import type { DeviceConfig } from "@/lib/config";
import { exec, execJson } from "@/lib/ssh/client";
import { ubusCall } from "@/lib/ssh/quote";
import {
  boolOption,
  chain,
  firstOption,
  listOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciDeleteIfExists,
  uciSet,
  uciSetOrClear,
  uciShow,
} from "./uci";
import { AppError, DeviceCommandError } from "@/lib/api/errors";
import type { WirelessNetwork, WirelessRadio } from "./types";

/**
 * Wireless is optional: the target TV-box has no radio, and many devices ship
 * without the `network.wireless` ubus object. Everything here degrades to an
 * empty list rather than throwing, so the UI can show a "no wireless" state.
 */

/**
 * `wifi-device` sections are always named (`radio0`). `wifi-iface` sections are
 * anonymous in a stock config, so the reference the editor sends back is either
 * a name or an `@wifi-iface[n]` positional — nothing else can address a section,
 * and a dot in here would silently retarget an option instead.
 */
const RADIO_NAME = /^[A-Za-z0-9_]+$/;
const IFACE_REF = /^(?:[A-Za-z0-9_]+|@wifi-iface\[\d+\])$/;

type RawStation = Record<string, unknown> & {
  signal?: number;
  signal_avg?: number;
  connected_time?: number;
  rx?: { bytes?: number };
  tx?: { bytes?: number };
  rx_bytes?: number;
  tx_bytes?: number;
  rx_bitrate?: number | { rate?: number };
  tx_bitrate?: number | { rate?: number };
};

type RawInterface = Record<string, unknown> & {
  ifname?: string;
  section?: string;
  state?: string;
  bssid?: string;
  channel?: number;
  frequency?: number;
  signal?: number;
  tx_power?: number;
  config?: Record<string, unknown>;
  stations?: Record<string, RawStation>;
};

type RawRadio = Record<string, unknown> & {
  up?: boolean;
  disabled?: boolean;
  autostart?: boolean;
  config?: Record<string, unknown>;
  interfaces?: RawInterface[];
};

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

/**
 * Station transmit rate in Mbit/s. ubus reports kbit/s, either as a plain
 * number or as an `{ rate, mhz, mcs, … }` object; LuCI divides by 1000 before
 * labelling the result (`getBitRate()`, `format_wifirate()`), so passing the
 * raw value through made every station look like it was linked at 72000 Mb/s.
 */
function bitrateMbps(v: unknown): number | undefined {
  let kbps: number | undefined;
  if (typeof v === "number" && Number.isFinite(v)) {
    kbps = v;
  } else if (v && typeof v === "object") {
    const rate = (v as { rate?: number }).rate;
    if (typeof rate === "number" && Number.isFinite(rate)) kbps = rate;
  }
  return kbps === undefined ? undefined : Math.round(kbps / 100) / 10;
}

function firstNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    const n = num(v);
    if (n !== undefined) return n;
  }
  return undefined;
}

export async function getWireless(cfg: DeviceConfig): Promise<WirelessRadio[]> {
  const raw = await execJson<Record<string, RawRadio>>(
    cfg,
    ubusCall("network.wireless", "status"),
  ).catch(() => null);
  if (!raw || typeof raw !== "object") return [];

  const radios: WirelessRadio[] = [];
  for (const [name, radio] of Object.entries(raw)) {
    if (!radio || typeof radio !== "object") continue;
    const ifaces = Array.isArray(radio.interfaces) ? radio.interfaces : [];
    const networks: WirelessNetwork[] = ifaces.map((iface) => {
      const ic = iface.config ?? {};
      const stations = Object.entries(iface.stations ?? {}).map(([mac, st]) => ({
        mac,
        signal: num(st?.signal ?? st?.signal_avg),
        bitrate: bitrateMbps(st?.tx_bitrate),
        rxBytes: num(st?.rx?.bytes ?? st?.rx_bytes),
        txBytes: num(st?.tx?.bytes ?? st?.tx_bytes),
        connected: num(st?.connected_time),
      }));
      return {
        iface: iface.ifname ?? iface.section ?? "",
        section: iface.section,
        ssid: typeof ic.ssid === "string" ? ic.ssid : undefined,
        bssid: iface.bssid,
        channel: num(iface.channel),
        frequency: num(iface.frequency),
        mode: typeof ic.mode === "string" ? ic.mode : undefined,
        encryption: typeof ic.encryption === "string" ? ic.encryption : undefined,
        enabled: String(iface.state ?? "").toUpperCase() !== "DOWN" && !radio.disabled,
        signal: num(iface.signal),
        stations,
      } satisfies WirelessNetwork;
    });

    const rc = radio.config ?? {};
    const first = ifaces[0];
    radios.push({
      name,
      up: Boolean(radio.up),
      channel: firstNumber(first?.channel, rc.channel),
      frequency: firstNumber(first?.frequency, rc.frequency),
      txpower: firstNumber(first?.tx_power, rc.tx_power),
      networks,
    });
  }
  return radios;
}

