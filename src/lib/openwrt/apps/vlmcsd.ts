import type { AppSchema } from "../uci-schema";

/**
 * luci-app-vlmcsd — "KMS Server".
 *
 * Mirrors the official CBI models: `basic.lua` (enable + auto activate flags)
 * and `config.lua`, whose TextValue edits `/etc/vlmcsd/vlmcsd.ini` directly.
 * Both official tabs wrap the same `vlmcsd` singleton, hence the label keys.
 */
export const vlmcsd: AppSchema = {
  slug: "vlmcsd",
  name: "KMS Server",
  config: "vlmcsd",
  service: "kms",
  sections: [
    {
      type: "vlmcsd",
      labelKey: "basic",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "autoactivate", kind: "bool", default: false },
      ],
    },
    {
      type: "vlmcsd",
      labelKey: "ini",
      fields: [
        { option: "config", kind: "textarea", file: "/etc/vlmcsd/vlmcsd.ini" },
      ],
    },
  ],
};
