// One-off helper: mint a valid session cookie value for local structural
// verification when the device is offline (login would fail its SSH test).
// Usage: node scripts/mint-session.mjs
import { readFileSync } from "node:fs";
import { EncryptJWT } from "jose";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const secret = env.SESSION_SECRET || "openwrt-console-insecure-default-secret";
const ttl = Number(env.SESSION_TTL || 60 * 60 * 12);
const key = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));

const token = await new EncryptJWT({
  host: env.OWRT_HOST || "192.168.3.5",
  port: Number(env.OWRT_PORT || 22),
  username: env.OWRT_USER || "root",
  password: env.OWRT_PASSWORD || "password",
})
  .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
  .setIssuedAt()
  .setExpirationTime(`${ttl}s`)
  .encrypt(key);

console.log(token);
