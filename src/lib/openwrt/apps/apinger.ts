import type { AppSchema } from "../uci-schema";

/**
 * luci-app-apinger — ICMP/TCP probe monitor for link/alarm watching.
 * Fields follow the official OpenWrt UCI defaults for /etc/config/apinger
 * (a singleton `main` section plus multiple `alarm` sections). Per-target
 * device sections are not modelled yet.
 * TODO(verify): confirm options + add `device`/`target` sections against live
 * `uci show apinger` / official view.js once a device is reachable.
 */

export const apinger: AppSchema = {
  slug: "apinger",
  name: "Apinger",
  config: "apinger",
  service: "apinger",
  sections: [
    {
      type: "apinger",
      named: "main",
      fields: [
        { option: "enabled", kind: "bool", default: true },
        { option: "user", kind: "text", default: "root" },
        { option: "group", kind: "text", default: "root" },
        { option: "config_file", kind: "text", default: "/var/run/apinger.conf" },
        { option: "status_file", kind: "text", default: "/var/run/apinger.status" },
        { option: "delay", kind: "int", default: "10" },
      ],
    },
    {
      type: "alarm",
      multiple: true,
      titleOption: "name",
      fields: [
        { option: "name", kind: "text", required: true },
        { option: "command", kind: "text" },
      ],
    },
  ],
};
