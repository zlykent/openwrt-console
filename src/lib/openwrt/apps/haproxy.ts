import type { AppSchema } from "../uci-schema";

/**
 * luci-app-haproxy — "HAProxy" load balancer.
 *
 * Mirrors the official CBI model (`haproxy.lua`): the `arguments` singleton
 * with the enable flag plus the add/remove-able `main_server` / `backup_server`
 * lists.
 */

const SERVER_FIELDS = [
  { option: "server_name", kind: "text" as const, required: true },
  { option: "validate", kind: "bool" as const, default: true },
  { option: "server_ip", kind: "text" as const, required: true },
  { option: "server_port", kind: "int" as const, min: 1, max: 65535 },
  { option: "server_weight", kind: "int" as const, min: 0 },
];

export const haproxy: AppSchema = {
  slug: "haproxy",
  name: "HAProxy",
  config: "haproxy",
  sections: [
    {
      type: "arguments",
      fields: [{ option: "enabled", kind: "bool", default: false }],
    },
    {
      type: "main_server",
      multiple: true,
      titleOption: "server_name",
      fields: SERVER_FIELDS,
    },
    {
      type: "backup_server",
      multiple: true,
      titleOption: "server_name",
      fields: SERVER_FIELDS.slice(0, 4),
    },
  ],
};
