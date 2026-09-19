import { shq } from "@/lib/ssh/quote";
import { AppError } from "@/lib/api/errors";

export type UciSection = {
  type: string;
  /** Resolved reference: a named section ("lan") or anonymous ("@zone[0]"). */
  name: string;
  anonymous: boolean;
  index?: number;
  options: Record<string, string | string[]>;
};

/** Validated identifier for uci config/section/option names. */
function assertUciId(value: string, label: string): void {
  if (!/^[A-Za-z0-9_.@\[\]-]+$/.test(value)) {
    throw new AppError(`Invalid uci ${label}: ${value}`);
  }
}

function unquoteSingle(s: string): string {
  const m = s.match(/^'([^']*)'$/);
  return m ? m[1] : s.trim();
}

function parseValue(rhs: string): string | string[] {
  const quoted = Array.from(rhs.matchAll(/'([^']*)'/g)).map((m) => m[1]);
  if (quoted.length > 1) return quoted;
  if (quoted.length === 1) return quoted[0];
  return rhs.trim();
}

function makeSection(ref: string, type: string): UciSection {
  // Section type names contain hyphens (`wifi-iface`, `wifi-device`), so an
  // anonymous reference looks like `@wifi-iface[1]`.
  const anon = ref.match(/^@([A-Za-z0-9_-]+)\[(\d+)\]$/);
  if (anon) {
    return { type: anon[1], name: ref, anonymous: true, index: Number(anon[2]), options: {} };
  }
  return { type, name: ref, anonymous: false, options: {} };
}

/**
 * Parse `uci -q show <config>` output into an ordered list of sections.
 * Handles named and anonymous sections plus single values and lists.
 */
export function parseUciShow(output: string): UciSection[] {
  const sections: UciSection[] = [];
  const byRef = new Map<string, UciSection>();

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;

    const lhs = line.slice(0, eq);
    const rhs = line.slice(eq + 1);

    const dot = lhs.indexOf(".");
    if (dot < 0) continue;
    const path = lhs.slice(dot + 1);

    // Hyphens are part of section type names (`wifi-iface`) and of some
    // section/option names, so excluding them silently dropped whole anonymous
    // sections from `uci show` output — a created wifi-iface then read back as
    // absent, and every later edit/delete of it answered 404.
    const decl = path.match(/^(@?[A-Za-z0-9_-]+(?:\[\d+\])?)$/);
    if (decl) {
      const ref = decl[1];
      const sec = makeSection(ref, unquoteSingle(rhs));
      byRef.set(ref, sec);
      sections.push(sec);
      continue;
    }

    const opt = path.match(/^(@?[A-Za-z0-9_-]+(?:\[\d+\])?)\.([A-Za-z0-9_-]+)$/);
    if (opt) {
      const ref = opt[1];
      const key = opt[2];
      let sec = byRef.get(ref);
      if (!sec) {
        sec = makeSection(ref, ref.startsWith("@") ? ref.slice(1).replace(/\[\d+\]$/, "") : "unknown");
        byRef.set(ref, sec);
        sections.push(sec);
      }
      sec.options[key] = parseValue(rhs);
    }
  }
  return sections;
}

export function firstOption(sec: UciSection | undefined, key: string, fallback = ""): string {
  const v = sec?.options[key];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return v ?? fallback;
}

export function listOption(sec: UciSection | undefined, key: string): string[] {
  const v = sec?.options[key];
  if (Array.isArray(v)) return v;
  if (typeof v === "string" && v.length) return v.split(/\s+/);
  return [];
}

export function boolOption(sec: UciSection | undefined, key: string): boolean {
  const v = firstOption(sec, key, "0");
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// ---- command builders (all dynamic values are shell-quoted) ----

export function uciShow(config: string): string {
  assertUciId(config, "config");
  return `uci -q show ${shq(config)}`;
}

export function uciGet(config: string, section: string, option: string): string {
  assertUciId(config, "config");
  assertUciId(section, "section");
  assertUciId(option, "option");
  return `uci -q get ${shq(`${config}.${section}.${option}`)}`;
}

export function uciSet(
  config: string,
  section: string,
  option: string,
  value: string | string[],
): string {
  assertUciId(config, "config");
  assertUciId(section, "section");
  assertUciId(option, "option");
  const target = `${config}.${section}.${option}`;
  if (Array.isArray(value)) {
    // The multi-value form `uci set target='a' 'b'` is rejected by the uci
    // build on the device (it prints its usage screen), so a list is written
    // by clearing the option and appending each entry with `add_list`.
    //
    // Clearing first is what makes a rewrite idempotent, but the option need
    // not exist yet (a brand-new section), and `uci delete` then exits
    // non-zero. The guard is parenthesised so that it cannot mask the failure
    // of an earlier command in the `&&` chain this string is spliced into.
    const clear = uciDeleteIfExists(config, section, option);
    if (value.length === 0) return clear;
    return [clear, ...value.map((v) => `uci add_list ${shq(target)}=${shq(v)}`)].join(" && ");
  }
  return `uci set ${shq(target)}=${shq(value)}`;
}

export function uciDelete(config: string, section: string, option?: string): string {
  assertUciId(config, "config");
  assertUciId(section, "section");
  if (option) assertUciId(option, "option");
  const target = option ? `${config}.${section}.${option}` : `${config}.${section}`;
  return `uci -q delete ${shq(target)}`;
}

/**
 * `uci delete` on an option that is absent exits non-zero, which is the normal
 * case for a form field that is blank or was never set, so the failure has to be
 * tolerated. The guard is a parenthesised subshell: a bare `|| true` spliced
 * into an `&&` chain would also swallow the failure of every command before it
 * (`A && B || true && C` parses as `((A&&B)||true)&&C`) and let a half-written
 * section be committed and reported as a success.
 */
export function uciDeleteIfExists(config: string, section: string, option: string): string {
  return `(${uciDelete(config, section, option)} 2>/dev/null || true)`;
}

/** Write a value, or clear the option when it is empty so a blanked field cannot go stale. */
export function uciSetOrClear(
  config: string,
  section: string,
  option: string,
  value: string | string[],
): string {
  const empty = Array.isArray(value) ? value.length === 0 : value === "";
  return empty ? uciDeleteIfExists(config, section, option) : uciSet(config, section, option, value);
}

/** Create a named section by assigning its type, e.g. `network.guest=interface`. */
export function uciCreateSection(config: string, section: string, type: string): string {
  assertUciId(config, "config");
  assertUciId(section, "section");
  assertUciId(type, "type");
  return `uci set ${shq(`${config}.${section}`)}=${shq(type)}`;
}

export function uciCommit(config: string): string {
  assertUciId(config, "config");
  return `uci commit ${shq(config)}`;
}

/** Chain commands with `&&` so a failure aborts the rest. */
export function chain(...cmds: string[]): string {
  return cmds.join(" && ");
}
