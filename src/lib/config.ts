/**
 * Central runtime configuration.
 *
 * All device connection details live on the server only. The browser never
 * receives the password; it only sees non-secret defaults (host/port/user)
 * used to prefill the login form.
 */

export type DeviceConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
};

function num(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Default device target, taken from the environment. */
export function getDeviceDefaults(): DeviceConfig {
  return {
    host: process.env.OWRT_HOST?.trim() || "192.168.3.5",
    port: num(process.env.OWRT_PORT, 22),
    username: process.env.OWRT_USER?.trim() || "root",
    password: process.env.OWRT_PASSWORD ?? "password",
  };
}

/** Non-secret subset that is safe to expose to the client (login prefill). */
export function getPublicDeviceDefaults() {
  const d = getDeviceDefaults();
  return { host: d.host, port: d.port, username: d.username };
}

export const SESSION_COOKIE = "owrt_session";

export function getSessionTtlSeconds(): number {
  return num(process.env.SESSION_TTL, 60 * 60 * 12);
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "openwrt-console-insecure-default-secret";
}

export const APP_NAME = "OpenWrt Console";
