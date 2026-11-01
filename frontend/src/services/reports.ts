import type {
  BestSellerRow,
  CashierPerformanceRow,
  DashboardMetrics,
  ProductStock,
  SalesReportRow,
} from "@vape/shared";
import { api, downloadFile } from "@/lib/api";

export interface DateRange {
  from?: string;
  to?: string;
}

interface Range<T> {
  range: { from: string; to: string };
  items: T[];
}

export interface OutstandingRow {
  sale_id: string;
  transaction_number: string;
  sale_date: string;
  customer_id: string | null;
  customer_name: string;
  cashier_name: string | null;
  total: number;
  paid_amount: number;
  balance: number;
  payment_status: string;
}

export const reportsService = {
  dashboard: (range: DateRange) =>
    api.get<{
      range: { from: string; to: string };
      metrics: DashboardMetrics;
      trend: SalesReportRow[];
      best_sellers: BestSellerRow[];
    }>("/analytics/dashboard", { from: range.from, to: range.to }),

  bestSellers: (range: DateRange, limit = 20) =>
    api.get<Range<BestSellerRow>>("/analytics/best-sellers", {
      from: range.from,
      to: range.to,
      limit,
    }),

  sales: (range: DateRange, granularity: "day" | "week" | "month" | "year") =>
    api.get<Range<SalesReportRow>>("/reports/sales", {
      from: range.from,
      to: range.to,
      granularity,
    }),

  outstanding: () => api.get<OutstandingRow[]>("/reports/outstanding"),

  cashiers: (range: DateRange) =>
    api.get<Range<CashierPerformanceRow>>("/reports/cashiers", {
      from: range.from,
      to: range.to,
    }),

  inventory: () =>
    api.get<{
      summary: {
        total_units: number;
        total_cost_value: number;
        total_retail_value: number;
        low_stock_count: number;
        active_products: number;
      } | null;
      items: ProductStock[];
    }>("/reports/inventory"),

  batches: (range: DateRange) =>
    api.get<Array<Record<string, unknown>>>("/reports/batches", {
      from: range.from,
      to: range.to,
    }),

  profit: (range: DateRange) =>
    api.get<{ range: { from: string; to: string }; items: unknown[] }>("/reports/profit", {
      from: range.from,
      to: range.to,
    }),

  exportCsv: (
    report: "sales" | "outstanding" | "inventory" | "batches",
    range: DateRange,
    granularity: "day" | "week" | "month" | "year" = "day",
  ) => {
    const path = {
      sales: "/reports/sales",
      outstanding: "/reports/outstanding",
      inventory: "/reports/inventory",
      batches: "/reports/batches",
    }[report];

    return downloadFile(
      path,
      { from: range.from, to: range.to, granularity, format: "csv" },
      `${report}-report.csv`,
    );
  },
};
