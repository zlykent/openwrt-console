import type { AppSchema } from "../uci-schema";

/**
 * luci-app-aria2 — aria2 download manager.
 * Fields follow the official OpenWrt UCI defaults for the `main` section of
 * /etc/config/aria2. The live RPC session status shown by the official view is
 * not modelled here (config-only page).
 * TODO(verify): confirm every option against live `uci show aria2` /
 * official view.js once a device is reachable.
 */

export const aria2: AppSchema = {
  slug: "aria2",
  name: "Aria2",
  config: "aria2",
  service: "aria2",
  sections: [
    {
      type: "aria2",
      named: "main",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "user", kind: "text", default: "aria2" },
            { option: "dir", kind: "text", default: "/mnt/sda1/aria2" },
            { option: "config_file", kind: "text", default: "/etc/aria2.conf" },
            { option: "file_allocation", kind: "select", default: "none", options: [
              { value: "none", label: "none" },
              { value: "prealloc", label: "prealloc" },
              { value: "falloc", label: "falloc" },
              { value: "trunc", label: "trunc" },
            ] },
          ],
        },
        {
          id: "bt",
          fields: [
            { option: "enable_dht", kind: "bool", default: true },
            { option: "enable_dht6", kind: "bool", default: true },
            { option: "bt_enable_lpd", kind: "bool", default: true },
            { option: "enable_peer_exchange", kind: "bool", default: true },
            { option: "follow_bt", kind: "bool", default: true },
            { option: "follow_torrent", kind: "bool", default: true },
            { option: "dht_listen_port", kind: "int", default: "6801" },
            { option: "listen_port", kind: "int", default: "6800" },
            { option: "bt_tracker", kind: "dynamiclist" },
          ],
        },
        {
          id: "rpc",
          fields: [
            { option: "rpc_listen_port", kind: "int", default: "6800" },
            { option: "rpc_secret", kind: "password" },
          ],
        },
        {
          id: "logging",
          fields: [
            { option: "log", kind: "text" },
            { option: "log_level", kind: "select", default: "notice", options: [
              { value: "debug", label: "debug" },
              { value: "info", label: "info" },
              { value: "notice", label: "notice" },
              { value: "warn", label: "warn" },
              { value: "error", label: "error" },
            ] },
          ],
        },
      ],
    },
  ],
};
