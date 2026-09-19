/**
 * `/etc/config/firewall` — modelled on the LuCI pages it replaces:
 * `luci/model/cbi/firewall/{zones,zone-details,rules,rule-details,forwards,
 * forward-details,custom}.lua` plus `luci/model/firewall.lua` for the semantics
 * that live outside the CBI templates (`del_zone`, `rename_zone`,
 * `add_forwarding_to`). Option names, allowed values and — where it matters —
 * the choice between "write 0" and "remove the option" all follow those files,
 * so a section written here reads back identically in LuCI and vice versa.
 */
import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput, SshError } from "@/lib/ssh/client";
import {
  boolOption,
  chain,
  firstOption,
  listOption,
  parseUciShow,
  uciCommit,
  uciCreateSection,
  uciDelete,
  uciDeleteIfExists,
  uciSet,
  uciShow,
  type UciSection,
} from "./uci";
import type {
  FirewallConfig,
  FirewallDefaults,
  FirewallForwarding,
  FirewallRedirect,
  FirewallRule,
  FirewallZone,
} from "./types";
import { AppError } from "@/lib/api/errors";

const CFG = "firewall";
const FIREWALL_USER_PATH = "/etc/firewall.user";

// ---- read ----

const POLICY = (s: UciSection | undefined, key: string, fallback: string) =>
  firstOption(s, key, fallback).toUpperCase() || fallback;

/**
 * Read a flag. `absent` is what fw3 assumes when the option is missing: off for
 * everything except `enabled` (rules and redirects are active unless they carry
 * `enabled='0'`) and `reflection` (NAT loopback defaults to on).
 */
function flag(s: UciSection | undefined, option: string, absent = false): boolean {
  if (s?.options[option] === undefined) return absent;
  return boolOption(s, option);
}

/** A possibly list-valued option as the space separated string forms carry. */
function joined(s: UciSection | undefined, option: string): string | undefined {
  if (s?.options[option] === undefined) return undefined;
  return listOption(s, option).join(" ");
}

function text(s: UciSection | undefined, option: string): string | undefined {
  return firstOption(s, option) || undefined;
}

function toDefaults(s: UciSection | undefined): FirewallDefaults {
  return {
    input: POLICY(s, "input", "REJECT"),
    output: POLICY(s, "output", "ACCEPT"),
    forward: POLICY(s, "forward", "REJECT"),
    synFlood: flag(s, "syn_flood"),
    dropInvalid: flag(s, "drop_invalid"),
    fullcone: flag(s, "fullcone"),
    flowOffloading: flag(s, "flow_offloading"),
  };
}

function toZone(s: UciSection): FirewallZone {
  return {
    ref: s.name,
    name: firstOption(s, "name", s.name),
    networks: listOption(s, "network"),
    input: POLICY(s, "input", "REJECT"),
    output: POLICY(s, "output", "ACCEPT"),
    forward: POLICY(s, "forward", "REJECT"),
    masq: flag(s, "masq"),
    mtuFix: flag(s, "mtu_fix"),
    family: text(s, "family"),
    masqSrc: joined(s, "masq_src"),
    masqDest: joined(s, "masq_dest"),
    conntrack: flag(s, "conntrack"),
    log: flag(s, "log"),
    logLimit: text(s, "log_limit"),
  };
}

function toForwarding(s: UciSection): FirewallForwarding {
  return { ref: s.name, src: firstOption(s, "src"), dest: firstOption(s, "dest") };
}

function toRule(s: UciSection): FirewallRule {
  return {
    ref: s.name,
    name: text(s, "name"),
    family: text(s, "family"),
    proto: text(s, "proto"),
    icmpType: joined(s, "icmp_type"),
    src: text(s, "src"),
    srcMac: joined(s, "src_mac"),
    srcIp: joined(s, "src_ip"),
    srcPort: joined(s, "src_port"),
    dest: text(s, "dest"),
    destIp: joined(s, "dest_ip"),
    destPort: joined(s, "dest_port"),
    target: firstOption(s, "target", "ACCEPT").toUpperCase(),
    extra: text(s, "extra"),
    weekdays: joined(s, "weekdays"),
    monthdays: joined(s, "monthdays"),
    startTime: text(s, "start_time"),
    stopTime: text(s, "stop_time"),
    startDate: text(s, "start_date"),
    stopDate: text(s, "stop_date"),
    utcTime: flag(s, "utc_time"),
    enabled: flag(s, "enabled", true),
    limit: text(s, "limit"),
  };
}

