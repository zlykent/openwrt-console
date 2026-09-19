/** Presentation helpers shared by the dashboard and status pages. */

export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatRate(bytesPerSec: number): string {
  return `${formatBytes(bytesPerSec)}/s`;
}

const LUCI_UNITS = [" ", " K", " M", " G", " T", " P", " E"];

/**
 * Port of LuCI's `String.format` "%m" conversion (`cbi.js`), used verbatim by
 * the nlbwmon views: `%1024.2mB` for bytes, `%1000.2mP` for packets,
 * `%1000m` for plain counts.
 */
export function formatLuciMetric(value: number, base: number, unit: string, decimals = 2): string {
  let val = Number(value);
  if (!Number.isFinite(val)) val = 0;
  let i = 0;
  // Clamped one short of the unit table so the exponent can never run off it.
  for (i = 0; i < LUCI_UNITS.length - 1 && val > base; i++) val /= base;
  return `${(i ? val.toFixed(decimals) : String(val)) + LUCI_UNITS[i]}${unit}`.trim();
}

/** Compact `3d 4h 5m` uptime from seconds. */
export function formatUptime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const s = Math.floor(totalSeconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatLoad(load: number[]): string {
  return load.map((n) => (Number.isFinite(n) ? n.toFixed(2) : "0.00")).join(" · ");
}

export function formatPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}

/** Epoch seconds → locale time string. */
export function formatEpoch(seconds: number, locale?: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return new Date(seconds * 1000).toLocaleString(locale ?? undefined);
}

/** Clock time only, for log rows. */
export function formatTime(seconds: number, locale?: string): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return new Date(seconds * 1000).toLocaleTimeString(locale ?? undefined);
}

/**
 * Interfaces that represent real traffic. Excludes loopback and bridge devices
 * so aggregating rx/tx does not double-count (a bridge mirrors its members).
 */
export function isPhysicalInterface(name: string): boolean {
  if (!name) return false;
  if (name === "lo") return false;
  if (name.startsWith("br-")) return false;
  if (name.startsWith("docker")) return false;
  if (name.startsWith("veth")) return false;
  if (name.startsWith("tun") || name.startsWith("tap")) return false;
  return true;
}
