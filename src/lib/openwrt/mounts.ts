import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import {
  chain,
  firstOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciDeleteIfExists,
  uciSet,
  uciShow,
  type UciSection,
} from "./uci";
import type {
  BlockDevice,
  FstabGlobal,
  FstabMount,
  FstabSwap,
  MountEntry,
  MountsState,
} from "./types";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * Mount points, modelled on LuCI's `admin_system/fstab*.lua`.
 *
 * Three things the device decides, not us:
 *  - the page exists only when `/sbin/block` and `/etc/config/fstab` are there;
 *  - "Run filesystem check" is offered only when `/usr/sbin/e2fsck` exists;
 *  - Unmount is offered only for mount points the system can live without.
 */

/** LuCI refuses to unmount these (`fstab.lua`, the `non_system_mounts` filter). */
export const SYSTEM_MOUNTPOINTS = [
  "/",
  "/overlay",
  "/rom",
  "/tmp",
  "/tmp/shm",
  "/tmp/upgrade",
  "/dev",
];

/** LuCI drops jail mounts from the table entirely. */
const JAIL_PREFIX = "/tmp/.jail";

/** Option name, form key and the value LuCI pre-selects when the option is absent. */
export const GLOBAL_FLAGS: readonly {
  option: string;
  key: keyof FstabGlobal;
  dflt: boolean;
}[] = [
  { option: "anon_swap", key: "anonSwap", dflt: false },
  { option: "anon_mount", key: "anonMount", dflt: false },
  { option: "auto_swap", key: "autoSwap", dflt: true },
  { option: "auto_mount", key: "autoMount", dflt: true },
  { option: "check_fs", key: "checkFs", dflt: false },
];

const PROBE_CMD = [
  "test -x /sbin/block && test -f /etc/config/fstab && echo supported",
  "test -x /usr/sbin/e2fsck && echo fsck",
  "echo ===BLOCK===",
  "block info 2>/dev/null",
  "echo ===FS===",
  "cat /proc/filesystems 2>/dev/null",
  "echo ===SWAPDEV===",
  // swap.lua globs these four patterns rather than reusing `block info`.
  "ls -d /dev/sd* /dev/hd* /dev/scd* /dev/mmc* 2>/dev/null",
  "echo ===SIZES===",
  "grep -H . /sys/class/block/*/size 2>/dev/null",
].join("; ");

// ---- pure parsers (unit tested) ----

/**
 * Split the probe output on its `===NAME===` markers. Lines before the first
 * marker land under `head`, which is where the capability flags are echoed.
 */
export function parseProbe(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  let key = "head";
  let buf: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^===(\w+)===\s*$/.exec(line.trim());
    if (m) {
      out[key] = buf.join("\n");
      key = m[1];
      buf = [];
      continue;
    }
    buf.push(line);
  }
  out[key] = buf.join("\n");
  return out;
}

/** `df -h` → rows. Header: Filesystem Size Used Available Use% Mounted on */
export function parseDf(text: string): MountEntry[] {
  const out: MountEntry[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || /^filesystem/i.test(line)) continue;
    const f = line.split(/\s+/);
    if (f.length < 6) continue;
    const [device, size, used, available, usePercent, ...targetParts] = f;
    const target = targetParts.join(" ");
    if (target.startsWith(JAIL_PREFIX)) continue;
    out.push({
      device,
      size,
      used,
      available,
      usePercent,
      target,
      umountable: !SYSTEM_MOUNTPOINTS.includes(target),
    });
  }
  return out;
}

/** sysfs sector counts (512 bytes) → MiB, the unit LuCI displays. */
export function parseBlockSizes(stdout: string): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const m = /^\/sys\/class\/block\/([^/]+)\/size:(\d+)\s*$/.exec(line.trim());
    if (m) sizes.set(m[1], Math.floor(Number(m[2]) / 2048));
  }
  return sizes;
}

/**
 * `block info` → devices. LuCI lowercases the attribute names and keeps every
 * `KEY="value"` pair; uuid/label/type are the ones the forms offer.
 */
