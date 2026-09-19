import type { AppSchema } from "../uci-schema";

/**
 * luci-app-ssr-mudb-server — "SSR MuDB Server".
 *
 * Mirrors the official CBI model (`ssr_mudb_server/index.lua`): the anonymous
 * `global` section with the enable flag and the traffic auto-clear pair. The
 * official page renders the MuDB user list from a JSON file with per-user
 * enable toggles; those users are managed by the MuDB backend itself and are
 * shown read-only through the service status on the device.
 */
export const ssrMudbServer: AppSchema = {
  slug: "ssr-mudb-server",
  name: "SSR MuDB Server",
  config: "ssr_mudb_server",
  service: "ssr_mudb_server",
  sections: [
    {
      type: "global",
      fields: [
        { option: "enable", kind: "bool", default: false },
        { option: "auto_clear_transfer", kind: "bool", default: false },
        {
          option: "auto_clear_transfer_time",
          kind: "text",
          default: "0,2,1,*,*",
          depends: { option: "auto_clear_transfer", values: ["1"] },
        },
      ],
    },
  ],
};
