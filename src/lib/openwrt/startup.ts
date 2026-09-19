import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput } from "@/lib/ssh/client";
import { DeviceCommandError } from "@/lib/api/errors";

const RC_LOCAL_PATH = "/etc/rc.local";

/**
 * Read /etc/rc.local. An absent or empty file is reported as empty, matching
 * LuCI's `fs.readfile("/etc/rc.local") or ""`: padding it with a template would
 * show the operator content the device does not have, and the padded text would
 * then be written back on the next save.
 */
export async function getRcLocal(cfg: DeviceConfig): Promise<{ content: string }> {
  const res = await exec(cfg, `cat ${RC_LOCAL_PATH} 2>/dev/null`);
  return { content: res.stdout.replace(/\s+$/, "") + (res.stdout.trim() ? "\n" : "") };
}

/**
 * Replace /etc/rc.local via stdin (no argv exposure). It runs on the next boot
 * through `/etc/init.d/done`, which does `[ -f /etc/rc.local ] && sh /etc/rc.local`
 * — so no service restart is needed here and the executable bit is irrelevant.
 * The file mode is deliberately left alone: the stock image ships it 0664 and it
 * is on the sysupgrade keep list, so a forced `chmod` would outlive the edit.
 */
export async function setRcLocal(cfg: DeviceConfig, content: string): Promise<{ ok: true }> {
  const cleaned = content.replace(/\r\n/g, "\n");
  // LuCI writes the textarea verbatim apart from folding CRLF. Clearing the
  // editor therefore empties the file rather than resurrecting a template.
  const body = cleaned.trim() ? cleaned.replace(/\n+$/, "\n") : "";
  const res = await execWithInput(cfg, `cat > ${RC_LOCAL_PATH}`, body);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to write rc.local");
  return { ok: true };
}