/** Reload wireless configuration (no-op safe when there is no radio). */
export async function reloadWireless(cfg: DeviceConfig): Promise<void> {
  // `wifi reload` re-reads /etc/config/wireless; harmless when empty.
  await exec(cfg, "wifi reload 2>/dev/null || ubus call network.wireless reload 2>/dev/null || true", {
    timeoutMs: 20000,
  });
}

// ---- uci configuration editing ----

export type RadioConfig = {
  name: string;
  /** "auto" or a channel number as string. */
  channel: string;
  country: string;
  htmode: string;
  txpower: string;
  disabled: boolean;
};

export type WifiIfaceConfig = {
  /** Named section or anonymous ref such as `@wifi-iface[0]`. */
  ref: string;
  device: string;
  ssid: string;
  mode: string;
  encryption: string;
  key: string;
  /**
   * Bridge assignments (`option`/`list network`). The editor only exposes the
   * first one, so the rest are carried through untouched — writing back a
   * single value would silently unbridge an AP that feeds more than one
   * network.
   */
  networks: string[];
  hidden: boolean;
  disabled: boolean;
};

export type WirelessConfigState = {
  radios: RadioConfig[];
  ifaces: WifiIfaceConfig[];
};

export async function getWirelessConfig(cfg: DeviceConfig): Promise<WirelessConfigState> {
  const r = await exec(cfg, uciShow("wireless")).catch(() => null);
  if (!r || r.code !== 0) return { radios: [], ifaces: [] };
  const sections = parseUciShow(r.stdout);
  const radios: RadioConfig[] = sections
    .filter((s) => s.type === "wifi-device")
    .map((s) => ({
      name: s.name,
      channel: firstOption(s, "channel", "auto"),
      country: firstOption(s, "country"),
      htmode: firstOption(s, "htmode"),
      txpower: firstOption(s, "txpower"),
      disabled: boolOption(s, "disabled"),
    }));
  const ifaces: WifiIfaceConfig[] = sections
    .filter((s) => s.type === "wifi-iface")
    .map((s) => ({
      ref: s.name,
      device: firstOption(s, "device"),
      ssid: firstOption(s, "ssid"),
      mode: firstOption(s, "mode", "ap"),
      encryption: firstOption(s, "encryption", "none"),
      key: firstOption(s, "key"),
      networks: listOption(s, "network"),
      hidden: boolOption(s, "hidden"),
      disabled: boolOption(s, "disabled"),
    }));
  return { radios, ifaces };
}

/**
 * Drop the staged delta. A chain that failed halfway leaves its earlier
 * commands in `/tmp/.uci`, where they resurface on the next read as entries the
 * operator never asked for — and for `createWifiIface` that means an orphan
 * anonymous `wifi-iface` section that nothing in the UI can address.
 */
const REVERT_DELTA = "uci revert wireless 2>/dev/null; true";

async function run(cfg: DeviceConfig, cmds: string[], action: string): Promise<void> {
  const r = await exec(cfg, chain(...cmds));
  if (r.code !== 0) {
    await exec(cfg, REVERT_DELTA).catch(() => null);
    throw new DeviceCommandError((r.stderr || r.stdout).trim() || `Failed to ${action}`);
  }
}

/**
 * Commands persisting a radio edit. Pure and unit-tested for the same reason
 * `interfaceCommands` is: every option here is optional in uci, so a blank
 * field means "delete it", and an unguarded `uci delete` on an option that was
 * never set exits non-zero and aborts the `&&` chain before the commit. `country`
 * and `txpower` are absent on most stock radios, so the unguarded version made
 * every radio save fail.
 */
export function radioCommands(input: RadioConfig): string[] {
  return [
    uciSetOrClear("wireless", input.name, "channel", input.channel),
    uciSetOrClear("wireless", input.name, "country", input.country),
    uciSetOrClear("wireless", input.name, "htmode", input.htmode),
    uciSetOrClear("wireless", input.name, "txpower", input.txpower),
    // Absent means enabled, so the enabled state is stored by deleting it.
    input.disabled
      ? uciSet("wireless", input.name, "disabled", "1")
      : uciDeleteIfExists("wireless", input.name, "disabled"),
    uciCommit("wireless"),
  ];
}

