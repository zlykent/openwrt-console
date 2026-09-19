"use client";

import { ApiError } from "./errors";

/**
 * Client-side fetch helper for the BFF API.
 * - Unwraps the `{ data }` envelope.
 * - Throws a structured `ApiError` on failure.
 * - On 401 (expired/absent session) redirects to the login page.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // FormData bodies must keep their browser-generated multipart boundary, so
  // only JSON-encode the content type for other payloads.
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, cache: "no-store" });
  } catch (e) {
    throw new ApiError("deviceUnreachable", (e as Error)?.message ?? "Network error", 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const err =
      body && typeof body === "object" && "error" in body
        ? (body as { error: { kind: string; message: string; detail?: string } }).error
        : { kind: "unknown", message: res.statusText || "Request failed" };

    if (res.status === 401 && typeof window !== "undefined") {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?expired=1&next=${next}`;
    }
    throw new ApiError(err.kind ?? "unknown", err.message ?? "Request failed", res.status, err.detail);
  }

  const data = body && typeof body === "object" && "data" in body ? (body as { data: T }).data : (body as T);
  return data;
}
