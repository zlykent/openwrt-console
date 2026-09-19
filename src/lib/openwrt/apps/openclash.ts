import type { AppSchema } from "../uci-schema";

/**
 * luci-app-openclash — "OpenClash" (Clash for OpenWrt).
 *
 * Mirrors the main options of the official CBI model (`openclash/settings.lua`)
 * against the named `config` section of the `openclash` UCI config: ports,
 * dashboard access, DNS / proxy mode and the update switches. The official
 * package additionally manages Clash YAML profiles, which stay out of UCI and
 * are edited through the Clash dashboard linked below.
 */

const EN_MODES = [
  { value: "redir-host", label: "redir-host" },
  { value: "fake-ip", label: "fake-ip" },
].map((o) => o);

const PROXY_MODES = ["rule", "global", "direct"].map((v) => ({ value: v, label: v }));

const LOG_LEVELS = ["silent", "error", "warning", "info", "debug"].map((v) => ({
  value: v,
  label: v,
}));

export const openclash: AppSchema = {
  slug: "openclash",
  name: "OpenClash",
  config: "openclash",
  links: [{ label: "Clash dashboard", href: "http://192.168.3.5:9090/ui" }],
  sections: [
    {
      type: "openclash",
      named: "config",
      fields: [
        { option: "http_port", kind: "int", min: 1, max: 65535, default: "7890" },
        { option: "socks_port", kind: "int", min: 1, max: 65535, default: "7891" },
        { option: "mixed_port", kind: "int", min: 1, max: 65535, default: "7893" },
        { option: "proxy_port", kind: "int", min: 1, max: 65535, default: "7892" },
        { option: "tproxy_port", kind: "int", min: 1, max: 65535, default: "7895" },
        { option: "dns_port", kind: "int", min: 1, max: 65535, default: "7874" },
        { option: "cn_port", kind: "int", min: 1, max: 65535, default: "9090" },
        { option: "dashboard_password", kind: "password" },
        { option: "en_mode", kind: "select", options: EN_MODES, default: "redir-host" },
        { option: "proxy_mode", kind: "select", options: PROXY_MODES, default: "rule" },
        { option: "log_level", kind: "select", options: LOG_LEVELS, default: "silent" },
        { option: "ipv6_enable", kind: "bool", default: false },
        { option: "ipv6_dns", kind: "bool", default: false },
        { option: "enable_redirect_dns", kind: "bool", default: true },
        { option: "enable_custom_dns", kind: "bool", default: false },
        { option: "enable_custom_clash_rules", kind: "bool", default: false },
        { option: "intranet_allowed", kind: "bool", default: true },
        { option: "enable_udp_proxy", kind: "bool", default: true },
        { option: "disable_udp_quic", kind: "bool", default: true },
        { option: "disable_masq_cache", kind: "bool", default: false },
        { option: "update", kind: "bool", default: false },
        { option: "auto_update_time", kind: "text", default: "0" },
        { option: "servers_update", kind: "bool", default: false },
        { option: "other_rule_auto_update", kind: "bool", default: false },
      ],
    },
  ],
};