/** Commands persisting a wireless network edit. See `radioCommands`. */
export function wifiIfaceCommands(input: WifiIfaceConfig): string[] {
  const needsKey = input.encryption !== "none" && input.encryption !== "";
  const networks = input.networks.filter(Boolean);
  return [
    uciSetOrClear("wireless", input.ref, "device", input.device),
    uciSetOrClear("wireless", input.ref, "ssid", input.ssid),
    uciSetOrClear("wireless", input.ref, "mode", input.mode),
    uciSetOrClear("wireless", input.ref, "encryption", input.encryption),
    // Dropping the key when the network is opened is not cosmetic: it would
    // otherwise stay in a world-readable config file after the UI stopped
    // showing the field.
    needsKey && input.key
      ? uciSet("wireless", input.ref, "key", input.key)
      : uciDeleteIfExists("wireless", input.ref, "key"),
    // A single bridge target is spelled the way a stock config spells it
    // (`option network`); only a real multi-bridge becomes a list.
    networks.length === 1
      ? uciSet("wireless", input.ref, "network", networks[0])
      : uciSet("wireless", input.ref, "network", networks),
    input.hidden
      ? uciSet("wireless", input.ref, "hidden", "1")
      : uciDeleteIfExists("wireless", input.ref, "hidden"),
    input.disabled
      ? uciSet("wireless", input.ref, "disabled", "1")
      : uciDeleteIfExists("wireless", input.ref, "disabled"),
    uciCommit("wireless"),
  ];
}

export async function saveRadio(cfg: DeviceConfig, input: RadioConfig): Promise<{ ok: true }> {
  if (!RADIO_NAME.test(input.name)) throw new AppError(`Invalid radio name: ${input.name}`);
  const state = await getWirelessConfig(cfg);
  // Without this the device answers "uci: Entry not found", which does not tell
  // the operator that the real problem is a device with no radio at all.
  if (!state.radios.some((r) => r.name === input.name)) {
    throw new AppError(`Radio not found: ${input.name}`, 404);
  }
  await run(cfg, radioCommands(input), `save radio ${input.name}`);
  return { ok: true };
}

export async function saveWifiIface(
  cfg: DeviceConfig,
  input: WifiIfaceConfig,
): Promise<{ ok: true }> {
  if (!IFACE_REF.test(input.ref)) {
    throw new AppError(`Invalid wireless network reference: ${input.ref}`);
  }
  const state = await getWirelessConfig(cfg);
  if (!state.ifaces.some((i) => i.ref === input.ref)) {
    throw new AppError(`Wireless network not found: ${input.ref}`, 404);
  }
  await run(cfg, wifiIfaceCommands(input), `save wireless network ${input.ref}`);
  return { ok: true };
}

export async function createWifiIface(
  cfg: DeviceConfig,
  input: { device: string; ssid: string; network: string },
): Promise<{ ok: true }> {
  const state = await getWirelessConfig(cfg);
  // `uci add wireless wifi-iface` needs /etc/config/wireless to exist, and a
  // radio is the only thing an interface can be attached to. A device without
  // one has nothing meaningful to create.
  if (state.radios.length === 0) {
    throw new AppError("This device has no wireless radio to attach a network to", 404);
  }
  if (!state.radios.some((r) => r.name === input.device)) {
    throw new AppError(`Radio not found: ${input.device}`, 404);
  }

  const added = await exec(cfg, "uci add wireless wifi-iface");
  if (added.code !== 0) {
    throw new DeviceCommandError(
      (added.stderr || added.stdout).trim() || "Failed to add wifi-iface",
    );
  }
  // `uci add` prints the fully qualified name (`wireless.cfg02e1a7`) and the uci
  // helpers prefix the package themselves, so the prefix has to come off or
  // every following set targets `wireless.wireless.cfg…` and fails, leaving the
  // new section behind as an orphan.
  const ref = added.stdout.trim().replace(/^wireless\./, "");
  if (!ref) {
    await exec(cfg, REVERT_DELTA).catch(() => null);
    throw new DeviceCommandError("Device did not report the new wifi-iface section");
  }
  const cmds = [
    uciSet("wireless", ref, "device", input.device),
    uciSet("wireless", ref, "ssid", input.ssid),
    uciSet("wireless", ref, "mode", "ap"),
    uciSet("wireless", ref, "encryption", "none"),
  ];
  if (input.network) cmds.push(uciSet("wireless", ref, "network", input.network));
  cmds.push(uciCommit("wireless"));
  await run(cfg, cmds, "create wireless network");
  return { ok: true };
}

export async function deleteWifiIface(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  if (!IFACE_REF.test(ref)) throw new AppError(`Invalid wireless network reference: ${ref}`);
  const state = await getWirelessConfig(cfg);
  if (!state.ifaces.some((i) => i.ref === ref)) {
    throw new AppError(`Wireless network not found: ${ref}`, 404);
  }
  await run(cfg, [uciDelete("wireless", ref), uciCommit("wireless")], `delete wireless network ${ref}`);
  return { ok: true };
}
