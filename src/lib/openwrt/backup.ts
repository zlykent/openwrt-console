import type { DeviceConfig } from "@/lib/config";
import { downloadFile, exec, uploadFile } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import { DeviceCommandError } from "@/lib/api/errors";

const BACKUP_REMOTE = "/tmp/owrt-console-backup.tar.gz";
const RESTORE_REMOTE = "/tmp/owrt-console-restore.tar.gz";
const FIRMWARE_REMOTE = "/tmp/owrt-console-firmware.bin";

/** Files that a configuration backup would include (sysupgrade conffiles). */
export async function listBackupFiles(cfg: DeviceConfig): Promise<string[]> {
  const res = await exec(cfg, "sysupgrade -l 2>/dev/null").catch(() => null);
  if (!res) return [];
  return res.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Create a configuration backup on the device and stream it back. */
export async function createBackup(cfg: DeviceConfig): Promise<Buffer> {
  const res = await exec(cfg, `sysupgrade -b ${shq(BACKUP_REMOTE)} 2>&1`, { timeoutMs: 60_000 });
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || res.stdout.trim() || "Failed to create backup");
  return await downloadFile(cfg, BACKUP_REMOTE);
}

/** Upload a configuration backup and restore it (does not reboot). */
export async function restoreBackup(cfg: DeviceConfig, data: Buffer): Promise<{ ok: true }> {
  await uploadFile(cfg, RESTORE_REMOTE, data);
  const res = await exec(cfg, `sysupgrade -r ${shq(RESTORE_REMOTE)} 2>&1`, { timeoutMs: 60_000 });
  await exec(cfg, `rm -f ${shq(RESTORE_REMOTE)} 2>/dev/null || true`);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || res.stdout.trim() || "Failed to restore backup");
  return { ok: true };
}

/**
 * Upload a firmware image and flash it with sysupgrade. This reboots the
 * device; `keepConfig` controls whether /etc is preserved (-n discards it).
 */
export async function flashFirmware(
  cfg: DeviceConfig,
  data: Buffer,
  keepConfig: boolean,
): Promise<{ ok: true }> {
  await uploadFile(cfg, FIRMWARE_REMOTE, data);
  // Sanity-check the image before committing to a flash.
  const test = await exec(cfg, `sysupgrade -T ${shq(FIRMWARE_REMOTE)} 2>&1`, { timeoutMs: 60_000 });
  if (test.code !== 0) {
    await exec(cfg, `rm -f ${shq(FIRMWARE_REMOTE)} 2>/dev/null || true`);
    throw new DeviceCommandError(test.stderr.trim() || test.stdout.trim() || "Image validation failed");
  }
  const flag = keepConfig ? "" : " -n";
  // Fire-and-forget: the device reboots and the SSH session drops.
  await exec(cfg, `nohup sysupgrade${flag} ${shq(FIRMWARE_REMOTE)} >/dev/null 2>&1 &`, {
    timeoutMs: 10_000,
  }).catch(() => null);
  return { ok: true };
}
