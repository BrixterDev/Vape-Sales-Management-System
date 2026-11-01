import type { RequestHandler } from "express";
import { authOf } from "../middleware/auth";
import { sendCsv } from "../lib/csv";
import {
  batchReport,
  bestSellers,
  cashierPerformance,
  dashboard as dashboardMetrics,
  inventoryReport,
  outstanding,
  profitReport,
  salesReport,
  type Granularity,
} from "../services/reports.service";

function rangeOf(req: { query: Record<string, unknown> }) {
  return {
    from: typeof req.query.from === "string" ? req.query.from : undefined,
    to: typeof req.query.to === "string" ? req.query.to : undefined,
  };
}

export const dashboard: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  res.json(await dashboardMetrics(auth.db, from, to));
};

export const best: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  const limit = Number(req.query.limit ?? 20);
  res.json(await bestSellers(auth.db, from, to, Number.isFinite(limit) ? limit : 20));
};

export const sales: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  const granularity = (req.query.granularity as Granularity) ?? "day";
  const result = await salesReport(auth.db, from, to, granularity);

  if (req.query.format === "csv") {
    sendCsv(res, `sales-report-${result.range.from.slice(0, 10)}.csv`, result.items, [
      "period",
      "transaction_count",
      "gross_sales",
      "collected",
      "gross_profit",
    ]);
    return;
  }

  res.json(result);
};

export const balances: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const rows = await outstanding(auth.db);

  if (req.query.format === "csv") {
    sendCsv(res, "outstanding-balances.csv", rows as Record<string, unknown>[], [
      "transaction_number",
      "sale_date",
      "customer_name",
      "cashier_name",
      "total",
      "paid_amount",
      "balance",
      "payment_status",
    ]);
    return;
  }

  res.json(rows);
};

export const cashiers: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  res.json(await cashierPerformance(auth.db, from, to));
};

export const inventory: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const result = await inventoryReport(auth.db);

  if (req.query.format === "csv") {
    sendCsv(res, "inventory-report.csv", result.items as Record<string, unknown>[], [
      "sku",
      "name",
      "brand",
      "flavor",
      "stock_qty",
      "stock_cost",
      "selling_price",
      "retail_value",
      "is_low_stock",
    ]);
    return;
  }

  res.json(result);
};

export const batches: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  const rows = await batchReport(auth.db, from, to);

  if (req.query.format === "csv") {
    sendCsv(res, "batch-report.csv", rows as Record<string, unknown>[], [
      "batch_number",
      "supplier",
      "date_received",
      "total_units",
      "remaining_units",
      "total_cost",
      "remaining_cost",
      "potential_revenue",
      "potential_profit",
    ]);
    return;
  }

  res.json(rows);
};

export const profit: RequestHandler = async (req, res) => {
  const auth = authOf(req);
  const { from, to } = rangeOf(req);
  res.json(await profitReport(auth.db, from, to));
};