export function parseBlockInfo(stdout: string, sizes: Map<string, number>): BlockDevice[] {
  const out: BlockDevice[] = [];
  for (const line of stdout.split("\n")) {
    const m = /^\s*\/dev\/([^:]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, name, rest] = m;
    const dev: BlockDevice = { dev: `/dev/${name}` };
    for (const kv of rest.matchAll(/(\w+)="([^"]*)"/g)) {
      const key = kv[1].toLowerCase();
      if (key === "uuid") dev.uuid = kv[2];
      else if (key === "label") dev.label = kv[2];
      else if (key === "type") dev.type = kv[2];
    }
    const size = sizes.get(name);
    if (size !== undefined) dev.sizeMb = size;
    out.push(dev);
  }
  return out;
}

/** `/proc/filesystems`: LuCI keeps the first token and skips `nodev` rows. */
export function parseProcFilesystems(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split("\n")) {
    const token = line.trim().split(/\s+/)[0];
    if (!token || token === "nodev") continue;
    out.push(token);
  }
  return out;
}

/** One device path per line (from the swap.lua globs). */
export function parseSwapDevices(stdout: string, sizes: Map<string, number>): BlockDevice[] {
  const out: BlockDevice[] = [];
  for (const line of stdout.split("\n")) {
    const dev = line.trim();
    if (!dev.startsWith("/dev/")) continue;
    const size = sizes.get(dev.slice("/dev/".length));
    out.push(size === undefined ? { dev } : { dev, sizeMb: size });
  }
  return out;
}

