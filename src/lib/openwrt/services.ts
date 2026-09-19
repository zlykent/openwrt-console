import type { DeviceConfig } from "@/lib/config";
import { exec, SshError } from "@/lib/ssh/client";
import { parseSections } from "./parse";
import type { ServiceInfo, ServiceInstance } from "./types";

/**
 * Available services come from `/etc/init.d`; boot-enabled state from the
 * `/etc/rc.d` start links; runtime state from `ubus call service list`. All
 * three are captured in one round-trip to keep the page snappy.
 */
const SERVICES_CMD = [
  "printf '@@INIT\\n'; ls -1 /etc/init.d 2>/dev/null",
  "printf '@@RC\\n'; ls -1 /etc/rc.d 2>/dev/null",
  "printf '@@UBUS\\n'; ubus call service list 2>/dev/null",
  "printf '@@END\\n'",
].join("; ");

type RawInstance = {
  running?: boolean;
  pid?: number;
  command?: string[];
};
type RawService = { instances?: Record<string, RawInstance> };

/** Strip the runlevel prefix from an rc.d link name, e.g. `S19dnsmasq`. */
function rcName(entry: string): { name: string; start: boolean } | null {
  const m = entry.match(/^([SK])(\d+)(.+)$/);
  if (!m) return null;
  return { name: m[3], start: m[1] === "S" };
}

export async function getServices(cfg: DeviceConfig): Promise<ServiceInfo[]> {
  const res = await exec(cfg, SERVICES_CMD, { timeoutMs: 15000 });
  const s = parseSections(res.stdout);

  const initNames = (s.INIT ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.includes(".")); // skip stray files, keep script names

  const enabled = new Set<string>();
  for (const line of (s.RC ?? "").split("\n")) {
    const rc = rcName(line.trim());
    if (rc && rc.start) enabled.add(rc.name);
  }

  let ubusServices: Record<string, RawService> = {};
  try {
    const parsed = JSON.parse((s.UBUS ?? "").trim());
    if (parsed && typeof parsed === "object") ubusServices = parsed as Record<string, RawService>;
  } catch {
    /* service list unavailable — fall back to init.d listing only */
  }

  const seen = new Set<string>();
  const out: ServiceInfo[] = [];
  const names = new Set<string>([...initNames, ...Object.keys(ubusServices)]);
  for (const name of names) {
    if (seen.has(name) || !name) continue;
    seen.add(name);
    const raw = ubusServices[name];
    const instances: ServiceInstance[] = Object.entries(raw?.instances ?? {}).map(
      ([iname, inst]) => ({
        name: iname,
        running: Boolean(inst.running),
        pid: typeof inst.pid === "number" ? inst.pid : undefined,
        command: Array.isArray(inst.command) ? inst.command : undefined,
      }),
    );
    const running = instances.some((i) => i.running);
    // Only expose services that actually have an init script for control.
    const manageable = initNames.includes(name);
    if (!manageable && instances.length === 0) continue;
    out.push({ name, running, enabled: enabled.has(name), instances });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type ServiceAction = "start" | "stop" | "restart" | "reload" | "enable" | "disable";
const SERVICE_ACTIONS: ServiceAction[] = ["start", "stop", "restart", "reload", "enable", "disable"];

function assertServiceName(name: string): void {
  if (!/^[A-Za-z0-9._+-]+$/.test(name)) {
    throw new SshError("exec", `Invalid service name: ${name}`);
  }
}

export async function serviceAction(
  cfg: DeviceConfig,
  name: string,
  action: ServiceAction,
): Promise<void> {
  assertServiceName(name);
  if (!SERVICE_ACTIONS.includes(action)) {
    throw new SshError("exec", `Invalid service action: ${action}`);
  }
  const r = await exec(cfg, `/etc/init.d/${name} ${action}`, { timeoutMs: 30000 });
  if (r.code !== 0) {
    throw new SshError("exec", `Failed to ${action} ${name}`, (r.stderr || r.stdout).trim());
  }
}
