import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import {
  boolOption,
  chain,
  firstOption,
  parseUciShow,
  uciCommit,
  uciCreateSection,
  uciDelete,
  uciDeleteIfExists,
  uciSet,
  uciShow,
} from "./uci";
import type { ActiveRoute, StaticRoute } from "./types";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * Leading route-class keywords `ip route` prints before the destination, e.g.
 * `unreachable fd12::/48 dev lo proto static`. Without stripping them the
 * destination is lost and the keyword is shown as the target.
 */
const ROUTE_TYPES = new Set([
  "anycast",
  "blackhole",
  "broadcast",
  "local",
  "multicast",
  "nat",
  "prohibit",
  "throw",
  "unreachable",
]);

/**
 * Parse `ip route` / `ip -6 route` output, e.g.
 *   default via 192.168.3.1 dev eth0 proto static
 *   192.168.3.0/24 dev eth0 proto kernel scope link src 192.168.3.5
 */
export function parseIpRoute(text: string): ActiveRoute[] {
  const out: ActiveRoute[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const f = line.split(/\s+/);
    let i = 0;
    let type: string | undefined;
    if (ROUTE_TYPES.has(f[0].toLowerCase())) {
      type = f[0].toLowerCase();
      i = 1;
    }
    const route: ActiveRoute = { target: f[i] ?? "" };
    if (type) route.type = type;
    for (let k = i + 1; k < f.length - 1; k++) {
      const key = f[k];
      const val = f[k + 1];
      if (key === "via") route.gateway = val;
      else if (key === "dev") route.device = val;
      else if (key === "proto") route.proto = val;
      else if (key === "scope") route.scope = val;
      else if (key === "src") route.source = val;
      else if (key === "metric") route.metric = val;
    }
    out.push(route);
  }
  return out;
}

export async function getActiveRoutes(cfg: DeviceConfig): Promise<ActiveRoute[]> {
  const res = await exec(cfg, "ip route 2>/dev/null; echo '---'; ip -6 route 2>/dev/null");
  const text = res.stdout.replace(/^---$|^\s*---\s*$/gm, "");
  return parseIpRoute(text);
}

/** Read configured static routes (uci `network` route / route6 sections). */
export async function getStaticRoutes(cfg: DeviceConfig): Promise<StaticRoute[]> {
  const res = await exec(cfg, uciShow("network")).catch(() => null);
  if (!res) return [];
  const out: StaticRoute[] = [];
  for (const sec of parseUciShow(res.stdout)) {
    if (sec.type !== "route" && sec.type !== "route6") continue;
    out.push({
      ref: sec.name,
      kind: sec.type === "route6" ? "route6" : "route",
      name: sec.anonymous ? undefined : sec.name,
      iface: firstOption(sec, "interface", "lan"),
      target: firstOption(sec, "target"),
      netmask: firstOption(sec, "netmask") || undefined,
      gateway: firstOption(sec, "gateway") || undefined,
      metric: firstOption(sec, "metric") || undefined,
      mtu: firstOption(sec, "mtu") || undefined,
      type: firstOption(sec, "type") || undefined,
      enabled: !boolOption(sec, "disabled") ? true : false,
    });
  }
  return out;
}

export type StaticRouteInput = Omit<StaticRoute, "ref">;

/** UCI section names are restricted to word characters. */
const SECTION_NAME = /^[A-Za-z0-9_]+$/;

/**
 * Append a `set` for a non-empty value, or a guarded `delete` so a cleared
 * field does not go stale.
 */
function setOrDelete(cmds: string[], section: string, option: string, value?: string): void {
  const v = value?.trim() ?? "";
  if (v) cmds.push(uciSet("network", section, option, v));
  else cmds.push(uciDeleteIfExists("network", section, option));
}

/**
 * LuCI clamps the route MTU to 64..9000. Validating here turns a typo into a
 * readable 400 instead of an opaque `ip route` failure on the device.
 */
