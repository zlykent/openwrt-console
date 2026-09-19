import type { AppSchema } from "../uci-schema";

/**
 * luci-app-udp2raw — udp2raw-tunnel client.
 *
 * Mirrors the official CBI models (`udp2raw/general.lua` + `udp2raw/servers*.lua`):
 * the named `general` section (server list + daemon user) and the
 * add/remove-able `servers` entries that the server list refers to.
 */

/** OpenWrt's fixed set of system accounts (`cut -d: -f1 /etc/passwd`). */
const USERS = ["root", "daemon", "ftp", "network", "nobody", "ntp", "dnsmasq", "logd", "sshd", "ubus"].map(
  (u) => ({ value: u, label: u }),
);

const RAW_MODES = ["faketcp", "udp", "icmp"].map((v) => ({ value: v, label: v }));
const CIPHER_MODES = ["aes128cbc", "xor", "none"].map((v) => ({ value: v, label: v }));
const AUTH_MODES = ["md5", "crc32", "simple", "none"].map((v) => ({ value: v, label: v }));

export const udp2raw: AppSchema = {
  slug: "udp2raw",
  name: "udp2raw-tunnel",
  config: "udp2raw",
  sections: [
    {
      type: "general",
      named: "general",
      fields: [
        // "nil" is the official sentinel for "disabled".
        { option: "server", kind: "dynamiclist", default: ["nil"] },
        { option: "daemon_user", kind: "select", options: USERS, default: "root" },
      ],
    },
    {
      type: "servers",
      multiple: true,
      titleOption: "alias",
      fields: [
        { option: "alias", kind: "text" },
        { option: "server_addr", kind: "text", required: true },
        { option: "server_port", kind: "int", min: 1, max: 65535 },
        { option: "listen_addr", kind: "ip" },
        { option: "listen_port", kind: "int", min: 1, max: 65535 },
        { option: "raw_mode", kind: "select", options: RAW_MODES, default: "faketcp" },
        { option: "key", kind: "password" },
        { option: "cipher_mode", kind: "select", options: CIPHER_MODES, default: "aes128cbc" },
        { option: "auth_mode", kind: "select", options: AUTH_MODES, default: "md5" },
        { option: "auto_rule", kind: "bool", default: true },
        { option: "keep_rule", kind: "bool", default: false },
        { option: "seq_mode", kind: "int", min: 0, max: 4 },
        { option: "lower_level", kind: "text" },
        { option: "source_ip", kind: "ip" },
        { option: "source_port", kind: "int", min: 1, max: 65535 },
        { option: "log_level", kind: "int", min: 0, max: 6 },
      ],
    },
  ],
};
