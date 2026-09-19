import type { DeviceConfig } from "@/lib/config";
import { exec, downloadFile, uploadFile } from "@/lib/ssh/client";
import { shq } from "@/lib/ssh/quote";
import { AppError } from "@/lib/api/errors";

/**
 * luci-app-filetransfer — "FileTransfer" (admin/system/filetransfer).
 *
 * The official page is a triple SimpleForm: a multipart upload into
 * `/tmp/upload/`, a download action that streams any path (directories are
 * tarred on the fly) and a table of `/tmp/upload/*` with Remove plus an
 * Install button that only renders for `.ipk` files.
 */

export const FT_UPLOAD_DIR = "/tmp/upload";

/** Official `IsIpkFile()`: only the last four characters matter. */
export function isIpk(name: string): boolean {
  return name.toLowerCase().slice(-4) === ".ipk";
}

/** Reject path traversal: uploads are flat files inside FT_UPLOAD_DIR. */
export function assertUploadName(name: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(name) || name === "." || name === "..") {
    throw new AppError(`Invalid file name: ${name}`);
  }
  return name;
}

/** Official `getSizeStr()`: divide by 1024 until <= 1024, one decimal. */
export function formatSize(bytes: number): string {
  const units = [" kB", " MB", " GB", " TB"];
  let size = bytes;
  let i = 0;
  do {
    size /= 1024;
    i += 1;
  } while (size > 1024 && i < units.length);
  return `${size.toFixed(1)}${units[Math.min(i, units.length) - 1]}`;
}

/** Official `os.date("%Y-%m-%d %H:%M:%S", attr.mtime)` (device runs UTC). */
export function formatMtime(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

export interface FtFile {
  name: string;
  mtime: string;
  modestr: string;
  size: string;
  isDir: boolean;
  ipk: boolean;
}

export async function listUploads(cfg: DeviceConfig): Promise<FtFile[]> {
  // BusyBox on the device ships no `stat` applet, so the official
  // `luci.fs.stat()` fields are assembled from `ls -ld` (mode), `wc -c`
  // (size) and `date -r` (mtime epoch) instead.
  const res = await exec(
    cfg,
    `mkdir -p ${shq(FT_UPLOAD_DIR)} && cd ${shq(FT_UPLOAD_DIR)} && for f in *; do [ -e "$f" ] || continue; ` +
      `if [ -d "$f" ]; then sz=0; ft=directory; else sz=$(wc -c < "$f" 2>/dev/null || echo 0); ft=file; fi; ` +
      `printf '%s\\t%s\\t%s\\t%s\\t%s\\n' "$f" "$(ls -ld "$f" | cut -c1-10)" "$sz" "$(date -r "$f" +%s 2>/dev/null || echo 0)" "$ft"; done`,
  ).catch(() => null);
  const files: FtFile[] = [];
  for (const line of (res?.stdout ?? "").split("\n")) {
    const [name, modestr, size, mtime, ftype] = line.split("\t");
    if (!name || !modestr) continue;
    const bytes = Number(size ?? 0);
    files.push({
      name,
      modestr,
      size: formatSize(bytes),
      mtime: formatMtime(Number(mtime ?? 0)),
      isDir: (ftype ?? "").startsWith("directory"),
      ipk: isIpk(name),
    });
  }
  return files;
}

export async function removeUpload(cfg: DeviceConfig, name: string): Promise<void> {
  assertUploadName(name);
  await exec(cfg, `rm -f ${shq(`${FT_UPLOAD_DIR}/${name}`)}`);
}

/** Official `btnis.write`: `opkg --force-depends install "/tmp/upload/<name>"`. */
export async function installUpload(cfg: DeviceConfig, name: string): Promise<string> {
  assertUploadName(name);
  if (!isIpk(name)) throw new AppError("Not an ipk package");
  const res = await exec(cfg, `opkg --force-depends install ${shq(`${FT_UPLOAD_DIR}/${name}`)} 2>&1`, {
    timeoutMs: 120_000,
  });
  return `${res.stdout}${res.stderr}`.trim();
}

export async function saveUpload(cfg: DeviceConfig, name: string, data: Buffer): Promise<string> {
  assertUploadName(name);
  await exec(cfg, `mkdir -p ${shq(FT_UPLOAD_DIR)}`);
  await uploadFile(cfg, `${FT_UPLOAD_DIR}/${name}`, data);
  return `${FT_UPLOAD_DIR}/${name}`;
}

/**
 * Official `Download()`: `dlfile` is an arbitrary device path; directories are
 * streamed as `tar -C <path> -cz .` named `<basename>.tar.gz`, plain files
 * verbatim. Bare names resolve inside the upload directory.
 */
export function assertDownloadTarget(target: string): string {
  const t = target.trim();
  if (!t || t.includes("..") || !/^[A-Za-z0-9._/-]{1,256}$/.test(t)) {
    throw new AppError(`Invalid path: ${target}`);
  }
  return t.startsWith("/") ? t : `${FT_UPLOAD_DIR}/${t}`;
}

export async function fetchDownload(
  cfg: DeviceConfig,
  target: string,
): Promise<{ data: Buffer; filename: string }> {
  const path = assertDownloadTarget(target);
  const base = path.split("/").pop() || "download";
  const probe = await exec(cfg, `[ -d ${shq(path)} ] && echo DIR || [ -f ${shq(path)} ] && echo FILE`);
  if ((probe.stdout ?? "").includes("DIR")) {
    const tmp = "/tmp/.filetransfer-download.tar.gz";
    await exec(cfg, `tar -C ${shq(path)} -czf ${shq(tmp)} . && echo OK`);
    try {
      const data = await downloadFile(cfg, tmp);
      return { data, filename: `${base}.tar.gz` };
    } finally {
      await exec(cfg, `rm -f ${shq(tmp)}`).catch(() => null);
    }
  }
  const data = await downloadFile(cfg, path);
  return { data, filename: base };
}
