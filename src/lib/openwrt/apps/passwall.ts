import type { AppSchema } from "../uci-schema";

/**
 * luci-app-passwall — "PassWall".
 *
 * Mirrors the official CBI models: `log.lua` is a viewer (handled elsewhere),
 * `client/index.lua` renders the `global` main section plus the `global_*`
 * anonymous sections (haproxy / delay / forwarding / other / rules) that the
 * device stores under `uci passwall`. Runtime-built ListValues (node
 * pickers) are rendered as selects fed from the `nodes` sections; add/remove-
 * able `nodes` sections keep their core fields so they can be created here.
 */
export const passwall: AppSchema = {
  slug: "passwall",
  name: "PassWall",
  config: "passwall",
  sections: [
    {
      type: "global",
      labelKey: "main",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "socks_enabled", kind: "bool", default: false },
        { option: "tcp_node", kind: "select", optionsFrom: {
          section: "nodes",
          labelOption: "remarks",
          prepend: [{ value: "nil", label: "Close" }],
        } },
        { option: "udp_node", kind: "select", optionsFrom: {
          section: "nodes",
          labelOption: "remarks",
          prepend: [{ value: "nil", label: "Close" }],
        } },
        { option: "dns_mode", kind: "select", options: [
          { value: "dns2tcp", label: "Requery DNS By TCP" },
          { value: "dns2socks", label: "dns2socks" },
          { value: "v2ray", label: "V2ray" },
          { value: "xray", label: "Xray" },
          { value: "udp", label: "Requery DNS By UDP" },
        ] },
        { option: "remote_dns", kind: "text", default: "1.1.1.1" },
        { option: "filter_proxy_ipv6", kind: "bool", default: false },
        { option: "tcp_proxy_mode", kind: "select", options: [
          { value: "disable", label: "Disable" },
          { value: "proxy", label: "Proxy" },
          { value: "bypass", label: "Bypass" },
        ] },
        { option: "udp_proxy_mode", kind: "select", options: [
          { value: "disable", label: "Disable" },
          { value: "proxy", label: "Proxy" },
          { value: "bypass", label: "Bypass" },
        ] },
        { option: "localhost_tcp_proxy_mode", kind: "select", options: [
          { value: "direct", label: "Direct" },
          { value: "proxy", label: "Proxy" },
        ] },
        { option: "localhost_udp_proxy_mode", kind: "select", options: [
          { value: "direct", label: "Direct" },
          { value: "proxy", label: "Proxy" },
        ] },
        { option: "close_log_tcp", kind: "bool", default: false },
        { option: "close_log_udp", kind: "bool", default: false },
        { option: "loglevel", kind: "select", options: [
          { value: "debug", label: "Debug" },
          { value: "info", label: "Info" },
          { value: "warning", label: "Warning" },
          { value: "error", label: "Error" },
          { value: "none", label: "None" },
        ] },
        { option: "trojan_loglevel", kind: "select", options: [
          { value: "debug", label: "Debug" },
          { value: "info", label: "Info" },
          { value: "warn", label: "Warn" },
          { value: "error", label: "Error" },
          { value: "fatal", label: "Fatal" },
          { value: "off", label: "Off" },
        ] },
      ],
    },
    {
      type: "global_haproxy",
      fields: [{ option: "balancing_enable", kind: "bool", default: false }],
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
        { option: "chnlist_update", kind: "bool", default: true },
        { option: "chnroute_update", kind: "bool", default: true },
        { option: "chnroute6_update", kind: "bool", default: true },
        { option: "gfwlist_update", kind: "bool", default: true },
        { option: "geosite_update", kind: "bool", default: false },
        { option: "geoip_update", kind: "bool", default: false },
        { option: "chnlist_url", kind: "dynamiclist" },
        { option: "chnroute_url", kind: "dynamiclist" },
        { option: "chnroute6_url", kind: "dynamiclist" },
        { option: "gfwlist_url", kind: "dynamiclist" },
        { option: "geosite_url", kind: "dynamiclist" },
        { option: "geoip_url", kind: "dynamiclist" },
      ],
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
