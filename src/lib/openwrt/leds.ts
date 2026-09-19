import type { DeviceConfig } from "@/lib/config";
import { exec, SshError } from "@/lib/ssh/client";
import {
  chain,
  firstOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciSet,
  uciShow,
} from "./uci";

/** A configured LED (uci `system` led section). */
export type LedSection = {
  ref: string;
  name: string;
  sysfs: string;
  trigger: string;
  /** netdev trigger: the network device. */
  dev: string;
  /** netdev trigger: space-separated modes (link tx rx). */
  mode: string;
  /** timer trigger: on/off delays in ms. */
  delayon: string;
  delayoff: string;
  /** Default (boot) state. */
  default: boolean;
};

export type LedConfigState = {
  supported: boolean;
  /** LED names exposed by the kernel under /sys/class/leds. */
  sysfsNames: string[];
  /** Union of triggers the device advertises, plus common fallbacks. */
  triggers: string[];
  sections: LedSection[];
};

export type LedInput = Omit<LedSection, "ref">;

/** Triggers offered even when the device list cannot be read. */
const BASE_TRIGGERS = [
  "none",
  "default-on",
  "heartbeat",
  "netdev",
  "timer",
  "disk",
  "usbdev",
  "wlan",
  "switch0",
];

function parseTriggers(raw: string): string[] {
  const set = new Set<string>();
  // `/sys/class/leds/*/trigger` lists triggers, the active one in [brackets].
  for (const tok of raw.split(/\s+/)) {
    const name = tok.replace(/[[\]]/g, "");
    if (name) set.add(name);
  }
  for (const t of BASE_TRIGGERS) set.add(t);
  return [...set].sort();
}

export async function getLedConfig(cfg: DeviceConfig): Promise<LedConfigState> {
  const [uciRes, lsRes, trigRes] = await Promise.all([
    exec(cfg, uciShow("system")),
    exec(cfg, "ls /sys/class/leds/ 2>/dev/null").catch(() => null),
    exec(cfg, "cat /sys/class/leds/*/trigger 2>/dev/null").catch(() => null),
  ]);
  const secs = parseUciShow(uciRes.stdout).filter((s) => s.type === "led");
  const sections: LedSection[] = secs.map((s) => ({
    ref: s.name,
    name: firstOption(s, "name"),
    sysfs: firstOption(s, "sysfs"),
    trigger: firstOption(s, "trigger"),
    dev: firstOption(s, "dev"),
    mode: firstOption(s, "mode"),
    delayon: firstOption(s, "delayon"),
    delayoff: firstOption(s, "delayoff"),
    default: firstOption(s, "default") === "1",
  }));
  const sysfsNames = lsRes ? lsRes.stdout.split(/\s+/).filter(Boolean) : [];
  const triggers = parseTriggers(trigRes?.stdout ?? "");
  const supported = sysfsNames.length > 0 || sections.length > 0;
  return { supported, sysfsNames, triggers, sections };
}

/** Commit `system` and re-apply LED configuration (tolerant of missing tools). */
async function commitAndApply(cfg: DeviceConfig, cmds: string[], action: string): Promise<void> {
  const r = await exec(cfg, chain(...cmds, uciCommit("system")), { timeoutMs: 20000 });
  if (r.code !== 0) {
    throw new SshError("exec", `Failed to ${action}`, (r.stderr || r.stdout).trim());
  }
  // TODO(verify): apply path differs across builds; try both, never fail the save.
  await exec(
    cfg,
    "/etc/init.d/led restart 2>/dev/null || /sbin/led.sh 2>/dev/null || true",
    { timeoutMs: 20000 },
  );
}

async function addSection(cfg: DeviceConfig): Promise<string> {
  const r = await exec(cfg, "uci add system led");
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to add led", (r.stderr || r.stdout).trim());
  }
  return r.stdout.trim();
}

export async function saveLed(
  cfg: DeviceConfig,
  ref: string | undefined,
  input: LedInput,
): Promise<{ ok: true }> {
  const target = ref ?? (await addSection(cfg));
  const cmds: string[] = [];
  const setOrDelete = (option: string, value: string) =>
    cmds.push(value ? uciSet("system", target, option, value) : uciDelete("system", target, option));
  setOrDelete("name", input.name);
  setOrDelete("sysfs", input.sysfs);
  setOrDelete("trigger", input.trigger);
  setOrDelete("dev", input.dev);
  setOrDelete("mode", input.mode.trim());
  setOrDelete("delayon", input.delayon);
  setOrDelete("delayoff", input.delayoff);
  cmds.push(uciSet("system", target, "default", input.default ? "1" : "0"));
  await commitAndApply(cfg, cmds, "save LED");
  return { ok: true };
}

export async function deleteLed(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  await commitAndApply(cfg, [uciDelete("system", ref)], "delete LED");
  return { ok: true };
}
