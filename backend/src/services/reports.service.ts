import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "../lib/db";

export type Granularity = "day" | "week" | "month" | "year";

export function resolveRange(from?: string, to?: string): { from: string; to: string } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from
    ? new Date(from)
    : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    const end = new Date();
    return {
      from: new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      to: end.toISOString(),
    };
  }

  return { from: fromDate.toISOString(), to: toDate.toISOString() };
}

export async function dashboard(
  db: SupabaseClient,
  from?: string,
  to?: string,
) {
  const range = resolveRange(from, to);
  const [metrics, trend, top] = await Promise.all([
    db.rpc("dashboard_metrics", { p_from: range.from, p_to: range.to }),
    db.rpc("sales_report", {
      p_from: range.from,
      p_to: range.to,
      p_granularity: "day",
    }),
    db.rpc("best_sellers", { p_from: range.from, p_to: range.to, p_limit: 5 }),
  ]);

  if (metrics.error) fail(metrics.error, "Unable to load dashboard metrics");
  if (trend.error) fail(trend.error, "Unable to load sales trend");
  if (top.error) fail(top.error, "Unable to load best sellers");

  return {
    range,
    metrics: metrics.data ?? {},
    trend: trend.data ?? [],
    best_sellers: top.data ?? [],
  };
}

export async function bestSellers(
  db: SupabaseClient,
  from?: string,
  to?: string,
  limit = 20,
) {
  const range = resolveRange(from, to);
  const { data, error } = await db.rpc("best_sellers", {
    p_from: range.from,
    p_to: range.to,
    p_limit: limit,
  });
  if (error) fail(error, "Unable to load best sellers");
  return { range, items: data ?? [] };
}

export async function salesReport(
  db: SupabaseClient,
  from?: string,
  to?: string,
  granularity: Granularity = "day",
) {
  const range = resolveRange(from, to);
  const { data, error } = await db.rpc("sales_report", {
    p_from: range.from,
    p_to: range.to,
    p_granularity: granularity,
  });
  if (error) fail(error, "Unable to build the sales report");
  return { range, items: data ?? [] };
}

export async function outstanding(db: SupabaseClient) {
  const { data, error } = await db.rpc("outstanding_report");
  if (error) fail(error, "Unable to load outstanding balances");
  return data ?? [];
}

export async function cashierPerformance(
  db: SupabaseClient,
  from?: string,
  to?: string,
) {
  const range = resolveRange(from, to);
  const { data, error } = await db.rpc("cashier_performance", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error) fail(error, "Unable to load cashier performance");
  return { range, items: data ?? [] };
}

export async function inventoryReport(db: SupabaseClient) {
  const { data, error } = await db
    .from("v_product_stock")
    .select("*")
    .order("stock_qty", { ascending: true });

  if (error) fail(error, "Unable to build the inventory report");

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  // Cost lives behind batch_items RLS, so merge it from the invoker view.
  if (rows.length > 0) {
    const { data: costs, error: costError } = await db
      .from("v_product_stock_costs")
      .select("product_id, stock_cost")
      .in(
        "product_id",
        rows.map((row) => row.id as string),
      );

    if (costError) fail(costError, "Unable to load stock costs");

    const byProduct = new Map(
      (costs ?? []).map((row) => [
        row.product_id as string,
        Number(row.stock_cost),
      ]),
    );

    for (const row of rows) {
      row.stock_cost = byProduct.get(row.id as string) ?? 0;
    }
  }

  const { data: summary, error: summaryError } = await db
    .from("v_inventory_value")
    .select("*")
    .maybeSingle();

  if (summaryError) fail(summaryError, "Unable to summarise inventory");

  return { summary, items: rows };
}

export async function batchReport(
  db: SupabaseClient,
  from?: string,
  to?: string,
) {
  let query = db
    .from("v_batch_summary")
    .select("*")
    .order("date_received", { ascending: false });

  if (from) query = query.gte("date_received", from.slice(0, 10));
  if (to) query = query.lte("date_received", to.slice(0, 10));

  const { data, error } = await query;

  if (error) fail(error, "Unable to build the batch report");
  return data ?? [];
}

export async function profitReport(
  db: SupabaseClient,
  from?: string,
  to?: string,
) {
  const range = resolveRange(from, to);

  const { data, error } = await db
    .from("v_sale_items")
    .select(
      "id, quantity, unit_cost, unit_price, line_total, product_name, flavor, brand_name, sale_date, status",
    )
    .gte("sale_date", range.from)
    .lt("sale_date", range.to)
    .eq("status", "completed");

  if (error) fail(error, "Unable to build the profit report");
  return { range, items: data ?? [] };
}
