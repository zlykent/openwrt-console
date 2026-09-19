import type { DeviceConfig } from "@/lib/config";
import { exec, SshError } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import type { PackageInfo } from "./types";

export type PackageResult = { code: number; output: string };

/** opkg package names: letters, digits, and a few punctuation marks only. */
function assertPackageName(name: string): void {
  if (!/^[A-Za-z0-9._+-]+$/.test(name)) {
    throw new SshError("exec", `Invalid package name: ${name}`);
  }
}

/**
 * Parse `opkg list-installed` output. Lines are `name - version`; some feeds
 * append an architecture, so we only split on the first ` - `.
 */
export function parseInstalled(text: string): PackageInfo[] {
  const out: PackageInfo[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const sep = t.indexOf(" - ");
    if (sep < 0) {
      out.push({ name: t, version: "" });
      continue;
    }
    out.push({ name: t.slice(0, sep).trim(), version: t.slice(sep + 3).trim() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInstalled(cfg: DeviceConfig): Promise<PackageInfo[]> {
  const r = await exec(cfg, "opkg list-installed 2>/dev/null", { timeoutMs: 30000 });
  return parseInstalled(r.stdout);
}

function combine(r: { stdout: string; stderr: string }): string {
  return `${r.stdout}${r.stdout && r.stderr ? "\n" : ""}${r.stderr}`.trim();
}

export async function updateLists(cfg: DeviceConfig): Promise<PackageResult> {
  const r = await exec(cfg, "opkg update 2>&1", { timeoutMs: 90000 });
  return { code: r.code ?? -1, output: combine(r) };
}

export async function installPackage(cfg: DeviceConfig, name: string): Promise<PackageResult> {
  assertPackageName(name);
  const r = await exec(cfg, `opkg install ${shq(name)} 2>&1`, { timeoutMs: 180000 });
  return { code: r.code ?? -1, output: combine(r) };
}

export async function removePackage(cfg: DeviceConfig, name: string): Promise<PackageResult> {
  assertPackageName(name);
  const r = await exec(cfg, `opkg remove ${shq(name)} 2>&1`, { timeoutMs: 120000 });
  return { code: r.code ?? -1, output: combine(r) };
}
