import { supabase } from "./supabase";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const API_PREFIX = "/api/v1";

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code = "UNKNOWN", details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export function toQuery(params?: Record<string, QueryValue>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

async function authHeaders(): Promise<Headers> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return headers;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = await authHeaders();
  const response = await fetch(`${BASE}${API_PREFIX}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = response.statusText || "Request failed";
    let code = "REQUEST_FAILED";
    let details: unknown;

    try {
      const body = await response.json();
      message = body?.error?.message ?? message;
      code = body?.error?.code ?? code;
      details = body?.error?.details;
    } catch {
      /* non-JSON error body */
    }

    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("vape:unauthorized"));
    }

    throw new ApiClientError(message, response.status, code, details);
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, QueryValue>) =>
    request<T>(`${path}${toQuery(params)}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Authenticated file download (CSV exports). */
export async function downloadFile(
  path: string,
  params: Record<string, QueryValue>,
  fallbackName: string,
): Promise<void> {
  const headers = await authHeaders();
  headers.delete("Content-Type");

  const response = await fetch(`${BASE}${API_PREFIX}${path}${toQuery(params)}`, {
    headers,
  });

  if (!response.ok) {
    throw new ApiClientError("Unable to export the file", response.status);
  }

  const disposition = response.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
