import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Search, Truck } from "lucide-react";
import { toast } from "sonner";
import type { Supplier } from "@vape/shared";
import { suppliersService } from "@/services/parties";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { formatDate, formatNumber, formatPHP } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/form";
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

interface SupplierForm {
  id?: string;
  name: string;
  phone: string;
  address: string;
  notes: string;
}

const emptyForm: SupplierForm = {
  name: "",
  phone: "",
  address: "",
  notes: "",
};

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [detail, setDetail] = useState<Supplier | null>(null);

  const listQuery = useQuery({
    queryKey: ["suppliers", page, debounced],
    queryFn: () => suppliersService.list({ page, pageSize: 20, search: debounced || undefined }),
  });

  const batchesQuery = useQuery({
    queryKey: ["supplier-batches", detail?.id],
    queryFn: () => suppliersService.batches(detail!.id),
    enabled: Boolean(detail),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      };
      return form.id ? suppliersService.update(form.id, payload) : suppliersService.create(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Supplier updated" : "Supplier created");
      setFormOpen(false);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      void queryClient.invalidateQueries({ queryKey: ["supplier-options"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Suppliers"
        description="Vendors you receive stock from, with their batch history."
        actions={
          <Button
            onClick={() => {
              setForm(emptyForm);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Add supplier
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search supplier"
          className="pl-9"
        />
      </div>

      <TableWrap>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : (listQuery.data?.items ?? []).length === 0 ? (
          <EmptyState
            icon={<Truck className="h-5 w-5" />}
            title="No suppliers yet"
            description="Add a supplier before receiving a batch."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Supplier</TH>
                  <TH>Phone</TH>
                  <TH>Status</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(listQuery.data?.items ?? []).map((supplier) => (
                  <TR key={supplier.id}>
                    <TD className="font-medium">{supplier.name}</TD>
                    <TD className="text-muted">{supplier.phone ?? "\u2014"}</TD>
                    <TD>
                      {supplier.is_active ? (
                        <Badge tone="success">Active</Badge>
                      ) : (
                        <Badge>Inactive</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setDetail(supplier)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setForm({
                              id: supplier.id,
                              name: supplier.name,
                              phone: supplier.phone ?? "",
                              address: supplier.address ?? "",
                              notes: supplier.notes ?? "",
                            });
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
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
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={form.id ? "Edit supplier" : "New supplier"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending ? "Saving\u2026" : "Save"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name *" className="sm:col-span-2">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Metro Vape Distributors"
            />
          </Field>
          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(event) => setForm({ ...form, phone: event.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input
              value={form.address}
              onChange={(event) => setForm({ ...form, address: event.target.value })}
            />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Supplier"}
        description="Batches received from this supplier"
        size="lg"
      >
        {batchesQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : (batchesQuery.data ?? []).length === 0 ? (
          <EmptyState title="No batches yet" description="Receive a batch to see it here." />
        ) : (
          <div className="space-y-2">
            {(batchesQuery.data ?? []).map((batch) => {
              const row = batch as unknown as {
                batch_id: string;
                batch_number: string;
                date_received: string;
                total_units: number;
                remaining_units: number;
                total_cost: number;
              };
              return (
                <div
                  key={row.batch_id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/50 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">{row.batch_number}</p>
                    <p className="text-[11px] text-muted">
                      {formatDate(row.date_received)} · {formatNumber(row.remaining_units)} /{" "}
                      {formatNumber(row.total_units)} units left
                    </p>
                  </div>
                  <p className="tabular text-sm">{formatPHP(row.total_cost)}</p>
                </div>
              );
            })}
          </div>
        )}
      </Dialog>
    </div>
  );
}
