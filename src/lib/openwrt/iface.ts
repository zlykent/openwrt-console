import type { DeviceConfig } from "@/lib/config";
import { exec, execJson } from "@/lib/ssh/client";
import { ubusCall } from "@/lib/ssh/quote";
import {
  chain,
  firstOption,
  listOption,
  parseUciShow,
  uciCommit,
  uciCreateSection,
  uciDelete,
  uciDeleteIfExists,
  uciSet,
  uciSetOrClear,
  uciShow,
  type UciSection,
} from "./uci";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * Editable view of a `network` interface section. Mirrors the option set the
 * official LuCI interface editor exposes for the common protocols (static,
 * dhcp, dhcpv6, pppoe, pptp, l2tp, wireguard). Empty string / empty list means
 * "option absent", which `saveInterface` translates into `uci delete`.
 */
export type InterfaceConfig = {
  name: string;
  proto: string;
  /** Autostart on boot; absent option means enabled, so only opt-out persists. */
  auto: boolean;
  device: string;
  ipaddr: string[];
  netmask: string;
  gateway: string;
  dns: string[];
  peerdns: boolean;
  metric: string;
  mtu: string;
  macaddr: string;
  username: string;
  password: string;
  server: string;
  privateKey: string;
  addresses: string[];
  /** Firewall zone this interface is assigned to; "" = unassigned. */
  zone: string;
};

/**
 * A firewall zone as the interface editor sees it.
 *
 * `ref` is the uci section reference — `@zone[0]` for the anonymous zones a
 * stock config ships with — and is the only thing that can address the section
 * for writes. `name` is the zone's `option name` (`lan`, `wan`): that is what
 * LuCI displays and what an interface's zone assignment refers to. Conflating
 * the two either renders `@zone[0]` in the UI or, on a write, creates a new
 * named section while the anonymous one is left untouched.
 */
export type ZoneAssignment = { ref: string; name: string; networks: string[] };

export type IfaceConfigState = {
  interfaces: InterfaceConfig[];
  zones: ZoneAssignment[];
  devices: string[];
};

const SECTION_NAME = /^[A-Za-z0-9_]+$/;

/** uci lists are ordered, so `a b` and `b a` are different values. */
function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function toIface(sec: UciSection, zones: ZoneAssignment[]): InterfaceConfig {
  const name = sec.name;
  return {
    name,
    proto: firstOption(sec, "proto", "static"),
    auto: firstOption(sec, "auto", "1") !== "0",
    device: firstOption(sec, "device") || firstOption(sec, "ifname"),
    ipaddr: listOption(sec, "ipaddr"),
    netmask: firstOption(sec, "netmask"),
    gateway: firstOption(sec, "gateway"),
    dns: listOption(sec, "dns"),
    peerdns: firstOption(sec, "peerdns", "1") !== "0",
    metric: firstOption(sec, "metric"),
    mtu: firstOption(sec, "mtu"),
    macaddr: firstOption(sec, "macaddr"),
    username: firstOption(sec, "username"),
    password: firstOption(sec, "password"),
    server: firstOption(sec, "server"),
    privateKey: firstOption(sec, "private_key"),
    addresses: listOption(sec, "addresses"),
    zone: zones.find((z) => z.networks.includes(name))?.name ?? "",
  };
}

function parseDevices(dump: unknown): string[] {
  const d = (dump as { device?: unknown } | null)?.device ?? dump;
  if (Array.isArray(d)) {
    return d.map((x) => (x as { name?: string }).name ?? "").filter(Boolean);
  }
  if (d && typeof d === "object") return Object.keys(d as Record<string, unknown>);
  return [];
}

/**
 * Kernel network devices from `ls /sys/class/net`, `lo` excluded — the list
 * LuCI's `sys.net:devices()` offers in interface pickers (arpbind and friends).
 * Unlike {@link parseDevices} this needs no netifd, so devices that exist
 * without a UCI interface still show up.
 */
export function parseNetDevices(stdout: string): string[] {
  return stdout
    .split(/\s+/)
    .map((d) => d.trim())
    .filter((d) => d !== "" && d !== "lo");
}

export async function getNetDevices(cfg: DeviceConfig): Promise<string[]> {
  const res = await exec(cfg, "ls /sys/class/net 2>/dev/null").catch(() => null);
  return res ? parseNetDevices(res.stdout) : [];
}

export async function getIfaceConfigState(cfg: DeviceConfig): Promise<IfaceConfigState> {
  const [net, fw, dump] = await Promise.all([
    exec(cfg, uciShow("network")),
    exec(cfg, uciShow("firewall")).catch(() => null),
    execJson<Record<string, unknown>>(cfg, ubusCall("network.device", "dump")).catch(() => null),
  ]);
  const zones: ZoneAssignment[] = (fw ? parseUciShow(fw.stdout) : [])
    .filter((s) => s.type === "zone")
    .map((s) => ({
      ref: s.name,
      name: firstOption(s, "name", s.name),
      networks: listOption(s, "network"),
    }));
  const interfaces = parseUciShow(net.stdout)
    .filter((s) => s.type === "interface" && !s.anonymous)
    .map((s) => toIface(s, zones));
  return { interfaces, zones, devices: parseDevices(dump).sort() };
}

/**
 * Commands aligning every zone's `network` list with the desired assignment.
 * Zones are matched by name but written through their uci reference.
 */
