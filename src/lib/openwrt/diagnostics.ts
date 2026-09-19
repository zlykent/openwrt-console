import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import type { DiagResult } from "./types";
import { AppError } from "@/lib/api/errors";

export type DiagTool = DiagResult["tool"];

/** Conservative host/IP literal so diagnostics never accept shell metachars. */
const TARGET_RE = /^[A-Za-z0-9._:-]+$/;

function assertTarget(target: string): string {
  const t = target.trim();
  if (!t || t.length > 253 || !TARGET_RE.test(t)) throw new AppError(`Invalid target: ${target}`);
  return t;
}

const TIMEOUT_MS = 30_000;

/**
 * Run a read-only network diagnostic. Only `ping`, `traceroute` and
 * `nslookup` are exposed (the tools present on the device); the target is
 * validated then shell-quoted.
 */
export async function runDiagnostic(
  cfg: DeviceConfig,
  tool: DiagTool,
  target: string,
): Promise<DiagResult> {
  const t = assertTarget(target);
  const quoted = shq(t);
  let command: string;
  switch (tool) {
    case "ping":
      command = `ping -c 4 -W 2 ${quoted} 2>&1`;
      break;
    case "traceroute":
      command = `traceroute -n -m 20 -w 2 ${quoted} 2>&1`;
      break;
    case "nslookup":
      command = `nslookup ${quoted} 2>&1`;
      break;
    default:
      throw new AppError(`Unknown tool: ${tool}`);
  }
  const res = await exec(cfg, command, { timeoutMs: TIMEOUT_MS });
  return { tool, target: t, stdout: res.stdout, stderr: res.stderr, code: res.code };
}
