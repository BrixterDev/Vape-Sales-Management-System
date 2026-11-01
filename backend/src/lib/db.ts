import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "./errors";

type DbError = Pick<PostgrestError, "message"> & {
  code?: string | null;
  details?: string | null;
  hint?: string | null;
};

const MAPPING: Record<string, { status: number; code: string }> = {
  "42501": { status: 403, code: "FORBIDDEN" },
  "28000": { status: 401, code: "UNAUTHENTICATED" },
  "23503": { status: 409, code: "REFERENCE_ERROR" },
  "23505": { status: 409, code: "DUPLICATE" },
  "23514": { status: 422, code: "CONSTRAINT_VIOLATION" },
  "22023": { status: 422, code: "INVALID_INPUT" },
  "22P02": { status: 400, code: "INVALID_INPUT" },
  P0001: { status: 422, code: "RULE_VIOLATION" },
};

/** Turn a PostgREST error into an ApiError with a sensible HTTP status. */
export function fail(error: DbError | null, fallback: string): never {
  if (!error) {
    throw ApiError.internal(fallback);
  }

  const mapped = MAPPING[error.code ?? ""];

  if (!mapped) {
    // eslint-disable-next-line no-console
    console.error("[db]", error.code, error.message, error.details);
    throw ApiError.internal(fallback);
  }

  throw new ApiError(mapped.status, mapped.code, error.message, error.details ?? undefined);
}

export function assertFound<T>(data: T | null, message = "Resource not found"): T {
  if (data === null || data === undefined) {
    throw ApiError.notFound(message);
  }
  return data;
}

/** PostgREST `or()` strings break on commas and parentheses. */
export function sanitizeSearch(term: string | undefined): string | null {
  if (!term) return null;
  const cleaned = term.replace(/[%_,()\\]/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function startOfDayIso(value?: string): string | undefined {
  return value;
}

export async function countRows(
  db: SupabaseClient,
  table: string,
): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select("id", { count: "exact", head: true });
  if (error) fail(error, "Unable to count rows");
  return count ?? 0;
}
