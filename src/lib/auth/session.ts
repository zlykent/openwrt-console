import { cookies } from "next/headers";
import { SESSION_COOKIE, type DeviceConfig } from "@/lib/config";
import { readSessionToken } from "./crypto";

/** Thrown by API handlers when there is no valid session; maps to HTTP 401. */
export class UnauthorizedError extends Error {
  constructor(message = "Not signed in") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/** Read the current device session from the request cookie (server only). */
export async function getSession(): Promise<DeviceConfig | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return readSessionToken(token);
}

/** Like getSession but throws UnauthorizedError when absent. */
export async function requireSession(): Promise<DeviceConfig> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}
