import type { SupabaseClient } from "@supabase/supabase-js";
import type { BatchInput } from "@vape/shared";
import { fail, pageRange, sanitizeSearch } from "../lib/db";

export async function listBatches(
  db: SupabaseClient,
  params: {
    page: number;
    pageSize: number;
    search?: string;
    supplierId?: string;
    from?: string;
    to?: string;
  },
) {
  let query = db.from("v_batch_summary").select("*", { count: "exact" });

  const term = sanitizeSearch(params.search);
  if (term) {
    query = query.or(`batch_number.ilike.%${term}%,supplier.ilike.%${term}%`);
  }
  if (params.supplierId) {
    query = query.eq("supplier_id", params.supplierId);
  }
  if (params.from) {
    query = query.gte("date_received", params.from);
  }
  if (params.to) {
    query = query.lte("date_received", params.to);
  }

  const [from, to] = pageRange(params.page, params.pageSize);
  const { data, error, count } = await query
    .order("date_received", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) fail(error, "Unable to load batches");

  return {
    items: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getBatch(db: SupabaseClient, id: string) {
  const { data: batch, error } = await db
    .from("batches")
    .select(
      "id, batch_number, supplier_id, date_received, notes, created_by, created_at, suppliers(name), profiles(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error, "Unable to load batch");
  if (!batch) return null;

  const { data: items, error: itemsError } = await db
    .from("batch_items")
    .select(
      "id, batch_id, product_id, quantity_received, remaining_quantity, supplier_price, selling_price, created_at, products(sku, name, flavor, brands(name))",
    )
    .eq("batch_id", id)
    .order("created_at");

  if (itemsError) fail(itemsError, "Unable to load batch items");

  const rows = items ?? [];

  const totals = rows.reduce(
    (acc, row) => {
      const received = Number(row.quantity_received);
      const remaining = Number(row.remaining_quantity);
      const cost = Number(row.supplier_price);
      const price = Number(row.selling_price);

      acc.totalCost += received * cost;
      acc.remainingCost += remaining * cost;
      acc.potentialRevenue += received * price;
      acc.potentialProfit += received * (price - cost);
      acc.remainingRetail += remaining * price;
      acc.remainingUnits += remaining;
      acc.totalUnits += received;
      return acc;
    },
    {
      totalCost: 0,
      remainingCost: 0,
      potentialRevenue: 0,
      potentialProfit: 0,
      remainingRetail: 0,
      remainingUnits: 0,
      totalUnits: 0,
    },
  );

  return { ...batch, items: rows, totals };
}

export async function createBatch(
  db: SupabaseClient,
  input: BatchInput,
) {
  const { data, error } = await db.rpc("create_batch", { p_payload: input });
  if (error) fail(error, "Unable to create batch");
  return data;
}

export async function deleteBatch(db: SupabaseClient, id: string) {
  const { data, error } = await db.rpc("delete_batch", { p_batch_id: id });
  if (error) fail(error, "Unable to delete batch");
  return data;
}