function toRedirect(s: UciSection): FirewallRedirect {
  return {
    ref: s.name,
    name: text(s, "name"),
    target: firstOption(s, "target", "DNAT").toUpperCase() || "DNAT",
    proto: text(s, "proto"),
    src: text(s, "src"),
    srcMac: joined(s, "src_mac"),
    srcIp: joined(s, "src_ip"),
    srcPort: joined(s, "src_port"),
    srcDip: joined(s, "src_dip"),
    srcDport: joined(s, "src_dport"),
    dest: text(s, "dest"),
    destIp: joined(s, "dest_ip"),
    destPort: joined(s, "dest_port"),
    reflection: flag(s, "reflection", true),
    extra: text(s, "extra"),
    enabled: flag(s, "enabled", true),
  };
}

export async function getFirewall(cfg: DeviceConfig): Promise<FirewallConfig> {
  const secs = await readSections(cfg);
  return {
    defaults: toDefaults(secs.find((s) => s.type === "defaults")),
    zones: secs.filter((s) => s.type === "zone").map(toZone),
    forwarding: secs.filter((s) => s.type === "forwarding").map(toForwarding),
    rules: secs.filter((s) => s.type === "rule").map(toRule),
    redirects: secs.filter((s) => s.type === "redirect").map(toRedirect),
  };
}

// ---- validation (LuCI datatypes) ----

