import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  Layers,
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
import type {
  CreateSaleResult,
  PosBatch,
  PosBatchItem,
} from "@vape/shared";
import { productsService } from "@/services/products";
import { salesService } from "@/services/sales";
import { customersService } from "@/services/parties";
import { settingsService } from "@/services/account";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { SaleReceipt, type ReceiptPaymentMethod } from "@/components/receipt/SaleReceipt";
import {
  cn,
  formatDate,
  formatPHP,
  newIdempotencyKey,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { EmptyState, Skeleton } from "@/components/ui/helpers";

type BatchMode = "auto" | "choose";

interface CartProduct {
  id: string;
  name: string;
  brand: string | null;
  flavor: string;
}

interface CartLine {
  product: CartProduct;
  batchItemId: string | null;
  batchNumber: string | null;
  unitPrice: number;
  available: number;
  quantity: number;
}

interface PosGridItem {
  key: string;
  product: CartProduct;
  price: number;
  available: number;
  lowStock: boolean;
  batchItemId: string | null;
  batchNumber: string | null;
}

const lineKey = (productId: string, batchItemId: string | null) =>
  `${productId}:${batchItemId ?? "auto"}`;

const readBatchMode = (): BatchMode => {
  if (typeof window === "undefined") return "auto";
  return window.localStorage.getItem("pos-batch-mode") === "choose" ? "choose" : "auto";
};

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
  const [receiptMeta, setReceiptMeta] = useState<{
    method: ReceiptPaymentMethod;
    reference: string | null;
    change: number;
  }>({ method: "cash", reference: null, change: 0 });
  const [batchMode, setBatchMode] = useState<BatchMode>(readBatchMode);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const productsQuery = useQuery({
    queryKey: ["pos-products", debounced],
    queryFn: () =>
      productsService.list({
        page: 1,
        pageSize: 100,
        search: debounced || undefined,
        inStock: true,
      }),
    enabled: batchMode === "auto",
  });

  const customersQuery = useQuery({
    queryKey: ["customer-options"],
    queryFn: () => customersService.list({ page: 1, pageSize: 100 }),
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: settingsService.get,
    staleTime: 5 * 60 * 1000,
  });

  const posBatchesQuery = useQuery({
    queryKey: ["pos-batches"],
    queryFn: productsService.posBatches,
    enabled: batchMode === "choose",
  });

  const posBatchItemsQuery = useQuery({
    queryKey: ["pos-batch-items", selectedBatchId],
    queryFn: () => productsService.posBatchItems(selectedBatchId),
    enabled: batchMode === "choose" && Boolean(selectedBatchId),
  });

  const products = useMemo(
    () =>
      (productsQuery.data?.items ?? []).filter(
        (product) => !product.is_archived && product.stock_qty > 0,
      ),
    [productsQuery.data],
  );

  const posBatches: PosBatch[] = posBatchesQuery.data ?? [];
  const selectedBatch =
    posBatches.find((batch) => batch.batch_id === selectedBatchId) ?? null;
  const batchItems: PosBatchItem[] = selectedBatch
    ? posBatchItemsQuery.data ?? []
    : [];

  useEffect(() => {
    if (batchMode !== "choose" || !selectedBatchId) return;
    if (
      posBatchesQuery.data &&
      !posBatchesQuery.data.some((batch) => batch.batch_id === selectedBatchId)
    ) {
      setSelectedBatchId("");
    }
  }, [batchMode, selectedBatchId, posBatchesQuery.data]);

  const filteredBatchItems = useMemo(() => {
    const term = debounced.trim().toLowerCase();
    if (!term) return batchItems;
    return batchItems.filter((item) =>
      [item.name, item.sku, item.brand, item.flavor, item.barcode]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(term)),
    );
  }, [batchItems, debounced]);

  const gridItems: PosGridItem[] = useMemo(() => {
    if (batchMode === "choose") {
      return filteredBatchItems.map((item) => ({
        key: item.batch_item_id,
        product: {
          id: item.product_id,
          name: item.name,
          brand: item.brand,
          flavor: item.flavor,
        },
        price: Number(item.selling_price),
        available: item.remaining_quantity,
        lowStock: false,
        batchItemId: item.batch_item_id,
        batchNumber: selectedBatch?.batch_number ?? null,
      }));
    }

    return products.map((product) => ({
      key: product.id,
      product,
      price: Number(product.selling_price),
      available: product.stock_qty,
      lowStock: product.is_low_stock,
      batchItemId: null,
      batchNumber: null,
    }));
  }, [batchMode, filteredBatchItems, products, selectedBatch]);

  const lines = Object.values(cart);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0,
  );
  const total = subtotal;
  const receivedNumber = received === "" ? total : Number(received || 0);
  const change = Math.max(0, receivedNumber - total);
  const canCheckout = lines.length > 0 && receivedNumber >= total && total > 0;

  const updateBatchMode = (mode: BatchMode) => {
    setBatchMode(mode);
    window.localStorage.setItem("pos-batch-mode", mode);
  };

  const addToCart = (
    product: CartProduct,
    spec: {
      batchItemId: string | null;
      batchNumber: string | null;
      unitPrice: number;
      available: number;
    },
    quantity = 1,
  ) => {
    if (spec.available <= 0) {
      toast.error("Out of stock");
      return;
    }

    const key = lineKey(product.id, spec.batchItemId);

    setCart((current) => {
      const existing = current[key];
      const nextQuantity = (existing?.quantity ?? 0) + quantity;
      if (nextQuantity > spec.available) {
        toast.error(`Only ${spec.available} available from this batch`);
        return current;
      }
      return {
        ...current,
        [key]: {
          product,
          batchItemId: spec.batchItemId,
          batchNumber: spec.batchNumber,
          unitPrice: spec.unitPrice,
          available: spec.available,
          quantity: nextQuantity,
        },
      };
    });
  };

  const addGridItem = (item: PosGridItem) => {
    addToCart(item.product, {
      batchItemId: item.batchItemId,
      batchNumber: item.batchNumber,
      unitPrice: item.price,
      available: item.available,
    });
  };

  const setQuantity = (key: string, quantity: number) => {
    setCart((current) => {
      const line = current[key];
      if (!line) return current;
      if (quantity <= 0) {
        const { [key]: _removed, ...rest } = current;
        return rest;
      }
      if (quantity > line.available) {
        toast.error(`Only ${line.available} available`);
        return current;
      }
      return { ...current, [key]: { ...line, quantity } };
    });
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    const term = search.trim().toLowerCase();
    if (!term) return;

    event.preventDefault();

    if (batchMode === "choose") {
      if (!selectedBatch) {
        toast.error("Select a batch first.");
        return;
      }

      const item = batchItems.find(
        (row) =>
          row.barcode?.toLowerCase() === term || row.sku.toLowerCase() === term,
      );

      if (!item) {
        toast.error("No matching item in the selected batch.");
        return;
      }

      addToCart(
        {
          id: item.product_id,
          name: item.name,
          brand: item.brand,
          flavor: item.flavor,
        },
        {
          batchItemId: item.batch_item_id,
          batchNumber: selectedBatch.batch_number,
          unitPrice: Number(item.selling_price),
          available: item.remaining_quantity,
        },
      );
      setSearch("");
      searchRef.current?.focus();
      return;
    }

    const match = products.find(
      (product) =>
        product.barcode?.toLowerCase() === term || product.sku.toLowerCase() === term,
    );

    if (match) {
      addToCart(match, {
        batchItemId: null,
        batchNumber: null,
        unitPrice: Number(match.selling_price),
        available: match.stock_qty,
      });
      setSearch("");
      searchRef.current?.focus();
    } else {
      toast.error("No in-stock product matches that code.");
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
          batch_item_id: line.batchItemId,
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
      setReceiptMeta({
        method,
        reference: reference.trim() || null,
        change: Math.max(0, receivedNumber - Number(result.total)),
      });
      setCart({});
      setReceived("");
      setReference("");
      setCustomerId("");
      setIdempotencyKey(newIdempotencyKey());
      void productsQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: ["pos-batches"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-batch-items"] });
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      toast.success(`Sale ${result.transaction_number} completed`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const receiptContent = receipt ? (
    <SaleReceipt
      receipt={receipt}
      settings={settingsQuery.data}
      cashierName={profile?.full_name}
      method={receiptMeta.method}
      reference={receiptMeta.reference}
      change={receiptMeta.change}
    />
  ) : null;

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
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-line bg-surface-2 p-0.5">
              <button
                type="button"
                onClick={() => updateBatchMode("auto")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  batchMode === "auto"
                    ? "bg-accent text-[#04120a]"
                    : "text-muted hover:text-foreground",
                )}
              >
                Auto (FIFO)
              </button>
              <button
                type="button"
                onClick={() => updateBatchMode("choose")}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  batchMode === "choose"
                    ? "bg-accent text-[#04120a]"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Layers className="h-3.5 w-3.5" />
                Choose batch
              </button>
            </div>
            <Badge tone="accent">
              <ShoppingCart className="h-3 w-3" />
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </Badge>
          </div>
        </div>

        <div className="relative">
          <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder={
              batchMode === "choose"
                ? "Search items in the selected batch…"
                : "Scan barcode or search name, SKU, brand, flavor…"
            }
            className="h-12 pl-10 text-base"
          />
        </div>

        {batchMode === "choose" ? (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-3">
            <Field label="Batch to sell from" className="min-w-[240px] flex-1">
              <Select
                value={selectedBatchId}
                onChange={(event) => setSelectedBatchId(event.target.value)}
              >
                <option value="">Select a batch…</option>
                {posBatches.map((batch) => (
                  <option key={batch.batch_id} value={batch.batch_id}>
                    {batch.batch_number} — {batch.remaining_units} unit
                    {batch.remaining_units === 1 ? "" : "s"} —{" "}
                    {formatDate(batch.date_received)}
                  </option>
                ))}
              </Select>
            </Field>
            {selectedBatch ? (
              <Badge tone="accent">
                {selectedBatch.item_count} item
                {selectedBatch.item_count === 1 ? "" : "s"} ·{" "}
                {selectedBatch.remaining_units} unit
                {selectedBatch.remaining_units === 1 ? "" : "s"} left
              </Badge>
            ) : null}
          </div>
        ) : null}

        {batchMode === "choose" && posBatchesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : batchMode === "choose" && posBatches.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="No batches with stock"
              description="Receive a batch to start selling from it."
            />
          </Card>
        ) : batchMode === "choose" && !selectedBatch ? (
          <Card>
            <EmptyState
              icon={<Layers className="h-5 w-5" />}
              title="Select a batch"
              description="Pick one of the current batches above to see only its items."
            />
          </Card>
        ) : (batchMode === "choose" && posBatchItemsQuery.isLoading) ||
          (batchMode === "auto" && productsQuery.isLoading) ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
        ) : gridItems.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={
                batchMode === "choose"
                  ? debounced.trim()
                    ? "No items match"
                    : "This batch has no items"
                  : debounced.trim()
                    ? "No in-stock products found"
                    : "No products in stock"
              }
              description={
                batchMode === "choose"
                  ? "Only products inside the selected batch are shown."
                  : debounced.trim()
                    ? "Nothing in stock matches that search. Out-of-stock items are hidden from POS."
                    : "Receive a batch to start selling. Out-of-stock items are hidden from POS."
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {gridItems.map((item) => {
              const inCart = lines
                .filter(
                  (line) =>
                    line.product.id === item.product.id &&
                    line.batchItemId === item.batchItemId,
                )
                .reduce((sum, line) => sum + line.quantity, 0);

              return (
                <button
                  key={item.key}
                  onClick={() => addGridItem(item)}
                  className="group flex flex-col rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-accent/40 hover:bg-surface-hover"
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.product.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {[item.product.brand, item.product.flavor]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.batchNumber ? (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-accent">
                          Batch {item.batchNumber}
                        </p>
                      ) : null}
                    </div>
                    {inCart > 0 ? <Badge tone="accent">{inCart}</Badge> : null}
                  </div>
                  <div className="mt-auto flex w-full items-end justify-between pt-3">
                    <p className="tabular text-base font-semibold text-accent">
                      {formatPHP(item.price)}
                    </p>
                    <p
                      className={cn(
                        "text-[11px]",
                        item.lowStock ? "text-warning" : "text-muted",
                      )}
                    >
                      {item.available} {batchMode === "choose" ? "left" : "in stock"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card className="flex h-fit flex-col xl:sticky xl:top-4">
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
              {lines.map((line) => {
                const key = lineKey(line.product.id, line.batchItemId);
                return (
                  <div key={key} className="flex gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.product.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {formatPHP(line.unitPrice)} each
                      </p>
                      {line.batchNumber ? (
                        <p className="mt-1 text-[10px] uppercase tracking-wide text-accent">
                          Batch {line.batchNumber}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQuantity(key, line.quantity - 1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="tabular w-6 text-center text-sm">{line.quantity}</span>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQuantity(key, line.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setQuantity(key, 0)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
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
        <div className="mx-auto w-full max-w-[300px]">
          <div className="mb-3 flex items-center justify-center gap-2 text-accent">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Paid</span>
          </div>
          {receiptContent}
        </div>
      </Dialog>

      {receipt
        ? createPortal(
            <div className="print-root">{receiptContent}</div>,
            document.body,
          )
        : null}
    </div>
  );
}
