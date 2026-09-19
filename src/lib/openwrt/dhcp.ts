import type { DeviceConfig } from "@/lib/config";
import { exec, execJson } from "@/lib/ssh/client";
import { ubusCall } from "@/lib/ssh/quote";
import type { Lease, Neighbor } from "./types";

type RawLease = {
  expiry?: number;
  ipaddr?: string;
  macaddr?: string;
  hostname?: string;
  duid?: string;
};

/**
 * DHCP leases come from dnsmasq/odhcpd via the `dhcp` ubus object. Devices
 * that route rather than serve DHCP (like the target box) simply return none,
 * so callers also expose ARP neighbours below as the "who's online" fallback.
 */
export async function getLeases(cfg: DeviceConfig): Promise<Lease[]> {
  const raw = await execJson<{ lease?: RawLease[] }>(cfg, ubusCall("dhcp", "ipv4leases")).catch(
    () => null,
  );
  const list = Array.isArray(raw?.lease) ? (raw!.lease as RawLease[]) : [];
  return list
    .filter((l) => typeof l.ipaddr === "string" && typeof l.macaddr === "string")
    .map((l) => ({
      ip: l.ipaddr as string,
      mac: l.macaddr as string,
      hostname: l.hostname && l.hostname !== "*" ? l.hostname : undefined,
      expires: Number(l.expiry ?? 0),
    }));
}

/**
 * Parse `/proc/net/arp` into neighbour entries. This works on busybox systems
 * where `ip -j neigh` (JSON) is unavailable.
 *
 * Header: IP address  HW type  Flags  HW address  Mask  Device
 */
export function parseProcArp(text: string): Neighbor[] {
  const out: Neighbor[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || /^ip address/i.test(line)) continue;
    const f = line.split(/\s+/);
    // ip hwtype flags hwaddr mask device
    if (f.length < 6) continue;
    const [ip, , flags, mac, , dev] = f;
    if (!ip || !mac) continue;
    if (mac === "00:00:00:00:00:00") continue; // incomplete entry
    const state = Number(flags) & 0x2 ? "reachable" : "stale";
    out.push({ ip, mac, state, dev });
  }
  return out;
}

export async function getNeighbors(cfg: DeviceConfig): Promise<Neighbor[]> {
  const res = await exec(cfg, "cat /proc/net/arp 2>/dev/null").catch(() => null);
  if (!res) return [];
  return parseProcArp(res.stdout);
}

// Editing `/etc/config/dhcp` is schema-driven: see `./dhcp-schema` for the
// option list (mirroring the device's `admin_network/dhcp.lua`) and the API
// route for the read/write plumbing shared with the luci-app pages.