export function zoneCommands(zones: ZoneAssignment[], iface: string, zone: string): string[] {
  const cmds: string[] = [];
  for (const z of zones) {
    const has = z.networks.includes(iface);
    const want = z.name === zone;
    if (want && !has) cmds.push(uciSet("firewall", z.ref, "network", [...z.networks, iface]));
    if (!want && has) {
      cmds.push(uciSet("firewall", z.ref, "network", z.networks.filter((n) => n !== iface)));
    }
  }
  return cmds;
}

/**
 * Build the uci commands that persist an interface edit (commits included, no
 * exec). Kept pure so the command shape is unit-tested, because the obvious
 * version of it is broken: `auto` and `peerdns` mean "enabled" when absent, so
 * saving an untouched interface issues `uci delete network.<iface>.auto`, which
 * exits non-zero on a stock config and aborts the whole `&&` chain before the
 * commit. Every clearing delete therefore has to be guarded.
 *
 * `current` is the section as the device holds it now. Passing it lets the list
 * options be skipped when they did not change: a list write is a `delete`
 * followed by one `add_list` per value, which re-appends the option at the end
 * of the section, so writing one that was never edited needlessly reshuffles
 * the config file the operator may well be tracking in version control.
 */
export function interfaceCommands(
  input: InterfaceConfig,
  zones: ZoneAssignment[],
  current?: InterfaceConfig,
): string[] {
  const cmds: string[] = [];
  const setOrClear = (option: string, value: string) =>
    cmds.push(uciSetOrClear("network", input.name, option, value));
  const setList = (option: string, next: string[], prev: string[] | undefined) => {
    const values = next.filter(Boolean);
    if (prev && sameList(values, prev)) return;
    cmds.push(uciSet("network", input.name, option, values));
  };

  setOrClear("proto", input.proto);
  cmds.push(
    input.auto
      ? uciDeleteIfExists("network", input.name, "auto")
      : uciSet("network", input.name, "auto", "0"),
  );
  setOrClear("device", input.device);
  setList("ipaddr", input.ipaddr, current?.ipaddr);
  setOrClear("netmask", input.netmask);
  setOrClear("gateway", input.gateway);
  setList("dns", input.dns, current?.dns);
  cmds.push(
    input.peerdns
      ? uciDeleteIfExists("network", input.name, "peerdns")
      : uciSet("network", input.name, "peerdns", "0"),
  );
  setOrClear("metric", input.metric);
  setOrClear("mtu", input.mtu);
  setOrClear("macaddr", input.macaddr);
  setOrClear("username", input.username);
  setOrClear("password", input.password);
  setOrClear("server", input.server);
  setOrClear("private_key", input.privateKey);
  setList("addresses", input.addresses, current?.addresses);
  cmds.push(...zoneCommands(zones, input.name, input.zone));
  cmds.push(uciCommit("network"), uciCommit("firewall"));
  return cmds;
}

/**
 * Drop the staged delta of both configs a write touches. A chain that failed
 * halfway leaves its earlier commands in `/tmp/.uci`, where they resurface on
 * the next read as entries the operator never asked for.
 */
const REVERT_DELTA = "uci revert network 2>/dev/null; uci revert firewall 2>/dev/null; true";

async function run(cfg: DeviceConfig, cmds: string[], action: string): Promise<void> {
  const r = await exec(cfg, chain(...cmds));
  if (r.code !== 0) {
    await exec(cfg, REVERT_DELTA).catch(() => null);
    throw new DeviceCommandError((r.stderr || r.stdout).trim() || `Failed to ${action}`);
  }
}

export async function saveInterface(cfg: DeviceConfig, input: InterfaceConfig): Promise<{ ok: true }> {
  if (!SECTION_NAME.test(input.name)) throw new AppError(`Invalid interface name: ${input.name}`);
  const state = await getIfaceConfigState(cfg);
  // The device rejects a `set` on a section that does not exist, so this cannot
  // silently create one — but its answer is a bare "uci: Invalid argument",
  // which tells the operator nothing about what to fix.
  const current = state.interfaces.find((i) => i.name === input.name);
  if (!current) {
    throw new AppError(`Interface not found: ${input.name}`, 404);
  }
  await run(cfg, interfaceCommands(input, state.zones, current), `save interface ${input.name}`);
  return { ok: true };
}

export async function createInterface(
  cfg: DeviceConfig,
  input: { name: string; proto: string; zone: string },
): Promise<{ ok: true }> {
  if (!SECTION_NAME.test(input.name)) throw new AppError(`Invalid interface name: ${input.name}`);
  const state = await getIfaceConfigState(cfg);
  if (state.interfaces.some((i) => i.name === input.name)) {
    throw new AppError(`Interface already exists: ${input.name}`);
  }

  const cmds = [uciCreateSection("network", input.name, "interface"), uciSet("network", input.name, "proto", input.proto)];
  cmds.push(...zoneCommands(state.zones, input.name, input.zone));
  cmds.push(uciCommit("network"), uciCommit("firewall"));
  await run(cfg, cmds, `create interface ${input.name}`);
  return { ok: true };
}

export async function deleteInterface(cfg: DeviceConfig, name: string): Promise<{ ok: true }> {
  if (name === "loopback") throw new AppError("The loopback interface cannot be deleted");
  const state = await getIfaceConfigState(cfg);
  if (!state.interfaces.some((i) => i.name === name)) {
    throw new AppError(`Interface not found: ${name}`);
  }

  const cmds = [uciDelete("network", name)];
  cmds.push(...zoneCommands(state.zones, name, ""));
  cmds.push(uciCommit("network"), uciCommit("firewall"));
  await run(cfg, cmds, `delete interface ${name}`);
  return { ok: true };
}
