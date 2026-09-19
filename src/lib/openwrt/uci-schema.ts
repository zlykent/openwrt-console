import { shq } from "@/lib/ssh/quote";
import { parseUciShow, uciDelete, uciSet, type UciSection } from "./uci";

/**
 * Schema-driven UCI configuration engine shared by all luci-app pages.
 *
 * Each app contributes an {@link AppSchema} (config name + section/field
 * definitions mirroring the official LuCI view). Reading parses `uci show`
 * into per-section form values; writing diffs the submitted values against
 * the stored config and emits only the changed `uci set/delete` commands.
 */

export type FieldKind =
  | "text"
  | "textarea"
  | "password"
  | "bool"
  | "int"
  | "select"
  | "dynamiclist"
  | "ip"
  | "mac"
  /** CBI `hostname`: a DNS label, never all-numeric. */
  | "hostname"
  /** CBI `host(1)`: a hostname or an IPv4 address. */
  | "host4";

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * Runtime candidate sources for a field. LuCI populates several widgets from
 * the live system instead of from static lists: `neighbours` mirrors
 * `luci.ip.neighbors()` (the ARP table), `devices` mirrors `sys.net:devices()`
 * (kernel interfaces minus `lo`). Both stay editable — the official widgets
 * are comboboxes, not closed lists, except for `kind: "select"`.
 */
export type CandidateSource = "neighbours" | "devices";

export interface CandidateOptions {
  neighbours?: { ip: string; mac: string }[];
  devices?: string[];
}

export interface FieldDef {
  option: string;
  kind: FieldKind;
  default?: string | boolean | string[];
  required?: boolean;
  min?: number;
  max?: number;
  options?: FieldOption[];
  /**
   * Select choices derived at render time from sibling section instances —
   * the LuCI equivalent of a ListValue populated from another config section
   * (passwall/passwall2 node pickers, ssrplus server pickers).
   */
  optionsFrom?: {
    /** Section type whose instances provide the choices. */
    section: string;
    /** Option whose value labels each choice; falls back to the section ref. */
    labelOption?: string;
    /** Static choices rendered before the derived ones (e.g. `nil` = Close). */
    prepend?: FieldOption[];
  };
  /** UCI stores the opposite polarity (e.g. udpxy `disabled` shown as "Enabled"). */
  invert?: boolean;
  /**
   * The value is a whitespace-separated list of `itemKind` values (CBI
   * `datatype = "list(<x>)"`, e.g. dnsmasq's static-lease `mac`). Applied to
   * every entry of a `dynamiclist` as well.
   */
  itemKind?: FieldKind;
  /** Extra literals the datatype accepts (CBI `or(ip4addr,'ignore')`). */
  allowValues?: string[];
  /**
   * Option maintained by the model rather than by a widget (a CBI `write` /
   * `remove` hook, e.g. dnsmasq's `dns`, which follows the lease hostname).
   * Still read, validated and written — just never rendered.
   */
  hidden?: boolean;
  /** i18n key suffix override for options shared by two sections (`name`, `ip`). */
  labelKey?: string;
  /** Greyed-out example value (CBI `placeholder`). */
  placeholder?: string;
  /** Live-system candidates for this field (see {@link CandidateSource}). */
  candidates?: CandidateSource;
  /**
   * Value lives in this file instead of a UCI option (e.g. smartdns
   * `/etc/smartdns/custom.conf`, nlbwmon `/usr/share/nlbwmon/protocols`).
   * Only meaningful with `kind: "textarea"`.
   */
  file?: string;
  /** Only show when another option's normalized value is in `values` ("*" = any non-empty). */
  depends?: { option: string; values: string[] };
}

export interface TabDef {
  id: string;
  fields: FieldDef[];
}

/** Cross-field constraint a CBI model enforces from a custom `validate` hook. */
export interface SectionRule {
  /** Option that triggers the rule when non-empty. */
  when: string;
  /** At least one of these must be non-empty too. */
  atLeastOne: string[];
}

