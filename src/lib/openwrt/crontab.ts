import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput } from "@/lib/ssh/client";
import { DeviceCommandError } from "@/lib/api/errors";

const CRONTAB_PATH = "/etc/crontabs/root";

/** Read the root crontab (empty string when none configured). */
export async function getCrontab(cfg: DeviceConfig): Promise<string> {
  const res = await exec(cfg, `cat ${CRONTAB_PATH} 2>/dev/null`);
  return res.stdout.replace(/\s+$/, "") + (res.stdout.trim() ? "\n" : "");
}

/**
 * Replace the root crontab atomically via stdin (no argv exposure), then
 * restart cron so the new schedule takes effect.
 */
export async function setCrontab(cfg: DeviceConfig, content: string): Promise<{ ok: true }> {
  const cleaned = content.replace(/\r\n/g, "\n");
  const body = cleaned.trim() ? cleaned.replace(/\n+$/, "\n") : "";
  const res = await execWithInput(cfg, `cat > ${CRONTAB_PATH}`, body);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || "Failed to write crontab");
  await exec(cfg, "/etc/init.d/cron restart 2>/dev/null || true");
  return { ok: true };
}
