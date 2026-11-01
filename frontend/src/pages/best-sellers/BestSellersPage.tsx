import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, TrendingUp } from "lucide-react";
import { reportsService } from "@/services/reports";
import { formatDate, formatNumber, formatPHP } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
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
import { isoDate } from "@/lib/utils";

export default function BestSellersPage() {
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return isoDate(date);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [search, setSearch] = useState("");

  const range = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
    }),
    [from, to],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["best-sellers", range.from, range.to],
    queryFn: () => reportsService.bestSellers(range, 50),
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const items = data?.items ?? [];
    if (!term) return items;
    return items.filter((row) =>
      [row.product_name, row.brand, row.flavor].join(" ").toLowerCase().includes(term),
    );
  }, [data, search]);

  const chartData = rows.slice(0, 10).map((row) => ({
    name: `${row.brand} ${row.flavor}`.trim() || row.product_name,
    quantity: row.quantity_sold,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Best Sellers"
        description="Ranked by actual quantity sold. Voided sales are excluded."
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by product, brand or flavor"
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          className="w-auto"
        />
        <span className="pb-3 text-xs text-muted">to</span>
        <Input
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          className="w-auto"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Top 10 by quantity</CardTitle>
              <p className="mt-1 text-xs text-muted">Units sold in the selected period</p>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              {chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 12, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid stroke="#232b26" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" stroke="#6b776f" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={130}
                      stroke="#6b776f"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value: string) =>
                        value.length > 18 ? `${value.slice(0, 18)}\u2026` : value
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#111513",
                        border: "1px solid #232b26",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      formatter={(value) => [`${value} units`, "Sold"]}
                    />
                    <Bar dataKey="quantity" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={<TrendingUp className="h-5 w-5" />}
                  title="No sales in this period"
                  description="Adjust the date range to see rankings."
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Period summary</CardTitle>
              <p className="mt-1 text-xs text-muted">
                {formatDate(from)} &ndash; {formatDate(to)}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow label="Products sold" value={formatNumber(rows.length)} />
            <SummaryRow
              label="Units sold"
              value={formatNumber(rows.reduce((sum, row) => sum + Number(row.quantity_sold), 0))}
            />
            <SummaryRow
              label="Revenue"
              value={formatPHP(rows.reduce((sum, row) => sum + Number(row.revenue), 0))}
            />
            <SummaryRow
              label="Gross profit"
              value={formatPHP(rows.reduce((sum, row) => sum + Number(row.gross_profit), 0))}
              positive
            />
          </CardContent>
        </Card>
      </div>

      <TableWrap>
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState title="No products sold" description="Nothing matches this period." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>#</TH>
                <TH>Product</TH>
                <TH>Brand</TH>
                <TH>Flavor</TH>
                <TH className="text-right">Qty Sold</TH>
                <TH className="text-right">Revenue</TH>
                <TH className="text-right">Gross Profit</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.product_id}>
                  <TD className="tabular text-muted">{row.rank}</TD>
                  <TD className="font-medium">{row.product_name}</TD>
                  <TD className="text-muted">{row.brand || "\u2014"}</TD>
                  <TD className="text-muted">{row.flavor}</TD>
                  <TD className="tabular text-right font-medium">{row.quantity_sold}</TD>
                  <TD className="tabular text-right">{formatPHP(row.revenue)}</TD>
                  <TD className="tabular text-right text-accent">{formatPHP(row.gross_profit)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </TableWrap>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className={`tabular font-medium ${positive ? "text-accent" : ""}`}>{value}</span>
    </div>
  );
}