export interface SectionDef {
  type: string;
  /**
   * i18n / React-key suffix override. Required when one app declares two
   * sections of the same UCI type (smartdns splits its `smartdns` singleton
   * over a "Settings" and an "Advanced Settings" card).
   */
  labelKey?: string;
  /** Multiple instances with add/remove (LuCI GridSection-like). */
  multiple?: boolean;
  /** Match one named section reference instead of matching by type. */
  named?: string;
  /** Option whose value titles an instance card. */
  titleOption?: string;
  fields?: FieldDef[];
  tabs?: TabDef[];
  rules?: SectionRule[];
}

export interface AppLink {
  label: string;
  href: string;
}

export interface AppSchema {
  slug: string;
  name: string;
  config: string;
  /** init.d script name when it differs from the slug. */
  service?: string;
  /** External references rendered in the page header (official "DummyValue" buttons). */
  links?: AppLink[];
  sections: SectionDef[];
}

export type FieldValue = string | boolean | string[];

export interface SectionInstance {
  /** null = new section, created with `uci add` on save. */
  ref: string | null;
  type: string;
  values: Record<string, FieldValue>;
}

export interface AppConfigGroup {
  type: string;
  instances: SectionInstance[];
}

export interface AppConfigState {
  present: boolean;
  groups: AppConfigGroup[];
}

export interface ServiceState {
  installed: boolean;
  enabled: boolean;
  running: boolean;
}

/** Everything a schema-driven config page needs in one payload. */
export interface AppConfigPayload {
  state: AppConfigState;
  service: ServiceState;
  candidates: CandidateOptions;
}

export interface AppSummary {
  slug: string;
  present: boolean;
  installed: boolean;
  enabled: boolean;
  running: boolean;
}

export function sectionFields(def: SectionDef): FieldDef[] {
  return [...(def.fields ?? []), ...(def.tabs ?? []).flatMap((t) => t.fields)];
}

/** Unique identity of a section within its schema: React key + `s.<key>` i18n suffix. */
export function sectionKey(def: SectionDef): string {
  return def.labelKey ?? def.type;
}

/** Unique identity of a field within its schema: `f.<key>` i18n suffix. */
export function fieldKey(field: FieldDef): string {
  return field.labelKey ?? field.option;
}

export function serviceName(schema: AppSchema): string {
  return schema.service ?? schema.slug;
}

