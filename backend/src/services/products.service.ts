import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductInput, ProductUpdateInput } from "@vape/shared";
import { fail, pageRange, sanitizeSearch } from "../lib/db";

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  lowStock?: boolean;
  archived?: boolean;
}

export async function listStock(db: SupabaseClient, params: ListParams) {
  let query = db.from("v_product_stock").select("*", { count: "exact" });

  query = query.eq("is_archived", params.archived ?? false);

  if (params.lowStock) {
    query = query.eq("is_low_stock", true);
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

  return {
    items: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getProduct(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("v_product_stock")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error, "Unable to load product");
  return data;
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

export async function listMovements(
  db: SupabaseClient,
  productId: string,
  limit = 100,
) {
  const { data, error } = await db
    .from("stock_movements")
    .select(
      "id, product_id, batch_item_id, type, quantity_delta, sale_id, actor_id, reason, created_at, batch_items:batch_item_id(batch_number)",
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(Math.min(limit, 500));

  if (error) fail(error, "Unable to load stock movements");
  return data ?? [];
}

export async function inventorySummary(db: SupabaseClient) {
  const { data, error } = await db.from("v_inventory_value").select("*").maybeSingle();
  if (error) fail(error, "Unable to load inventory summary");
  return data;
}
