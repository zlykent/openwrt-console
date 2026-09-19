import type { DeviceConfig } from "@/lib/config";
import { exec, execJson, SshError } from "@/lib/ssh/client";
import { ubusCall, assertToken } from "@/lib/ssh/quote";
import { parseProcNetDev } from "./parse";
import type { DeviceStatus, InterfaceCounters, NetworkInterface } from "./types";

type RawAddress = { address?: string; mask?: number };
type RawRoute = { target?: string; mask?: number; nexthop?: string };

type RawIface = Record<string, unknown> & {
  interface?: string;
  up?: boolean;
  available?: boolean;
  autostart?: boolean;
  dynamic?: boolean;
  proto?: string;
  device?: string;
  l3_device?: string;
  uptime?: number;
};

type RawDevice = Record<string, unknown> & {
  up?: boolean;
  carrier?: boolean;
  macaddr?: string;
  mtu?: number;
  speed?: string;
  type?: string;
  statistics?: Record<string, number>;
};

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeAddresses(v: unknown) {
  return asArray<RawAddress>(v)
    .filter((a) => a && typeof a.address === "string")
    .map((a) => ({ address: a.address as string, mask: a.mask ?? 0 }));
}

export async function getDeviceStatus(cfg: DeviceConfig, name: string): Promise<DeviceStatus | null> {
  assertToken(name, "device");
  const raw = await execJson<RawDevice>(cfg, ubusCall("network.device", "status", { name }));
  if (!raw) return null;
  const st = raw.statistics ?? {};
  const statistics: InterfaceCounters | undefined = raw.statistics
    ? {
        rxBytes: st.rx_bytes ?? 0,
        txBytes: st.tx_bytes ?? 0,
        rxPackets: st.rx_packets ?? 0,
        txPackets: st.tx_packets ?? 0,
      }
    : undefined;
  return {
    name,
    up: Boolean(raw.up),
    carrier: Boolean(raw.carrier),
    mac: raw.macaddr,
    mtu: raw.mtu,
    speed: raw.speed,
    type: raw.type,
    statistics,
  };
}

export async function getInterfaces(cfg: DeviceConfig): Promise<NetworkInterface[]> {
  const [dump, netdev] = await Promise.all([
    execJson<{ interface?: RawIface[] }>(cfg, ubusCall("network.interface", "dump")),
    exec(cfg, "cat /proc/net/dev").catch(() => null),
  ]);
  const counters = netdev ? parseProcNetDev(netdev.stdout) : {};
  const list = dump?.interface ?? [];

  const deviceNames = Array.from(
    new Set(list.map((i) => i.l3_device ?? i.device).filter((d): d is string => Boolean(d))),
  );
  const statuses = await Promise.all(
    deviceNames.map((d) => getDeviceStatus(cfg, d).catch(() => null)),
  );
  const linkByDevice = new Map<string, DeviceStatus>();
  for (const s of statuses) if (s) linkByDevice.set(s.name, s);

  return list
    .filter((i) => typeof i.interface === "string")
    .map((raw) => {
      const dev = (raw.l3_device ?? raw.device ?? "") as string;
      const link = linkByDevice.get(dev);
      const statistics = counters[dev] ?? link?.statistics;
      const prefixAssign = asArray<{ address?: string; mask?: number }>(raw["ipv6-prefix-assignment"]);
      const ipv6Prefix = prefixAssign.length
        ? prefixAssign.map((p) => ({ address: p.address ?? "", mask: p.mask ?? 0 }))
        : normalizeAddresses(raw["ipv6-prefix"]);
      return {
        name: raw.interface as string,
        up: Boolean(raw.up),
        available: Boolean(raw.available),
        autostart: Boolean(raw.autostart),
        dynamic: Boolean(raw.dynamic),
        proto: String(raw.proto ?? ""),
        device: raw.device,
        l3Device: raw.l3_device,
        uptime: Number(raw.uptime ?? 0),
        ipv4: normalizeAddresses(raw["ipv4-address"]),
        ipv6: normalizeAddresses(raw["ipv6-address"]),
        ipv6Prefix,
        routes: asArray<RawRoute>(raw.route).map((r) => ({
          target: r.target ?? "",
          mask: r.mask ?? 0,
          nexthop: r.nexthop,
        })),
        dns: asArray<string>(raw["dns-server"]),
        errors: asArray<{ code?: string }>(raw.errors)
          .map((e) => e?.code)
          .filter((c): c is string => typeof c === "string" && c.length > 0),
        statistics,
        link,
      } satisfies NetworkInterface;
    });
}

export type InterfaceAction = "up" | "down" | "renew";

export async function interfaceAction(
  cfg: DeviceConfig,
  name: string,
  action: InterfaceAction,
): Promise<void> {
  assertToken(name, "interface");
  const object = `network.interface.${name}`;
  const r = await exec(cfg, ubusCall(object, action), { timeoutMs: 20000 });
  if (r.code !== 0) {
    throw new SshError("exec", `Failed to ${action} interface ${name}`, (r.stderr || r.stdout).trim());
  }
}

export async function restartNetwork(cfg: DeviceConfig): Promise<void> {
  const r = await exec(cfg, ubusCall("network", "restart"), { timeoutMs: 30000 });
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to restart networking", (r.stderr || r.stdout).trim());
  }
}
