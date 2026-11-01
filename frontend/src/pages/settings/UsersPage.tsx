import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Plus, ShieldCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import type { UserRole } from "@vape/shared";
import { usersService, type UserRow } from "@/services/account";
import { useAuth } from "@/contexts/AuthContext";
import { errorMessage } from "@/lib/api";
import { formatDate, initials } from "@/lib/utils";
import { PageHeader } from "@/components/ui/layout-bits";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
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

export default function UsersPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [formOpen, setFormOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<"manager" | "cashier">("cashier");
  const [created, setCreated] = useState<{
    email: string;
    temporary_password: string;
  } | null>(null);

  const listQuery = useQuery({ queryKey: ["users"], queryFn: usersService.list });

  const createMutation = useMutation({
    mutationFn: () =>
      usersService.create({
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        phone: phone.trim() || null,
      }),
    onSuccess: (result) => {
      setCreated({ email: result.email, temporary_password: result.temporary_password });
      setFormOpen(false);
      setEmail("");
      setFullName("");
      setPhone("");
      setRole("cashier");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; role?: UserRole; is_active?: boolean }) =>
      usersService.update(input.id, {
        ...(input.role ? { role: input.role } : {}),
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
      }),
    onSuccess: () => {
      toast.success("User updated");
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const rows = listQuery.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="User Management"
        description="Create staff accounts, assign roles and control access."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="h-4 w-4" />
            Add user
          </Button>
        }
      />

      <div className="rounded-lg border border-line bg-surface-2/50 px-4 py-3 text-xs text-muted">
        Roles: <span className="text-foreground">Owner</span> manages everything,{" "}
        <span className="text-foreground">Manager</span> runs inventory and sales,{" "}
        <span className="text-foreground">Cashier</span> is limited to POS, own sales and payments.
      </div>

      <TableWrap>
        {listQuery.isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No users yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>User</TH>
                <TH>Email</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Joined</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((user: UserRow) => (
                <TR key={user.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface-2 text-[11px] font-semibold text-accent">
                        {initials(user.full_name)}
                      </div>
                      <span className="font-medium">{user.full_name || "\u2014"}</span>
                    </div>
                  </TD>
                  <TD className="text-muted">{user.email ?? "\u2014"}</TD>
                  <TD>
                    <Select
                      value={user.role}
                      onChange={(event) =>
                        updateMutation.mutate({
                          id: user.id,
                          role: event.target.value as UserRole,
                        })
                      }
                      disabled={user.id === profile?.id}
                      className="h-8 w-auto text-xs"
                    >
                      <option value="owner">Owner</option>
                      <option value="manager">Manager</option>
                      <option value="cashier">Cashier</option>
                    </Select>
                  </TD>
                  <TD>
                    {user.is_active ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="danger">Inactive</Badge>
                    )}
                  </TD>
                  <TD className="text-xs text-muted">{formatDate(user.created_at)}</TD>
                  <TD>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger"
                        disabled={!user.is_active || user.id === profile?.id}
                        onClick={() =>
                          updateMutation.mutate({ id: user.id, is_active: false })
                        }
                      >
                        <UserX className="h-4 w-4" />
                        Deactivate
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </TableWrap>

      <Dialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Create staff account"
        description="A temporary password is generated. Share it securely; the user can sign in immediately."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !email.trim() || !fullName.trim()}
            >
              {createMutation.isPending ? "Creating\u2026" : "Create account"}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *" className="sm:col-span-2">
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Maria Santos"
            />
          </Field>
          <Field label="Email *" className="sm:col-span-2">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="staff@example.com"
            />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Role">
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as "manager" | "cashier")}
            >
              <option value="cashier">Cashier / Staff</option>
              <option value="manager">Manager</option>
            </Select>
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={Boolean(created)}
        onClose={() => setCreated(null)}
        title="Account created"
        description="Copy these credentials now. The password is not shown again."
        footer={
          <Button onClick={() => setCreated(null)}>Done</Button>
        }
      >
        {created ? (
          <div className="space-y-3">
            <Field label="Email">
              <Input readOnly value={created.email} />
            </Field>
            <Field label="Temporary password">
              <div className="flex gap-2">
                <Input readOnly value={created.temporary_password} className="font-mono" />
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(created.temporary_password);
                    toast.success("Password copied");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </Field>
            <p className="text-xs text-muted">
              Ask the user to change it from the account menu after signing in.
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
