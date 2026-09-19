import type { AppSchema } from "../uci-schema";

/**
 * luci-app-adguardhome — AdGuard Home DNS proxy manager.
 * Fields follow the official OpenWrt UCI defaults for the `config` section of
 * /etc/config/adguardhome (upstream filters themselves live in the AdGuardHome
 * YAML and are not modelled here).
 * TODO(verify): confirm every option against live `uci show adguardhome` /
 * official view.js once a device is reachable.
 */

export const adguardhome: AppSchema = {
  slug: "adguardhome",
  name: "AdGuard Home",
  config: "adguardhome",
  service: "adguardhome",
  sections: [
    {
      type: "adguardhome",
      named: "config",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "enabled", kind: "bool", default: false },
            { option: "binfile", kind: "text", default: "/usr/bin/AdGuardHome" },
            { option: "workdir", kind: "text", default: "/usr/bin/AdGuardHome" },
            { option: "configpath", kind: "text", default: "/etc/AdGuardHome/AdGuardHome.yaml" },
            { option: "user", kind: "text", default: "root" },
            { option: "group", kind: "text", default: "root" },
            { option: "autoupdate", kind: "bool", default: false },
          ],
        },
        {
          id: "network",
          fields: [
            { option: "redirectport", kind: "int", default: "53" },
            { option: "httpport", kind: "int", default: "3000" },
            { option: "upstreams", kind: "textarea" },
            { option: "upstreamfile", kind: "text", default: "/etc/AdGuardHome/AdGuardHome_upstream.conf" },
            { option: "additional_param", kind: "textarea" },
          ],
        },
        {
          id: "logging",
          fields: [
            { option: "logfile", kind: "text", default: "/var/log/AdGuardHome.log" },
            { option: "loglevel", kind: "select", options: [
              { value: "", label: "default" },
              { value: "verbose", label: "verbose" },
              { value: "debug", label: "debug" },
              { value: "info", label: "info" },
              { value: "warn", label: "warn" },
              { value: "error", label: "error" },
              { value: "fatal", label: "fatal" },
            ] },
            { option: "logmaxsize", kind: "text", default: "128" },
            { option: "logmaxdays", kind: "int", default: "7" },
            { option: "logcompress", kind: "bool", default: false },
            { option: "loglocaltime", kind: "bool", default: false },
            { option: "verbose", kind: "bool", default: false },
          ],
        },
      ],
    },
  ],
};
