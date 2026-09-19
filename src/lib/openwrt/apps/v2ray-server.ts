import type { AppSchema } from "../uci-schema";

/**
 * luci-app-v2ray-server — "V2ray Server".
 *
 * Mirrors the official CBI models (`v2ray_server/index.lua` list +
 * `v2ray_server/user.lua` editor): the `global` enable flag and the
 * add/remove-able `user` sections (one per listening instance).
 */

const PROTOCOLS = [
  { value: "vmess", label: "Vmess" },
  { value: "vless", label: "VLESS" },
  { value: "http", label: "HTTP" },
  { value: "socks", label: "Socks" },
  { value: "shadowsocks", label: "Shadowsocks" },
  { value: "trojan", label: "Trojan" },
  { value: "mtproto", label: "MTProto" },
];

const SS_METHODS = [
  "aes-128-cfb",
  "aes-256-cfb",
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20",
  "chacha20-ietf",
  "chacha20-poly1305",
  "chacha20-ietf-poly1305",
].map((v) => ({ value: v, label: v }));

const SS_NETWORK = [
  { value: "tcp", label: "TCP" },
  { value: "udp", label: "UDP" },
  { value: "tcp,udp", label: "TCP,UDP" },
];

const FLOWS = [
  "xtls-rprx-origin",
  "xtls-rprx-origin-udp443",
  "xtls-rprx-direct",
].map((v) => ({ value: v, label: v }));

const AUTH_PROTOCOLS = { option: "protocol", values: ["socks", "http", "shadowsocks"] };

export const v2rayServer: AppSchema = {
  slug: "v2ray-server",
  name: "V2ray Server",
  config: "v2ray_server",
  service: "v2ray_server",
  sections: [
    {
      type: "global",
      fields: [{ option: "enable", kind: "bool", default: false }],
    },
    {
      type: "user",
      multiple: true,
      titleOption: "remarks",
      fields: [
        { option: "enable", kind: "bool", default: true },
        { option: "remarks", kind: "text", required: true },
        { option: "protocol", kind: "select", options: PROTOCOLS, default: "vmess" },
        { option: "port", kind: "int", min: 1, max: 65535, required: true },
        { option: "auth", kind: "bool", default: false, depends: { option: "protocol", values: ["socks", "http"] } },
        { option: "username", kind: "text", depends: { option: "auth", values: ["1"] } },
        { option: "password", kind: "password", depends: AUTH_PROTOCOLS },
        { option: "mtproto_password", kind: "password", depends: { option: "protocol", values: ["mtproto"] } },
        { option: "decryption", kind: "text", default: "none", depends: { option: "protocol", values: ["vless"] } },
        { option: "v_ss_encrypt_method", kind: "select", options: SS_METHODS, depends: { option: "protocol", values: ["shadowsocks"] } },
        { option: "ss_network", kind: "select", options: SS_NETWORK, default: "tcp,udp", depends: { option: "protocol", values: ["shadowsocks"] } },
        { option: "uuid", kind: "dynamiclist", depends: { option: "protocol", values: ["vmess", "vless", "trojan"] } },
        { option: "alter_id", kind: "int", default: "16", depends: { option: "protocol", values: ["vmess"] } },
        { option: "level", kind: "int", default: "1" },
        { option: "tls", kind: "bool", default: false, depends: { option: "protocol", values: ["vmess", "vless", "socks", "shadowsocks"] } },
        { option: "xtls", kind: "bool", default: false, depends: { option: "tls", values: ["1"] } },
        { option: "flow", kind: "select", options: FLOWS, default: "xtls-rprx-direct", depends: { option: "xtls", values: ["1"] } },
      ],
    },
  ],
};
