import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import type { ProcessInfo } from "./types";
import { AppError, DeviceCommandError } from "@/lib/api/errors";

/**
 * Parse busybox `top -bn1` output. The process table starts after the
 * `PID PPID USER STAT VSZ %VSZ %CPU COMMAND` header line.
 */
export function parseTop(text: string): ProcessInfo[] {
  const out: ProcessInfo[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || !/^\d+\s+\d+\s+\S+/.test(line)) continue;
    const m = line.match(
      /^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s+([\d.]+)%\s+([\d.]+)%\s+(.*)$/,
    );
    if (!m) continue;
    out.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      user: m[3],
      stat: m[4],
      vsz: Number(m[5]),
      pctMem: Number(m[6]),
      pctCpu: Number(m[7]),
      command: m[8].trim(),
    });
  }
  return out;
}

export async function getProcesses(cfg: DeviceConfig): Promise<ProcessInfo[]> {
  const res = await exec(cfg, "top -bn1 2>/dev/null");
  return parseTop(res.stdout);
}

/** Send a signal to a process. `pid` is strictly validated as an integer. */
export async function killProcess(
  cfg: DeviceConfig,
  pid: number,
  signal: "term" | "kill" = "term",
): Promise<{ ok: true }> {
  if (!Number.isInteger(pid) || pid <= 1) throw new AppError(`Invalid pid: ${pid}`);
  const flag = signal === "kill" ? "-9" : "-15";
  const res = await exec(cfg, `kill ${flag} ${pid} 2>&1`);
  if (res.code !== 0) throw new DeviceCommandError(res.stderr.trim() || res.stdout.trim() || `kill failed (${res.code})`);
  return { ok: true };
}
