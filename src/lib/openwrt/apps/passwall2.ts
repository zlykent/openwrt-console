import type { AppSchema } from "../uci-schema";

/**
 * luci-app-passwall2 — "PassWall 2".
 *
 * Mirrors the official CBI models (`client/index.lua` and friends): the
 * `global` main section plus the `global_*` anonymous sections that
 * `uci show passwall2` reports on the device (delay / forwarding / other /
 * rules / app / subscribe) and the `auto_switch` section. Runtime-built
 * node pickers degrade to text fields; `nodes` sections are add/remove-able
 * with their core fields.
 */
export const passwall2: AppSchema = {
  slug: "passwall2",
  name: "PassWall 2",
  config: "passwall2",
  service: "passwall2",
  sections: [
    {
      type: "global",
      labelKey: "main",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "localhost_proxy", kind: "select", options: [
          { value: "0", label: "Disable" },
          { value: "1", label: "Direct" },
          { value: "2", label: "Proxy" },
        ] },
        { option: "socks_enabled", kind: "bool", default: false },
        { option: "node", kind: "select", optionsFrom: {
          section: "nodes",
          labelOption: "remarks",
          prepend: [{ value: "nil", label: "Close" }],
        } },
        { option: "direct_dns_protocol", kind: "text" },
        { option: "remote_dns_protocol", kind: "text" },
        { option: "remote_dns", kind: "text", default: "1.1.1.1" },
        { option: "dns_query_strategy", kind: "select", options: [
          { value: "UseIPv4", label: "Use IPv4" },
          { value: "UseIP", label: "Use IPv4 + IPv6" },
          { value: "UseIPv6", label: "Use IPv6" },
        ] },
        { option: "dns_hosts", kind: "textarea" },
        { option: "close_log", kind: "bool", default: false },
        { option: "loglevel", kind: "select", options: [
          { value: "debug", label: "Debug" },
          { value: "info", label: "Info" },
          { value: "warning", label: "Warning" },
          { value: "error", label: "Error" },
          { value: "none", label: "None" },
        ] },
      ],
    },
    {
      type: "global_delay",
      fields: [
        { option: "auto_on", kind: "bool", default: false },
        { option: "start_daemon", kind: "bool", default: false },
        { option: "start_delay", kind: "int", min: 0, default: "1" },
      ],
    },
    {
      type: "global_forwarding",
      fields: [
        { option: "tcp_no_redir_ports", kind: "text", default: "disable" },
        { option: "udp_no_redir_ports", kind: "text", default: "disable" },
        { option: "tcp_proxy_drop_ports", kind: "text" },
        { option: "udp_proxy_drop_ports", kind: "text" },
        { option: "tcp_redir_ports", kind: "text", default: "80,443" },
        { option: "udp_redir_ports", kind: "text", default: "1:65535" },
        { option: "accept_icmp", kind: "bool", default: false },
        { option: "tcp_proxy_way", kind: "select", options: [
          { value: "redirect", label: "REDIRECT" },
          { value: "tproxy", label: "TPROXY" },
        ] },
        { option: "ipv6_tproxy", kind: "bool", default: false },
        { option: "sniffing", kind: "bool", default: true },
        { option: "route_only", kind: "bool", default: false },
      ],
    },
    {
      type: "global_other",
      fields: [{ option: "nodes_ping", kind: "bool", default: true }],
    },
    {
      type: "global_rules",
      fields: [
        { option: "auto_update", kind: "bool", default: false },
        { option: "geosite_update", kind: "bool", default: false },
        { option: "geoip_update", kind: "bool", default: false },
        { option: "v2ray_location_asset", kind: "text", default: "/usr/share/v2ray/" },
        { option: "geosite_url", kind: "dynamiclist" },
        { option: "geoip_url", kind: "dynamiclist" },
      ],
    },
    {
      type: "global_app",
      fields: [
        { option: "v2ray_file", kind: "text" },
        { option: "xray_file", kind: "text" },
        { option: "brook_file", kind: "text" },
        { option: "hysteria_file", kind: "text" },
      ],
    },
    {
      type: "global_subscribe",
      fields: [
        { option: "subscribe_proxy", kind: "bool", default: false },
        { option: "filter_keyword_mode", kind: "select", options: [
          { value: "0", label: "Disable" },
          { value: "1", label: "Discard list" },
          { value: "2", label: "Keep list" },
        ] },
        { option: "filter_discard_list", kind: "dynamiclist" },
        { option: "filter_keep_list", kind: "dynamiclist" },
      ],
    },
    {
      type: "auto_switch",
      fields: [{ option: "enable", kind: "bool", default: false }],
    },
    {
      type: "nodes",
      multiple: true,
      titleOption: "remarks",
      fields: [
        { option: "remarks", kind: "text" },
        { option: "type", kind: "text", default: "VLESS" },
        { option: "address", kind: "text" },
        { option: "port", kind: "int", min: 1, max: 65535 },
        { option: "method", kind: "text" },
        { option: "password", kind: "password" },
        { option: "uuid", kind: "text" },
        { option: "tls", kind: "bool", default: false },
        { option: "transport", kind: "text" },
        { option: "ws_host", kind: "text" },
        { option: "ws_path", kind: "text", default: "/" },
        { option: "ss_encrypt_method", kind: "text" },
        { option: "tcp_fast_open", kind: "bool", default: false },
      ],
    },
  ],
};
