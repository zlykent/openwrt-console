/**
 * Shell command construction helpers.
 *
 * Every dynamic value that reaches the device MUST go through `shq` so that a
 * value like `foo'; reboot; '` can never break out of its argument. Commands
 * are assembled here and executed verbatim over SSH.
 */

import { AppError } from "@/lib/api/errors";

/** POSIX-safe single quoting. */
export function shq(value: unknown): string {
  const s = value === undefined || value === null ? "" : String(value);
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/**
 * Build a `ubus call <object> <method> ['<json-args>']` command.
 * Object/method are validated against a conservative identifier pattern and
 * quoted regardless; arguments are JSON-serialised then shell-quoted.
 */
export function ubusCall(object: string, method: string, args?: unknown): string {
  assertIdentifier(object, "ubus object");
  assertIdentifier(method, "ubus method");
  const base = `ubus call ${shq(object)} ${shq(method)}`;
  if (args === undefined) return base;
  return `${base} ${shq(JSON.stringify(args ?? {}))}`;
}

/** Validate a dotted identifier such as `network.interface` or `system`. */
export function assertIdentifier(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) {
    throw new AppError(`Invalid ${label}: ${value}`);
  }
}

/** Validate a shell-safe token (interface names, package names, etc.). */
export function assertToken(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.:@+/-]+$/.test(value)) {
    throw new AppError(`Invalid ${label}: ${value}`);
  }
}
