import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Save, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { settingsService } from "@/services/account";
import { errorMessage } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);

  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: settingsService.get });
  const auditQuery = useQuery({
    queryKey: ["audit-logs", page],
    queryFn: () => settingsService.auditLogs({ page, pageSize: 20 }),
  });

  const [form, setForm] = useState({
    store_name: "",
    address: "",
    phone: "",
    receipt_footer: "",
    default_low_stock: "5",
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    setForm({
      store_name: settingsQuery.data.store_name,
      address: settingsQuery.data.address ?? "",
      phone: settingsQuery.data.phone ?? "",
      receipt_footer: settingsQuery.data.receipt_footer ?? "",
      default_low_stock: String(settingsQuery.data.default_low_stock),
    });
  }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsService.update({
        store_name: form.store_name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        receipt_footer: form.receipt_footer.trim() || null,
        default_low_stock: Number(form.default_low_stock || 0),
      }),
    onSuccess: () => {
      toast.success("Settings saved");
      void queryClient.invalidateQueries({ queryKey: ["settings"] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const logs = auditQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Store details used on receipts, plus a full audit trail."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Store profile</CardTitle>
              <p className="mt-1 text-xs text-muted">Shown on printed receipts.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Store name *">
              <Input
                value={form.store_name}
                onChange={(event) => setForm({ ...form, store_name: event.target.value })}
              />
            </Field>
            <Field label="Address">
              <Input
                value={form.address}
                onChange={(event) => setForm({ ...form, address: event.target.value })}
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
              />
            </Field>
            <Field label="Receipt footer">
              <Textarea
                value={form.receipt_footer}
                onChange={(event) => setForm({ ...form, receipt_footer: event.target.value })}
              />
            </Field>
            <Field label="Default low stock threshold">
              <Input
                type="number"
                min="0"
                value={form.default_low_stock}
                onChange={(event) =>
                  setForm({ ...form, default_low_stock: event.target.value })
                }
              />
            </Field>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.store_name.trim()}
            >
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? "Saving\u2026" : "Save settings"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>System information</CardTitle>
              <p className="mt-1 text-xs text-muted">Read-only environment details.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <InfoRow label="Currency" value="PHP (\u20B1)" />
            <InfoRow label="Timezone" value="Asia/Manila" />
            <InfoRow label="Inventory method" value="FIFO (per batch)" />
            <InfoRow label="Tax mode" value="Non-VAT" />
            <InfoRow label="Returns" value="Void transaction (restores stock)" />
            <div className="rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning">
              Public sign-up is disabled. Create staff accounts from User Management.
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Audit log</CardTitle>
            <p className="mt-1 text-xs text-muted">
              Every insert, update and void on business tables is recorded.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const rows = logs.map((log) => ({
                created_at: log.created_at,
                actor_id: log.actor_id,
                action: log.action,
                table_name: log.table_name,
                record_id: log.record_id,
              }));
              const header = "created_at,actor_id,action,table_name,record_id";
              const body = rows
                .map((row) =>
                  [row.created_at, row.actor_id, row.action, row.table_name, row.record_id]
                    .map((value) => `"${String(value ?? "")}"`)
                    .join(","),
                )
                .join("\r\n");
              const blob = new Blob([`${header}\r\n${body}`], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = "audit-log.csv";
              anchor.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-4 w-4" />
            Export page
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {auditQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-9" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="h-5 w-5" />}
              title="No audit entries yet"
              description="Changes to products, batches, sales and users appear here."
            />
          ) : (
            <>
              <TableWrap className="rounded-none border-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>When</TH>
                      <TH>Action</TH>
                      <TH>Table</TH>
                      <TH>Record</TH>
                      <TH>Actor</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {logs.map((log) => (
                      <TR key={log.id}>
                        <TD className="whitespace-nowrap text-xs text-muted">
                          {formatDateTime(log.created_at)}
                        </TD>
                        <TD>
                          <Badge
                            tone={
                              log.action === "DELETE"
                                ? "danger"
                                : log.action === "INSERT"
                                  ? "success"
                                  : "info"
                            }
                          >
                            {log.action}
                          </Badge>
                        </TD>
                        <TD className="text-muted">{log.table_name}</TD>
                        <TD className="font-mono text-[11px] text-muted">
                          {log.record_id?.slice(0, 8) ?? "\u2014"}
                        </TD>
                        <TD className="font-mono text-[11px] text-muted">
                          {log.actor_id?.slice(0, 8) ?? "system"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrap>
              <Pagination
                page={page}
                pageSize={20}
                total={auditQuery.data?.total ?? 0}
                onPageChange={setPage}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
