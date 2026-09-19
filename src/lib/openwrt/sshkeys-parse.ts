/**
 * Pure, isomorphic parsing helpers for dropbear `authorized_keys`. Kept free of
 * any SSH/Node-only imports so client components (the SSH Keys editor) can use
 * `parseSshKeys` without pulling `ssh2` into the browser bundle. The server-side
 * I/O lives in `./sshkeys.ts`.
 */

/**
 * Public keys authorised for password-less root SSH login (dropbear).
 * Stored one key per line in /etc/dropbear/authorized_keys.
 */
export type SshKey = {
  /** Key type, e.g. ssh-ed25519, ssh-rsa, ecdsa-sha2-nistp256. */
  type: string;
  /** Base64 key material. */
  data: string;
  /** Trailing comment/label (optional). */
  comment: string;
};

export type SshKeysState = {
  /** Raw file content for the editor (authoritative). */
  content: string;
  /** Parsed view of the non-comment key lines. */
  keys: SshKey[];
};

const KEY_LINE = /^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-[a-z0-9@.-]+)\s+(\S+)(?:\s+(.*))?$/;

/** Parse authorized_keys content into structured key entries (best effort). */
export function parseSshKeys(content: string): SshKey[] {
  const out: SshKey[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = KEY_LINE.exec(line);
    if (m) {
      out.push({ type: m[1], data: m[3], comment: (m[4] ?? "").trim() });
    } else {
      // Unknown/legacy format — keep the whole line as data so nothing is lost.
      out.push({ type: "", data: line, comment: "" });
    }
  }
  return out;
}
