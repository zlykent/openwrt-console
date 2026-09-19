import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import { assertToken, shq } from "@/lib/ssh/quote";
import { MAC_PATTERN, WOL_ETHERWAKE, WOL_WOL } from "./wol-shared";
import { AppError } from "@/lib/api/errors";

/**
 * luci-app-wol — "Wake on LAN".
 *
 * The official page is a `SimpleForm` (not a persisted UCI config): submitting
 * it runs the chosen WoL utility immediately and prints its output back. This
 * module mirrors that behaviour, including the binary/interface availability
 * rules and the MAC hint sources (`sys.net.mac_hints`).
 */

// Re-exported so server callers keep one import site; browser code imports
// `./wol-shared` directly to avoid bundling the ssh2 client.
export { MAC_PATTERN, WOL_ETHERWAKE, WOL_WOL };

export interface WolHost {
  mac: string;
  name: string;
}

export interface WolState {
  hasEtherwake: boolean;
  hasWol: boolean;
  /** Network devices offered in the interface list (`lo` excluded). */
  devices: string[];
  hosts: WolHost[];
}

export interface WolRequest {
  binary?: string;
  iface?: string;
  mac: string;
}

export interface WolResult {
  /** Exact command line that was executed on the device. */
  command: string;
  output: string[];
}

const PROBE = [
  `for b in ${WOL_ETHERWAKE} ${WOL_WOL}; do [ -x "$b" ] && echo "BIN $b"; done`,
  "echo '--DEV--'; ls /sys/class/net 2>/dev/null",
  "echo '--LEASES--'; cat /tmp/dhcp.leases 2>/dev/null",
  "echo '--NEIGH--'; ip neigh show 2>/dev/null",
  "echo '--ETHERS--'; cat /etc/ethers 2>/dev/null",
].join("; ");

/**
 * Parse the probe output into the WoL form state. Pure so it can be unit
 * tested without a device.
 */
export function parseWolProbe(stdout: string): WolState {
  const state: WolState = { hasEtherwake: false, hasWol: false, devices: [], hosts: [] };
  const seen = new Map<string, WolHost>();
  let part = "";

  const addHost = (mac: string | undefined, name: string | undefined) => {
    if (!mac || !MAC_PATTERN.test(mac) || !mac.includes(":")) return;
    const key = mac.toLowerCase();
    if (seen.has(key)) return;
    const hint = { mac, name: name && name !== "*" ? name : mac };
    seen.set(key, hint);
    state.hosts.push(hint);
  };

  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("--") && line.endsWith("--")) {
      part = line.slice(2, -2);
      continue;
    }
    if (part === "") {
      if (line.startsWith("BIN ")) {
        const bin = line.slice(4).trim();
        if (bin === WOL_ETHERWAKE) state.hasEtherwake = true;
        if (bin === WOL_WOL) state.hasWol = true;
      }
      continue;
    }
    const cols = line.split(/\s+/);
    if (part === "DEV") {
      if (cols[0] && cols[0] !== "lo") state.devices.push(cols[0]);
    } else if (part === "LEASES") {
      // <expiry> <mac> <ip> <hostname> <clientid>
      addHost(cols[1], cols[3] || cols[2]);
    } else if (part === "NEIGH") {
      // <ip> dev <iface> lladdr <mac> <state...>
      const at = cols.indexOf("lladdr");
      addHost(at >= 0 ? cols[at + 1] : undefined, cols[0]);
    } else if (part === "ETHERS") {
      addHost(cols[0], cols[1]);
    }
  }
  return state;
}

/** Build the exact command the official form would run (null = invalid MAC). */
export function buildWolCommand(req: {
  binary?: string;
  iface?: string;
  mac: string;
  hasEtherwake?: boolean;
}): string | null {
  const mac = req.mac.trim();
  if (!MAC_PATTERN.test(mac)) return null;
  // Official fallback: etherwake when available, otherwise wol.
  const util =
    req.binary === WOL_WOL || (req.binary !== WOL_ETHERWAKE && !req.hasEtherwake)
      ? WOL_WOL
      : WOL_ETHERWAKE;
  if (util === WOL_WOL) return `${util} -v ${shq(mac)}`;
  // `binary`/`iface` are never interpolated raw: the utility is one of the two
  // constants above and the interface is token-validated then quoted.
  let iface = "";
  if (req.iface) {
    assertToken(req.iface, "interface");
    iface = ` -i ${shq(req.iface)}`;
  }
  return `${util} -D${iface} ${shq(mac)}`;
}

export async function getWol(cfg: DeviceConfig): Promise<WolState> {
  const res = await exec(cfg, PROBE).catch(() => null);
  return parseWolProbe(res?.stdout ?? "");
}

export async function wakeHost(cfg: DeviceConfig, req: WolRequest): Promise<WolResult> {
  const state = await getWol(cfg);
  const command = buildWolCommand({ ...req, hasEtherwake: state.hasEtherwake });
  if (!command) throw new AppError("Invalid MAC address");
  // Official form ignores the exit code and just echoes stdout+stderr.
  const res = await exec(cfg, `${command} 2>&1`);
  const output = res.stdout
    .split("\n")
    .map((l) => (l.length > 100 ? `${l.slice(0, 100)}...` : l))
    .filter((l) => l.trim().length > 0);
  return { command, output };
}