function normalizedMtu(value?: string): string {
  const v = value?.trim() ?? "";
  if (!v) return "";
  if (!/^\d+$/.test(v) || Number(v) < 64 || Number(v) > 9000) {
    throw new AppError(`Invalid route MTU: ${v} (expected 64..9000)`);
  }
  return v;
}

/**
 * LuCI offers `unicast` as the empty value, so a plain unicast route stores no
 * `type` option at all. Collapsing it keeps our writes byte-identical to what
 * LuCI would have produced.
 */
function normalizedType(value?: string): string {
  const v = value?.trim() ?? "";
  return v.toLowerCase() === "unicast" ? "" : v;
}

/**
 * The section a save writes to: the requested name when it differs from the
 * current one, otherwise the existing ref, otherwise a generated name. Rejects
 * names uci could not address as `network.<name>`.
 */
export function resolveRouteSection(
  input: StaticRouteInput,
  ref: string | undefined,
  generated: string,
): string {
  const name = input.name?.trim();
  if (name && !SECTION_NAME.test(name)) {
    throw new AppError(`Invalid route name: ${name}`);
  }
  return ref ? (name && name !== ref ? name : ref) : (name || generated);
}

/**
 * Build the uci commands that persist a static route (commit included, no
 * exec). Kept pure so the exact command shape is unit-tested: the device
 * rejects subtle variations, and both mistakes this guards against corrupt the
 * config without surfacing any error in the UI.
 */
export function buildRouteCommands(
  input: StaticRouteInput,
  ref: string | undefined,
  section: string,
): string[] {
  const name = input.name?.trim();
  const cmds: string[] = [];
  // Only a *named* section can be renamed. `uci rename network.@route[-1]=x`
  // does not rename the anonymous section that `uci add` just created: it
  // rewrites that section's *type* to `x`, leaving an orphan behind which a
  // revert of `network.x` cannot reach. New routes are therefore created
  // directly under their final name with `uci set`, which also retypes an
  // existing section when the address family changed.
  if (ref && name && name !== ref) {
    cmds.push(`uci -q rename ${shq(`network.${ref}`)}=${shq(name)}`);
  }
  cmds.push(uciCreateSection("network", section, input.kind));
  cmds.push(uciSet("network", section, "interface", input.iface));
  cmds.push(uciSet("network", section, "target", input.target));
  setOrDelete(cmds, section, "gateway", input.gateway);
  setOrDelete(cmds, section, "netmask", input.netmask);
  setOrDelete(cmds, section, "metric", input.metric);
  setOrDelete(cmds, section, "mtu", normalizedMtu(input.mtu));
  setOrDelete(cmds, section, "type", normalizedType(input.type));
  cmds.push(uciSet("network", section, "disabled", input.enabled ? "0" : "1"));
  cmds.push(uciCommit("network"));
  return cmds;
}

/**
 * Add or update a static route, then commit + reload network.
 *
 * Sections are addressed by name (never by the unstable `@route[n]` index) so
 * that editing and deleting always hit the route the operator picked. An
 * optional `name` is used as the section name; unnamed routes get a generated
 * one.
 */
export async function saveStaticRoute(
  cfg: DeviceConfig,
  input: StaticRouteInput,
  ref?: string,
): Promise<{ ok: true }> {
  const section = resolveRouteSection(input, ref, `route_${Date.now().toString(36)}`);
  const res = await exec(cfg, chain(...buildRouteCommands(input, ref, section)));
  if (res.code !== 0) {
    // Drop the half-applied delta so the next save starts from a clean state.
    await exec(cfg, `uci revert ${shq(`network.${section}`)} 2>/dev/null || true`);
    throw new DeviceCommandError(res.stderr.trim() || "Failed to save route");
  }
  await exec(cfg, "/etc/init.d/network reload 2>/dev/null || true");
  return { ok: true };
}

export async function deleteStaticRoute(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  const res = await exec(cfg, chain(uciDelete("network", ref), uciCommit("network")));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to delete route");
  await exec(cfg, "/etc/init.d/network reload 2>/dev/null || true");
  return { ok: true };
}
