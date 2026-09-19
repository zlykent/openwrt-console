// Dev helper: log into the device's LuCI web UI and save the rendered page so
// CBI sections can be compared with this app's output. Credentials come from
// .env.local, the same place dev-exec.mjs reads them, so they never have to be
// typed into a browser session or into a shell command.
// Usage: node scripts/dev-luci.mjs /admin/system/fstab .verify/luci-fstab.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const base = `http://${env.OWRT_HOST}`;
const path = process.argv[2] ?? "/admin/status/overview";
const outFile = process.argv[3];

const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function store(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const pair = c.split(";")[0];
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

const login = await fetch(`${base}/cgi-bin/luci/`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    luci_username: env.OWRT_USER,
    luci_password: env.OWRT_PASSWORD,
  }),
  redirect: "manual",
});
store(login);

const res = await fetch(base + "/cgi-bin/luci" + path, {
  headers: { cookie: cookieHeader() },
  redirect: "manual",
});
store(res);
const html = await res.text();

if (outFile) {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
}

// A short plain-text digest is usually enough to compare labels and values.
const text = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<\/(tr|p|div|h\d|li|table|fieldset)>/gi, "\n")
  .replace(/<\/t[dh]>/gi, " | ")
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/[ \t]+/g, " ")
  .replace(/\n\s*\n+/g, "\n")
  .trim();

const loggedIn = !/luci_username/.test(html);
process.stdout.write(`login=${login.status} page=${res.status} authed=${loggedIn} bytes=${html.length}\n`);
process.stdout.write(text.slice(0, Number(process.argv[4] ?? 6000)) + "\n");
