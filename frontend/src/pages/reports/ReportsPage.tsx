import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { reportsService } from "@/services/reports";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatPHP, isoDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
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
import { cn } from "@/lib/utils";

type Tab = "sales" | "outstanding" | "cashiers" | "inventory" | "batches";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "sales", label: "Sales" },
  { key: "outstanding", label: "Outstanding" },
  { key: "cashiers", label: "Cashiers" },
  { key: "inventory", label: "Inventory" },
  { key: "batches", label: "Batches" },
];

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return isoDate(date);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [granularity, setGranularity] = useState<"day" | "week" | "month" | "year">("day");

  const range = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00`).toISOString(),
      to: new Date(`${to}T23:59:59`).toISOString(),
    }),
    [from, to],
  );

  const exportCsv = async () => {
    try {
      await reportsService.exportCsv(
        tab === "cashiers" ? "sales" : tab,
        range,
        granularity,
      );
      toast.success("Export downloaded");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Financial and operational reporting, exportable to CSV."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-auto"
          />
          <span className="text-xs text-muted">to</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-auto"
          />
        </div>
        {tab === "sales" ? (
          <Select
            value={granularity}
            onChange={(event) =>
              setGranularity(event.target.value as typeof granularity)
            }
            className="w-auto"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </Select>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === item.key ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "sales" ? <SalesReport range={range} granularity={granularity} /> : null}
      {tab === "outstanding" ? <OutstandingReport /> : null}
      {tab === "cashiers" ? <CashierReport range={range} /> : null}
      {tab === "inventory" ? <InventoryReport /> : null}
      {tab === "batches" ? <BatchReport range={range} /> : null}
    </div>
  );
}

function SalesReport({
  range,
  granularity,
}: {
  range: { from: string; to: string };
  granularity: "day" | "week" | "month" | "year";
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-sales", range.from, range.to, granularity],
    queryFn: () => reportsService.sales(range, granularity),
  });

  const items = data?.items ?? [];
  const totals = items.reduce(
    (acc, row) => ({
      transactions: acc.transactions + Number(row.transaction_count),
      gross: acc.gross + Number(row.gross_sales),
      collected: acc.collected + Number(row.collected),
      profit: acc.profit + Number(row.gross_profit),
    }),
    { transactions: 0, gross: 0, collected: 0, profit: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <Mini label="Transactions" value={formatNumber(totals.transactions)} />
        <Mini label="Gross sales" value={formatPHP(totals.gross)} />
        <Mini label="Collected" value={formatPHP(totals.collected)} tone="positive" />
        <Mini label="Gross profit" value={formatPHP(totals.profit)} tone="positive" />
      </div>

      <ReportTable
        loading={isLoading}
        empty={items.length === 0}
        head={
          <>
            <TH>Period</TH>
            <TH className="text-right">Transactions</TH>
            <TH className="text-right">Gross Sales</TH>
            <TH className="text-right">Collected</TH>
            <TH className="text-right">Gross Profit</TH>
          </>
        }
        body={items.map((row) => (
          <TR key={row.period}>
            <TD>{formatDate(row.period)}</TD>
            <TD className="tabular text-right">{row.transaction_count}</TD>
            <TD className="tabular text-right">{formatPHP(row.gross_sales)}</TD>
            <TD className="tabular text-right text-accent">{formatPHP(row.collected)}</TD>
            <TD className="tabular text-right">{formatPHP(row.gross_profit)}</TD>
          </TR>
        ))}
      />
    </div>
  );
}

function OutstandingReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-outstanding"],
    queryFn: () => reportsService.outstanding(),
  });

  const rows = data ?? [];
  const total = rows.reduce((sum, row) => sum + Number(row.balance), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Mini label="Unpaid sales" value={formatNumber(rows.length)} />
        <Mini label="Total outstanding" value={formatPHP(total)} tone="negative" />
        <Mini
          label="Customers affected"
          value={formatNumber(new Set(rows.map((row) => row.customer_name)).size)}
        />
      </div>

      <ReportTable
        loading={isLoading}
        empty={rows.length === 0}
        head={
          <>
            <TH>Sale date</TH>
            <TH>Receipt</TH>
            <TH>Customer</TH>
            <TH>Cashier</TH>
            <TH className="text-right">Total</TH>
            <TH className="text-right">Paid</TH>
            <TH className="text-right">Balance</TH>
            <TH>Status</TH>
          </>
        }
        body={rows.map((row) => (
          <TR key={row.sale_id}>
            <TD className="text-xs text-muted">{formatDateTime(row.sale_date)}</TD>
            <TD className="font-medium">{row.transaction_number}</TD>
            <TD>{row.customer_name}</TD>
            <TD className="text-muted">{row.cashier_name ?? "\u2014"}</TD>
            <TD className="tabular text-right">{formatPHP(row.total)}</TD>
            <TD className="tabular text-right">{formatPHP(row.paid_amount)}</TD>
            <TD className="tabular text-right text-danger">{formatPHP(row.balance)}</TD>
            <TD>
              <Badge tone={row.payment_status === "partial" ? "warning" : "danger"}>
                {row.payment_status}
              </Badge>
            </TD>
          </TR>
        ))}
      />
    </div>
  );
}

function CashierReport({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-cashiers", range.from, range.to],
    queryFn: () => reportsService.cashiers(range),
  });

  const rows = data?.items ?? [];

  return (
    <ReportTable
      loading={isLoading}
      empty={rows.length === 0}
      head={
        <>
          <TH>Cashier</TH>
          <TH className="text-right">Transactions</TH>
          <TH className="text-right">Gross Sales</TH>
          <TH className="text-right">Collected</TH>
          <TH className="text-right">Outstanding</TH>
        </>
      }
      body={rows.map((row) => (
        <TR key={row.cashier_id}>
          <TD className="font-medium">{row.cashier_name}</TD>
          <TD className="tabular text-right">{row.transaction_count}</TD>
          <TD className="tabular text-right">{formatPHP(row.gross_sales)}</TD>
          <TD className="tabular text-right text-accent">{formatPHP(row.collected)}</TD>
          <TD className="tabular text-right text-danger">{formatPHP(row.outstanding)}</TD>
        </TR>
      ))}
    />
  );
}

function InventoryReport() {
  const { data, isLoading } = useQuery({
    queryKey: ["report-inventory"],
    queryFn: () => reportsService.inventory(),
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Mini label="Units on hand" value={formatNumber(data?.summary?.total_units)} />
        <Mini label="Cost value" value={formatPHP(data?.summary?.total_cost_value)} />
        <Mini label="Retail value" value={formatPHP(data?.summary?.total_retail_value)} tone="positive" />
      </div>

      <ReportTable
        loading={isLoading}
        empty={rows.length === 0}
        head={
          <>
            <TH>Product</TH>
            <TH>Brand</TH>
            <TH>Flavor</TH>
            <TH className="text-right">Stock</TH>
            <TH className="text-right">Cost Value</TH>
            <TH className="text-right">Retail Value</TH>
            <TH>Status</TH>
          </>
        }
        body={rows.map((row) => (
          <TR key={row.id}>
            <TD className="font-medium">{row.name}</TD>
            <TD className="text-muted">{row.brand ?? "\u2014"}</TD>
            <TD className="text-muted">{row.flavor}</TD>
            <TD className="tabular text-right">{row.stock_qty}</TD>
            <TD className="tabular text-right">{formatPHP(row.stock_cost)}</TD>
            <TD className="tabular text-right">{formatPHP(row.retail_value)}</TD>
            <TD>
              {row.is_low_stock ? <Badge tone="warning">Low</Badge> : <Badge tone="success">OK</Badge>}
            </TD>
          </TR>
        ))}
      />
    </div>
  );
}

function BatchReport({ range }: { range: { from: string; to: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ["report-batches", range.from, range.to],
    queryFn: () => reportsService.batches(range),
  });

  const rows = (data ?? []) as Array<Record<string, unknown>>;

  return (
    <ReportTable
      loading={isLoading}
      empty={rows.length === 0}
      head={
        <>
          <TH>Batch</TH>
          <TH>Supplier</TH>
          <TH>Received</TH>
          <TH className="text-right">Units</TH>
          <TH className="text-right">Cost</TH>
          <TH className="text-right">Remaining Cost</TH>
          <TH className="text-right">Potential Profit</TH>
        </>
      }
      body={rows.map((row) => (
        <TR key={String(row.batch_id)}>
          <TD className="font-medium">{String(row.batch_number)}</TD>
          <TD className="text-muted">{String(row.supplier ?? "\u2014")}</TD>
          <TD>{formatDate(String(row.date_received))}</TD>
          <TD className="tabular text-right">
            {formatNumber(Number(row.remaining_units))} / {formatNumber(Number(row.total_units))}
          </TD>
          <TD className="tabular text-right">{formatPHP(Number(row.total_cost))}</TD>
          <TD className="tabular text-right">{formatPHP(Number(row.remaining_cost))}</TD>
          <TD className="tabular text-right text-accent">
            {formatPHP(Number(row.potential_profit))}
          </TD>
        </TR>
      ))}
    />
  );
}

function ReportTable({
  loading,
  empty,
  head,
  body,
}: {
  loading: boolean;
  empty: boolean;
  head: React.ReactNode;
  body: React.ReactNode;
}) {
  return (
    <TableWrap>
      {loading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-11" />
          ))}
        </div>
      ) : empty ? (
        <EmptyState title="No data for this period" description="Adjust the date range and try again." />
      ) : (
        <Table>
          <THead>
            <TR>{head}</TR>
          </THead>
          <TBody>{body}</TBody>
        </Table>
      )}
    </TableWrap>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-[11px] uppercase tracking-wider text-muted">{label}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1">
        <p
          className={cn(
            "tabular text-lg font-semibold",
            tone === "positive" && "text-accent",
            tone === "negative" && "text-danger",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
