import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import {
  boolOption,
  chain,
  firstOption,
  listOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciSet,
  uciShow,
} from "./uci";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * VLAN switching has two mutually-exclusive back-ends:
 *  - `swconfig` — legacy kernel switch drivers (`/sbin/swconfig`), configured
 *    via uci `network` `switch` + `switch_vlan` sections. Ports are numeric
 *    tokens where a trailing `t` means tagged (e.g. `1 2 6t`).
 *  - `dsa` — modern distributed switch architecture, configured via uci
 *    `network` `device` (bridge, `vlan_filtering 1`) + `bridge-vlan` sections.
 *    Ports are named tokens with a `:t`/`:u` suffix (e.g. `lan1:u wan:t`).
 * This mirrors LuCI's Network → Switch (swconfig) and Switch/VLAN (DSA) views.
 */
export type SwitchBackend = "swconfig" | "dsa" | "none";

export type SwitchVlan = {
  ref: string;
  backend: Exclude<SwitchBackend, "none">;
  /** Switch name (`switch0`) or bridge device (`br-lan`). */
  device: string;
  vlan: string;
  /** Raw port tokens; the tagged/untagged encoding is backend-specific. */
  ports: string[];
};

export type SwitchState = {
  backend: SwitchBackend;
  supported: boolean;
  /** Devices that can host VLANs (switch names or vlan-filtering bridges). */
  devices: string[];
  /** Candidate base port identifiers offered by the editor. */
  portNames: string[];
  vlans: SwitchVlan[];
};

export type SwitchVlanInput = {
  device: string;
  vlan: string;
  ports: string[];
};

/** Strip the tagged/untagged suffix so `6t`→`6`, `lan1:u`→`lan1`, `wan:t`→`wan`. */
function basePort(token: string): string {
  return token.replace(/:u\*?$|:t$|[*t]$/, "").trim();
}

/** Numeric-aware ordering so `2` sorts before `10`, and `lan1` before `lan2`. */
function sortPorts(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

async function reloadNetwork(cfg: DeviceConfig): Promise<void> {
  await exec(cfg, "/etc/init.d/network reload 2>/dev/null || true");
}

export async function getSwitchConfig(cfg: DeviceConfig): Promise<SwitchState> {
  const [netRes, probe] = await Promise.all([
    exec(cfg, uciShow("network")).catch(() => null),
    exec(cfg, "command -v swconfig >/dev/null 2>&1 && echo yes").catch(() => null),
  ]);
  const secs = parseUciShow(netRes?.stdout ?? "");
  const hasSwconfig = probe?.stdout.trim() === "yes";

  const switches = secs.filter((s) => s.type === "switch");
  const switchVlans = secs.filter((s) => s.type === "switch_vlan");
  const bridgeVlans = secs.filter((s) => s.type === "bridge-vlan");
  const bridges = secs.filter(
    (s) => s.type === "device" && firstOption(s, "type") === "bridge",
  );

  let backend: SwitchBackend = "none";
  if (switchVlans.length > 0 || (hasSwconfig && switches.length > 0)) {
    backend = "swconfig";
  } else if (
    bridgeVlans.length > 0 ||
    bridges.some((b) => boolOption(b, "vlan_filtering"))
  ) {
    backend = "dsa";
  }

  const vlans: SwitchVlan[] = [];
  const devices = new Set<string>();
  const ports = new Set<string>();

  if (backend === "swconfig") {
    for (const s of switches) {
      const name = firstOption(s, "name") || s.name;
      if (name) devices.add(name);
    }
    for (const s of switchVlans) {
      const device = firstOption(s, "device");
      const portList = firstOption(s, "ports").split(/\s+/).filter(Boolean);
      vlans.push({
        ref: s.name,
        backend: "swconfig",
        device,
        vlan: firstOption(s, "vlan"),
        ports: portList,
      });
      if (device) devices.add(device);
      for (const p of portList) ports.add(basePort(p));
    }
  } else if (backend === "dsa") {
    for (const b of bridges) {
      const name = firstOption(b, "name") || b.name;
      if (boolOption(b, "vlan_filtering") && name) devices.add(name);
      for (const p of listOption(b, "ports")) ports.add(basePort(p));
    }
    for (const s of bridgeVlans) {
      const device = firstOption(s, "device");
      const portList = listOption(s, "ports");
      vlans.push({
        ref: s.name,
        backend: "dsa",
        device,
        vlan: firstOption(s, "vlan"),
        ports: portList,
      });
      if (device) devices.add(device);
      for (const p of portList) ports.add(basePort(p));
    }
  }

  return {
    backend,
    supported: backend !== "none",
    devices: [...devices].sort(),
    portNames: [...ports].sort(sortPorts),
    vlans,
  };
}

/**
 * Create (no `ref`) or update (`ref` present) a VLAN section. The section type
 * is taken from the existing section, or from the detected backend when adding.
 * Ports are written as a single space-joined option for swconfig and as a uci
 * list for DSA bridge-vlan.
 */
export async function saveSwitchVlan(
  cfg: DeviceConfig,
  ref: string | undefined,
  input: SwitchVlanInput,
): Promise<{ ok: true }> {
  let target: string;
  let sectionType: "switch_vlan" | "bridge-vlan";
  // Set when this call created the section, so a later failure can roll it back
  // instead of leaving an anonymous orphan behind in the config.
  let created: string | undefined;

  if (ref) {
    target = ref;
    const res = await exec(cfg, uciShow("network")).catch(() => null);
    const sec = parseUciShow(res?.stdout ?? "").find((s) => s.name === ref);
    // Without this the type silently falls back to switch_vlan and the writes
    // below would materialise a section under a name that never existed.
    if (!sec) throw new AppError(`Unknown VLAN section: ${ref}`, 404);
    sectionType = sec.type === "bridge-vlan" ? "bridge-vlan" : "switch_vlan";
  } else {
    const state = await getSwitchConfig(cfg);
    if (state.backend === "none") {
      // A stray `switch_vlan` section would make the next read detect swconfig
      // and offer a VLAN editor for hardware that does not exist.
      throw new AppError("This device has no configurable switch");
    }
    sectionType = state.backend === "dsa" ? "bridge-vlan" : "switch_vlan";
    const r = await exec(cfg, `uci add network ${sectionType}`);
    if (r.code !== 0) {
      throw new DeviceCommandError(r.stderr.trim() || "Failed to add VLAN");
    }
    target = r.stdout.trim();
    created = target;
  }

  const cmds = [
    uciSet("network", target, "device", input.device),
    uciSet("network", target, "vlan", input.vlan),
    sectionType === "bridge-vlan"
      ? uciSet("network", target, "ports", input.ports)
      : uciSet("network", target, "ports", input.ports.join(" ")),
    uciCommit("network"),
  ];
  const res = await exec(cfg, chain(...cmds), { timeoutMs: 20000 });
  if (res.code !== 0) {
    // The section added above is still an uncommitted delta: drop it so a
    // failed save cannot leave an orphan VLAN in the device config.
    if (created) {
      await exec(cfg, `uci revert ${shq(`network.${created}`)} 2>/dev/null || true`);
    }
    throw new DeviceCommandError(res.stderr.trim() || "Failed to save VLAN");
  }
  await reloadNetwork(cfg);
  return { ok: true };
}

export async function deleteSwitchVlan(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  const res = await exec(cfg, chain(uciDelete("network", ref), uciCommit("network")));
  if (res.code !== 0) {
    throw new DeviceCommandError(res.stderr.trim() || "Failed to delete VLAN");
  }
  await reloadNetwork(cfg);
  return { ok: true };
}
