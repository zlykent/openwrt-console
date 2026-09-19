import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/lib/auth/session";
import { SshError } from "@/lib/ssh/client";
import { AppError, type ErrorKind } from "./errors";

/** Success envelope. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

/** Error envelope. */
export function fail(
  status: number,
  kind: ErrorKind,
  message: string,
  detail?: string,
): NextResponse {
  return NextResponse.json({ error: { kind, message, detail } }, { status });
}

/** Map a thrown value to a structured HTTP error response. */
export function mapError(e: unknown): NextResponse {
  if (e instanceof UnauthorizedError) {
    return fail(401, "unauthorized", e.message);
  }
  // Raised deliberately by the device/service layer: the message is written
  // for the operator, so forward it verbatim.
  if (e instanceof AppError) {
    return fail(e.status, e.kind, e.message);
  }
  if (e instanceof SshError) {
    switch (e.kind) {
      case "auth":
        return fail(502, "auth", "SSH authentication failed", e.detail);
      case "connect":
        return fail(503, "deviceUnreachable", "Device unreachable", e.detail);
      case "timeout":
        return fail(504, "timeout", "The device did not respond in time", e.detail);
      default:
        return fail(502, "commandFailed", e.message || "Command failed", e.detail);
    }
  }
  if (e instanceof ZodError) {
    const first = e.issues[0];
    return fail(400, "validation", first ? `${first.path.join(".")}: ${first.message}` : "Invalid request");
  }
  const message = e instanceof Error ? e.message : String(e);
  return fail(500, "unknown", "Something went wrong", message);
}

/**
 * Wrap a handler that returns data. Errors are converted to structured
 * responses so every endpoint behaves consistently.
 */
export async function handle<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const data = await fn();
    return ok(data);
  } catch (e) {
    return mapError(e);
  }
}
