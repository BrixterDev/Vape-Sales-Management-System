import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AddPaymentInput,
  CreateSaleInput,
  UpdateSaleInput,
} from "@vape/shared";
import { fail, pageRange, sanitizeSearch } from "../lib/db";

export interface SalesListParams {
  page: number;
  pageSize: number;
  search?: string;
  customerId?: string;
  productId?: string;
  cashierId?: string;
  status?: "completed" | "voided";
  paymentStatus?: "unpaid" | "partial" | "paid";
  source?: "pos" | "manual";
  from?: string;
  to?: string;
}

export async function createSale(db: SupabaseClient, input: CreateSaleInput) {
  const { data, error } = await db.rpc("create_sale", { p_payload: input });
  if (error) fail(error, "Unable to complete the sale");
  return data;
}

/** Remove supplier cost from a sale payload before it reaches a cashier. */
export function redactCost<T extends { items?: unknown }>(sale: T): T {
  const items = Array.isArray(sale.items)
    ? (sale.items as Array<Record<string, unknown>>).map((item) => {
        const { unit_cost: _cost, ...rest } = item;
        return rest;
      })
    : sale.items;

  return { ...sale, items };
}

export async function listSales(db: SupabaseClient, params: SalesListParams) {
  let query = db.from("v_sale_balances").select("*", { count: "exact" });

  if (params.status) query = query.eq("status", params.status);
  if (params.paymentStatus) query = query.eq("payment_status", params.paymentStatus);
  if (params.source) query = query.eq("source", params.source);
  if (params.customerId) query = query.eq("customer_id", params.customerId);
  if (params.cashierId) query = query.eq("cashier_id", params.cashierId);
  if (params.from) query = query.gte("sale_date", params.from);
  if (params.to) query = query.lte("sale_date", params.to);

  const term = sanitizeSearch(params.search);
  if (term) {
    query = query.or(`transaction_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }

  if (params.productId) {
    const { data: rows, error: itemError } = await db
      .from("v_sale_items")
      .select("sale_id")
      .eq("product_id", params.productId);

    if (itemError) fail(itemError, "Unable to filter by product");

    const ids = [...new Set((rows ?? []).map((row) => row.sale_id as string))];
    if (ids.length === 0) {
      return { items: [], total: 0, page: params.page, pageSize: params.pageSize };
    }
    query = query.in("id", ids);
  }

  const [from, to] = pageRange(params.page, params.pageSize);
  const { data, error, count } = await query
    .order("sale_date", { ascending: false })
    .range(from, to);

  if (error) fail(error, "Unable to load sales");

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // Attach the sale lines for the current page so the sales screen can render
  // flavor / quantity details. v_sale_items masks cost for cashiers.
  const itemsBySale = new Map<string, Array<Record<string, unknown>>>();
  if (rows.length > 0) {
    const ids = rows.map((row) => row.id as string);
    const { data: itemRows, error: itemError } = await db
      .from("v_sale_items")
      .select("*")
      .in("sale_id", ids);

    if (itemError) fail(itemError, "Unable to load sale items");

    for (const item of itemRows ?? []) {
      const key = item.sale_id as string;
      const list = itemsBySale.get(key) ?? [];
      list.push(item);
      itemsBySale.set(key, list);
    }
  }

  return {
    items: rows.map((row) => ({
      ...row,
      items: itemsBySale.get(row.id as string) ?? [],
    })),
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getSale(
  db: SupabaseClient,
  id: string,
  includeCost = true,
) {
  const { data: sale, error } = await db
    .from("v_sale_balances")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) fail(error, "Unable to load sale");
  if (!sale) return null;

  const [{ data: items, error: itemError }, { data: payments, error: payError }] =
    await Promise.all([
      db.from("v_sale_items").select("*").eq("sale_id", id).order("created_at"),
      db
        .from("payments")
        .select("*")
        .eq("sale_id", id)
        .order("paid_at", { ascending: true }),
    ]);

  if (itemError) fail(itemError, "Unable to load sale items");
  if (payError) fail(payError, "Unable to load payments");

  const { data: cashier } = await db
    .from("profiles")
    .select("full_name")
    .eq("id", sale.cashier_id)
    .maybeSingle();

  const itemIds = (items ?? []).map((item) => item.id);

  const { data: allocations } = itemIds.length
    ? await db
        .from("v_sale_allocations")
        .select("sale_item_id, batch_item_id, quantity, unit_cost, unit_price")
        .in("sale_item_id", itemIds)
    : { data: [] as Array<Record<string, unknown>> };

  const itemRows = (items ?? []) as Array<Record<string, unknown>>;
  const allocationRows = (allocations ?? []) as Array<Record<string, unknown>>;

  return {
    ...sale,
    cashier_name: cashier?.full_name ?? null,
    items: includeCost
      ? itemRows
      : itemRows.map(({ unit_cost: _cost, ...rest }) => rest),
    payments: payments ?? [],
    allocations: includeCost
      ? allocationRows
      : allocationRows.map(({ unit_cost: _cost, ...rest }) => rest),
  };
}

export async function addPayment(
  db: SupabaseClient,
  saleId: string,
  input: AddPaymentInput,
) {
  const { data, error } = await db.rpc("add_payment", {
    p_sale_id: saleId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference_no ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) fail(error, "Unable to record the payment");
  return data;
}

export async function voidSale(db: SupabaseClient, saleId: string, reason: string) {
  const { data, error } = await db.rpc("void_sale", {
    p_sale_id: saleId,
    p_reason: reason,
  });
  if (error) fail(error, "Unable to void the sale");
  return data;
}

export async function editSale(
  db: SupabaseClient,
  saleId: string,
  input: CreateSaleInput,
  reason: string,
) {
  const { data, error } = await db.rpc("edit_sale", {
    p_sale_id: saleId,
    p_payload: input,
    p_reason: reason,
  });
  if (error) fail(error, "Unable to edit the sale");
  return data;
}

export async function updateSaleDetails(
  db: SupabaseClient,
  saleId: string,
  input: UpdateSaleInput,
) {
  const { data, error } = await db.rpc("update_sale_details", {
    p_sale_id: saleId,
    p_customer_id: input.customer_id ?? null,
    p_customer_name: input.customer_name ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) fail(error, "Unable to update the sale");
  return data;
}

export async function saleReceiptData(db: SupabaseClient, id: string) {
  return getSale(db, id);
}
