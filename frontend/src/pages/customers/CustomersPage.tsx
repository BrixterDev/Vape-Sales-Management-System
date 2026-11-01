import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import type { CustomerBalance } from "@vape/shared";
import { customersService } from "@/services/parties";
import { useAuth } from "@/contexts/AuthContext";
import { useDebounced } from "@/hooks/useDebounced";
import { errorMessage } from "@/lib/api";
import { formatDateTime, formatNumber, formatPHP } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
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

interface CustomerForm {
  id?: string;
  name: string;
}

const emptyForm: CustomerForm = { name: "" };

export default function CustomersPage() {
  const { profile } = useAuth();
  const canManage = profile?.role === "owner" || profile?.role === "manager";
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [detail, setDetail] = useState<CustomerBalance | null>(null);

  const listQuery = useQuery({
    queryKey: ["customers", page, debounced],
    queryFn: () => customersService.list({ page, pageSize: 20, search: debounced || undefined }),
  });

  const historyQuery = useQuery({
    queryKey: ["customer-transactions", detail?.id],
    queryFn: () => customersService.transactions(detail!.id),
    enabled: Boolean(detail),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name.trim() };
      return form.id ? customersService.update(form.id, payload) : customersService.create(payload);
    },
    onSuccess: () => {
      toast.success(form.id ? "Customer updated" : "Customer created");
      setFormOpen(false);
      setForm(emptyForm);
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["customer-options"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const openEdit = (customer: CustomerBalance) => {
    setForm({ id: customer.id, name: customer.name });
    setFormOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Customers"
        description="Customer names and their order history."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setForm(emptyForm);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add customer
            </Button>
          ) : null
        }
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search customer name"
          className="pl-9"
        />
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
            icon={<Users className="h-5 w-5" />}
            title="No customers yet"
            description="Add a customer to track balances and repeat purchases."
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Customer</TH>
                  <TH className="text-right">Orders</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {(listQuery.data?.items ?? []).map((customer) => (
                  <TR key={customer.id}>
                    <TD>
                      <p className="font-medium">{customer.name}</p>
                      {!customer.is_active ? <Badge>Inactive</Badge> : null}
                    </TD>
                    <TD className="tabular text-right">
                      {formatNumber(customer.transaction_count)}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setDetail(customer)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canManage ? (
                          <Button variant="ghost" size="icon" onClick={() => openEdit(customer)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
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
        title={form.id ? "Edit customer" : "New customer"}
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
        <div className="grid gap-4">
          <Field label="Name *">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Juan Dela Cruz"
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Customer"}
        description={
          detail
            ? `${formatNumber(detail.transaction_count)} transactions \u00b7 ${formatPHP(detail.total_purchases)} lifetime`
            : undefined
        }
        size="lg"
      >
        {historyQuery.isLoading ? (
          <Skeleton className="h-40" />
        ) : (historyQuery.data ?? []).length === 0 ? (
          <EmptyState title="No purchases yet" description="This customer has no transaction history." />
        ) : (
          <div className="space-y-2">
            {(historyQuery.data ?? []).map((sale) => (
              <div
                key={sale.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-canvas/50 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{sale.transaction_number}</p>
                  <p className="text-[11px] text-muted">{formatDateTime(sale.sale_date)}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm">{formatPHP(sale.total)}</p>
                  <p
                    className={`tabular text-[11px] ${
                      sale.balance > 0 ? "text-danger" : "text-accent"
                    }`}
                  >
                    {sale.balance > 0 ? `${formatPHP(sale.balance)} balance` : "Paid"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
