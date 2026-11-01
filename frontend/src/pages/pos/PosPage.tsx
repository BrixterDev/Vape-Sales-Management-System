import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { CreateSaleResult, ProductStock } from "@vape/shared";
import { productsService } from "@/services/products";
import { salesService } from "@/services/sales";
import { customersService } from "@/services/parties";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import {
  cn,
  formatDateTime,
  formatPHP,
  newIdempotencyKey,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/helpers";

interface CartLine {
  product: ProductStock;
  quantity: number;
}

export default function PosPage() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 250);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [customerId, setCustomerId] = useState("");
  const [method, setMethod] = useState<"cash" | "gcash" | "bank_transfer" | "other">("cash");
  const [reference, setReference] = useState("");
  const [received, setReceived] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [receipt, setReceipt] = useState<CreateSaleResult | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const productsQuery = useQuery({
    queryKey: ["pos-products", debounced],
    queryFn: () =>
      productsService.list({
        page: 1,
        pageSize: 50,
        search: debounced || undefined,
      }),
  });

  const customersQuery = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => customersService.list({ page: 1, pageSize: 100 }),
  });

  const products = useMemo(
    () => (productsQuery.data?.items ?? []).filter((product) => !product.is_archived),
    [productsQuery.data],
  );

  const lines = Object.values(cart);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * Number(line.product.selling_price),
    0,
  );
  const total = subtotal;
  const receivedNumber = received === "" ? total : Number(received || 0);
  const change = Math.max(0, receivedNumber - total);
  const canCheckout = lines.length > 0 && receivedNumber >= total && total > 0;

  const addToCart = (product: ProductStock) => {
    if (product.stock_qty <= 0) {
      toast.error("Out of stock");
      return;
    }

    setCart((current) => {
      const existing = current[product.id];
      const nextQuantity = (existing?.quantity ?? 0) + 1;
      if (nextQuantity > product.stock_qty) {
        toast.error(`Only ${product.stock_qty} in stock`);
        return current;
      }
      return { ...current, [product.id]: { product, quantity: nextQuantity } };
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    setCart((current) => {
      const line = current[productId];
      if (!line) return current;
      if (quantity <= 0) {
        const { [productId]: _removed, ...rest } = current;
        return rest;
      }
      if (quantity > line.product.stock_qty) {
        toast.error(`Only ${line.product.stock_qty} in stock`);
        return current;
      }
      return { ...current, [productId]: { ...line, quantity } };
    });
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const term = search.trim().toLowerCase();
    if (!term) return;

    const match = products.find(
      (product) =>
        product.barcode?.toLowerCase() === term || product.sku.toLowerCase() === term,
    );

    if (match) {
      event.preventDefault();
      addToCart(match);
      setSearch("");
      searchRef.current?.focus();
    }
  };

  const checkout = useMutation({
    mutationFn: () =>
      salesService.create({
        source: "pos",
        customer_id: customerId || null,
        items: lines.map((line) => ({
          product_id: line.product.id,
          quantity: line.quantity,
        })),
        payment: {
          method,
          amount: Math.min(receivedNumber, total),
          reference_no: reference.trim() || null,
        },
        idempotency_key: idempotencyKey,
      }),
    onSuccess: (result) => {
      setReceipt(result);
      setCart({});
      setReceived("");
      setReference("");
      setCustomerId("");
      setIdempotencyKey(newIdempotencyKey());
      void productsQuery.refetch();
      toast.success(`Sale ${result.transaction_number} completed`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Point of Sale</h1>
            <p className="mt-1 text-sm text-muted">
              Scan a barcode or search for a product to start.
            </p>
          </div>
          <Badge tone="accent">
            <ShoppingCart className="h-3 w-3" />
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Scan barcode or search name, SKU, brand, flavor\u2026"
            className="h-12 pl-10 text-base"
          />
        </div>

        {productsQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="No products found"
              description="Try a different search, or receive a batch to add stock."
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const inCart = cart[product.id]?.quantity ?? 0;
              return (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock_qty <= 0}
                  className={cn(
                    "group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors",
                    product.stock_qty <= 0
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-accent/40 hover:bg-surface-hover",
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{product.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {[product.brand, product.flavor].filter(Boolean).join(" \u00b7 ")}
                      </p>
                    </div>
                    {inCart > 0 ? <Badge tone="accent">{inCart}</Badge> : null}
                  </div>
                  <div className="mt-auto flex w-full items-end justify-between pt-3">
                    <p className="tabular text-base font-semibold text-accent">
                      {formatPHP(product.selling_price)}
                    </p>
                    <p
                      className={cn(
                        "text-[11px]",
                        product.is_low_stock ? "text-warning" : "text-muted",
                      )}
                    >
                      {product.stock_qty} in stock
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card className="flex h-fit flex-col xl:sticky xl:top-20">
        <div className="border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Current sale</h2>
            {lines.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setCart({})}>
                Clear
              </Button>
            ) : null}
          </div>
        </div>

        <div className="max-h-[38vh] overflow-y-auto">
          {lines.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-5 w-5" />}
              title="Cart is empty"
              description="Pick products from the left to begin."
            />
          ) : (
            <div className="divide-y divide-line/70">
              {lines.map((line) => (
                <div key={line.product.id} className="flex gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.product.name}</p>
                    <p className="truncate text-[11px] text-muted">
                      {formatPHP(line.product.selling_price)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="tabular w-6 text-center text-sm">{line.quantity}</span>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQuantity(line.product.id, 0)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <CardContent className="space-y-3 border-t border-line p-4">
          <Field label="Customer (optional)">
            <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">Walk-in</option>
              {(customersQuery.data?.items ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Payment method">
              <Select
                value={method}
                onChange={(event) => setMethod(event.target.value as typeof method)}
              >
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

          <Field label="Amount received">
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={received}
              onChange={(event) => setReceived(event.target.value)}
              placeholder={total ? total.toFixed(2) : "0.00"}
            />
          </Field>

          <div className="space-y-1.5 rounded-lg border border-line bg-canvas/60 p-3 text-sm">
            <div className="flex justify-between text-muted">
              <span>Subtotal</span>
              <span className="tabular">{formatPHP(subtotal)}</span>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <span>Total</span>
              <span className="tabular">{formatPHP(total)}</span>
            </div>
            <div className="flex justify-between text-muted">
              <span>Change</span>
              <span className="tabular text-accent">{formatPHP(change)}</span>
            </div>
          </div>

          <Button
            className="h-11 w-full"
            disabled={!canCheckout || checkout.isPending}
            onClick={() => checkout.mutate()}
          >
            <Banknote className="h-4 w-4" />
            {checkout.isPending ? "Processing\u2026" : `Complete sale \u00b7 ${formatPHP(total)}`}
          </Button>
          {!canCheckout && lines.length > 0 ? (
            <p className="text-center text-[11px] text-muted">
              Amount received must cover the total.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(receipt)}
        onClose={() => setReceipt(null)}
        title="Sale completed"
        description={receipt ? `Transaction ${receipt.transaction_number}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReceipt(null)}>
              Close
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print receipt
            </Button>
          </>
        }
      >
        {receipt ? (
          <div className="print-area mx-auto max-w-xs font-mono text-xs">
            <div className="mb-3 flex items-center justify-center gap-2 text-accent">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-sans text-sm font-semibold">Paid</span>
            </div>
            <div className="space-y-1 border-b border-dashed border-line pb-2">
              <div className="flex justify-between">
                <span className="text-muted">Receipt</span>
                <span>{receipt.transaction_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Date</span>
                <span>{formatDateTime(new Date().toISOString())}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Customer</span>
                <span>{receipt.customer_name || "Walk-in"}</span>
              </div>
            </div>
            <div className="space-y-1 border-b border-dashed border-line py-2">
              {receipt.items.map((item) => (
                <div key={`${item.product_id}-${item.flavor}`} className="flex justify-between gap-2">
                  <span className="truncate">
                    {item.quantity} \u00d7 {item.product_name}
                  </span>
                  <span className="tabular">{formatPHP(item.line_total)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 pt-2">
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span className="tabular">{formatPHP(receipt.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Paid</span>
                <span className="tabular">{formatPHP(receipt.paid_amount)}</span>
              </div>
              {receipt.balance > 0 ? (
                <div className="flex justify-between text-danger">
                  <span>Balance</span>
                  <span className="tabular">{formatPHP(receipt.balance)}</span>
                </div>
              ) : null}
            </div>
            <p className="mt-4 text-center text-[10px] text-muted">Thank you!</p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
