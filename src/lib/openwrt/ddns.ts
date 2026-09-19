import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import {
  boolOption,
  chain,
  firstOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciSet,
  uciShow,
} from "./uci";
import type { DdnsGlobal, DdnsService } from "./types";
import { DeviceCommandError } from "@/lib/api/errors";

export type DdnsConfig = { global: DdnsGlobal; services: DdnsService[] };

export async function getDdns(cfg: DeviceConfig): Promise<DdnsConfig> {
  const res = await exec(cfg, uciShow("ddns")).catch(() => null);
  const global: DdnsGlobal = { dateFormat: "%F %R", logLines: "250", updatePrivateIp: false };
  const services: DdnsService[] = [];
  if (!res) return { global, services };
  for (const sec of parseUciShow(res.stdout)) {
    if (sec.type === "ddns") {
      global.dateFormat = firstOption(sec, "ddns_dateformat", global.dateFormat);
      global.logLines = firstOption(sec, "ddns_loglines", global.logLines);
      global.updatePrivateIp = boolOption(sec, "upd_privateip");
    } else if (sec.type === "service") {
      services.push({
        ref: sec.name,
        name: sec.anonymous ? sec.name : sec.name,
        enabled: boolOption(sec, "enabled"),
        serviceName: firstOption(sec, "service_name") || undefined,
        lookupHost: firstOption(sec, "lookup_host") || undefined,
        domain: firstOption(sec, "domain") || undefined,
        updateUrl: firstOption(sec, "update_url") || undefined,
        username: firstOption(sec, "username") || undefined,
        checkInterval: firstOption(sec, "check_interval") || undefined,
        forceInterval: firstOption(sec, "force_interval") || undefined,
        ipSource: firstOption(sec, "ip_source") || undefined,
        useIpv6: boolOption(sec, "use_ipv6"),
      });
    }
  }
  return { global, services };
}

export type DdnsServiceInput = Omit<DdnsService, "ref">;

export async function saveDdnsService(
  cfg: DeviceConfig,
  input: DdnsServiceInput,
  ref?: string,
): Promise<{ ok: true }> {
  const section = ref ?? (input.name || `svc_${Date.now().toString(36)}`);
  const cmds: string[] = [];
  if (!ref) cmds.push(`uci -q add ddns service >/dev/null && uci -q rename ddns @service[-1]=${section}`);
  cmds.push(uciSet("ddns", section, "enabled", input.enabled ? "1" : "0"));
  if (input.serviceName) cmds.push(uciSet("ddns", section, "service_name", input.serviceName));
  if (input.lookupHost) cmds.push(uciSet("ddns", section, "lookup_host", input.lookupHost));
  if (input.domain) cmds.push(uciSet("ddns", section, "domain", input.domain));
  if (input.updateUrl) cmds.push(uciSet("ddns", section, "update_url", input.updateUrl));
  if (input.username) cmds.push(uciSet("ddns", section, "username", input.username));
  if (input.checkInterval) cmds.push(uciSet("ddns", section, "check_interval", input.checkInterval));
  if (input.forceInterval) cmds.push(uciSet("ddns", section, "force_interval", input.forceInterval));
  if (input.ipSource) cmds.push(uciSet("ddns", section, "ip_source", input.ipSource));
  cmds.push(uciSet("ddns", section, "use_ipv6", input.useIpv6 ? "1" : "0"));
  cmds.push(uciCommit("ddns"));
  const res = await exec(cfg, chain(...cmds));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to save DDNS service");
  await exec(cfg, "/etc/init.d/ddns restart 2>/dev/null || true");
  return { ok: true };
}

export async function deleteDdnsService(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  const res = await exec(cfg, chain(uciDelete("ddns", ref), uciCommit("ddns")));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to delete DDNS service");
  await exec(cfg, "/etc/init.d/ddns restart 2>/dev/null || true");
  return { ok: true };
}

/** List the ddns update scripts shipped on the device (service providers). */
export async function getDdnsProviders(cfg: DeviceConfig): Promise<string[]> {
  const res = await exec(cfg, "ls /usr/lib/ddns/ 2>/dev/null").catch(() => null);
  if (!res) return [];
  return res.stdout
    .split(/\s+/)
    .filter((f) => /^update_.+_com.*\.sh$|^update_.+\.sh$/.test(f) && !f.includes("functions") && !f.includes("lucihelper") && !f.includes("updater"))
    .map((f) => f.replace(/^update_/, "").replace(/\.sh$/, ""));
}
