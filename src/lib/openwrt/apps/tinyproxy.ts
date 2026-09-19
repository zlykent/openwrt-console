import type { AppSchema } from "../uci-schema";

/**
 * luci-app-tinyproxy — small, fast non-caching HTTP(S) proxy.
 *
 * Fields, tabs, defaults and dependencies mirror the official CBI model
 * (`model/cbi/tinyproxy.lua`): one anonymous `tinyproxy` section split over
 * four tabs, plus add/remove-able `upstream` proxy rules.
 */

const LOG_LEVELS = ["Critical", "Error", "Warning", "Notice", "Connect", "Info"].map(
  (v) => ({ value: v, label: v }),
);

export const tinyproxy: AppSchema = {
  slug: "tinyproxy",
  name: "Tinyproxy",
  config: "tinyproxy",
  sections: [
    {
      type: "tinyproxy",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "enabled", kind: "bool", default: false },
            { option: "Port", kind: "int", min: 1, max: 65535, default: "8888" },
            { option: "Listen", kind: "ip" },
            { option: "Bind", kind: "ip" },
            {
              option: "DefaultErrorFile",
              kind: "text",
              default: "/usr/share/tinyproxy/default.html",
            },
            { option: "StatFile", kind: "text", default: "/usr/share/tinyproxy/stats.html" },
            { option: "Syslog", kind: "bool", default: false },
            {
              option: "LogFile",
              kind: "text",
              default: "/var/log/tinyproxy.log",
              // Official: `o:depends("Syslog", "")` — only when syslog is off.
              depends: { option: "Syslog", values: ["0"] },
            },
            { option: "LogLevel", kind: "select", options: LOG_LEVELS, default: "Info" },
            { option: "User", kind: "text", default: "nobody" },
            { option: "Group", kind: "text", default: "nogroup" },
          ],
        },
        {
          id: "privacy",
          fields: [
            { option: "XTinyproxy", kind: "bool", default: false },
            { option: "ViaProxyName", kind: "text" },
            { option: "Anonymous", kind: "dynamiclist", default: [] },
          ],
        },
        {
          id: "filter",
          fields: [
            { option: "Allow", kind: "dynamiclist", default: [] },
            { option: "ConnectPort", kind: "dynamiclist", default: [] },
            { option: "Filter", kind: "text" },
            { option: "FilterURLs", kind: "bool", default: false },
            { option: "FilterExtended", kind: "bool", default: false },
            { option: "FilterCaseSensitive", kind: "bool", default: false },
            { option: "FilterDefaultDeny", kind: "bool", default: false },
          ],
        },
        {
          id: "limits",
          fields: [
            { option: "Timeout", kind: "int", min: 0, default: "600" },
            { option: "MaxClients", kind: "int", min: 0, default: "10" },
            { option: "MinSpareServers", kind: "int", min: 0, default: "5" },
            { option: "MaxSpareServers", kind: "int", min: 0, default: "10" },
            { option: "StartServers", kind: "int", min: 0, default: "5" },
            { option: "MaxRequestsPerChild", kind: "int", min: 0, default: "0" },
          ],
        },
      ],
    },
    {
      type: "upstream",
      multiple: true,
      titleOption: "target",
      fields: [
        {
          option: "type",
          kind: "select",
          options: [
            { value: "proxy", label: "Via proxy" },
            { value: "reject", label: "Reject access" },
          ],
          default: "proxy",
        },
        { option: "target", kind: "text" },
        { option: "via", kind: "text", depends: { option: "type", values: ["proxy"] } },
      ],
    },
  ],
};