function isTrue(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

function readField(
  field: FieldDef,
  sec: UciSection | undefined,
  files: Record<string, string>,
): FieldValue {
  if (field.file) return files[field.file] ?? "";
  const raw = sec?.options[field.option];
  if (field.kind === "bool") {
    if (raw === undefined) return typeof field.default === "boolean" ? field.default : false;
    const on = isTrue(Array.isArray(raw) ? raw[0] : raw);
    return field.invert ? !on : on;
  }
  if (field.kind === "dynamiclist") {
    if (raw === undefined) return Array.isArray(field.default) ? [...field.default] : [];
    return Array.isArray(raw) ? raw : [raw];
  }
  // A `list(<datatype>)` option may already be stored as a real UCI list (the
  // upstream JS views use a DynamicList where the Lua view uses a Value); join
  // it back into the whitespace-separated form the widget edits, so entries
  // after the first are not silently dropped on the next save.
  const v = Array.isArray(raw) ? (field.itemKind ? raw.join(" ") : raw[0]) : raw;
  if (v === undefined) return typeof field.default === "string" ? field.default : "";
  return v;
}

/**
 * Whether a field takes part in the form right now — the equivalent of CBI's
 * `depends`, whose unmet widgets are neither rendered nor submitted.
 */
export function fieldVisible(field: FieldDef, values: Record<string, FieldValue>): boolean {
  if (!field.depends) return true;
  const raw = values[field.depends.option];
  const v =
    raw === undefined
      ? ""
      : typeof raw === "boolean"
        ? raw
          ? "1"
          : "0"
        : Array.isArray(raw)
          ? (raw[0] ?? "")
          : raw;
  if (field.depends.values.includes("*")) return v !== "";
  return field.depends.values.includes(v);
}

export function defaultInstance(def: SectionDef, candidates?: CandidateOptions): SectionInstance {
  const values: Record<string, FieldValue> = {};
  for (const f of sectionFields(def)) values[f.option] = readField(f, undefined, {});
  // A ListValue built from `sys.net:devices()` cannot hold an interface the
  // kernel does not know — LuCI coerces such a value to its first choice — so
  // a declared default (arpbind's `br-lan`) only applies on a device that
  // really has it.
  const devices = candidates?.devices;
  if (devices && devices.length > 0) {
    for (const f of sectionFields(def)) {
      if (f.candidates !== "devices") continue;
      const v = values[f.option];
      if (typeof v === "string" && !devices.includes(v)) values[f.option] = devices[0];
    }
  }
  return { ref: null, type: def.type, values };
}

/** Every file path this app's schema reads/writes outside of UCI. */
export function appFilePaths(schema: AppSchema): string[] {
  const paths = schema.sections
    .flatMap((def) => sectionFields(def))
    .map((f) => f.file)
    .filter((p): p is string => !!p);
  return [...new Set(paths)];
}

/** Candidate sources this app's fields ask the device for (empty = skip the probe). */
export function candidateSources(schema: AppSchema): CandidateSource[] {
  const sources = schema.sections
    .flatMap((def) => sectionFields(def))
    .map((f) => f.candidates)
    .filter((c): c is CandidateSource => !!c);
  return [...new Set(sources)];
}

export function readAppConfig(
  schema: AppSchema,
  output: string,
  present: boolean,
  files: Record<string, string> = {},
): AppConfigState {
  const sections = present ? parseUciShow(output) : [];
  const groups: AppConfigGroup[] = schema.sections.map((def) => {
    const matched = def.named
      ? sections.filter((s) => s.name === def.named)
      : sections.filter((s) => s.type === def.type);
    return {
      type: def.type,
      instances: matched.map((sec) => {
        const values: Record<string, FieldValue> = {};
        for (const f of sectionFields(def)) values[f.option] = readField(f, sec, files);
        return { ref: sec.name, type: sec.type, values };
      }),
    };
  });
  return { present, groups };
}

/**
 * Encode a form value into its UCI representation ("" / [] means "delete").
 * An option the form never carried encodes as empty rather than as the string
 * `undefined`, which would otherwise be written verbatim.
 */
export function encodeField(field: FieldDef, value: FieldValue | undefined): string | string[] {
  if (field.kind === "bool") {
    const on = value === true || value === "1" || value === "true";
    return (field.invert ? !on : on) ? "1" : "0";
  }
  if (value === undefined) return field.kind === "dynamiclist" ? [] : "";
  if (field.kind === "dynamiclist") {
    return Array.isArray(value) ? value.filter((v) => v !== "") : String(value).split(/\s+/).filter(Boolean);
  }
  return Array.isArray(value) ? (value[0] ?? "") : String(value);
}

function storedAsString(stored: string | string[] | undefined): string {
  if (stored === undefined) return "";
  return Array.isArray(stored) ? (stored[0] ?? "") : stored;
}

function storedAsList(stored: string | string[] | undefined): string[] {
  if (stored === undefined) return [];
  return Array.isArray(stored) ? stored : [stored];
}

// ---- value validation (pure) ----

function isIpv4(addr: string): boolean {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  // Leading zeroes are ambiguous (octal in some parsers), so reject them.
  return m.slice(1).every((o) => Number(o) <= 255 && String(Number(o)) === o);
}

function isIpv6(addr: string): boolean {
  if (!addr.includes(":") || addr.includes("%")) return false;
  let a = addr;
  // An embedded IPv4 tail (::ffff:192.0.2.1) counts as two 16-bit groups.
  const mapped = a.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) {
    if (!isIpv4(mapped[2])) return false;
    a = `${mapped[1]}0:0`;
  }
  const halves = a.split("::");
  if (halves.length > 2) return false;
  const groups = (s: string) => (s === "" ? [] : s.split(":"));
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if ([...head, ...tail].some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return false;
  // `::` always stands for at least one omitted group.
  return halves.length === 2 ? head.length + tail.length <= 7 : head.length === 8;
}

/** IPv4/IPv6 literal, optionally with a prefix length (CBI `ipaddr`/`cidr`). */
export function isValidIpValue(value: string): boolean {
  const slash = value.indexOf("/");
  const addr = slash < 0 ? value : value.slice(0, slash);
  const v4 = isIpv4(addr);
  if (!v4 && !isIpv6(addr)) return false;
  if (slash < 0) return true;
  const prefix = value.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (v4 ? 32 : 128);
}

/** CBI `macaddr`: six hex octets separated by `:` or `-`. */
export function isValidMacValue(value: string): boolean {
  return /^([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}$/.test(value);
}

/** Bare IPv4 address without a prefix (CBI `ip4addr`). */
export function isValidIpv4Value(value: string): boolean {
  return isIpv4(value);
}

/**
 * CBI `hostname`: shorter than 254 chars, either purely alphabetic or a label
 * that starts alphanumeric, ends alphanumeric and is not all digits/dots (so an
 * address can never masquerade as a name).
 */
export function isValidHostnameValue(value: string): boolean {
  if (!value || value.length >= 254) return false;
  if (/^[a-zA-Z_]+$/.test(value)) return true;
  return /^[a-zA-Z0-9_][a-zA-Z0-9_.-]*[a-zA-Z0-9]$/.test(value) && /[^0-9.]/.test(value);
}

function isValidForKind(kind: FieldKind, field: FieldDef, value: string): boolean {
  switch (kind) {
    case "ip":
      return isValidIpValue(value);
    case "mac":
      return isValidMacValue(value);
    case "hostname":
      return isValidHostnameValue(value);
    case "host4":
      return isValidHostnameValue(value) || isValidIpv4Value(value);
    case "int":
      return isValidIntValue(field, value);
    default:
      return true;
  }
}

export function isValidIntValue(field: FieldDef, value: string): boolean {
  if (!/^-?\d+$/.test(value)) return false;
  const n = Number(value);
  if (field.min !== undefined && n < field.min) return false;
  if (field.max !== undefined && n > field.max) return false;
  return true;
}

/** The first token of a `list(<datatype>)` value its datatype rejects. */
export function invalidToken(field: FieldDef, value: string): string | undefined {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .find((token) => !isValidForKind(field.itemKind as FieldKind, field, token));
}

/** Whether a field's encoded value passes its declared datatype. */
export function isValidValue(field: FieldDef, value: string): boolean {
  if ((field.allowValues ?? []).includes(value)) return true;
  // `list(<datatype>)`: every whitespace-separated token is checked on its own.
  if (field.itemKind) return invalidToken(field, value) === undefined;
  return isValidForKind(field.kind, field, value);
}

export type IssueReason = "required" | "invalid" | "atLeastOne";

export interface FieldIssue {
  /** Position of the offending instance in the submitted list. */
  index: number;
  ref: string | null;
  type: string;
  option: string;
  reason: IssueReason;
  /** Rejected value; "" when a required field is empty. */
  value: string;
  /** For `atLeastOne`: the sibling options that would also satisfy the rule. */
  others?: string[];
}

/**
 * CBI validates every submitted widget against its `datatype` and refuses to
 * store what it rejects — an invalid address comes back marked
 * `cbi-input-invalid` and never reaches the config file. These checks gate our
 * writes the same way.
 *
 * `required` is only enforced for drafts added in this form: a partial rule
 * that already sits on the device (LuCI stores one happily, its address
 * widgets are `data-optional`) must stay editable instead of blocking every
 * later save.
 */
export function validateInstances(
  schema: AppSchema,
  instances: SectionInstance[],
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  for (const [index, inst] of instances.entries()) {
    const def =
      schema.sections.find((s) => s.type === inst.type && (!s.named || s.named === inst.ref)) ??
      schema.sections.find((s) => s.type === inst.type);
    if (!def) continue;
    const isNew = inst.ref === null;
    for (const f of sectionFields(def)) {
      // File-backed fields hold free-form config text, not a single value.
      if (f.file || !fieldVisible(f, inst.values)) continue;
      const enc = encodeField(f, inst.values[f.option]);
      if (Array.isArray(enc)) {
        // List entries are only checked when the widget declares a datatype.
        if (!f.itemKind) continue;
        const bad = enc.find((v) => !isValidForKind(f.itemKind as FieldKind, f, v));
        if (bad !== undefined) {
          issues.push({ index, ref: inst.ref, type: inst.type, option: f.option, reason: "invalid", value: bad });
        }
        continue;
      }
      if (enc === "") {
        if (isNew && f.required) {
          issues.push({ index, ref: inst.ref, type: inst.type, option: f.option, reason: "required", value: "" });
        }
        continue;
      }
      // A `list(<datatype>)` widget holds several values in one input, so the
      // offending token is named instead of echoing all of them back.
      const bad = f.itemKind && !(f.allowValues ?? []).includes(enc) ? invalidToken(f, enc) : undefined;
      if (bad === undefined && isValidValue(f, enc)) continue;
      issues.push({
        index,
        ref: inst.ref,
        type: inst.type,
        option: f.option,
        reason: "invalid",
        value: bad ?? enc,
      });
    }
    // Cross-field constraints run on every row, saved or draft: CBI calls the
    // model's `validate` hook for each section on every submit.
    for (const rule of def.rules ?? []) {
      if (text(inst.values[rule.when]) === "") continue;
      if (rule.atLeastOne.some((o) => text(inst.values[o]) !== "")) continue;
      issues.push({
        index,
        ref: inst.ref,
        type: inst.type,
        option: rule.when,
        reason: "atLeastOne",
        value: text(inst.values[rule.when]),
        others: rule.atLeastOne,
      });
    }
  }
  return issues;
}

/** Form value as the plain text a rule or datatype check inspects. */
function text(value: FieldValue | undefined): string {
  if (value === undefined) return "";
  if (typeof value === "boolean") return value ? "1" : "0";
  if (Array.isArray(value)) return value.filter((v) => v !== "").join(" ");
  return value.trim();
}

/** UCI encoding of a field's declared default (what readField would show). */
function defaultEncoding(field: FieldDef): string | string[] {
  if (field.kind === "bool") {
    const on = field.default === true;
    return (field.invert ? !on : on) ? "1" : "0";
  }
  if (field.kind === "dynamiclist") {
    return Array.isArray(field.default) ? [...field.default] : [];
  }
  return typeof field.default === "string" ? field.default : "";
}

function sameValue(a: string | string[], b: string | string[]): boolean {
  return Array.isArray(a) || Array.isArray(b)
    ? JSON.stringify(storedAsList(a)) === JSON.stringify(storedAsList(b))
    : storedAsString(a) === storedAsString(b);
}

/**
 * Diff submitted instances against the stored config and return the exact
 * `uci` commands to apply (without commit). Pure and unit-testable.
 */
export function planWrite(
  schema: AppSchema,
  current: UciSection[],
  payload: SectionInstance[],
): string[] {
  const cmds: string[] = [];
  const payloadByType = new Map<string, SectionInstance[]>();
  for (const inst of payload) {
    const arr = payloadByType.get(inst.type) ?? [];
    arr.push(inst);
    payloadByType.set(inst.type, arr);
  }

  // Iterate schema sections (not payload types) so removing *every* instance
  // of a multiple section still emits its delete commands.
  for (const def of schema.sections) {
    const type = def.type;
    const instances = payloadByType.get(type) ?? [];
    const fields = sectionFields(def);
    const currentOfType = def.named
      ? current.filter((s) => s.name === def.named)
      : current.filter((s) => s.type === type);

    for (const inst of instances) {
      if (inst.ref === null) {
        const target = `@${type}[-1]`;
        const sets: string[] = [];
        for (const f of fields) {
          if (f.file || !(f.option in inst.values)) continue;
          const enc = encodeField(f, inst.values[f.option]);
          if (Array.isArray(enc) ? enc.length > 0 : enc !== "") {
            sets.push(uciSet(schema.config, target, f.option, enc));
          }
        }
        // An empty draft carries nothing to persist: creating a section for it
        // would litter the device with entries no widget can describe.
        if (sets.length === 0) continue;
        cmds.push(`uci -q add ${schema.config} ${type}`, ...sets);
        continue;
      }
      const sec = currentOfType.find((s) => s.name === inst.ref);
      if (!sec) {
        // Section missing on the device (e.g. config file absent): create it
        // under its canonical name before writing options.
        cmds.push(`uci -q add ${schema.config} ${type}`);
        cmds.push(
          `uci -q rename ${shq(`${schema.config}.@${type}[-1]`)}=${shq(inst.ref)}`,
        );
      }
      for (const f of fields) {
        if (f.file || !(f.option in inst.values)) continue;
        const enc = encodeField(f, inst.values[f.option]);
        const stored = sec?.options[f.option];
        if (sameValue(enc, storedAsList(stored)) || sameValue(enc, stored ?? "")) continue;
        // Option absent on the device and the form still shows the untouched
        // default: nothing to persist (LuCI leaves defaults unwritten). A flag
        // therefore needs a `default` that matches what the init script does
        // when the option is missing, or the form would claim a state the
        // daemon is not in.
        if (stored === undefined && sameValue(enc, defaultEncoding(f))) continue;
        if (Array.isArray(enc) ? enc.length === 0 : enc === "") {
          if (stored !== undefined) cmds.push(uciDelete(schema.config, inst.ref, f.option));
        } else {
          cmds.push(uciSet(schema.config, inst.ref, f.option, enc));
        }
      }
    }

    if (def.multiple) {
      const keep = new Set(instances.map((i) => i.ref).filter((r): r is string => !!r));
      const dropped = currentOfType.filter((s) => !keep.has(s.name));
      // Anonymous references are positional: removing `@type[0]` renumbers every
      // section after it, so an ascending chain of deletes drops the wrong ones
      // and then fails on an index that no longer exists — leaving the earlier
      // deletes staged but uncommitted. Highest index first keeps each
      // remaining reference valid. Named sections carry no index and cannot be
      // renumbered, so they may go last.
      dropped.sort((a, b) => (b.index ?? -1) - (a.index ?? -1));
      for (const sec of dropped) cmds.push(uciDelete(schema.config, sec.name));
    }
  }
  return cmds;
}

export interface FileWrite {
  path: string;
  content: string;
}

/**
 * Diff the submitted values of file-backed fields against what the device
 * currently stores and return the files that need writing. Pure.
 */
export function planFileWrites(
  schema: AppSchema,
  currentFiles: Record<string, string>,
  payload: SectionInstance[],
): FileWrite[] {
  const byPath = new Map<string, string>();
  for (const def of schema.sections) {
    for (const f of sectionFields(def)) {
      if (!f.file) continue;
      for (const inst of payload) {
        if (inst.type !== def.type) continue;
        const v = inst.values[f.option];
        if (typeof v !== "string") continue;
        // Official CBI normalises CRLF when writing these files.
        byPath.set(f.file, v.replace(/\r\n/g, "\n"));
      }
    }
  }
  const writes: FileWrite[] = [];
  for (const [path, content] of byPath) {
    if ((currentFiles[path] ?? "") === content) continue;
    writes.push({ path, content });
  }
  return writes;
}

// ---- service operation identifiers (pure) ----
// Device I/O lives in `./apps-service` so client components can import this
// module's schema types/helpers without bundling the Node-only `ssh2` client.

export const SERVICE_OPS = ["enable", "disable", "start", "stop", "restart"] as const;
export type ServiceOp = (typeof SERVICE_OPS)[number];
