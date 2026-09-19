import { z, ZodError } from "zod";
import { getDeviceDefaults, SESSION_COOKIE, type DeviceConfig } from "@/lib/config";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/crypto";
import { SshError, testConnection } from "@/lib/ssh/client";
import { fail, mapError, ok } from "@/lib/api/respond";

const schema = z.object({
  host: z.string().trim().min(1).max(253).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  username: z.string().trim().min(1).max(64).optional(),
  password: z.string().min(0).max(512),
});

/**
 * Validate credentials against the device over SSH, then seal them into an
 * httpOnly cookie. The password never reaches the browser.
 */
export async function POST(req: Request) {
  let cfg: DeviceConfig;
  try {
    const body = schema.parse(await req.json());
    const d = getDeviceDefaults();
    cfg = {
      host: body.host || d.host,
      port: body.port ?? d.port,
      username: body.username || d.username,
      // Empty password falls back to the server-configured credential.
      password: body.password || d.password,
    };
    await testConnection(cfg);
  } catch (e) {
    if (e instanceof ZodError) return mapError(e);
    // Bad credentials are a client error (400), not 401 — a 401 here would
    // make the browser client bounce back to /login in a loop.
    if (e instanceof SshError && e.kind === "auth") {
      return fail(400, "auth", "Invalid username or password", e.detail);
    }
    return mapError(e);
  }

  const token = await createSessionToken(cfg);
  const res = ok({ host: cfg.host, port: cfg.port, username: cfg.username });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
