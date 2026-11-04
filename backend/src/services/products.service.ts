import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductInput, ProductUpdateInput } from "@vape/shared";
import { fail, pageRange, sanitizeSearch } from "../lib/db";

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  lowStock?: boolean;
  archived?: boolean;
  /** POS only: hide products with no stock left. */
  inStock?: boolean;
  /** Managers and owners only — cashiers must never receive batch costs. */
  includeCost?: boolean;
}

/**
 * Attach supplier cost to stock rows. Cost lives in a separate invoker view so
 * that RLS on batch_items blocks cashiers from ever reading supplier prices.
 */
async function attachCosts(
  db: SupabaseClient,
  rows: Array<Record<string, unknown>>,
) {
  if (rows.length === 0) return rows;

  const ids = rows.map((row) => row.id as string);
  const { data, error } = await db
    .from("v_product_stock_costs")
    .select("product_id, stock_cost")
    .in("product_id", ids);

  if (error) fail(error, "Unable to load stock costs");

  const costs = new Map(
    (data ?? []).map((row) => [row.product_id as string, Number(row.stock_cost)]),
  );

  return rows.map((row) => ({
    ...row,
    stock_cost: costs.get(row.id as string) ?? 0,
  }));
}

export async function listStock(db: SupabaseClient, params: ListParams) {
  let query = db.from("v_product_stock").select("*", { count: "exact" });

  query = query.eq("is_archived", params.archived ?? false);

  if (params.lowStock) {
    query = query.eq("is_low_stock", true);
  }

  if (params.inStock) {
    query = query.gt("stock_qty", 0);
  }

  const term = sanitizeSearch(params.search);
  if (term) {
    query = query.or(
      `name.ilike.%${term}%,sku.ilike.%${term}%,brand.ilike.%${term}%,flavor.ilike.%${term}%,barcode.ilike.%${term}%`,
    );
  }

  const [from, to] = pageRange(params.page, params.pageSize);
  const { data, error, count } = await query.order("name").range(from, to);

  if (error) fail(error, "Unable to load inventory");

  let items = (data ?? []) as Array<Record<string, unknown>>;

  if (params.includeCost) {
    items = await attachCosts(db, items);
  } else {
    items = items.map((row) => ({ ...row, stock_cost: null }));
  }

  return {
    items,
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getProduct(
  db: SupabaseClient,
  id: string,
  includeCost = false,
) {
  const { data, error } = await db
    .from("v_product_stock")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error, "Unable to load product");
  if (!data) return null;

  const [row] = await attachCosts(
    db,
    includeCost ? [data as Record<string, unknown>] : [],
  );

  return row ?? data;
}

export async function createProduct(
  db: SupabaseClient,
  input: ProductInput,
  actorId: string,
) {
  const { data, error } = await db
    .from("products")
    .insert({ ...input, created_by: actorId })
    .select()
    .single();

  if (error) fail(error, "Unable to create product");
  return data;
}

export async function updateProduct(
  db: SupabaseClient,
  id: string,
  input: ProductUpdateInput,
) {
  const { data, error } = await db
    .from("products")
    .update(input)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to update product");
  return data;
}

export async function setArchived(db: SupabaseClient, id: string, archived: boolean) {
  const { data, error } = await db
    .from("products")
    .update({ is_archived: archived })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to archive product");
  return data;
}

export async function listBrands(db: SupabaseClient) {
  const { data, error } = await db.from("brands").select("*").order("name");
  if (error) fail(error, "Unable to load brands");
  return data ?? [];
}

export async function createBrand(db: SupabaseClient, name: string) {
  const { data, error } = await db
    .from("brands")
    .insert({ name })
    .select()
    .single();
  if (error) fail(error, "Unable to create brand");
  return data;
}

export async function listPosBatches(db: SupabaseClient) {
  const { data, error } = await db.rpc("pos_active_batches");
  if (error) fail(error, "Unable to load batches");
  return data ?? [];
}

export async function listPosBatchItems(
  db: SupabaseClient,
  batchId: string,
) {
  const { data, error } = await db.rpc("pos_batch_items", {
    p_batch_id: batchId,
  });
  if (error) fail(error, "Unable to load batch items");
  return data ?? [];
}

export async function listMovements(
  db: SupabaseClient,
  productId: string,
  limit = 100,
) {
  const { data, error } = await db
    .from("stock_movements")
    .select(
      "id, product_id, batch_item_id, type, quantity_delta, sale_id, actor_id, reason, created_at, batch_items:batch_item_id(batch_id, batches(batch_number))",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) fail(error, "Unable to load stock movements");

  const rows = (data ?? []) as Array<{
    batch_items?: { batches?: { batch_number?: string | null } | null } | null;
    [key: string]: unknown;
  }>;

  return rows.map(({ batch_items, ...movement }) => ({
    ...movement,
    batch_number: batch_items?.batches?.batch_number ?? null,
  }));
}

export async function inventorySummary(db: SupabaseClient, includeCost = true) {
  if (!includeCost) {
    const { data, error } = await db
      .from("v_inventory_summary_public")
      .select("*")
      .maybeSingle();

    if (error) fail(error, "Unable to load inventory summary");

    return {
      total_units: data?.total_units ?? 0,
      low_stock_count: data?.low_stock_count ?? 0,
      active_products: data?.active_products ?? 0,
      total_cost_value: null,
      total_retail_value: null,
    };
  }

  const { data, error } = await db.from("v_inventory_value").select("*").maybeSingle();
  if (error) fail(error, "Unable to load inventory summary");
  return data;
}
