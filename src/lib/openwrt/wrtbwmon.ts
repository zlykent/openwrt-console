import type { DeviceConfig } from "@/lib/config";
import { exec, execWithInput } from "@/lib/ssh/client";
import { chain, uciCommit, uciGet, uciSet } from "./uci";
import {
  parseUsageHtml,
  usageDatabasePath,
  WRTBWMON_DB_PERSIST,
  WRTBWMON_DB_TMP,
  WRTBWMON_USER_FILE,
  type UsageState,
} from "./wrtbwmon-view";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * luci-app-wrtbwmon — "Usage" (admin/nlbw/usage), device side.
 *
 * The official controller (`controller/wrtbwmon.lua`) exposes three leaf
 * pages, each mirrored by one function group here:
 *  - `details` → `usage_data` runs `wrtbwmon update <db> && wrtbwmon publish
 *    <db> /tmp/usage.htm /etc/config/wrtbwmon.user` and returns the generated
 *    HTML; `usage_reset` runs `wrtbwmon update <db> && rm <db>`.
 *  - `config` → CBI map with the single `persist` flag, whose writer also
 *    moves the database file between /tmp and /etc/config.
 *  - `custom` → SimpleForm editing `/etc/config/wrtbwmon.user`.
 *
 * The published HTML is parsed on the server (`wrtbwmon-view.ts`) so the page
 * renders the same rows with React.
 */

export {
  aggregateHostTotals,
  formatUsageSize,
  parseUsageHtml,
  sortUsageRows,
  usageDateToIso,
  usageDatabasePath,
  usageTotals,
  withSpeeds,
  USAGE_REFRESH_INTERVALS,
  USAGE_SORT_COLUMNS,
  WRTBWMON_DB_PERSIST,
  WRTBWMON_DB_TMP,
  WRTBWMON_USER_FILE,
} from "./wrtbwmon-view";
export type { UsageDisplayRow, UsageRow, UsageSortColumn, UsageState } from "./wrtbwmon-view";

const PUBLISHED_FILE = "/tmp/usage.htm";

async function readPersist(cfg: DeviceConfig): Promise<boolean> {
  const res = await exec(cfg, uciGet("wrtbwmon", "general", "persist"));
  return res.stdout.trim() === "1";
}

/** Official `usage_data()` call. */
export async function getUsage(cfg: DeviceConfig): Promise<UsageState> {
  const installed = await exec(cfg, "command -v wrtbwmon >/dev/null 2>&1 && echo yes || echo no");
  if (installed.stdout.trim() !== "yes") {
    throw new AppError("wrtbwmon is not installed on the device");
  }
  const persist = await readPersist(cfg);
  const db = usageDatabasePath(persist);
  const publish = `wrtbwmon publish ${db} ${PUBLISHED_FILE} ${WRTBWMON_USER_FILE}`;
  const res = await exec(cfg, `wrtbwmon update ${db} && ${publish} && cat ${PUBLISHED_FILE}`, {
    timeoutMs: 30_000,
  });
  return {
    rows: parseUsageHtml(res.stdout),
    persist,
    dbPath: db,
    updatedAt: new Date().toISOString(),
  };
}

/** Official `usage_reset()` call: flush the counters, then delete the file. */
export async function resetUsage(cfg: DeviceConfig): Promise<{ ok: true }> {
  const db = usageDatabasePath(await readPersist(cfg));
  const res = await exec(cfg, `wrtbwmon update ${db} && rm ${db}`);
  if (res.code !== 0) {
    throw new DeviceCommandError(res.stderr.trim() || "Failed to reset the usage database");
  }
  return { ok: true };
}

/** Official `Flag.write` override: move the database file, then store the flag. */
export async function setPersist(cfg: DeviceConfig, persist: boolean): Promise<{ ok: true }> {
  const from = persist ? WRTBWMON_DB_TMP : WRTBWMON_DB_PERSIST;
  const to = usageDatabasePath(persist);
  // The official writer ignores a missing source file, and so do we.
  await exec(cfg, `mv ${from} ${to} 2>/dev/null || true`);
  const res = await exec(
    cfg,
    chain(uciSet("wrtbwmon", "general", "persist", persist ? "1" : "0"), uciCommit("wrtbwmon")),
  );
  if (res.code !== 0) {
    throw new DeviceCommandError(res.stderr.trim() || "Failed to save the wrtbwmon settings");
  }
  return { ok: true };
}

/** Official `custom.lua` `cfgvalue`: the file may not exist yet. */
export async function getUserFile(cfg: DeviceConfig): Promise<string> {
  const res = await exec(cfg, `cat ${WRTBWMON_USER_FILE} 2>/dev/null`);
  return res.stdout.replace(/\r\n/g, "\n");
}

/** Official `custom.lua` `write`: normalise line endings, write the whole file. */
export async function setUserFile(cfg: DeviceConfig, content: string): Promise<{ ok: true }> {
  const body = content.replace(/\r\n?/g, "\n");
  const res = await execWithInput(cfg, `cat > ${WRTBWMON_USER_FILE}`, body);
  if (res.code !== 0) {
    throw new DeviceCommandError(res.stderr.trim() || "Failed to write the user file");
  }
  return { ok: true };
}

/** Official `check_dependency()`: the traffic counters need iptables. */
export async function checkDependency(cfg: DeviceConfig): Promise<boolean> {
  const res = await exec(cfg, "opkg list-installed iptables 2>/dev/null | head -1");
  return res.stdout.trim().length > 0;
}
