import type { DeviceConfig } from "@/lib/config";
import { exec } from "@/lib/ssh/client";

/** Which firewall backend produced the ruleset dump. */
export type FirewallBackend = "nft" | "iptables" | "none";

export type FirewallRulesetState = {
  backend: FirewallBackend;
  /** True when a non-empty ruleset could be read. */
  supported: boolean;
  /** Raw ruleset text (nft list ruleset / iptables-save). */
  ruleset: string;
};

/**
 * Dump the running firewall ruleset — the read-only counterpart of the
 * firewall config editor, mirroring LuCI's Status → Firewall (nftables /
 * iptables) view.
 *
 * Backend selection is driven by which firewall the device actually runs:
 *  - fw4 (OpenWrt 22.03+) → nftables is authoritative.
 *  - fw3 (legacy) → iptables is authoritative. Such boxes may still have `nft`
 *    loaded by Docker/other services, so `nft list ruleset` alone would show a
 *    misleading partial picture; we therefore prefer `iptables-save` unless fw4
 *    is present.
 */
export async function getFirewallRuleset(
  cfg: DeviceConfig,
): Promise<FirewallRulesetState> {
  const probe = await exec(
    cfg,
    "command -v fw4 >/dev/null 2>&1 && echo fw4",
  ).catch(() => null);
  const isFw4 = probe?.stdout.trim() === "fw4";

  const readNft = () => exec(cfg, "nft list ruleset 2>/dev/null").catch(() => null);
  const readIptablesSave = () =>
    exec(cfg, "iptables-save 2>/dev/null; ip6tables-save 2>/dev/null").catch(() => null);

  // Order the two readers by the detected firewall, then fall back to the other.
  const readers: Array<() => Promise<{ backend: FirewallBackend; text: string } | null>> = isFw4
    ? [
        async () => {
          const r = await readNft();
          return r && r.stdout.trim() ? { backend: "nft", text: r.stdout } : null;
        },
        async () => {
          const r = await readIptablesSave();
          return r && r.stdout.trim() ? { backend: "iptables", text: r.stdout } : null;
        },
      ]
    : [
        async () => {
          const r = await readIptablesSave();
          return r && r.stdout.trim() ? { backend: "iptables", text: r.stdout } : null;
        },
        async () => {
          const r = await readNft();
          return r && r.stdout.trim() ? { backend: "nft", text: r.stdout } : null;
        },
      ];

  for (const read of readers) {
    const res = await read();
    if (res) return { backend: res.backend, supported: true, ruleset: res.text };
  }

  // Last resort: builds without *-save binaries.
  const list = await exec(
    cfg,
    "iptables -L -n -v 2>/dev/null; echo; ip6tables -L -n -v 2>/dev/null",
  ).catch(() => null);
  if (list && list.stdout.trim()) {
    return { backend: "iptables", supported: true, ruleset: list.stdout };
  }
  return { backend: "none", supported: false, ruleset: "" };
}
