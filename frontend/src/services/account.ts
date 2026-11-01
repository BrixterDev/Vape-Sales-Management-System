import type {
  AuditLog,
  InviteUserInput,
  Profile,
  Settings,
  SettingsInput,
  UpdateUserInput,
} from "@vape/shared";
import { api } from "@/lib/api";
import type { Paginated } from "./products";

export interface UserRow extends Profile {
  email: string | null;
}

export const usersService = {
  list: () => api.get<UserRow[]>("/users"),

  create: (input: InviteUserInput) =>
    api.post<{
      id: string;
      email: string;
      role: string;
      temporary_password: string;
    }>("/users", input),

  update: (id: string, input: UpdateUserInput) =>
    api.patch<Profile>(`/users/${id}`, input),

  deactivate: (id: string) => api.post<Profile>(`/users/${id}/deactivate`),
};

export const settingsService = {
  get: () => api.get<Settings>("/settings"),

  update: (input: SettingsInput) => api.patch<Settings>("/settings", input),

  auditLogs: (params: {
    page: number;
    pageSize: number;
    table?: string;
    action?: string;
    from?: string;
    to?: string;
  }) => api.get<Paginated<AuditLog>>("/settings/audit-logs", params),
};
