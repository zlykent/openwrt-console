import type { DeviceConfig } from "@/lib/config";
import { exec, SshError } from "@/lib/ssh/client";
import {
  chain,
  firstOption,
  parseUciShow,
  uciCommit,
  uciDelete,
  uciSet,
  uciShow,
  type UciSection,
} from "./uci";

/**
 * A dropbear (SSH server) instance from `/etc/config/dropbear`. Mirrors the
 * LuCI System → Administration → SSH Access view. Option names match what
 * `/etc/init.d/dropbear` consumes.
 */
export type DropbearInstance = {
  ref: string;
  /** uci `enable` — start this instance (default on). */
  enable: boolean;
  /** uci `interface` — bind to a logical interface ("" = all). */
  interface: string;
  /** uci `Port` — listening port (default 22). */
  port: string;
  /** uci `PasswordAuth` — allow password login. */
  passwordAuth: boolean;
  /** uci `RootPasswordAuth` — allow root login with a password. */
  rootPasswordAuth: boolean;
  /** uci `AllowBlankPassword` — allow login with an empty password. */
  allowBlankPassword: boolean;
  /** uci `EnableForwarding` — allow TCP/port forwarding. */
  enableForwarding: boolean;
  /** uci `GatewayPorts` — let remote hosts reach local forwarded ports. */
  gatewayPorts: boolean;
  /** uci `max_auth_tries`. */
  maxAuthTries: string;
  /** uci `IdleTimeout` (seconds). */
  idleTimeout: string;
  /** uci `BannerFile` — path to the pre-login banner file. */
  bannerFile: string;
};

/** Which SSH server the device actually runs. */
export type SshServerBackend = "dropbear" | "openssh" | "none";

export type DropbearState = {
  /**
   * The SSH server detected on the device. LuCI's SSH Access tab edits
   * dropbear; OpenSSH-based builds (backend "openssh") carry no dropbear
   * config, so the editor is unavailable and the page explains why.
   */
  backend: SshServerBackend;
  /** True when dropbear is present and its uci config is manageable. */
  supported: boolean;
  instances: DropbearInstance[];
};

export type DropbearInput = Omit<DropbearInstance, "ref">;

function toInstance(s: UciSection): DropbearInstance {
  return {
    ref: s.name,
    enable: firstOption(s, "enable", "1") !== "0",
    interface: firstOption(s, "interface"),
    port: firstOption(s, "Port", "22"),
    passwordAuth: firstOption(s, "PasswordAuth", "1") !== "0",
    rootPasswordAuth: firstOption(s, "RootPasswordAuth", "1") !== "0",
    allowBlankPassword: firstOption(s, "AllowBlankPassword") === "1",
    enableForwarding: firstOption(s, "EnableForwarding", "1") !== "0",
    gatewayPorts: firstOption(s, "GatewayPorts") === "1",
    maxAuthTries: firstOption(s, "max_auth_tries"),
    idleTimeout: firstOption(s, "IdleTimeout"),
    bannerFile: firstOption(s, "BannerFile"),
  };
}

export async function getDropbear(cfg: DeviceConfig): Promise<DropbearState> {
  // Probe both SSH servers by PATH and by their usual sbin location, since a
  // non-login SSH shell may carry a trimmed PATH. Emits HAVE_dropbear / HAVE_sshd.
  const [uciRes, probe] = await Promise.all([
    exec(cfg, uciShow("dropbear")).catch(() => null),
    exec(
      cfg,
      "(command -v dropbear >/dev/null 2>&1 || [ -x /usr/sbin/dropbear ]) && echo HAVE_dropbear; " +
        "(command -v sshd >/dev/null 2>&1 || [ -x /usr/sbin/sshd ]) && echo HAVE_sshd",
    ).catch(() => null),
  ]);
  const probeOut = probe?.stdout ?? "";
  const secs = parseUciShow(uciRes?.stdout ?? "").filter((s) => s.type === "dropbear");
  const instances = secs.map(toInstance);
  const hasDropbear = probeOut.includes("HAVE_dropbear") || instances.length > 0;
  const backend: SshServerBackend = hasDropbear
    ? "dropbear"
    : probeOut.includes("HAVE_sshd")
      ? "openssh"
      : "none";
  return { backend, supported: hasDropbear, instances };
}

/**
 * Commit `dropbear` and bounce the listener. The restart is detached so this
 * call returns first; established SSH sessions (including the BFF channel)
 * are separate dropbear children and are not torn down by a listener restart.
 */
async function commitAndApply(cfg: DeviceConfig, cmds: string[], action: string): Promise<void> {
  const r = await exec(cfg, chain(...cmds, uciCommit("dropbear")), { timeoutMs: 20000 });
  if (r.code !== 0) {
    throw new SshError("exec", `Failed to ${action}`, (r.stderr || r.stdout).trim());
  }
  // TODO(verify): restart timing varies by build; detached so we never block on it.
  await exec(cfg, "( sleep 1; /etc/init.d/dropbear restart ) >/dev/null 2>&1 &", {
    timeoutMs: 8000,
  }).catch(() => {
    /* the channel may close as the listener bounces */
  });
}

async function addSection(cfg: DeviceConfig): Promise<string> {
  const r = await exec(cfg, "uci add dropbear dropbear");
  if (r.code !== 0) {
    throw new SshError("exec", "Failed to add dropbear instance", (r.stderr || r.stdout).trim());
  }
  return r.stdout.trim();
}

export async function saveDropbear(
  cfg: DeviceConfig,
  ref: string | undefined,
  input: DropbearInput,
): Promise<{ ok: true }> {
  const target = ref ?? (await addSection(cfg));
  const cmds: string[] = [];
  const setOrDelete = (option: string, value: string) =>
    cmds.push(value ? uciSet("dropbear", target, option, value) : uciDelete("dropbear", target, option));
  cmds.push(uciSet("dropbear", target, "enable", input.enable ? "1" : "0"));
  setOrDelete("interface", input.interface.trim());
  setOrDelete("Port", input.port.trim());
  cmds.push(uciSet("dropbear", target, "PasswordAuth", input.passwordAuth ? "1" : "0"));
  cmds.push(uciSet("dropbear", target, "RootPasswordAuth", input.rootPasswordAuth ? "1" : "0"));
  cmds.push(uciSet("dropbear", target, "AllowBlankPassword", input.allowBlankPassword ? "1" : "0"));
  cmds.push(uciSet("dropbear", target, "EnableForwarding", input.enableForwarding ? "1" : "0"));
  cmds.push(uciSet("dropbear", target, "GatewayPorts", input.gatewayPorts ? "1" : "0"));
  setOrDelete("max_auth_tries", input.maxAuthTries.trim());
  setOrDelete("IdleTimeout", input.idleTimeout.trim());
  setOrDelete("BannerFile", input.bannerFile.trim());
  await commitAndApply(cfg, cmds, "save SSH access settings");
  return { ok: true };
}

export async function deleteDropbear(cfg: DeviceConfig, ref: string): Promise<{ ok: true }> {
  await commitAndApply(cfg, [uciDelete("dropbear", ref)], "delete dropbear instance");
  return { ok: true };
}
