import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput } from "@/lib/ssh/client";
import { parseSshKeys, type SshKey, type SshKeysState } from "./sshkeys-parse";
import { DeviceCommandError } from "@/lib/api/errors";

// The pure parser + types live in ./sshkeys-parse so client components can use
// them without pulling ssh2 into the browser bundle. Re-exported here so
// existing server-side importers keep resolving from this module.
export { parseSshKeys };
export type { SshKey, SshKeysState };

const AUTH_KEYS_PATH = "/etc/dropbear/authorized_keys";

/** Read the dropbear authorized_keys file (empty string when none present). */
export async function getSshKeys(cfg: DeviceConfig): Promise<SshKeysState> {
  const res = await exec(cfg, `cat ${AUTH_KEYS_PATH} 2>/dev/null`);
  const content = res.stdout.replace(/\s+$/, "") + (res.stdout.trim() ? "\n" : "");
  return { content, keys: parseSshKeys(content) };
}

/**
 * Replace authorized_keys atomically via stdin (no argv exposure), lock the
 * file to 0600 as dropbear expects, then reload dropbear so keys take effect.
 */
export async function setSshKeys(cfg: DeviceConfig, content: string): Promise<{ ok: true }> {
  const cleaned = content.replace(/\r\n/g, "\n");
  const body = cleaned.trim() ? cleaned.replace(/\n+$/, "\n") : "";
  const res = await execWithInput(cfg, `cat > ${AUTH_KEYS_PATH}`, body);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to write authorized_keys");
  await exec(cfg, `chmod 600 ${AUTH_KEYS_PATH} 2>/dev/null; /etc/init.d/dropbear reload 2>/dev/null || true`);
  return { ok: true };
}
