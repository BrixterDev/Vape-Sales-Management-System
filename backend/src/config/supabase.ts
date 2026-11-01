import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { ApiError } from "../lib/errors";

/**
 * Anonymous client — used to verify access tokens.
 */
export const supabasePublic: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  },
);

/**
 * User-scoped client. Requests run under the caller's JWT, so RLS applies.
 */
export function getUserClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Only for auth administration (invite / deactivate).
 * Never use it to serve business data: it bypasses RLS.
 */
export function getAdminClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError(
      500,
      "SERVICE_KEY_MISSING",
      "SUPABASE_SERVICE_ROLE_KEY is not configured on the server",
    );
  }

  adminClient ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  return adminClient;
}
