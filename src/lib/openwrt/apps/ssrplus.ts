import type { AppSchema, FieldDef } from "../uci-schema";

/**
 * luci-app-ssr-plus — "ShadowSocksR Plus+".
 *
 * Mirrors the core of the official CBI models: `client.lua` (global main
 * server / running mode), `servers.lua` (subscription settings), the access
 * control and socks5 sections, `server.lua` (local server side) and the
 * add/remove-able `servers` node sections edited by `server-config.lua`.
 * Runtime-built ListValues (server pickers) are selects fed from the
 * `servers` sections; port sets stay plain text fields.
 */

const RUN_MODES = [
  { value: "gfwlist", label: "GFW List" },
  { value: "chnroute", label: "Not China Mainland" },
  { value: "router", label: "Global" },
  { value: "oversea", label: "China Mainland" },
];

/** Official node pickers: a ListValue over every `servers` section. */
const SERVER_PICKER: NonNullable<FieldDef["optionsFrom"]> = {
  section: "servers",
  labelOption: "alias",
  prepend: [{ value: "nil", label: "Close" }],
};

export const ssrplus: AppSchema = {
  slug: "ssrplus",
  name: "ShadowSocksR Plus+",
  config: "shadowsocksr",
  service: "shadowsocksr",
  sections: [
    {
      type: "global",
      fields: [
        { option: "global_server", kind: "select", optionsFrom: SERVER_PICKER, default: "nil" },
        { option: "udp_relay_server", kind: "select", optionsFrom: SERVER_PICKER },
        { option: "netflix_server", kind: "select", optionsFrom: SERVER_PICKER, default: "nil" },
        { option: "netflix_proxy", kind: "bool", default: false },
        { option: "threads", kind: "text", default: "0" },
        { option: "run_mode", kind: "select", options: RUN_MODES, default: "router" },
        { option: "dports", kind: "text", default: "2" },
        { option: "pdnsd_enable", kind: "text", default: "1" },
        { option: "tunnel_forward", kind: "text", default: "8.8.4.4:53" },
        { option: "monitor_enable", kind: "bool", default: true },
        { option: "enable_switch", kind: "bool", default: true },
        { option: "switch_time", kind: "text", default: "667" },
        { option: "switch_timeout", kind: "text", default: "5" },
        { option: "switch_try_count", kind: "text", default: "3" },
        { option: "default_packet_encoding", kind: "text", default: "xudp" },
      ],
    },
    {
      type: "server_subscribe",
      fields: [
        { option: "auto_update", kind: "bool", default: false },
        { option: "auto_update_time", kind: "text", default: "2" },
        { option: "subscribe_url", kind: "dynamiclist" },
        { option: "filter_words", kind: "text" },
        { option: "save_words", kind: "text" },
        { option: "proxy", kind: "bool", default: false },
        { option: "switch", kind: "bool", default: false },
      ],
    },
    {
      type: "access_control",
      fields: [
        { option: "lan_ac_mode", kind: "text", default: "0" },
        { option: "router_proxy", kind: "bool", default: true },
        { option: "wan_fw_ips", kind: "dynamiclist" },
        { option: "Interface", kind: "text", default: "lan" },
      ],
    },
    {
      type: "socks5_proxy",
      fields: [
        { option: "server", kind: "select", optionsFrom: SERVER_PICKER, default: "nil" },
        { option: "local_port", kind: "int", min: 1, max: 65535, default: "1080" },
      ],
    },
    {
      type: "server_global",
      fields: [{ option: "enable_server", kind: "bool", default: false }],
    },
    {
      type: "servers",
      multiple: true,
      titleOption: "alias",
      fields: [
        { option: "alias", kind: "text" },
        { option: "type", kind: "text" },
        { option: "server", kind: "text" },
        { option: "server_port", kind: "int", min: 1, max: 65535 },
        { option: "method", kind: "text" },
        { option: "password", kind: "password" },
        { option: "protocol", kind: "text" },
        { option: "protoparam", kind: "text" },
        { option: "obfs", kind: "text" },
        { option: "obfs_param", kind: "text" },
        { option: "switch_enable", kind: "bool", default: true },
      ],
    },
  ],
};