function flagValue(sec: UciSection | undefined, option: string, dflt: boolean): boolean {
  const raw = firstOption(sec, option, "");
  if (raw === "") return dflt;
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

export function parseFstabSections(sections: UciSection[]): {
  fstab: FstabMount[];
  swap: FstabSwap[];
  global: FstabGlobal;
} {
  const fstab: FstabMount[] = [];
  const swap: FstabSwap[] = [];
  let globalSec: UciSection | undefined;
  for (const sec of sections) {
    if (sec.type === "mount") {
      fstab.push({
        ref: sec.name,
        target: firstOption(sec, "target"),
        device: firstOption(sec, "device") || undefined,
        uuid: firstOption(sec, "uuid") || undefined,
        label: firstOption(sec, "label") || undefined,
        fstype: firstOption(sec, "fstype") || undefined,
        options: firstOption(sec, "options") || undefined,
        enabledFsck: flagValue(sec, "enabled_fsck", false),
        enabled: flagValue(sec, "enabled", false),
      });
    } else if (sec.type === "swap") {
      swap.push({
        ref: sec.name,
        device: firstOption(sec, "device") || undefined,
        uuid: firstOption(sec, "uuid") || undefined,
        label: firstOption(sec, "label") || undefined,
        enabled: flagValue(sec, "enabled", false),
      });
    } else if (sec.type === "global") {
      globalSec = sec;
    }
  }
  const global = {} as FstabGlobal;
  for (const f of GLOBAL_FLAGS) global[f.key] = flagValue(globalSec, f.option, f.dflt);
  return { fstab, swap, global };
}

// ---- validation ----

/** Values that end up as a single uci option: no shell syntax, no whitespace. */
function requireToken(value: string, label: string): void {
  if (/[\s'"\\`$<>|;&]/.test(value)) {
    throw new AppError(`Invalid ${label}: ${value}`);
  }
}

/** Partition labels may contain spaces, so only the config-breaking set is refused. */
function requireLabel(value: string): void {
  if (/['"\\\n\r]/.test(value)) throw new AppError(`Invalid label: ${value}`);
}

function requirePath(value: string, label: string): void {
  if (!value.startsWith("/")) {
    throw new AppError(`Invalid ${label}: ${value} (expected an absolute path)`);
  }
  requireToken(value, label);
}

export type FstabMountInput = {
  target: string;
  device?: string;
  uuid?: string;
  label?: string;
  fstype?: string;
  options?: string;
  enabledFsck?: boolean;
  enabled: boolean;
};

export type FstabSwapInput = {
  device?: string;
  uuid?: string;
  label?: string;
  enabled: boolean;
};

export type FstabGlobalInput = Partial<FstabGlobal>;

export function validateMountInput(next: FstabMountInput, hasFsck: boolean): void {
  requirePath(next.target, "target");
  if (next.uuid) requireToken(next.uuid, "uuid");
  if (next.label) requireLabel(next.label);
  if (next.device) requirePath(next.device, "device");
  if (next.fstype) {
    if (!/^[A-Za-z0-9_.+-]+$/.test(next.fstype)) {
      throw new AppError(`Invalid fstype: ${next.fstype}`);
    }
  }
  if (next.options) requireToken(next.options, "options");
  // mount.lua chains uuid → label → device: an entry with none of them can
  // never match a device, so `block` would silently skip it forever.
  if (!next.uuid && !next.label && !next.device) {
    throw new AppError("A mount entry needs a UUID, a label or a device");
  }
  if (next.enabledFsck && !hasFsck) {
    throw new AppError("This device has no e2fsck, so filesystem checks cannot run");
  }
}

export function validateSwapInput(next: FstabSwapInput): void {
  if (next.uuid) requireToken(next.uuid, "uuid");
  if (next.label) requireLabel(next.label);
  if (next.device) requirePath(next.device, "device");
  if (!next.uuid && !next.label && !next.device) {
    throw new AppError("A swap entry needs a UUID, a label or a device");
  }
}

// ---- command builders ----

const MOUNT_OPTIONS = ["target", "uuid", "label", "device", "fstype", "options"] as const;
const SWAP_OPTIONS = ["uuid", "label", "device"] as const;

/**
 * `uci set` on an option that already exists moves it to the end of the
 * section, so unchanged options are left alone (see g29).
 */
function writeOption(
  cmds: string[],
  ref: string,
  option: string,
  value: string,
  cur: UciSection | undefined,
  optional: boolean,
): void {
  // A section being created stores nothing yet, so "" is both its current and
  // its desired value for every field the operator left blank.
  const stored = cur ? firstOption(cur, option, "") : "";
  if (value === stored) return;
  if (optional && value === "") {
    cmds.push(uciDeleteIfExists("fstab", ref, option));
    return;
  }
  cmds.push(uciSet("fstab", ref, option, value));
}

/**
 * Commands that write one mount section. `cur` is undefined when the section
 * is being created, in which case `ref` must be `@mount[-1]`.
 */
export function mountCommands(
  ref: string,
  next: FstabMountInput,
  cur: UciSection | undefined,
  hasFsck: boolean,
): string[] {
  const cmds: string[] = [];
  const values: Record<string, string> = {
    target: next.target,
    uuid: next.uuid ?? "",
    label: next.label ?? "",
    device: next.device ?? "",
    fstype: next.fstype ?? "",
    options: next.options ?? "",
  };
  for (const option of MOUNT_OPTIONS) {
    writeOption(cmds, ref, option, values[option], cur, option !== "target");
  }
  // LuCI's Flag has rmempty = false, so `enabled` is always written explicitly.
  writeOption(cmds, ref, "enabled", next.enabled ? "1" : "0", cur, false);
  if (hasFsck) {
    writeOption(cmds, ref, "enabled_fsck", next.enabledFsck ? "1" : "0", cur, false);
  }
  return cmds;
}

export function swapCommands(
  ref: string,
  next: FstabSwapInput,
  cur: UciSection | undefined,
): string[] {
  const cmds: string[] = [];
  const values: Record<string, string> = {
    uuid: next.uuid ?? "",
    label: next.label ?? "",
    device: next.device ?? "",
  };
  for (const option of SWAP_OPTIONS) {
    writeOption(cmds, ref, option, values[option], cur, true);
  }
  writeOption(cmds, ref, "enabled", next.enabled ? "1" : "0", cur, false);
  return cmds;
}

/** Commands for the `config global` section; empty when nothing changed. */
export function globalCommands(input: FstabGlobalInput, cur: UciSection | undefined): string[] {
  const writes: string[] = [];
  const ref = cur?.name ?? "@global[-1]";
  for (const f of GLOBAL_FLAGS) {
    const want = input[f.key];
    if (want === undefined) continue;
    const value = want ? "1" : "0";
    if (cur && firstOption(cur, f.option, "") === value) continue;
    writes.push(uciSet("fstab", ref, f.option, value));
  }
  if (writes.length === 0) return [];
  // Never touch options LuCI does not expose either (`delay_root` lives here).
  return cur ? writes : ["uci -q add fstab global >/dev/null", ...writes];
}

// ---- device access ----

async function readSections(cfg: DeviceConfig): Promise<UciSection[]> {
  const res = await exec(cfg, uciShow("fstab")).catch(() => null);
  return res ? parseUciShow(res.stdout) : [];
}

async function run(cfg: DeviceConfig, cmds: string[], failure: string): Promise<void> {
  const res = await exec(cfg, chain(...cmds), { timeoutMs: 20000 });
  if (res.code !== 0) {
    await exec(cfg, "uci revert fstab 2>/dev/null; true").catch(() => undefined);
    const detail = (res.stderr || res.stdout).trim();
    throw new DeviceCommandError(detail ? `${failure}: ${detail}` : failure);
  }
}

export async function getMountsState(cfg: DeviceConfig): Promise<MountsState> {
  const [uciRes, dfRes, probeRes] = await Promise.all([
    exec(cfg, uciShow("fstab")).catch(() => null),
    exec(cfg, "df -h 2>/dev/null").catch(() => null),
    exec(cfg, PROBE_CMD).catch(() => null),
  ]);
  const probe = parseProbe(probeRes?.stdout ?? "");
  const head = probe.head ?? "";
  const sizes = parseBlockSizes(probe.SIZES ?? "");
  const sections = parseUciShow(uciRes?.stdout ?? "");
  const { fstab, swap, global } = parseFstabSections(sections);
  return {
    supported: /\bsupported\b/.test(head),
    mounts: parseDf(dfRes?.stdout ?? ""),
    fstab,
    swap,
    global,
    devices: parseBlockInfo(probe.BLOCK ?? "", sizes),
    fstypes: parseProcFilesystems(probe.FS ?? ""),
    swapDevices: parseSwapDevices(probe.SWAPDEV ?? "", sizes),
    hasFsck: /\bfsck\b/.test(head),
  };
}

/**
 * LuCI's own guard on the entry pages: `m.uci:get("fstab", arg[1]) ~= "mount"`
 * redirects away. Without it a caller could address `@global[0]`, or a section
 * that vanished between reading the list and submitting the form.
 */
async function requireSection(
  cfg: DeviceConfig,
  ref: string,
  type: "mount" | "swap",
): Promise<UciSection> {
  const sections = await readSections(cfg);
  const sec = sections.find((s) => s.name === ref);
  if (!sec || sec.type !== type) {
    throw new AppError(`No ${type} section "${ref}" in fstab`, 404, "unknown");
  }
  return sec;
}

async function probeHasFsck(cfg: DeviceConfig): Promise<boolean> {
  const res = await exec(cfg, "test -x /usr/sbin/e2fsck && echo fsck").catch(() => null);
  return /\bfsck\b/.test(res?.stdout ?? "");
}

export async function saveMount(
  cfg: DeviceConfig,
  input: FstabMountInput,
  ref?: string,
): Promise<{ ok: true }> {
  const hasFsck = input.enabledFsck === undefined ? false : await probeHasFsck(cfg);
  validateMountInput(input, hasFsck);
  // `uci add` prints a generated `cfgXXXXXX` name, but that name is re-derived
  // on every load, so a new section is addressed as `@mount[-1]` for the rest
  // of this chain. `uci rename @mount[-1]=name` is not an option: it rewrites
  // the section *type* instead of naming it (see g8).
  const cur = ref ? await requireSection(cfg, ref, "mount") : undefined;
  const target = ref ?? "@mount[-1]";
  const cmds: string[] = ref ? [] : ["uci -q add fstab mount >/dev/null"];
  const writes = mountCommands(target, input, cur, hasFsck);
  if (writes.length === 0) return { ok: true }; // nothing changed, leave the device alone
  cmds.push(...writes, uciCommit("fstab"));
  await run(cfg, cmds, "Failed to save mount point");
  return { ok: true };
}

export async function saveSwap(
  cfg: DeviceConfig,
  input: FstabSwapInput,
  ref?: string,
): Promise<{ ok: true }> {
  validateSwapInput(input);
  const cur = ref ? await requireSection(cfg, ref, "swap") : undefined;
  const target = ref ?? "@swap[-1]";
  const cmds: string[] = ref ? [] : ["uci -q add fstab swap >/dev/null"];
  const writes = swapCommands(target, input, cur);
  if (writes.length === 0) return { ok: true };
  cmds.push(...writes, uciCommit("fstab"));
  await run(cfg, cmds, "Failed to save swap entry");
  return { ok: true };
}

export async function saveGlobal(
  cfg: DeviceConfig,
  input: FstabGlobalInput,
): Promise<{ ok: true }> {
  const sections = await readSections(cfg);
  const cur = sections.find((s) => s.type === "global");
  const cmds = globalCommands(input, cur);
  if (cmds.length === 0) return { ok: true };
  cmds.push(uciCommit("fstab"));
  await run(cfg, cmds, "Failed to save global settings");
  return { ok: true };
}

export async function deleteFstabSection(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  const sections = await readSections(cfg);
  const sec = sections.find((s) => s.name === ref);
  if (!sec || (sec.type !== "mount" && sec.type !== "swap")) {
    throw new AppError(`No mount or swap section "${ref}" in fstab`, 404, "unknown");
  }
  await run(cfg, [uciDelete("fstab", ref), uciCommit("fstab")], `Failed to delete ${sec.type}`);
  return { ok: true };
}

/**
 * `/etc/config/ucitrack` maps `fstab` to `exec '/sbin/block mount'`, which is
 * exactly what LuCI's "Save & Apply" runs for this page.
 */
export async function applyFstab(cfg: DeviceConfig): Promise<{ ok: true; output: string }> {
  const res = await exec(cfg, "/sbin/block mount 2>&1", { timeoutMs: 30000 });
  if (res.code !== 0) {
    throw new DeviceCommandError(
      (res.stdout || res.stderr).trim() || "block mount failed",
    );
  }
  return { ok: true, output: res.stdout.trim() };
}

export async function umountTarget(cfg: DeviceConfig, target: string): Promise<{ ok: true }> {
  requirePath(target, "mount point");
  // LuCI enforces this by not rendering the button; the API is reachable
  // without the UI, so the same list has to be enforced here.
  if (SYSTEM_MOUNTPOINTS.includes(target)) {
    throw new AppError(`Refusing to unmount ${target}: the running system depends on it`);
  }
  const res = await exec(cfg, `/bin/umount ${shq(target)} 2>&1`, { timeoutMs: 20000 });
  if (res.code !== 0) {
    throw new DeviceCommandError(
      (res.stdout || res.stderr).trim() || `Failed to unmount ${target}`,
    );
  }
  return { ok: true };
}

/**
 * LuCI's "Generate Config" button runs `block detect >/etc/config/fstab`,
 * which replaces the whole file. Redirecting straight into the config would
 * leave it empty if `block detect` produced nothing, so the output is staged
 * and only copied over when it is non-empty.
 *
 * The staged file is fed back with a redirection rather than `cp`: busybox `cp`
 * re-applies `source_mode & ~umask` to an existing destination, which would
 * silently relax a 0600 fstab to 0644. Truncating in place keeps mode, owner
 * and inode, exactly like LuCI's own redirect.
 */
export async function detectFstab(cfg: DeviceConfig): Promise<{ ok: true }> {
  const res = await exec(
    cfg,
    chain(
      "/sbin/block detect > /tmp/.fstab-detect 2>/dev/null",
      "[ -s /tmp/.fstab-detect ]",
      "cat /tmp/.fstab-detect > /etc/config/fstab",
    ),
    { timeoutMs: 30000 },
  );
  if (res.code !== 0) {
    throw new DeviceCommandError(
      (res.stderr || res.stdout).trim() || "block detect produced no configuration",
    );
  }
  return { ok: true };
}
