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
import type { UpnpConfig, UpnpRule } from "./types";
import { DeviceCommandError } from "@/lib/api/errors";

export type UpnpState = { config: UpnpConfig; rules: UpnpRule[] };

const DEFAULT_CONFIG: UpnpConfig = {
  enabled: false,
  enableNatpmp: true,
  enableUpnp: true,
  secureMode: true,
  logOutput: false,
  download: "1024",
  upload: "512",
  internalIface: "lan",
  port: "5000",
};

export async function getUpnp(cfg: DeviceConfig): Promise<UpnpState> {
  const res = await exec(cfg, uciShow("upnpd")).catch(() => null);
  const config = { ...DEFAULT_CONFIG };
  const rules: UpnpRule[] = [];
  if (!res) return { config, rules };
  for (const sec of parseUciShow(res.stdout)) {
    if (sec.type === "upnpd") {
      config.enabled = boolOption(sec, "enabled");
      config.enableNatpmp = boolOption(sec, "enable_natpmp");
      config.enableUpnp = boolOption(sec, "enable_upnp");
      config.secureMode = boolOption(sec, "secure_mode");
      config.logOutput = boolOption(sec, "log_output");
      config.download = firstOption(sec, "download", config.download);
      config.upload = firstOption(sec, "upload", config.upload);
      config.internalIface = firstOption(sec, "internal_iface", config.internalIface);
      config.port = firstOption(sec, "port", config.port);
    } else if (sec.type === "perm_rule") {
      rules.push({
        ref: sec.name,
        action: firstOption(sec, "action", "allow"),
        extPorts: firstOption(sec, "ext_ports"),
        intAddr: firstOption(sec, "int_addr"),
        intPorts: firstOption(sec, "int_ports"),
        comment: firstOption(sec, "comment") || undefined,
      });
    }
  }
  return { config, rules };
}

export async function saveUpnpConfig(cfg: DeviceConfig, input: UpnpConfig): Promise<{ ok: true }> {
  const cmds = [
    uciSet("upnpd", "config", "enabled", input.enabled ? "1" : "0"),
    uciSet("upnpd", "config", "enable_natpmp", input.enableNatpmp ? "1" : "0"),
    uciSet("upnpd", "config", "enable_upnp", input.enableUpnp ? "1" : "0"),
    uciSet("upnpd", "config", "secure_mode", input.secureMode ? "1" : "0"),
    uciSet("upnpd", "config", "log_output", input.logOutput ? "1" : "0"),
    uciSet("upnpd", "config", "download", input.download),
    uciSet("upnpd", "config", "upload", input.upload),
    uciSet("upnpd", "config", "internal_iface", input.internalIface),
    uciSet("upnpd", "config", "port", input.port),
    uciCommit("upnpd"),
  ];
  const res = await exec(cfg, chain(...cmds));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to save UPnP config");
  await exec(cfg, "/etc/init.d/miniupnpd restart 2>/dev/null || /etc/init.d/upnpd restart 2>/dev/null || true");
  return { ok: true };
}

export type UpnpRuleInput = Omit<UpnpRule, "ref">;

export async function addUpnpRule(cfg: DeviceConfig, input: UpnpRuleInput): Promise<{ ok: true }> {
  const section = `rule_${Date.now().toString(36)}`;
  const cmds = [
    `uci -q add upnpd perm_rule >/dev/null && uci -q rename upnpd @perm_rule[-1]=${section}`,
    uciSet("upnpd", section, "action", input.action),
    uciSet("upnpd", section, "ext_ports", input.extPorts),
    uciSet("upnpd", section, "int_addr", input.intAddr),
    uciSet("upnpd", section, "int_ports", input.intPorts),
  ];
  if (input.comment) cmds.push(uciSet("upnpd", section, "comment", input.comment));
  cmds.push(uciCommit("upnpd"));
  const res = await exec(cfg, chain(...cmds));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to add UPnP rule");
  await exec(cfg, "/etc/init.d/miniupnpd restart 2>/dev/null || true");
  return { ok: true };
}

export async function deleteUpnpRule(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  const res = await exec(cfg, chain(uciDelete("upnpd", ref), uciCommit("upnpd")));
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to delete UPnP rule");
  await exec(cfg, "/etc/init.d/miniupnpd restart 2>/dev/null || true");
  return { ok: true };
}
