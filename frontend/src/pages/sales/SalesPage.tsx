import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Ban,
  CalendarDays,
  Eye,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { SaleWithBalance } from "@vape/shared";
import { salesService } from "@/services/sales";
import { productsService } from "@/services/products";
import { customersService } from "@/services/parties";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatPHP,
  isoDate,
  newIdempotencyKey,
} from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { EmptyState, Pagination, Skeleton } from "@/components/ui/helpers";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui/table";

type Tone = "neutral" | "success" | "danger" | "warning";

function paymentTone(status: string): Tone {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  return "danger";
}

export default function SalesPage() {
  const { profile } = useAuth();
  const canVoid = profile?.role === "owner" || profile?.role === "manager";
  const canManual = canVoid;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debounced = useDebounced(search);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [payFor, setPayFor] = useState<SaleWithBalance | null>(null);
  const [voidFor, setVoidFor] = useState<SaleWithBalance | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualDate, setManualDate] = useState(isoDate(new Date()));
  const [manualCustomer, setManualCustomer] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [manualMethod, setManualMethod] = useState("cash");
  const [manualPaid, setManualPaid] = useState("");
  const [manualRef, setManualRef] = useState("");
  const [manualLines, setManualLines] = useState<
    Array<{ product_id: string; quantity: string }>
  >([{ product_id: "", quantity: "1" }]);

  const listQuery = useQuery({
    queryKey: ["sales", page, debounced, paymentStatus, status, from, to],
    queryFn: () =>
      salesService.list({
        page,
        pageSize: 20,
        search: debounced || undefined,
        payment_status: paymentStatus || undefined,
        status: status || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      }),
  });

  const detailQuery = useQuery({
    queryKey: ["sale", detailId],
    queryFn: () => salesService.get(detailId!),
    enabled: Boolean(detailId),
  });

  const productsQuery = useQuery({
    queryKey: ["product-options"],
    queryFn: () => productsService.list({ page: 1, pageSize: 100 }),
  });

  const customersQuery = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => customersService.list({ page: 1, pageSize: 100 }),
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["sales"] });
    void queryClient.invalidateQueries({ queryKey: ["sale"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const paymentMutation = useMutation({
    mutationFn: (input: { amount: number; method: string; reference: string }) =>
      salesService.addPayment(payFor!.id, {
        amount: input.amount,
        method: input.method as "cash" | "gcash" | "bank_transfer" | "other",
        reference_no: input.reference || null,
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      setPayFor(null);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const voidMutation = useMutation({
    mutationFn: (reason: string) => salesService.void(voidFor!.id, reason),
    onSuccess: () => {
      toast.success("Sale voided and stock restored");
      setVoidFor(null);
      setDetailId(null);
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const manualTotal = useMemo(
    () =>
      manualLines.reduce((sum, line) => {
        const product = productsQuery.data?.items.find((entry) => entry.id === line.product_id);
        return sum + Number(product?.selling_price ?? 0) * Number(line.quantity || 0);
      }, 0),
    [manualLines, productsQuery.data],
  );

  const manualMutation = useMutation({
    mutationFn: () => {
      const paid = manualPaid === "" ? manualTotal : Number(manualPaid || 0);
      return salesService.create({
        source: "manual",
        sale_date: new Date(`${manualDate}T12:00:00`).toISOString(),
        customer_id: manualCustomer || null,
        customer_name: manualName.trim() || null,
        notes: manualNotes.trim() || null,
        items: manualLines
          .filter((line) => line.product_id)
          .map((line) => ({
            product_id: line.product_id,
            quantity: Number(line.quantity || 0),
          })),
        payment: {
          method: manualMethod as "cash" | "gcash" | "bank_transfer" | "other",
          amount: Math.min(paid, manualTotal),
          reference_no: manualRef.trim() || null,
        },
        idempotency_key: newIdempotencyKey(),
      });
    },
    onSuccess: () => {
      toast.success("Manual sale recorded");
      setManualOpen(false);
      setManualLines([{ product_id: "", quantity: "1" }]);
      setManualPaid("");
      setManualName("");
      setManualNotes("");
      refresh();
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sales"
        description="Every POS and manual transaction, with payment status and balances."
        actions={
          canManual ? (
            <Button onClick={() => setManualOpen(true)}>
              <Plus className="h-4 w-4" />
              Record sale
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search receipt or customer"
            className="pl-9"
          />
        </div>
        <Select
          value={paymentStatus}
          onChange={(event) => {
            setPaymentStatus(event.target.value);
            setPage(1);
          }}
          className="w-auto"
        >
          <option value="">All payments</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="unpaid">Unpaid</option>
        </Select>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="w-auto"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
        </Select>
        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          <span className="text-xs text-muted">to</span>
          <Input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
        </div>
      </div>

      <TableWrap>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : (listQuery.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="h-5 w-5" />}
            title="No sales found"
            description="Complete a sale in the POS or record one manually."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Transaction</TH>
                  <TH>Customer</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Total</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Balance</TH>
                  <TH>Payment</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(listQuery.data?.items ?? []).map((sale) => (
                  <TR key={sale.id}>
                    <TD className="whitespace-nowrap text-xs text-muted">
                      {formatDateTime(sale.sale_date)}
                    </TD>
                    <TD className="font-medium">{sale.transaction_number}</TD>
                    <TD>{sale.customer_name || "Walk-in"}</TD>
                    <TD className="tabular text-right">{formatNumber(sale.item_count)}</TD>
                    <TD className="tabular text-right">{formatPHP(sale.total)}</TD>
                    <TD className="tabular text-right text-accent">{formatPHP(sale.paid_amount)}</TD>
                    <TD className="tabular text-right">
                      <span className={Number(sale.balance) > 0 ? "text-danger" : "text-muted"}>
                        {formatPHP(sale.balance)}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={paymentTone(sale.payment_status)}>
                        {sale.payment_status}
                      </Badge>
                    </TD>
                    <TD>
                      {sale.status === "voided" ? (
                        <Badge tone="danger">Voided</Badge>
                      ) : (
                        <Badge tone="neutral">Completed</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        {Number(sale.balance) > 0 && sale.status === "completed" ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Record payment"
                            onClick={() => setPayFor(sale)}
                          >
                            <Wallet className="h-4 w-4" />
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="View details"
                          onClick={() => setDetailId(sale.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={20}
              total={listQuery.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        )}
      </TableWrap>

      {/* ---------------------------------------------------------- detail */}
      <Dialog
        open={Boolean(detailId)}
        onClose={() => setDetailId(null)}
        title={
          detailQuery.data
            ? `Sale ${detailQuery.data.transaction_number}`
            : "Sale details"
        }
        description={
          detailQuery.data
            ? `${formatDateTime(detailQuery.data.sale_date)} \u00b7 ${detailQuery.data.cashier_name ?? "Staff"} \u00b7 ${detailQuery.data.source.toUpperCase()}`
            : undefined
        }
        size="lg"
        footer={
          detailQuery.data && canVoid && detailQuery.data.status === "completed" ? (
            <Button variant="danger" onClick={() => setVoidFor(detailQuery.data)}>
              <Ban className="h-4 w-4" />
              Void sale
            </Button>
          ) : null
        }
      >
        {detailQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Summary label="Total" value={formatPHP(detailQuery.data.total)} />
              <Summary label="Paid" value={formatPHP(detailQuery.data.paid_amount)} positive />
              <Summary
                label="Balance"
                value={formatPHP(detailQuery.data.balance)}
                danger={detailQuery.data.balance > 0}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-line">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">Qty</TH>
                    <TH className="text-right">Price</TH>
                    <TH className="text-right">Cost</TH>
                    <TH className="text-right">Total</TH>
                  </TR>
                </THead>
                <TBody>
                  {detailQuery.data.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-[11px] text-muted">
                          {[item.brand_name, item.flavor].filter(Boolean).join(" \u00b7 ")}
                        </p>
                      </TD>
                      <TD className="tabular text-right">{item.quantity}</TD>
                      <TD className="tabular text-right">{formatPHP(item.unit_price)}</TD>
                      <TD className="tabular text-right text-muted">{formatPHP(item.unit_cost)}</TD>
                      <TD className="tabular text-right">{formatPHP(item.line_total)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                Payment history
              </p>
              {detailQuery.data.payments.length === 0 ? (
                <p className="text-xs text-muted">No payments recorded.</p>
              ) : (
                <div className="space-y-1.5">
                  {detailQuery.data.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between rounded-lg border border-line bg-canvas/50 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="capitalize">{payment.method.replace("_", " ")}</p>
                        <p className="text-[11px] text-muted">
                          {formatDateTime(payment.paid_at)}
                          {payment.reference_no ? ` \u00b7 ${payment.reference_no}` : ""}
                        </p>
                      </div>
                      <span
                        className={
                          payment.voided_at ? "tabular text-muted line-through" : "tabular text-accent"
                        }
                      >
                        {formatPHP(payment.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detailQuery.data.voided_at ? (
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
                Voided {formatDateTime(detailQuery.data.voided_at)} \u2014{" "}
                {detailQuery.data.void_reason}
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Sale not found" />
        )}
      </Dialog>

      <PaymentDialog
        sale={payFor}
        onClose={() => setPayFor(null)}
        onSubmit={(values) => paymentMutation.mutate(values)}
        pending={paymentMutation.isPending}
      />

      <VoidDialog
        sale={voidFor}
        onClose={() => setVoidFor(null)}
        onSubmit={(reason) => voidMutation.mutate(reason)}
        pending={voidMutation.isPending}
      />

      {/* ---------------------------------------------------------- manual */}
      <Dialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Record manual sale"
        description="Use this for sales taken outside the POS. Stock is deducted immediately."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => manualMutation.mutate()}
              disabled={
                manualMutation.isPending || !manualLines.some((line) => line.product_id)
              }
            >
              {manualMutation.isPending ? "Saving\u2026" : "Save sale"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Sale date">
            <Input
              type="date"
              value={manualDate}
              onChange={(event) => setManualDate(event.target.value)}
            />
          </Field>
          <Field label="Customer">
            <Select
              value={manualCustomer}
              onChange={(event) => setManualCustomer(event.target.value)}
            >
              <option value="">Walk-in / typed name</option>
              {(customersQuery.data?.items ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Customer name (walk-in)">
            <Input
              value={manualName}
              onChange={(event) => setManualName(event.target.value)}
              disabled={Boolean(manualCustomer)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Items</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setManualLines((lines) => [...lines, { product_id: "", quantity: "1" }])
              }
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          </div>

          {manualLines.map((line, index) => {
            const product = productsQuery.data?.items.find(
              (entry) => entry.id === line.product_id,
            );
            return (
              <div
                key={index}
                className="grid gap-2 rounded-lg border border-line bg-canvas/40 p-3 sm:grid-cols-[1fr_90px_120px_36px]"
              >
                <Select
                  value={line.product_id}
                  onChange={(event) =>
                    setManualLines((lines) =>
                      lines.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, product_id: event.target.value }
                          : entry,
                      ),
                    )
                  }
                >
                  <option value="">Select product</option>
                  {(productsQuery.data?.items ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name} \u00b7 {entry.flavor} ({entry.stock_qty} left)
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min="1"
                  value={line.quantity}
                  onChange={(event) =>
                    setManualLines((lines) =>
                      lines.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, quantity: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <div className="flex items-center justify-end px-2 text-sm">
                  {formatPHP(
                    Number(product?.selling_price ?? 0) * Number(line.quantity || 0),
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setManualLines((lines) =>
                      lines.length === 1 ? lines : lines.filter((_, i) => i !== index),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Payment method">
            <Select value={manualMethod} onChange={(event) => setManualMethod(event.target.value)}>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Amount paid">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={manualPaid}
              onChange={(event) => setManualPaid(event.target.value)}
              placeholder={manualTotal.toFixed(2)}
            />
          </Field>
          <Field label="Reference no.">
            <Input
              value={manualRef}
              onChange={(event) => setManualRef(event.target.value)}
              placeholder="Optional"
            />
          </Field>
          <Field label="Notes" className="sm:col-span-3">
            <Textarea
              value={manualNotes}
              onChange={(event) => setManualNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-surface-2/50 px-4 py-3 text-sm">
          <span className="text-muted">Sale total</span>
          <span className="tabular text-base font-semibold">{formatPHP(manualTotal)}</span>
        </div>
      </Dialog>
    </div>
  );
}

function Summary({
  label,
  value,
  positive,
  danger,
}: {
  label: string;
  value: string;
  positive?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas/50 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`tabular mt-1 text-sm font-semibold ${
          danger ? "text-danger" : positive ? "text-accent" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function PaymentDialog({
  sale,
  onClose,
  onSubmit,
  pending,
}: {
  sale: SaleWithBalance | null;
  onClose: () => void;
  onSubmit: (values: { amount: number; method: string; reference: string }) => void;
  pending: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const balance = Number(sale?.balance ?? 0);

  return (
    <Dialog
      open={Boolean(sale)}
      onClose={() => {
        setAmount("");
        onClose();
      }}
      title={sale ? `Record payment \u00b7 ${sale.transaction_number}` : "Record payment"}
      description={sale ? `Outstanding balance ${formatPHP(balance)}` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({ amount: Number(amount || 0), method, reference })
            }
            disabled={pending || Number(amount) <= 0 || Number(amount) > balance}
          >
            {pending ? "Saving\u2026" : "Record payment"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Amount">
          <Input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={balance.toFixed(2)}
          />
        </Field>
        <Field label="Method">
          <Select value={method} onChange={(event) => setMethod(event.target.value)}>
            <option value="cash">Cash</option>
            <option value="gcash">GCash</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Reference no.">
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Optional"
            disabled={method === "cash"}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function VoidDialog({
  sale,
  onClose,
  onSubmit,
  pending,
}: {
  sale: SaleWithBalance | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");

  return (
    <Dialog
      open={Boolean(sale)}
      onClose={() => {
        setReason("");
        onClose();
      }}
      title={sale ? `Void ${sale.transaction_number}?` : "Void sale"}
      description="Stock is restored and recorded payments are reversed. This cannot be undone."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => onSubmit(reason)}
            disabled={pending || reason.trim().length < 3}
          >
            {pending ? "Voiding\u2026" : "Void sale"}
          </Button>
        </>
      }
    >
      <Field label="Reason *" hint="At least 3 characters. Stored in the audit log.">
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Wrong item scanned"
        />
      </Field>
    </Dialog>
  );
}
