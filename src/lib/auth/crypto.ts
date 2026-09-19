import { EncryptJWT, jwtDecrypt } from "jose";
import {
  getSessionSecret,
  getSessionTtlSeconds,
  type DeviceConfig,
} from "@/lib/config";

/**
 * Session sealing.
 *
 * The device credentials (including the password) are encrypted into a single
 * httpOnly cookie using a key derived from SESSION_SECRET. The browser can never
 * read them, and the server stays stateless (survives restarts / dev HMR).
 */

let cachedKey: Uint8Array | null = null;

async function getKey(): Promise<Uint8Array> {
  if (cachedKey) return cachedKey;
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(getSessionSecret()),
  );
  cachedKey = new Uint8Array(digest);
  return cachedKey;
}

export async function createSessionToken(cfg: DeviceConfig): Promise<string> {
  const key = await getKey();
  return await new EncryptJWT({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${getSessionTtlSeconds()}s`)
    .encrypt(key);
}

export async function readSessionToken(token: string): Promise<DeviceConfig | null> {
  try {
    const key = await getKey();
    const { payload } = await jwtDecrypt(token, key);
    const { host, port, username, password } = payload as Record<string, unknown>;
    if (
      typeof host !== "string" ||
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return null;
    }
    return {
      host,
      port: typeof port === "number" ? port : 22,
      username,
      password,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    // LAN deployments are typically plain http; keep the cookie usable there.
    secure: false,
    maxAge: getSessionTtlSeconds(),
  };
}
