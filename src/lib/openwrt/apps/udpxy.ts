import type { AppSchema } from "../uci-schema";

/**
 * luci-app-udpxy — UDP-to-HTTP multicast relay (IPTV stream proxy).
 * Fields mirror the official JS view (applications/luci-app-udpxy):
 * one anonymous, add/remove-able `udpxy` section per instance.
 */
export const udpxy: AppSchema = {
  slug: "udpxy",
  name: "udpxy",
  config: "udpxy",
  sections: [
    {
      type: "udpxy",
      multiple: true,
      fields: [
        // Official view shows "Enabled" backed by an inverted `disabled` flag.
        { option: "disabled", kind: "bool", invert: true, default: false },
        { option: "respawn", kind: "bool", default: false },
        { option: "verbose", kind: "bool", default: false },
        { option: "status", kind: "bool", default: false },
        { option: "bind", kind: "text" },
        { option: "port", kind: "int", min: 1, max: 65535 },
        { option: "source_network", kind: "text" },
        { option: "source", kind: "text" },
        { option: "max_clients", kind: "int", min: 1, max: 5000 },
        { option: "log_file", kind: "text" },
        { option: "buffer_size", kind: "text" },
        { option: "buffer_messages", kind: "int", min: -1 },
        { option: "buffer_time", kind: "int", min: -1 },
        { option: "nice_increment", kind: "int" },
        { option: "mcsub_renew", kind: "int", min: 0, max: 64000 },
      ],
    },
  ],
};
