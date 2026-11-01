import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  Boxes,
  Package,
  ReceiptText,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { reportsService } from "@/services/reports";
import { StatCard } from "@/components/ui/layout-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/helpers";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui/table";
import { RANGE_OPTIONS, rangeFor, type RangeKey } from "@/lib/ranges";
import { cn, formatDate, formatNumber, formatPHP } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const { profile } = useAuth();
  const bounds = useMemo(() => rangeFor(range), [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", bounds.from, bounds.to],
    queryFn: () => reportsService.dashboard(bounds),
  });

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Good {greeting()}, {profile?.full_name?.split(" ")[0] || "there"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Here is how the store is performing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              onClick={() => setRange(option.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                range === option.key
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-[110px]" />
          ))
        ) : (
          <>
            <StatCard
              label="Total Products"
              value={formatNumber(metrics?.total_products)}
              hint="Active products"
              icon={<Package className="h-4 w-4" />}
            />
            <StatCard
              label="Available Inventory"
              value={formatNumber(metrics?.available_units)}
              hint="Units on hand"
              icon={<Boxes className="h-4 w-4" />}
            />
            <StatCard
              label="Gross Sales"
              value={formatPHP(metrics?.gross_sales)}
              hint="Selected period"
              icon={<Banknote className="h-4 w-4" />}
            />
            <StatCard
              label="Collected"
              value={formatPHP(metrics?.collected)}
              hint="Payments received"
              tone="positive"
              icon={<ArrowDownToLine className="h-4 w-4" />}
            />
            <StatCard
              label="Gross Profit"
              value={formatPHP(metrics?.gross_profit)}
              hint="Revenue less batch cost"
              tone="positive"
              icon={<TrendingUp className="h-4 w-4" />}
            />
            <StatCard
              label="Outstanding"
              value={formatPHP(metrics?.outstanding)}
              hint="All unpaid balances"
              tone={Number(metrics?.outstanding ?? 0) > 0 ? "negative" : "default"}
              icon={<Wallet className="h-4 w-4" />}
            />
            <StatCard
              label="Transactions"
              value={formatNumber(metrics?.transaction_count)}
              hint="Completed sales"
              icon={<ReceiptText className="h-4 w-4" />}
            />
            <StatCard
              label="Low Stock"
              value={formatNumber(metrics?.low_stock_count)}
              hint="At or below threshold"
              tone={Number(metrics?.low_stock_count ?? 0) > 0 ? "warning" : "default"}
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Sales trend</CardTitle>
              <p className="mt-1 text-xs text-muted">Gross sales vs collected per day</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              {data?.trend?.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#232b26" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="period"
                      tickFormatter={(value: string) => formatDate(value)}
                      stroke="#6b776f"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke="#6b776f"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value: number) =>
                        value >= 1000 ? `${Math.round(value / 1000)}k` : String(value)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111513",
                        border: "1px solid #232b26",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      labelFormatter={(value) => formatDate(String(value))}
                      formatter={(value, name) => [
                        formatPHP(Number(value)),
                        name === "gross_sales" ? "Gross sales" : "Collected",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="gross_sales"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="url(#salesFill)"
                    />
                    <Area
                      type="monotone"
                      dataKey="collected"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No sales in this period"
                  description="Complete a sale in the POS to see the trend here."
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Best sellers</CardTitle>
              <p className="mt-1 text-xs text-muted">Top 5 by quantity sold</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => window.location.assign("/best-sellers")}>
              View all
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {data?.best_sellers?.length ? (
              <div className="divide-y divide-line/70">
                {data.best_sellers.map((row) => (
                  <div key={row.product_id} className="flex items-center gap-3 px-5 py-3">
                    <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-[11px] text-muted">
                      {row.rank}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{row.product_name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {[row.brand, row.flavor].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-medium">{row.quantity_sold}</p>
                      <p className="tabular text-[11px] text-muted">{formatPHP(row.revenue)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nothing sold yet" description="Best sellers appear after the first sale." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Daily breakdown</CardTitle>
            <p className="mt-1 text-xs text-muted">Transactions, sales and profit by day</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <TableWrap className="rounded-none border-0 border-t border-line">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH className="text-right">Transactions</TH>
                  <TH className="text-right">Gross Sales</TH>
                  <TH className="text-right">Collected</TH>
                  <TH className="text-right">Gross Profit</TH>
                </TR>
              </THead>
              <TBody>
                {(data?.trend ?? []).slice(-14).reverse().map((row) => (
                  <TR key={row.period}>
                    <TD>{formatDate(row.period)}</TD>
                    <TD className="tabular text-right">{row.transaction_count}</TD>
                    <TD className="tabular text-right">{formatPHP(row.gross_sales)}</TD>
                    <TD className="tabular text-right text-accent">{formatPHP(row.collected)}</TD>
                    <TD className="tabular text-right">{formatPHP(row.gross_profit)}</TD>
                  </TR>
                ))}
                {!data?.trend?.length ? (
                  <TR>
                    <TD colSpan={5}>
                      <EmptyState title="No activity yet" description="Sales will appear here." />
                    </TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
