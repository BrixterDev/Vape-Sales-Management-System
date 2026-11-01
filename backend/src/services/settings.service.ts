import type { SupabaseClient } from "@supabase/supabase-js";
import type { SettingsInput } from "@vape/shared";
import { fail } from "../lib/db";

export async function getSettings(db: SupabaseClient) {
  const { data, error } = await db
    .from("settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) fail(error, "Unable to load settings");
  return data;
}

export async function updateSettings(db: SupabaseClient, input: SettingsInput) {
  const { data, error } = await db
    .from("settings")
    .update(input)
    .eq("id", 1)
    .select()
    .maybeSingle();

  if (error) fail(error, "Unable to save settings");
  return data;
}

export async function listAuditLogs(
  db: SupabaseClient,
  params: { page: number; pageSize: number; table?: string; action?: string; from?: string; to?: string },
) {
  let query = db.from("audit_logs").select("*", { count: "exact" });

  if (params.table) query = query.eq("table_name", params.table);
  if (params.action) query = query.eq("action", params.action.toUpperCase());
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", params.to);

  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) fail(error, "Unable to load audit logs");

  return {
    items: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}
