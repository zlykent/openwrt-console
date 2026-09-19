import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";

/**
 * luci-app-wireguard — "WireGuard Status".
 *
 * The official view parses `wg show all dump` and renders one block per
 * interface plus one block per peer, polling every 5 seconds. The dump is
 * tab-separated: the first line of an interface carries its own keys, every
 * following line with the same interface name is a peer.
 */

export interface WireguardPeer {
  publicKey: string;
  /** "(none)" on the device means "no endpoint yet". */
  endpoint: string;
  allowedIps: string[];
  /** Unix seconds; 0 = never. */
  latestHandshake: number;
  transferRx: number;
  transferTx: number;
  /** "off" when keepalive is disabled. */
  persistentKeepalive: string;
}

export interface WireguardInterface {
  name: string;
  /** "(none)" when the interface has no public key configured. */
  publicKey: string;
  listenPort: number;
  /** "off" when no fwmark is set. */
  fwmark: string;
  peers: WireguardPeer[];
}

export interface WireguardStatus {
  installed: boolean;
  interfaces: WireguardInterface[];
}

/** Peer is considered up when the last handshake is younger than this. */
export const WG_CONNECTED_WINDOW = 140;

const num = (v: string | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Parse `wg show all dump` exactly like the official Lua view. Pure. */
export function parseWgDump(stdout: string): WireguardInterface[] {
  const byName = new Map<string, WireguardInterface>();
  let last = "";

  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;
    const cols = line.split("\t");
    const name = cols[0] ?? "";
    if (name !== last) {
      last = name;
      byName.set(name, {
        name,
        publicKey: cols[2] ?? "(none)",
        listenPort: num(cols[3]),
        fwmark: cols[4] ?? "off",
        peers: [],
      });
      continue;
    }
    const iface = byName.get(name);
    if (!iface) continue;
    const endpoint = cols[3] ?? "(none)";
    iface.peers.push({
      publicKey: cols[1] ?? "",
      endpoint,
      allowedIps:
        endpoint === "(none)"
          ? []
          : (cols[4] ?? "")
              .split(",")
              .map((ip) => ip.trim())
              .filter(Boolean),
      latestHandshake: num(cols[5]),
      transferRx: num(cols[6]),
      transferTx: num(cols[7]),
      persistentKeepalive: cols[8] ?? "off",
    });
  }
  return [...byName.values()];
}

export async function getWireguardStatus(cfg: DeviceConfig): Promise<WireguardStatus> {
  const res = await exec(
    cfg,
    'if command -v wg >/dev/null 2>&1; then echo "WG_INSTALLED"; wg show all dump 2>/dev/null; fi',
  ).catch(() => null);
  const stdout = res?.stdout ?? "";
  return {
    installed: stdout.includes("WG_INSTALLED"),
    interfaces: parseWgDump(stdout.replace("WG_INSTALLED", "")),
  };
}
