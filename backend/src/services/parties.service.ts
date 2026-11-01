import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomerInput, SupplierInput } from "@vape/shared";
import { fail, pageRange, sanitizeSearch } from "../lib/db";

/* ---------------------------------------------------------------- suppliers */

export async function listSuppliers(
  db: SupabaseClient,
  params: { page: number; pageSize: number; search?: string; includeInactive?: boolean },
) {
  let query = db.from("suppliers").select("*", { count: "exact" });

  if (!params.includeInactive) {
    query = query.eq("is_active", true);
  }

  const term = sanitizeSearch(params.search);
  if (term) {
    query = query.or(`name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const [from, to] = pageRange(params.page, params.pageSize);
  const { data, error, count } = await query.order("name").range(from, to);

  if (error) fail(error, "Unable to load suppliers");

  return {
    items: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function createSupplier(db: SupabaseClient, input: SupplierInput) {
  const { data, error } = await db.from("suppliers").insert(input).select().single();
  if (error) fail(error, "Unable to create supplier");
  return data;
}

export async function updateSupplier(
  db: SupabaseClient,
  id: string,
  input: Partial<SupplierInput>,
) {
  const { data, error } = await db
    .from("suppliers")
    .update(input)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) fail(error, "Unable to update supplier");
  return data;
}

export async function supplierBatches(
  db: SupabaseClient,
  supplierId: string,
  limit = 50,
) {
  const { data, error } = await db
    .from("v_batch_summary")
    .select("*")
    .eq("supplier_id", supplierId)
    .order("date_received", { ascending: false })
    .limit(limit);
  if (error) fail(error, "Unable to load supplier batches");
  return data ?? [];
}

/* ---------------------------------------------------------------- customers */

export async function listCustomers(
  db: SupabaseClient,
  params: { page: number; pageSize: number; search?: string },
) {
  let query = db.from("v_customer_balances").select("*", { count: "exact" });

  const term = sanitizeSearch(params.search);
  if (term) {
    query = query.ilike("name", `%${term}%`);
  }

  const [from, to] = pageRange(params.page, params.pageSize);
  const { data, error, count } = await query.order("name").range(from, to);

  if (error) fail(error, "Unable to load customers");

  return {
    items: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function getCustomer(db: SupabaseClient, id: string) {
  const { data, error } = await db
    .from("v_customer_balances")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail(error, "Unable to load customer");
  return data;
}

export async function customerTransactions(db: SupabaseClient, id: string, limit = 100) {
  const { data, error } = await db
    .from("v_sale_balances")
    .select("*")
    .eq("customer_id", id)
    .order("sale_date", { ascending: false })
    .limit(Math.min(limit, 300));
  if (error) fail(error, "Unable to load customer transactions");
  return data ?? [];
}

export async function createCustomer(db: SupabaseClient, input: CustomerInput) {
  const { data, error } = await db.from("customers").insert(input).select().single();
  if (error) fail(error, "Unable to create customer");
  return data;
}

export async function updateCustomer(
  db: SupabaseClient,
  id: string,
  input: Partial<CustomerInput>,
) {
  const { data, error } = await db
    .from("customers")
    .update(input)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) fail(error, "Unable to update customer");
  return data;
}
