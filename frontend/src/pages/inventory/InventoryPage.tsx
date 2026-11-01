import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Archive,
  Boxes,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import type { ProductStock, StockMovement } from "@vape/shared";
import { productsService } from "@/services/products";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { cn, formatDateTime, formatNumber, formatPHP } from "@/lib/utils";
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

interface FormState {
  id?: string;
  sku: string;
  name: string;
  brand: string;
  flavor: string;
  nicotine_strength: string;
  selling_price: string;
  low_stock_threshold: string;
  notes: string;
}

const emptyForm: FormState = {
  sku: "",
  name: "",
  brand: "",
  flavor: "",
  nicotine_strength: "",
  selling_price: "0",
  low_stock_threshold: "5",
  notes: "",
};

export default function InventoryPage() {
  const { profile } = useAuth();
  const canManage = profile?.role === "owner" || profile?.role === "manager";
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [lowStock, setLowStock] = useState(false);
  const [archived, setArchived] = useState(false);
  const debouncedSearch = useDebounced(search);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<ProductStock | null>(null);
  const [movementsFor, setMovementsFor] = useState<ProductStock | null>(null);

  useEffect(() => setPage(1), [debouncedSearch, lowStock, archived]);

  const listQuery = useQuery({
    queryKey: ["inventory", page, debouncedSearch, lowStock, archived],
    queryFn: () =>
      productsService.list({
        page,
        pageSize: 20,
        search: debouncedSearch || undefined,
        lowStock: lowStock || undefined,
        archived: archived || undefined,
      }),
  });

  const summaryQuery = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: productsService.summary,
  });

  const brandsQuery = useQuery({
    queryKey: ["brands"],
    queryFn: productsService.brands,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const brandName = form.brand.trim();
      let brandId: string | null = null;

      if (brandName) {
        const existing = brandsQuery.data?.find(
          (brand) => brand.name.toLowerCase() === brandName.toLowerCase(),
        );
        brandId = existing?.id ?? (await productsService.createBrand(brandName)).id;
      }

      const payload = {
        sku: form.sku.trim(),
        name: form.name.trim(),
        brand_id: brandId,
        flavor: form.flavor.trim(),
        nicotine_strength: form.nicotine_strength.trim() || null,
        selling_price: Number(form.selling_price || 0),
        low_stock_threshold: Number(form.low_stock_threshold || 0),
        notes: form.notes.trim() || null,
      };

      if (form.id) return productsService.update(form.id, payload);
      return productsService.create(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Product updated" : "Product created");
      setFormOpen(false);
      setForm(emptyForm);
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const archiveMutation = useMutation({
    mutationFn: (product: ProductStock) =>
      productsService.archive(product.id, !product.is_archived),
    onSuccess: () => {
      toast.success("Product updated");
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const movementsQuery = useQuery({
    queryKey: ["movements", movementsFor?.id],
    queryFn: () => productsService.movements(movementsFor!.id),
    enabled: Boolean(movementsFor),
  });

  const summary = summaryQuery.data;
  const items = listQuery.data?.items ?? [];
  const brandNames = useMemo(
    () => (brandsQuery.data ?? []).map((brand) => brand.name),
    [brandsQuery.data],
  );

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (product: ProductStock) => {
    setEditing(product);
    setForm({
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand ?? "",
      flavor: product.flavor,
      nicotine_strength: product.nicotine_strength ?? "",
      selling_price: String(product.selling_price),
      low_stock_threshold: String(product.low_stock_threshold),
      notes: product.notes ?? "",
    });
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        description="Products, stock levels and low-stock monitoring."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Add product
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active Products"
          value={formatNumber(summary?.active_products)}
          icon={<Package className="h-4 w-4" />}
        />
        <StatCard
          label="Units on Hand"
          value={formatNumber(summary?.total_units)}
          icon={<Boxes className="h-4 w-4" />}
        />
        <StatCard
          label="Inventory Cost"
          value={
            summary?.total_cost_value == null
              ? "\u2014"
              : formatPHP(summary.total_cost_value)
          }
          icon={<Wallet className="h-4 w-4" />}
        />
        <StatCard
          label="Low Stock"
          value={formatNumber(summary?.low_stock_count)}
          tone={Number(summary?.low_stock_count ?? 0) > 0 ? "warning" : "default"}
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, SKU, brand or flavor"
            className="pl-9"
          />
        </div>

        <Button
          variant={lowStock ? "primary" : "secondary"}
          size="sm"
          onClick={() => setLowStock((value) => !value)}
        >
          <AlertTriangle className="h-4 w-4" />
          Low stock
        </Button>
        <Button
          variant={archived ? "primary" : "secondary"}
          size="sm"
          onClick={() => setArchived((value) => !value)}
        >
          <Archive className="h-4 w-4" />
          Archived
        </Button>
      </div>

      <TableWrap>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="No products found"
            description={
              archived
                ? "No archived products match this search."
                : "Add your first product to start tracking stock."
            }
            action={canManage ? <Button onClick={openCreate}>Add product</Button> : undefined}
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH>
                  <TH>SKU</TH>
                  <TH className="text-right">Selling Price</TH>
                  <TH className="text-right">Stock</TH>
                  <TH className="text-right">Stock Value</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((product) => (
                  <TR key={product.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted">
                          <Boxes className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{product.name}</p>
                          <p className="truncate text-[11px] text-muted">
                            {[product.brand, product.flavor].filter(Boolean).join(" \u00b7 ") || "\u2014"}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD className="text-xs text-muted">{product.sku}</TD>
                    <TD className="tabular text-right">{formatPHP(product.selling_price)}</TD>
                    <TD className="tabular text-right">
                      <span
                        className={cn(
                          "font-medium",
                          product.stock_qty <= 0
                            ? "text-danger"
                            : product.is_low_stock
                              ? "text-warning"
                              : "text-foreground",
                        )}
                      >
                        {formatNumber(product.stock_qty)}
                      </span>
                    </TD>
                    <TD className="tabular text-right text-muted">
                      {product.stock_cost == null ? "\u2014" : formatPHP(product.stock_cost)}
                    </TD>
                    <TD>
                      {product.is_archived ? (
                        <Badge>Archived</Badge>
                      ) : product.stock_qty <= 0 ? (
                        <Badge tone="danger">Out of stock</Badge>
                      ) : product.is_low_stock ? (
                        <Badge tone="warning">Low stock</Badge>
                      ) : (
                        <Badge tone="success">In stock</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Stock movements"
                          onClick={() => setMovementsFor(product)}
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canManage ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Edit"
                              onClick={() => openEdit(product)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title={product.is_archived ? "Restore" : "Archive"}
                              onClick={() => archiveMutation.mutate(product)}
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          </>
                        ) : null}
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit product" : "New product"}
        description="Selling price is the default used when receiving a new batch."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name || !form.sku || !form.flavor}
            >
              {saveMutation.isPending ? "Saving\u2026" : editing ? "Save changes" : "Create product"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU *">
            <Input
              value={form.sku}
              onChange={(event) => setForm({ ...form, sku: event.target.value })}
              placeholder="ELF-BC-5000"
            />
          </Field>
          <Field label="Product name *">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Elfbar BC5000"
            />
          </Field>
          <Field label="Brand" hint="Type a new name to create it automatically.">
            <Input
              list="brand-options"
              value={form.brand}
              onChange={(event) => setForm({ ...form, brand: event.target.value })}
              placeholder="Elfbar"
            />
            <datalist id="brand-options">
              {brandNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </Field>
          <Field label="Flavor *">
            <Input
              value={form.flavor}
              onChange={(event) => setForm({ ...form, flavor: event.target.value })}
              placeholder="Blue Razz Ice"
            />
          </Field>
          <Field label="Nicotine strength">
            <Input
              value={form.nicotine_strength}
              onChange={(event) =>
                setForm({ ...form, nicotine_strength: event.target.value })
              }
              placeholder="50mg"
            />
          </Field>
          <Field label="Default selling price">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.selling_price}
              onChange={(event) => setForm({ ...form, selling_price: event.target.value })}
            />
          </Field>
          <Field label="Low stock threshold">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.low_stock_threshold}
              onChange={(event) =>
                setForm({ ...form, low_stock_threshold: event.target.value })
              }
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Optional internal notes"
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(movementsFor)}
        onClose={() => setMovementsFor(null)}
        title={`Stock movements${movementsFor ? ` \u00b7 ${movementsFor.name}` : ""}`}
        size="lg"
      >
        {movementsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </div>
        ) : (movementsQuery.data ?? []).length === 0 ? (
          <EmptyState title="No movements yet" description="Receiving a batch or selling this product will create history." />
        ) : (
          <div className="space-y-2">
            {(movementsQuery.data ?? []).map((movement: StockMovement) => (
              <div
                key={movement.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm capitalize">{movement.type.replace("_", " ")}</p>
                  <p className="truncate text-[11px] text-muted">
                    {formatDateTime(movement.created_at)}
                    {movement.reason ? ` \u00b7 ${movement.reason}` : ""}
                  </p>
                </div>
                <span
                  className={cn(
                    "tabular text-sm font-medium",
                    movement.quantity_delta > 0 ? "text-accent" : "text-danger",
                  )}
                >
                  {movement.quantity_delta > 0 ? "+" : ""}
                  {movement.quantity_delta}
                </span>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
