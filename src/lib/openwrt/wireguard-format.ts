/**
 * Pure, client-safe formatting helpers for the WireGuard status view.
 *
 * Ports of the two inline JS helpers in the official
 * `luci/view/wireguard.htm` (`bytes_to_str` / `timestamp_to_str`). Kept free
 * of device imports so React pages can use them without bundling ssh2.
 */

/** Official rule: a peer counts as up while the last handshake is < 140 s old. */
export const WG_CONNECTED_WINDOW = 140;

const SIZES = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

/** `bytes_to_str()` — binary prefixes, two decimals. */
export function wgBytesToStr(bytes: number): string {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 1) return "0 B";
  const i = Math.min(Math.floor(Math.log(value) / Math.log(1024)), SIZES.length - 1);
  return `${Math.round((value / Math.pow(1024, i)) * 100) / 100} ${SIZES[i]}`;
}

export type WgHandshakeAgo =
  | { kind: "never" }
  | { kind: "seconds"; value: number }
  | { kind: "minutes"; value: number }
  | { kind: "hours"; value: number }
  | { kind: "overDay" };

/**
 * `timestamp_to_str()` split into data + formatting so the caller can
 * translate the "… ago" suffix. Unix seconds; 0 means "never".
 */
export function wgHandshakeAgo(timestamp: number, now = Date.now()): WgHandshakeAgo {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts < 1) return { kind: "never" };
  const seconds = now / 1000 - ts;
  if (seconds < 60) return { kind: "seconds", value: Math.floor(seconds) };
  if (seconds < 3600) return { kind: "minutes", value: Math.floor(seconds / 60) };
  if (seconds < 86401) return { kind: "hours", value: Math.floor(seconds / 3600) };
  return { kind: "overDay" };
}

/** UTC rendering used next to the relative "ago" text. */
export function wgHandshakeUtc(timestamp: number): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts < 1) return "";
  return new Date(ts * 1000).toUTCString();
}

export function wgPeerConnected(latestHandshake: number, now = Date.now()): boolean {
  return now / 1000 - Number(latestHandshake) < WG_CONNECTED_WINDOW;
}
