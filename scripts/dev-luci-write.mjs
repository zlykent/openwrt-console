/**
 * Submits a LuCI CBI form exactly the way the browser's plain "Save" button
 * does, so a change can be written through LuCI and read back through this
 * project's API. Credentials come from .env.local and never touch the shell.
 *
 * Usage: node scripts/dev-luci-write.mjs <pagePath> <fieldName> <fieldValue>
 *   e.g. node scripts/dev-luci-write.mjs /admin/system/fstab/mount/cfg024d78 \
 *          cbid.fstab.cfg024d78.options noatime
 *        node scripts/dev-luci-write.mjs /admin/system/crontab \
 *          cbid.crontab.1.crons "0 0 * * * logger probe"
 *
 * Every other field is replayed with the value the page rendered, which is what
 * keeps CBI from wiping options the form did not touch.
 *
 * WARNING: omitting <fieldValue> replays the target field's own rendered value.
 * On a UCI Map that is a harmless no-op, but on a SimpleForm it destroys data:
 * AbstractValue.parse skips `write` when fvalue == cvalue (cbi.lua:1419), so
 * data.<option> stays nil and crontab.lua's `else fs.writefile(cronfile, "")`
 * branch empties /etc/crontabs/root. Keep a backup before using that mode.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const env = Object.fromEntries(
  readFileSync(resolve(".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const base = `http://${env.OWRT_HOST}`;
const pagePath = process.argv[2];
const overrideName = process.argv[3];
// Omitting the value replays whatever the page rendered. See the warning above:
// on SimpleForm pages this reports an empty field back to Lua and wipes the file.
const overrideValue = process.argv[4];
if (!pagePath || !overrideName) {
  process.stdout.write("usage: dev-luci-write.mjs <pagePath> <fieldName> <fieldValue>\n");
  process.exit(2);
}

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

const get = await fetch(base + "/cgi-bin/luci" + pagePath, {
  headers: { cookie: cookieHeader() },
  redirect: "manual",
});
const html = await get.text();
store(get);

const token = html.match(/name="token" value="([0-9a-f]+)"/)?.[1];
if (!token) {
  process.stdout.write(`no csrf token in page (status ${get.status})\n`);
  process.exit(1);
}

// The browser decodes entities before submitting, so replaying raw markup would
// double-escape them (rc.local carries `&#62;` and non-ASCII comments).
function decode(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// Hidden `cbi.cbe.*` markers tell CBI "this checkbox was rendered", so an
// unchecked box is stored as 0 instead of being left alone.
const fields = new Map();
for (const m of html.matchAll(/<input[^>]*name="(cbi\.cbe\.[^"]+)"[^>]*>/g)) {
  fields.set(m[1], "1");
}
for (const m of html.matchAll(/<input([^>]*name="cbid\.[^"]+"[^>]*)>/g)) {
  const attrs = m[1];
  const name = attrs.match(/name="([^"]+)"/)[1];
  const isCheckbox = /type="checkbox"/.test(attrs);
  const checked = /checked="checked"/.test(attrs);
  if (isCheckbox && !checked) continue;
  const value = attrs.match(/value="([^"]*)"/)?.[1] ?? "1";
  fields.set(name, decode(value));
}
// SimpleForm pages (crontab, startup) render their payload as a textarea whose
// value lives in the element body rather than in an attribute.
for (const m of html.matchAll(/<textarea([^>]*name="(cbid\.[^"]+)"[^>]*)>([\s\S]*?)<\/textarea>/g)) {
  fields.set(m[2], decode(m[3]));
}
// A select replays its chosen option; CBI omits `value` when it equals the label.
for (const m of html.matchAll(/<select([^>]*name="(cbid\.[^"]+)"[^>]*)>([\s\S]*?)<\/select>/g)) {
  const sel =
    m[3].match(/<option[^>]*selected="selected"[^>]*>([\s\S]*?)<\/option>/) ??
    m[3].match(/<option[^>]*>([\s\S]*?)<\/option>/);
  const tag = m[3].match(/<option[^>]*selected="selected"[^>]*>/)?.[0] ?? "";
  fields.set(m[2], decode(tag.match(/value="([^"]*)"/)?.[1] ?? sel?.[1] ?? ""));
}
if (!fields.has(overrideName)) {
  process.stdout.write(
    `field ${overrideName} not on page; found:\n  ${[...fields.keys()].join("\n  ")}\n`,
  );
  process.exit(1);
}
const before = fields.get(overrideName);
const sent = overrideValue === undefined ? before : overrideValue;
fields.set(overrideName, sent);

const body = new URLSearchParams({ token, "cbi.submit": "1" });
for (const [k, v] of fields) body.append(k, v);
if (process.env.LUCI_DEBUG) {
  process.stdout.write(`body=${body.toString()}\n`);
}

const post = await fetch(base + "/cgi-bin/luci" + pagePath, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader() },
  body,
  redirect: "manual",
});
store(post);

// Re-read the page so the rendered value proves what LuCI actually stored.
const verify = await fetch(base + "/cgi-bin/luci" + pagePath, {
  headers: { cookie: cookieHeader() },
  redirect: "manual",
});
const vhtml = await verify.text();
const esc = overrideName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const rendered = decode(
  vhtml.match(new RegExp(`name="${esc}"[^>]*value="([^"]*)"`))?.[1] ??
    vhtml.match(new RegExp(`name="${esc}"[^>]*>([\\s\\S]*?)</textarea>`))?.[1] ??
    (vhtml.includes(`name="${overrideName}"`) ? "(unchecked)" : "(absent)"),
);

process.stdout.write(
  `login=${login.status} get=${get.status} post=${post.status} location=${post.headers.get("location") ?? "-"}\n` +
    `field=${overrideName} mode=${overrideValue === undefined ? "round-trip" : "override"}\n` +
    `  before=${JSON.stringify(before)}\n  sent=${JSON.stringify(sent)}\n  renderedAfter=${JSON.stringify(rendered)}\n` +
    `  lossless=${rendered === before}\n` +
    `fieldsReplayed=${fields.size}\n`,
);
