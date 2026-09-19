import type { AppSchema } from "../uci-schema";

/**
 * luci-app-filebrowser — "FileBrowser" web file explorer.
 *
 * Mirrors the official CBI model (`filebrowser/settings.lua`): the singleton
 * `global` section with enable flag, listen port, web root path and the
 * project storage directory. The official "Manually download" button fetches
 * the binary on the device; it is exposed as a header link to the same
 * release source used by the official download script.
 */
export const filebrowser: AppSchema = {
  slug: "filebrowser",
  name: "FileBrowser",
  config: "filebrowser",
  links: [
    {
      label: "filebrowser.org",
      href: "https://github.com/filebrowser/filebrowser/releases",
    },
  ],
  sections: [
    {
      type: "global",
      fields: [
        { option: "enable", kind: "bool", default: false },
        { option: "port", kind: "int", min: 1, max: 65535, default: "8088", required: true },
        { option: "root_path", kind: "text", default: "/", required: true },
        { option: "project_directory", kind: "text", default: "/tmp", required: true },
      ],
    },
  ],
};
