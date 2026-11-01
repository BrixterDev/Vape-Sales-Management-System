import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronRight,
  CircleDollarSign,
  PackagePlus,
  Plus,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { BatchSummary, Product } from "@vape/shared";
import { batchesService } from "@/services/batches";
import { productsService } from "@/services/products";
import { suppliersService } from "@/services/parties";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { formatDate, formatNumber, formatPHP, isoDate } from "@/lib/utils";
import { PageHeader, StatCard } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

interface ItemRow {
  product_id: string;
  quantity_received: string;
  supplier_price: string;
  selling_price: string;
}

const blankItem: ItemRow = {
  product_id: "",
  quantity_received: "1",
  supplier_price: "0",
  selling_price: "0",
};

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<BatchSummary | null>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [dateReceived, setDateReceived] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemRow[]>([{ ...blankItem }]);
  const [newProduct, setNewProduct] = useState({
    name: "",
    brand: "",
    flavor: "",
    sku: "",
    selling_price: "0",
  });
  const [creatingProduct, setCreatingProduct] = useState(false);

  const listQuery = useQuery({
    queryKey: ["batches", page, debounced],
    queryFn: () => batchesService.list({ page, pageSize: 20, search: debounced || undefined }),
  });

  const productsQuery = useQuery({
    queryKey: ["product-options"],
    queryFn: () => productsService.list({ page: 1, pageSize: 100 }),
  });

  const brandsQuery = useQuery({
    queryKey: ["brands"],
    queryFn: () => productsService.brands(),
  });

  const [extraProducts, setExtraProducts] = useState<Product[]>([]);

  const productOptions = useMemo(() => {
    const list = productsQuery.data?.items ?? [];
    const seen = new Set(list.map((p) => p.id));
    const merged = [...list, ...extraProducts.filter((p) => !seen.has(p.id))];
    return merged;
  }, [productsQuery.data, extraProducts]);

  const brandNames = useMemo(() => (brandsQuery.data ?? []).map((brand) => brand.name), [
    brandsQuery.data,
  ]);

  const suppliersQuery = useQuery({
    queryKey: ["supplier-options"],
    queryFn: () => suppliersService.list({ page: 1, pageSize: 100 }),
  });

  const detailQuery = useQuery({
    queryKey: ["batch-detail", detail?.batch_id],
    queryFn: () => batchesService.get(detail!.batch_id),
    enabled: Boolean(detail),
  });

  const totals = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const qty = Number(item.quantity_received || 0);
        const cost = Number(item.supplier_price || 0);
        const price = Number(item.selling_price || 0);
        acc.cost += qty * cost;
        acc.revenue += qty * price;
        acc.units += qty;
        return acc;
      },
      { cost: 0, revenue: 0, units: 0 },
    );
  }, [items]);

  const createMutation = useMutation({
    mutationFn: () =>
      batchesService.create({
        batch_number: batchNumber.trim(),
        supplier_id: supplierId || null,
        date_received: dateReceived,
        notes: notes.trim() || null,
        items: items
          .filter((item) => item.product_id)
          .map((item) => ({
            product_id: item.product_id,
            quantity_received: Number(item.quantity_received || 0),
            supplier_price: Number(item.supplier_price || 0),
            selling_price: Number(item.selling_price || 0),
          })),
      }),
    onSuccess: () => {
      toast.success("Batch received");
      setCreateOpen(false);
      setBatchNumber("");
      setSupplierId("");
      setNotes("");
      setItems([{ ...blankItem }]);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["product-options"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const createProductMutation = useMutation({
    mutationFn: async () => {
      const sellingPrice = Number(newProduct.selling_price || 0);
      let brandId: string | null = null;
      const brandName = newProduct.brand.trim();
      if (brandName) {
        const existing = brandsQuery.data?.find(
          (brand) => brand.name.toLowerCase() === brandName.toLowerCase(),
        );
        brandId = existing?.id ?? (await productsService.createBrand(brandName)).id;
      }

      const product = await productsService.create({
        sku: newProduct.sku.trim(),
        name: newProduct.name.trim(),
        brand_id: brandId,
        flavor: newProduct.flavor.trim(),
        selling_price: sellingPrice,
        low_stock_threshold: 5,
      });

      setExtraProducts((rows) => [...rows, product]);
      setItems((rows) => [
        ...rows,
        {
          product_id: product.id,
          quantity_received: "1",
          supplier_price: "",
          selling_price: String(product.selling_price),
        },
      ]);
      setNewProduct({ name: "", brand: "", flavor: "", sku: "", selling_price: "0" });
      setCreatingProduct(false);
      toast.success("Flavor created and added to batch");
      void queryClient.invalidateQueries({ queryKey: ["product-options"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      return product;
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateItem = (index: number, patch: Partial<ItemRow>) => {
    setItems((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Batches"
        description="Stock received per supplier, with FIFO-ready cost and price snapshots."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <PackagePlus className="h-4 w-4" />
            Receive batch
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search batch number or supplier"
            className="pl-9"
          />
        </div>
      </div>

      <TableWrap>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : (listQuery.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-5 w-5" />}
            title="No batches yet"
            description="Receive your first batch to load stock into inventory."
            action={<Button onClick={() => setCreateOpen(true)}>Receive batch</Button>}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Batch</TH>
                  <TH>Supplier</TH>
                  <TH>Received</TH>
                  <TH className="text-right">Units</TH>
                  <TH className="text-right">Cost</TH>
                  <TH className="text-right">Revenue</TH>
                  <TH className="text-right">Profit</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(listQuery.data?.items ?? []).map((batch) => (
                  <TR key={batch.batch_id}>
                    <TD className="font-medium">{batch.batch_number}</TD>
                    <TD className="text-muted">{batch.supplier ?? "\u2014"}</TD>
                    <TD>{formatDate(batch.date_received)}</TD>
                    <TD className="tabular text-right">
                      {formatNumber(batch.remaining_units)}
                      <span className="text-muted"> / {formatNumber(batch.total_units)}</span>
                    </TD>
                    <TD className="tabular text-right">{formatPHP(batch.total_cost)}</TD>
                    <TD className="tabular text-right">{formatPHP(batch.potential_revenue)}</TD>
                    <TD className="tabular text-right text-accent">
                      {formatPHP(batch.potential_profit)}
                    </TD>
                    <TD>
                      <Button variant="ghost" size="icon" onClick={() => setDetail(batch)}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
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

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Receive batch"
        description="Costs and selling prices are frozen for this batch."
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={
                createMutation.isPending ||
                !batchNumber.trim() ||
                !items.some((item) => item.product_id)
              }
            >
              {createMutation.isPending ? "Saving\u2026" : "Receive batch"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batch number *">
            <Input
              value={batchNumber}
              onChange={(event) => setBatchNumber(event.target.value)}
              placeholder="BATCH-2026-001"
            />
          </Field>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">No supplier</option>
              {(suppliersQuery.data?.items ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date received">
            <Input
              type="date"
              value={dateReceived}
              onChange={(event) => setDateReceived(event.target.value)}
            />
          </Field>
          <Field label="Notes">
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-5 space-y-2">
          <div className="rounded-lg border border-line bg-canvas/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                New flavor / product
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreatingProduct(true)}
                disabled={createMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                Create product
              </Button>
            </div>

            {creatingProduct ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Flavor *">
                  <Input
                    value={newProduct.flavor}
                    onChange={(event) => setNewProduct({ ...newProduct, flavor: event.target.value })}
                    placeholder="Blue Razz"
                  />
                </Field>
                <Field label="Product name *">
                  <Input
                    value={newProduct.name}
                    onChange={(event) => setNewProduct({ ...newProduct, name: event.target.value })}
                    placeholder="Vape X Juice Blue Razz"
                  />
                </Field>
                <Field label="Brand">
                  <Input
                    list="batch-brand-options"
                    value={newProduct.brand}
                    onChange={(event) => setNewProduct({ ...newProduct, brand: event.target.value })}
                    placeholder="Optional"
                  />
                  <datalist id="batch-brand-options">
                    {brandNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </Field>
                <Field label="SKU *">
                  <Input
                    value={newProduct.sku}
                    onChange={(event) => setNewProduct({ ...newProduct, sku: event.target.value })}
                    placeholder="JUICE-001"
                  />
                </Field>
                <Field label="Selling price (PHP)">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProduct.selling_price}
                    onChange={(event) =>
                      setNewProduct({ ...newProduct, selling_price: event.target.value })
                    }
                  />
                </Field>
                <div className="flex items-end gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreatingProduct(false)}
                    disabled={createProductMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => createProductMutation.mutate()}
                    disabled={
                      createProductMutation.isPending ||
                      !newProduct.name.trim() ||
                      !newProduct.flavor.trim() ||
                      !newProduct.sku.trim()
                    }
                  >
                    {createProductMutation.isPending ? "Creating\u2026" : "Create & add to batch"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Batch items</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setItems((rows) => [...rows, { ...blankItem }])}
            >
              <Plus className="h-4 w-4" />
              Add product
            </Button>
          </div>

          {items.map((item, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-line bg-canvas/40 p-3 sm:grid-cols-[1fr_90px_110px_110px_36px]"
            >
              <Select
                value={item.product_id}
                onChange={(event) => {
                  const productId = event.target.value;
                  const product = productOptions.find((entry) => entry.id === productId);
                  updateItem(index, {
                    product_id: productId,
                    selling_price: product ? String(product.selling_price) : item.selling_price,
                  });
                }}
              >
                <option value="">Select product</option>
                {productOptions.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · {product.flavor}
                  </option>
                ))}
              </Select>
              <Input
                type="number"
                min="1"
                value={item.quantity_received}
                onChange={(event) =>
                  updateItem(index, { quantity_received: event.target.value })
                }
                placeholder="Qty"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.supplier_price}
                onChange={(event) => updateItem(index, { supplier_price: event.target.value })}
                placeholder="Cost"
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={item.selling_price}
                onChange={(event) => updateItem(index, { selling_price: event.target.value })}
                placeholder="Price"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setItems((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)))
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-line bg-surface-2/50 p-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Units</p>
            <p className="tabular mt-0.5 text-sm font-semibold">{formatNumber(totals.units)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Batch cost</p>
            <p className="tabular mt-0.5 text-sm font-semibold">{formatPHP(totals.cost)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted">Potential profit</p>
            <p className="tabular mt-0.5 text-sm font-semibold text-accent">
              {formatPHP(totals.revenue - totals.cost)}
            </p>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `Batch ${detail.batch_number}` : "Batch"}
        description={detail ? `${detail.supplier ?? "No supplier"} \u00b7 ${formatDate(detail.date_received)}` : undefined}
        size="xl"
      >
        {detailQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : detailQuery.data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MiniStat label="Units received" value={formatNumber(detailQuery.data.totals.totalUnits)} />
              <MiniStat label="Remaining" value={formatNumber(detailQuery.data.totals.remainingUnits)} />
              <MiniStat label="Batch cost" value={formatPHP(detailQuery.data.totals.totalCost)} />
              <MiniStat
                label="Potential profit"
                value={formatPHP(detailQuery.data.totals.potentialProfit)}
                tone="positive"
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-line">
              <Table>
                <THead>
                  <TR>
                    <TH>Product</TH>
                    <TH className="text-right">Received</TH>
                    <TH className="text-right">Remaining</TH>
                    <TH className="text-right">Cost</TH>
                    <TH className="text-right">Price</TH>
                  </TR>
                </THead>
                <TBody>
                  {detailQuery.data.items.map((item) => (
                    <TR key={item.id}>
                      <TD>
                        <p className="font-medium">{item.products?.name ?? "\u2014"}</p>
                        <p className="text-[11px] text-muted">
                          {[item.products?.brands?.name, item.products?.flavor]
                            .filter(Boolean)
                            .join(" \u00b7 ")}
                        </p>
                      </TD>
                      <TD className="tabular text-right">{item.quantity_received}</TD>
                      <TD className="tabular text-right">{item.remaining_quantity}</TD>
                      <TD className="tabular text-right">{formatPHP(item.supplier_price)}</TD>
                      <TD className="tabular text-right">{formatPHP(item.selling_price)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </div>
        ) : (
          <EmptyState title="Batch not found" />
        )}
      </Dialog>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive";
}) {
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`tabular mt-1 text-sm font-semibold ${tone === "positive" ? "text-accent" : ""}`}>
        {value}
      </p>
    </Card>
  );
}
