import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
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
import type { BatchSummary, Product, ProductStock } from "@vape/shared";
import { batchesService } from "@/services/batches";
import { productsService } from "@/services/products";
import { suppliersService } from "@/services/parties";
import { useAuth } from "@/contexts/AuthContext";
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

interface FlavorRow {
  flavor: string;
  quantity: string;
}

const blankFlavor: FlavorRow = { flavor: "", quantity: "10" };

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export default function BatchesPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isOwner = profile?.role === "owner";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [archived, setArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BatchSummary | null>(null);
  const debounced = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<BatchSummary | null>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [dateReceived, setDateReceived] = useState(isoDate(new Date()));
  const [notes, setNotes] = useState("");
  const [batchBrand, setBatchBrand] = useState("");
  const [batchSupplierPrice, setBatchSupplierPrice] = useState("0");
  const [batchSellingPrice, setBatchSellingPrice] = useState("0");
  const [flavorRows, setFlavorRows] = useState<FlavorRow[]>([{ ...blankFlavor }]);

  const listQuery = useQuery({
    queryKey: ["batches", page, debounced, archived],
    queryFn: () =>
      batchesService.list({
        page,
        pageSize: 20,
        search: debounced || undefined,
        archived: archived || undefined,
      }),
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

  const buildSku = (brand: string, flavor: string) => {
    const base = `${slugify(brand) || "vape"}-${slugify(flavor) || "flavor"}`.toUpperCase();
    let sku = base;
    let suffix = 2;
    while (productOptions.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) {
      sku = `${base}-${suffix}`;
      suffix += 1;
    }
    return sku;
  };

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
    const cost = flavorRows.reduce(
      (acc, row) => acc + Number(row.quantity || 0) * Number(batchSupplierPrice || 0),
      0,
    );
    const revenue = flavorRows.reduce(
      (acc, row) => acc + Number(row.quantity || 0) * Number(batchSellingPrice || 0),
      0,
    );
    const units = flavorRows.reduce((acc, row) => acc + Number(row.quantity || 0), 0);
    return { cost, revenue, units };
  }, [flavorRows, batchSupplierPrice, batchSellingPrice]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const brand = batchBrand.trim();
      const supplierPrice = Number(batchSupplierPrice || 0);
      const sellingPrice = Number(batchSellingPrice || 0);
      const rows = flavorRows
        .map((row) => ({ flavor: row.flavor.trim(), quantity: Number(row.quantity || 0) }))
        .filter((row) => row.flavor.length > 0 && row.quantity > 0);

      if (!batchNumber.trim() || rows.length === 0) {
        throw new Error("Batch number and at least one flavor are required");
      }

      const batchItems: Array<{
        product_id: string;
        quantity_received: number;
        supplier_price: number;
        selling_price: number;
      }> = [];

      for (const row of rows) {
        const existing = productOptions.find(
          (product) =>
            ((product as ProductStock).brand ?? "").toLowerCase() === brand.toLowerCase() &&
            product.flavor.toLowerCase() === row.flavor.toLowerCase(),
        );

        let productId = existing?.id;
        if (!productId) {
          const brandRecord = brandsQuery.data?.find(
            (entry) => entry.name.toLowerCase() === brand.toLowerCase(),
          );
          const created = await productsService.create({
            sku: buildSku(brand, row.flavor),
            name: `${brand} ${row.flavor}`,
            brand_id: brandRecord?.id ?? null,
            flavor: row.flavor,
            selling_price: sellingPrice,
            low_stock_threshold: 5,
          });
          setExtraProducts((previous) => [...previous, created]);
          productId = created.id;
        }

        batchItems.push({
          product_id: productId,
          quantity_received: row.quantity,
          supplier_price: supplierPrice,
          selling_price: sellingPrice,
        });
      }

      const result = await batchesService.create({
        batch_number: batchNumber.trim(),
        supplier_id: supplierId || null,
        date_received: dateReceived,
        notes: notes.trim() || null,
        items: batchItems,
      });

      return result;
    },
    onSuccess: () => {
      toast.success("Batch received");
      setCreateOpen(false);
      setBatchNumber("");
      setSupplierId("");
      setNotes("");
      setDateReceived(isoDate(new Date()));
      setBatchBrand("");
      setBatchSupplierPrice("0");
      setBatchSellingPrice("0");
      setFlavorRows([{ ...blankFlavor }]);
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["product-options"] });
      void queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { batch: BatchSummary; archived: boolean }) =>
      batchesService.archive(input.batch.batch_id, input.archived),
    onSuccess: (_batch, input) => {
      toast.success(input.archived ? "Batch deleted" : "Batch restored");
      setPendingDelete(null);
      if (input.archived && detail?.batch_id === input.batch.batch_id) {
        setDetail(null);
      }
      void queryClient.invalidateQueries({ queryKey: ["batches"] });
      void queryClient.invalidateQueries({ queryKey: ["batch-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["product-options"] });
      void queryClient.invalidateQueries({ queryKey: ["pos-products"] });
      void queryClient.invalidateQueries({ queryKey: ["product-batches"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

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
        <Button
          variant={archived ? "primary" : "secondary"}
          onClick={() => {
            setArchived((value) => !value);
            setPage(1);
          }}
        >
          <Archive className="h-4 w-4" />
          Archived
        </Button>
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
            title={archived ? "No deleted batches" : "No batches yet"}
            description={
              archived
                ? "Batches you delete, and batches that sell out, are kept here for history."
                : "Receive your first batch to load stock into inventory."
            }
            action={
              archived ? undefined : (
                <Button onClick={() => setCreateOpen(true)}>Receive batch</Button>
              )
            }
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
                    <TD className="font-medium">
                      {batch.batch_number}
                      {batch.is_archived ? (
                        <Badge tone="neutral" className="ml-2">
                          Deleted
                        </Badge>
                      ) : null}
                    </TD>
                    <TD className="text-muted">{batch.supplier ?? "—"}</TD>
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
                      <div className="flex items-center justify-end gap-1">
                        {isOwner ? (
                          batch.is_archived ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Restore batch"
                              disabled={archiveMutation.isPending}
                              onClick={() =>
                                archiveMutation.mutate({ batch, archived: false })
                              }
                            >
                              <ArchiveRestore className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              title={
                                batch.remaining_units > 0
                                  ? "Sell or adjust the stock to zero before deleting"
                                  : "Delete batch"
                              }
                              disabled={
                                batch.remaining_units > 0 || archiveMutation.isPending
                              }
                              onClick={() => setPendingDelete(batch)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )
                        ) : null}
                        <Button variant="ghost" size="icon" onClick={() => setDetail(batch)}>
                          <ChevronRight className="h-4 w-4" />
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

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Receive batch"
        description="One brand per batch, with FIFO-ready cost and price snapshots."
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
                !batchBrand.trim() ||
                flavorRows.every((row) => !row.flavor.trim() || Number(row.quantity) <= 0)
              }
            >
              {createMutation.isPending ? "Saving…" : "Receive batch"}
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
          <Field label="Brand name *">
            <Input
              value={batchBrand}
              onChange={(event) => setBatchBrand(event.target.value)}
              placeholder="XBLACK Non Transparent"
            />
          </Field>
          <Field label="Supplier price (PHP)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={batchSupplierPrice}
              onChange={(event) => setBatchSupplierPrice(event.target.value)}
            />
          </Field>
          <Field label="Selling price (PHP)">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={batchSellingPrice}
              onChange={(event) => setBatchSellingPrice(event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Flavors</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFlavorRows((rows) => [...rows, { flavor: "", quantity: "10" }])}
            >
              <Plus className="h-4 w-4" />
              Add flavor
            </Button>
          </div>

          {flavorRows.map((row, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-line bg-canvas/40 p-3 sm:grid-cols-[1fr_90px_36px]"
            >
              <Input
                value={row.flavor}
                onChange={(event) =>
                  setFlavorRows((rows) =>
                    rows.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, flavor: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Mango"
              />
              <Input
                type="number"
                min="1"
                value={row.quantity}
                onChange={(event) =>
                  setFlavorRows((rows) =>
                    rows.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, quantity: event.target.value } : entry,
                    ),
                  )
                }
                placeholder="Qty"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  setFlavorRows((rows) => (rows.length === 1 ? rows : rows.filter((_, i) => i !== index)))
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
        description={detail ? `${detail.supplier ?? "No supplier"} · ${formatDate(detail.date_received)}` : undefined}
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
                        <p className="font-medium">{item.products?.name ?? "—"}</p>
                        <p className="text-[11px] text-muted">
                          {[item.products?.brands?.name, item.products?.flavor]
                            .filter(Boolean)
                            .join(" · ")}
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

      <Dialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete batch?"
        description={
          pendingDelete
            ? `Batch ${pendingDelete.batch_number} will be removed from lists and the POS.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={archiveMutation.isPending}
              onClick={() =>
                pendingDelete
                  ? archiveMutation.mutate({ batch: pendingDelete, archived: true })
                  : undefined
              }
            >
              {archiveMutation.isPending ? "Deleting…" : "Delete batch"}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm text-muted">
          <p>
            Sales, stock movements and profit history for this batch are kept, so reports
            stay accurate.
          </p>
          <p>You can restore it any time from the Archived list.</p>
        </div>
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