/** `and(uciname,maxlength(11))` — zone names double as uci section names. */
const ZONE_NAME = /^[A-Za-z0-9_]{1,11}$/;
/** Network / interface names as offered by LuCI's netlist. */
const NET_NAME = /^[A-Za-z0-9_.@-]+$/;
/** `neg(or(uciname,hostname,ipmask4))` — masq_src / masq_dest entries. */
const SUBNET = /^!?[A-Za-z0-9_.:/-]+$/;
/** `neg(portrange)`: "80", "8080-8090" or fw3's "33434:33689". */
const PORT = /^!?\d{1,5}$/;
const PORT_RANGE = /^!?\d{1,5}[-:]\d{1,5}$/;
const MAC = /^!?([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
/** timehhmmss / dateyyyymmdd. */
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const DAY = /^\d{4}-(0\d|1[0-2])-([0-2]\d|3[01])$/;
const WEEKDAY = /^!?(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/;
/** icmp types are names ("echo-request") or "type/code" ("130/0"). */
const ICMP_TYPE = /^!?[A-Za-z0-9/-]+$/;

const POLICIES = new Set(["ACCEPT", "REJECT", "DROP"]);
/** Rule actions; `NOTRACK` is a rule target only, never a zone policy. */
const TARGETS = new Set(["ACCEPT", "REJECT", "DROP", "NOTRACK"]);
const FAMILIES = new Set(["", "ipv4", "ipv6"]);
const REDIRECT_TARGETS = new Set(["DNAT", "SNAT"]);

function tokens(value: string | undefined): string[] {
  return (value ?? "").split(/\s+/).filter(Boolean);
}

function requireTokens(
  value: string | undefined,
  option: string,
  test: RegExp,
  example: string,
): void {
  const bad = tokens(value).find((t) => !test.test(t));
  if (bad !== undefined) throw new AppError(`Invalid ${option}: ${bad} (expected ${example})`);
}

function requireOneOf(value: string, allowed: Set<string>, option: string): void {
  if (!allowed.has(value.toUpperCase())) {
    throw new AppError(`Invalid ${option}: ${value || "(empty)"} (expected one of ${[...allowed].join(", ")})`);
  }
}

function requireFamily(value: string | undefined): void {
  if (!FAMILIES.has(value ?? "")) throw new AppError(`Invalid family: ${value}`);
}

/** `list(neg(portrange))`: one or more space separated ports or ranges. fw3 accepts
 *  more than LuCI's single-value datatype here and emits one rule per value. */
function requirePortList(value: string | undefined, option: string): void {
  const bad = tokens(value).find((t) => !PORT.test(t) && !PORT_RANGE.test(t));
  if (bad !== undefined)
    throw new AppError(`Invalid ${option}: ${bad} (expected "80", "8080-8090" or "!80")`);
}

function requireMonthdays(value: string | undefined): void {
  const bad = tokens(value).find((t) => !/^\d{1,2}$/.test(t) || Number(t) < 1 || Number(t) > 31);
  if (bad !== undefined) throw new AppError(`Invalid monthdays: ${bad} (expected 1-31)`);
}

/**
 * `extra` is handed to iptables verbatim by fw3, exactly as LuCI does, so it is
 * not validated beyond rejecting characters that cannot appear in a single uci
 * option value (a newline would end the option and start a new config line).
 */
function requireExtra(value: string | undefined): void {
  // Control characters are what we screen out: a newline would end the option.
  if (value !== undefined && /[\r\n\0]/.test(value)) {
    throw new AppError("Extra arguments must be a single line");
  }
}

// ---- drafts ----

export type ZoneInput = Omit<FirewallZone, "ref"> & { ref?: string };
export type RuleInput = Omit<FirewallRule, "ref" | "limit"> & { ref?: string };
export type RedirectInput = Omit<FirewallRedirect, "ref"> & { ref?: string };
export type ForwardingInput = { src: string; dest: string };

export function zoneNames(secs: UciSection[]): Set<string> {
  return new Set(secs.filter((s) => s.type === "zone").map((s) => firstOption(s, "name", s.name)));
}

function requireZone(value: string | undefined, option: string, zones: Set<string>): void {
  if (!value || !zones.has(value)) {
    throw new AppError(`Unknown zone for ${option}: ${value || "(empty)"}`);
  }
}

/** Datatype checks, the same ones LuCI's CBI `datatype` attributes perform. */
export function validateZoneInput(input: ZoneInput): void {
  if (!ZONE_NAME.test(input.name)) {
    throw new AppError(`Invalid zone name: ${input.name || "(empty)"} (1-11 of A-Z a-z 0-9 _)`);
  }
  for (const key of ["input", "output", "forward"] as const) {
    requireOneOf(input[key], POLICIES, `${key} policy`);
  }
  requireFamily(input.family);
  for (const n of input.networks) {
    if (!NET_NAME.test(n)) throw new AppError(`Invalid network name: ${n}`);
  }
  requireTokens(input.masqSrc, "masq_src", SUBNET, "192.168.1.0/24 or !10.0.0.5");
  requireTokens(input.masqDest, "masq_dest", SUBNET, "192.168.1.0/24 or !10.0.0.5");
}

export function validateRuleInput(input: RuleInput): void {
  requireOneOf(input.target, TARGETS, "target");
  requireFamily(input.family);
  requirePortList(input.srcPort, "src_port");
  requirePortList(input.destPort, "dest_port");
  requireTokens(input.srcIp, "src_ip", SUBNET, "192.168.1.0/24 or !10.0.0.5");
  requireTokens(input.destIp, "dest_ip", SUBNET, "192.168.1.0/24 or !10.0.0.5");
  requireTokens(input.srcMac, "src_mac", MAC, "aa:bb:cc:dd:ee:ff");
  requireTokens(input.icmpType, "icmp_type", ICMP_TYPE, "echo-request or 130/0");
  requireTokens(input.weekdays, "weekdays", WEEKDAY, "Mon Tue ...");
  requireMonthdays(input.monthdays);
  for (const [value, option] of [
    [input.startTime, "start_time"],
    [input.stopTime, "stop_time"],
  ] as const) {
    if (value && !CLOCK.test(value)) throw new AppError(`Invalid ${option}: ${value} (expected hh:mm:ss)`);
  }
  for (const [value, option] of [
    [input.startDate, "start_date"],
    [input.stopDate, "stop_date"],
  ] as const) {
    if (value && !DAY.test(value)) throw new AppError(`Invalid ${option}: ${value} (expected yyyy-mm-dd)`);
  }
  requireExtra(input.extra);
}

/** Returns the normalised target so callers do not derive it a second time. */
export function validateRedirectInput(input: RedirectInput): "DNAT" | "SNAT" {
  const target = (input.target || "DNAT").toUpperCase();
  requireOneOf(target, REDIRECT_TARGETS, "target");
  requirePortList(input.srcDport, "src_dport");
  requirePortList(input.srcPort, "src_port");
  requirePortList(input.destPort, "dest_port");
  requireTokens(input.srcIp, "src_ip", SUBNET, "192.168.1.0/24");
  requireTokens(input.destIp, "dest_ip", SUBNET, "192.168.1.20");
  requireTokens(input.srcDip, "src_dip", SUBNET, "203.0.113.5");
  requireTokens(input.srcMac, "src_mac", MAC, "aa:bb:cc:dd:ee:ff");
  requireExtra(input.extra);
  return target as "DNAT" | "SNAT";
}

/**
 * The checks that need the current config. They run before a new section is
 * staged with `uci add`, so a rejected draft cannot leave an orphan behind.
 */
export function checkZoneDraft(secs: UciSection[], input: ZoneInput): void {
  // LuCI's `add_zone` refuses a name that is already taken; without the check a
  // second zone with the same name would be created and fw3 would merge them.
  const current = input.ref ? findSection(secs, input.ref, "zone") : undefined;
  if (!current && (zoneNames(secs).has(input.name) || secs.some((s) => s.name === input.name))) {
    throw new AppError(`A zone named ${input.name} already exists`);
  }
}

export function checkRuleDraft(secs: UciSection[], input: RuleInput): void {
  const zones = zoneNames(secs);
  if (input.src && input.src !== "*") requireZone(input.src, "src", zones);
  if (input.dest && input.dest !== "*") requireZone(input.dest, "dest", zones);
}

export function checkRedirectDraft(
  secs: UciSection[],
  input: RedirectInput,
  target: "DNAT" | "SNAT",
): void {
  // Structural refusal first: reporting a missing field on a form the operator
  // cannot actually submit would send them fixing the wrong thing.
  const current = input.ref ? findSection(secs, input.ref, "redirect") : undefined;
  const storedTarget = current ? firstOption(current, "target", "DNAT").toUpperCase() : target;
  if (current && storedTarget !== target) {
    throw new AppError(`Cannot change ${current.name} from ${storedTarget} to ${target}`);
  }
  const zones = zoneNames(secs);
  requireZone(input.src, "src", zones);
  requireZone(input.dest, "dest", zones);
  // fw3 skips a redirect that cannot be turned into a rule, which shows up as a
  // forward that silently does nothing; fail loudly instead.
  if (target === "DNAT") {
    if (!tokens(input.srcDport).length) throw new AppError("External port is required for a port forward");
    if (!tokens(input.destIp).length) throw new AppError("Internal IP address is required for a port forward");
  } else if (!tokens(input.srcDip).length) {
    throw new AppError("SNAT IP address is required");
  }
}

// ---- write planning ----

/**
 * A pending write against one section. Every command is compared with what the
 * device already stores so that a save which changes nothing writes nothing:
 * this build's `uci set` moves an existing option to the end of its section, so
 * a redundant write is visible churn in `/etc/config/firewall`.
 */
type Writer = { ref: string; current: UciSection | undefined; cmds: string[] };

function writer(ref: string, current: UciSection | undefined): Writer {
  return { ref, current, cmds: [] };
}

function stored(w: Writer, option: string): string | undefined {
  const v = w.current?.options[option];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join(" ") : v;
}

/** Single-valued option; an empty value removes it (LuCI `Value` + rmempty). */
function putValue(w: Writer, option: string, value: string | undefined): void {
  const next = (value ?? "").trim();
  if (next === "") {
    if (stored(w, option) !== undefined) w.cmds.push(uciDeleteIfExists(CFG, w.ref, option));
    return;
  }
  if (stored(w, option) === next) return;
  w.cmds.push(uciSet(CFG, w.ref, option, next));
}

/**
 * List-valued option (uci `list`), written as one `add_list` per whitespace
 * token. Only `network`, `icmp_type`, `masq_src`, `masq_dest` and a redirect's
 * `src_mac` are lists in LuCI; the rest are single options that may hold
 * several space separated tokens, which is why this is not used everywhere.
 */
function putList(w: Writer, option: string, value: string | undefined): void {
  const items = tokens(value);
  if (items.length === 0) {
    if (w.current?.options[option] !== undefined) w.cmds.push(uciDeleteIfExists(CFG, w.ref, option));
    return;
  }
  if (stored(w, option) === items.join(" ")) return;
  w.cmds.push(uciSet(CFG, w.ref, option, items));
}

/**
 * Flag written the way LuCI's `Flag.parse` does it: `fvalue == default and
 * rmempty` removes the option, anything else writes it. With `absentOn` (fw3
 * defaults the flag to on) turning the flag *on* removes the option and turning
 * it *off* has to write an explicit `0`, or the setting would not stick.
 */
function putFlag(w: Writer, option: string, on: boolean | undefined, absentOn = false): void {
  if (on === undefined) return;
  const isOn = stored(w, option) === undefined ? absentOn : boolOption(w.current, option);
  if (on === isOn) return;
  if (on) {
    w.cmds.push(absentOn ? uciDeleteIfExists(CFG, w.ref, option) : uciSet(CFG, w.ref, option, "1"));
  } else {
    w.cmds.push(absentOn ? uciSet(CFG, w.ref, option, "0") : uciDeleteIfExists(CFG, w.ref, option));
  }
}

/**
 * Turn a validated draft into uci commands. `newRef` is the section id that
 * `uci add` handed out for a brand new rule or redirect; zones carry their own
 * name as the reference, so they do not need one.
 */
export function planZone(secs: UciSection[], input: ZoneInput): { ref: string; cmds: string[] } {
  const current = input.ref ? findSection(secs, input.ref, "zone") : undefined;
  // LuCI creates zones anonymously, but a named section is equally valid to fw3
  // and keeps the reference stable for later edits.
  const ref = current?.name ?? input.name;
  const w = writer(ref, current);
  if (!current) w.cmds.push(uciCreateSection(CFG, ref, "zone"));

  const oldName = current ? firstOption(current, "name", current.name) : undefined;
  putValue(w, "name", input.name);
  putValue(w, "input", input.input.toUpperCase());
  putValue(w, "output", input.output.toUpperCase());
  putValue(w, "forward", input.forward.toUpperCase());
  putList(w, "network", input.networks.join(" "));
  putFlag(w, "masq", input.masq);
  putFlag(w, "mtu_fix", input.mtuFix);
  putValue(w, "family", input.family);
  putList(w, "masq_src", input.masqSrc);
  putList(w, "masq_dest", input.masqDest);
  putFlag(w, "conntrack", input.conntrack);
  putFlag(w, "log", input.log);
  // `log_limit` depends on `log` in zone-details.lua: while logging is off the
  // field is not rendered, so a stored limit is left alone rather than cleared.
  if (input.log) putValue(w, "log_limit", input.logLimit);

  if (oldName !== undefined && oldName !== input.name) {
    // LuCI's `rename_zone` rewrites every section that points at the old name;
    // without this the renamed zone silently loses its rules and forwardings.
    for (const s of secs) {
      if (s.type !== "rule" && s.type !== "redirect" && s.type !== "forwarding") continue;
      const rw = writer(s.name, s);
      if (firstOption(s, "src") === oldName) putValue(rw, "src", input.name);
      if (firstOption(s, "dest") === oldName) putValue(rw, "dest", input.name);
      w.cmds.push(...rw.cmds);
    }
  }
  return { ref, cmds: w.cmds };
}

export function planRule(
  secs: UciSection[],
  input: RuleInput,
  newRef: string,
): { ref: string; cmds: string[] } {
  const current = input.ref ? findSection(secs, input.ref, "rule") : undefined;
  const ref = current?.name ?? newRef;
  const w = writer(ref, current);
  putValue(w, "name", input.name);
  putValue(w, "family", input.family);
  putValue(w, "proto", input.proto);
  putList(w, "icmp_type", input.icmpType);
  putValue(w, "src", input.src);
  putValue(w, "src_mac", input.srcMac);
  putValue(w, "src_ip", input.srcIp);
  putValue(w, "src_port", input.srcPort);
  putValue(w, "dest", input.dest);
  putValue(w, "dest_ip", input.destIp);
  putValue(w, "dest_port", input.destPort);
  putValue(w, "target", input.target.toUpperCase());
  putValue(w, "extra", input.extra);
  putValue(w, "weekdays", input.weekdays);
  putValue(w, "monthdays", input.monthdays);
  putValue(w, "start_time", input.startTime);
  putValue(w, "stop_time", input.stopTime);
  putValue(w, "start_date", input.startDate);
  putValue(w, "stop_date", input.stopDate);
  putFlag(w, "utc_time", input.utcTime);
  putFlag(w, "enabled", input.enabled, true);
  return { ref, cmds: w.cmds };
}

/** Port forward (`target DNAT`) and source NAT (`target SNAT`) live in the same
 *  uci section type; LuCI keeps them on two pages but the fields overlap, so one
 *  planner handles both and only the meaning of `src_dip`/`src_dport` differs. */
export function planRedirect(
  secs: UciSection[],
  input: RedirectInput,
  target: "DNAT" | "SNAT",
  newRef: string,
): { ref: string; cmds: string[] } {
  const current = input.ref ? findSection(secs, input.ref, "redirect") : undefined;
  const ref = current?.name ?? newRef;
  const w = writer(ref, current);
  putValue(w, "target", target);
  putValue(w, "name", input.name);
  putValue(w, "proto", input.proto);
  putValue(w, "src", input.src);
  putList(w, "src_mac", input.srcMac);
  putValue(w, "src_ip", input.srcIp);
  putValue(w, "src_port", input.srcPort);
  putValue(w, "src_dip", input.srcDip);
  putValue(w, "src_dport", input.srcDport);
  putValue(w, "dest", input.dest);
  putValue(w, "dest_ip", input.destIp);
  putValue(w, "dest_port", input.destPort);
  putValue(w, "extra", input.extra);
  // Only DNAT reflects; on an SNAT rule the option means nothing.
  if (target === "DNAT") putFlag(w, "reflection", input.reflection, true);
  putFlag(w, "enabled", input.enabled, true);
  return { ref, cmds: w.cmds };
}

/**
 * LuCI's `add_forwarding_to` skips a pair that already exists and refuses
 * `src == dest`; both would otherwise end up as a duplicate section.
 */
export function checkForwardingDraft(secs: UciSection[], input: ForwardingInput): void {
  const zones = zoneNames(secs);
  requireZone(input.src, "src", zones);
  requireZone(input.dest, "dest", zones);
  if (input.src === input.dest) throw new AppError("Source and destination zone must differ");
  const duplicate = secs.find(
    (s) =>
      s.type === "forwarding" && firstOption(s, "src") === input.src && firstOption(s, "dest") === input.dest,
  );
  if (duplicate) throw new AppError(`${input.src} → ${input.dest} is already forwarded`);
}

// ---- device plumbing ----

async function readSections(cfg: DeviceConfig): Promise<UciSection[]> {
  const res = await exec(cfg, uciShow(CFG));
  return parseUciShow(res.stdout);
}

/**
 * Drop the staged delta of the whole config. A chain that failed halfway leaves
 * its earlier commands in `/tmp/.uci/firewall`, where they resurface on the next
 * read as entries the operator never asked for — and for a section created by
 * `uci add` that means an orphan the UI cannot address. Reverting the config
 * rather than one section is deliberate: a zone rename touches every section
 * that pointed at it, and `iface.ts` already makes the same trade-off.
 */
const REVERT_DELTA = "uci revert firewall 2>/dev/null; true";

/**
 * Every write path reports whether it actually touched the device. A save that
 * changes nothing must not claim the firewall was reloaded: a reload flushes
 * conntrack and briefly drops every connection on the box, so the UI owes the
 * operator the difference between "applied" and "nothing to apply".
 */
export type FirewallWriteResult = { ok: true; reloaded: boolean };

async function commitAndReload(cfg: DeviceConfig, cmds: string[], action: string): Promise<boolean> {
  // Nothing to write: skip the commit and, more importantly, the reload, so a
  // save that changes nothing does not bounce every connection on the device.
  if (cmds.length === 0) return false;
  const r = await exec(cfg, chain(...cmds, uciCommit(CFG)), { timeoutMs: 20000 });
  if (r.code !== 0) {
    await exec(cfg, REVERT_DELTA);
    throw new SshError("exec", `Failed to ${action}`, (r.stderr || r.stdout).trim());
  }
  await reloadFirewall(cfg);
  return true;
}

/** `uci add` prints the generated section id (`cfg0f1a2b`), used as the ref. */
async function addSection(cfg: DeviceConfig, type: string): Promise<string> {
  const r = await exec(cfg, `uci add ${CFG} ${type}`);
  if (r.code !== 0) {
    throw new SshError("exec", `Failed to add ${type}`, (r.stderr || r.stdout).trim());
  }
  const ref = r.stdout.trim();
  if (ref === "") throw new SshError("exec", `uci add ${type} returned no section id`);
  return ref;
}

function findSection(secs: UciSection[], ref: string, type: string): UciSection {
  const sec = secs.find((s) => s.name === ref);
  if (!sec) throw new AppError(`Firewall ${type} not found: ${ref}`, 404);
  if (sec.type !== type) throw new AppError(`Section ${ref} is a ${sec.type}, not a ${type}`);
  return sec;
}

/** Reload the firewall (fw4/nftables on modern OpenWrt, fw3 fallback). */
export async function reloadFirewall(cfg: DeviceConfig): Promise<void> {
  const r = await exec(cfg, "/etc/init.d/firewall reload 2>/dev/null || fw4 reload 2>/dev/null || fw3 reload", {
    timeoutMs: 30000,
  });
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to reload firewall", (r.stderr || r.stdout).trim());
  }
}

/**
 * Restart (not reload) the firewall. `config include` sections default to
 * `reload 0`, so a reload leaves `/etc/firewall.user` and the package includes
 * unexecuted — LuCI's custom.lua restarts for exactly this reason, and its
 * submit button reads "Restart Firewall".
 */
export async function restartFirewall(cfg: DeviceConfig): Promise<void> {
  const r = await exec(
    cfg,
    "/etc/init.d/firewall restart 2>/dev/null || fw4 restart 2>/dev/null || fw3 restart",
    { timeoutMs: 40000 },
  );
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to restart firewall", (r.stderr || r.stdout).trim());
  }
}

// ---- defaults ----

/** Apply firewall defaults, then commit and reload. */
export async function updateDefaults(
  cfg: DeviceConfig,
  next: Partial<FirewallDefaults>,
): Promise<FirewallWriteResult> {
  const secs = await readSections(cfg);
  const def = secs.find((s) => s.type === "defaults");
  const w = writer(def?.name ?? "@defaults[0]", def);

  for (const [key, option] of [
    ["input", "input"],
    ["output", "output"],
    ["forward", "forward"],
  ] as const) {
    const value = next[key];
    if (value === undefined) continue;
    requireOneOf(value, POLICIES, `${option} policy`);
    putValue(w, option, value.toUpperCase());
  }
  putFlag(w, "syn_flood", next.synFlood);
  putFlag(w, "drop_invalid", next.dropInvalid);
  putFlag(w, "fullcone", next.fullcone);
  putFlag(w, "flow_offloading", next.flowOffloading);

  if (w.cmds.length === 0) return { ok: true, reloaded: false };
  return { ok: true, reloaded: await commitAndReload(cfg, w.cmds, "update firewall defaults") };
}

// ---- enable / delete ----

/**
 * Enable or disable a rule or redirect by its uci section reference. LuCI's
 * `opt_enabled` removes the option to enable (fw3 treats an absent `enabled` as
 * on) and writes `0` to disable; doing the same keeps stock sections untouched.
 */
export async function setSectionEnabled(
  cfg: DeviceConfig,
  ref: string,
  enabled: boolean,
): Promise<FirewallWriteResult> {
  const secs = await readSections(cfg);
  const sec = secs.find((s) => s.name === ref);
  if (!sec) throw new AppError(`Firewall section not found: ${ref}`, 404);
  if (sec.type !== "rule" && sec.type !== "redirect") {
    throw new AppError(`Only rules and redirects can be toggled, not ${sec.type}: ${ref}`);
  }
  const w = writer(sec.name, sec);
  putFlag(w, "enabled", enabled, true);
  if (w.cmds.length === 0) return { ok: true, reloaded: false };
  const reloaded = await commitAndReload(cfg, w.cmds, `${enabled ? "enable" : "disable"} ${ref}`);
  return { ok: true, reloaded };
}

/**
 * Section types the delete endpoint accepts. `defaults` is refused because it
 * would leave the firewall without any policy, and `include` sections belong to
 * installed packages (passwall, miniupnpd, zerotier, socat, ...) that recreate
 * them on their own schedule.
 */
const DELETABLE = new Set(["zone", "rule", "redirect", "forwarding"]);

const ANON_REF = /^@([A-Za-z0-9_-]+)\[(\d+)\]$/;

/**
 * Order `uci delete` calls so that every reference still resolves. Anonymous
 * indices count *all* sections of a type — named ones included — and deleting a
 * section renumbers the ones after it, so the anonymous refs go first, highest
 * index first, and the named ones last. Any other order makes a later
 * `@type[n]` point at the wrong section, or at nothing, which aborts the `&&`
 * chain half way through and leaves a staged delta behind.
 */
export function deleteCmds(refs: string[]): string[] {
  const anon: { ref: string; index: number }[] = [];
  const named: string[] = [];
  for (const ref of refs) {
    const m = ANON_REF.exec(ref);
    if (m) anon.push({ ref, index: Number(m[2]) });
    else named.push(ref);
  }
  anon.sort((a, b) => b.index - a.index);
  return [...anon.map((a) => uciDelete(CFG, a.ref)), ...named.map((ref) => uciDelete(CFG, ref))];
}

/**
 * LuCI's `del_zone`: dropping a zone also drops every rule, redirect and
 * forwarding that names it, otherwise those sections keep pointing at a zone
 * that no longer exists.
 */
export function zoneCascade(secs: UciSection[], zone: UciSection): string[] {
  const name = firstOption(zone, "name", zone.name);
  const doomed = [zone.name];
  for (const s of secs) {
    if (s.type !== "rule" && s.type !== "redirect" && s.type !== "forwarding") continue;
    if (firstOption(s, "src") === name || firstOption(s, "dest") === name) doomed.push(s.name);
  }
  return doomed;
}

/** Delete a firewall section (zone/rule/redirect/forwarding) by reference. */
export async function deleteSection(cfg: DeviceConfig, ref: string): Promise<FirewallWriteResult> {
  const secs = await readSections(cfg);
  const sec = secs.find((s) => s.name === ref);
  if (!sec) throw new AppError(`Firewall section not found: ${ref}`, 404);
  if (!DELETABLE.has(sec.type)) {
    throw new AppError(`Refusing to delete firewall section of type ${sec.type}: ${ref}`);
  }
  const refs = sec.type === "zone" ? zoneCascade(secs, sec) : [ref];
  return { ok: true, reloaded: await commitAndReload(cfg, deleteCmds(refs), `delete ${ref}`) };
}

// ---- create / update zones, rules, redirects, forwardings ----

export async function saveZone(cfg: DeviceConfig, input: ZoneInput): Promise<FirewallWriteResult> {
  validateZoneInput(input);
  const secs = await readSections(cfg);
  checkZoneDraft(secs, input);
  const { cmds } = planZone(secs, input);
  return { ok: true, reloaded: await commitAndReload(cfg, cmds, `save zone ${input.name}`) };
}

export async function saveRule(cfg: DeviceConfig, input: RuleInput): Promise<FirewallWriteResult> {
  validateRuleInput(input);
  const secs = await readSections(cfg);
  checkRuleDraft(secs, input);
  const current = input.ref ? findSection(secs, input.ref, "rule") : undefined;
  // Staged only after every check passed: an anonymous section created by
  // `uci add` has no name the UI could offer for deleting it again.
  const newRef = current ? "" : await addSection(cfg, "rule");
  const { ref, cmds } = planRule(secs, input, newRef);
  return { ok: true, reloaded: await commitAndReload(cfg, cmds, `save rule ${input.name || ref}`) };
}

export async function saveRedirect(
  cfg: DeviceConfig,
  input: RedirectInput,
): Promise<FirewallWriteResult> {
  const target = validateRedirectInput(input);
  const secs = await readSections(cfg);
  checkRedirectDraft(secs, input, target);
  const current = input.ref ? findSection(secs, input.ref, "redirect") : undefined;
  const newRef = current ? "" : await addSection(cfg, "redirect");
  const { ref, cmds } = planRedirect(secs, input, target, newRef);
  const reloaded = await commitAndReload(
    cfg,
    cmds,
    `save ${target === "DNAT" ? "port forward" : "source NAT"} ${input.name || ref}`,
  );
  return { ok: true, reloaded };
}

/** Add one direction of an inter-zone forward. */
export async function addForwarding(
  cfg: DeviceConfig,
  input: ForwardingInput,
): Promise<FirewallWriteResult> {
  const secs = await readSections(cfg);
  checkForwardingDraft(secs, input);
  const ref = await addSection(cfg, "forwarding");
  const w = writer(ref, undefined);
  putValue(w, "src", input.src);
  putValue(w, "dest", input.dest);
  return { ok: true, reloaded: await commitAndReload(cfg, w.cmds, "add forwarding") };
}

// ---- custom rules ----

/**
 * Read `/etc/firewall.user` — the LuCI "Custom Rules" tab. These commands are
 * appended to the ruleset each time the firewall (re)loads. Returns an empty
 * string when the file does not exist yet.
 */
export async function getCustomRules(cfg: DeviceConfig): Promise<{ content: string }> {
  const res = await exec(cfg, `cat ${FIREWALL_USER_PATH} 2>/dev/null`).catch(() => null);
  return { content: res?.stdout ?? "" };
}

/**
 * Write `/etc/firewall.user` via stdin (no argv exposure) and restart to apply.
 * A restart, not a reload: the include that points at this file has no
 * `reload 1`, so a reload would leave the new commands unexecuted while the UI
 * reported success. An unchanged file is left alone — rewriting it would
 * restart the firewall, and drop every connection, for an edit that changed
 * nothing.
 */
export async function setCustomRules(
  cfg: DeviceConfig,
  content: string,
): Promise<FirewallWriteResult> {
  const cleaned = content.replace(/\r\n/g, "\n");
  const { content: before } = await getCustomRules(cfg);
  if (before === cleaned) return { ok: true, reloaded: false };
  const res = await execWithInput(cfg, `cat > ${FIREWALL_USER_PATH}`, cleaned);
  if (res.code !== 0) {
    throw new SshError("exec", "Failed to write firewall.user", (res.stderr || res.stdout).trim());
  }
  await restartFirewall(cfg);
  return { ok: true, reloaded: true };
}
