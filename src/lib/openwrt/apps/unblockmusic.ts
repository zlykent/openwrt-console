import type { AppSchema } from "../uci-schema";

/**
 * luci-app-unblockmusic — "Unblock NetEase Cloud Music".
 *
 * Mirrors the official CBI model: the singleton `unblockmusic` section (the
 * official page is authored in Chinese, including its option titles) and the
 * add/remove-able `acl_rule` exception list. The official certificate
 * DummyValue button is exposed as a header link.
 */

const APP_TYPES = [
  { value: "go", label: "Golang version" },
  { value: "nodejs", label: "NodeJS version" },
  { value: "cloud", label: "Cloud unlock (CTCGFW server)" },
];

const MUSIC_SOURCES = [
  { value: "default", label: "Default" },
  { value: "netease", label: "NetEase Music" },
  { value: "qq", label: "QQ Music" },
  { value: "baidu", label: "Baidu Music" },
  { value: "kugou", label: "Kugou Music" },
  { value: "kuwo", label: "Kuwo Music" },
  { value: "migu", label: "Migu Music" },
  { value: "joox", label: "JOOX Music" },
];

const REPLACE_SOURCES = [
  { value: "0", label: "Never force replace" },
  { value: "192000", label: "When quality below 192 Kbps (medium)" },
  { value: "320000", label: "When quality below 320 Kbps (high)" },
  { value: "600000", label: "When quality below 999 Kbps (lossless)" },
];

const FILTER_MODES = [
  { value: "disable", label: "Bypass HTTP and HTTPS" },
  { value: "http", label: "Bypass HTTP" },
  { value: "https", label: "Bypass HTTPS" },
];

const LOCAL_ENGINES = { option: "apptype", values: ["nodejs", "go"] };

export const unblockmusic: AppSchema = {
  slug: "unblockmusic",
  name: "Unblock NetEase Music",
  config: "unblockmusic",
  links: [
    {
      label: "CA root certificate (ca.crt)",
      href: "https://raw.githubusercontent.com/UnblockNeteaseMusic/server/enhanced/ca.crt",
    },
  ],
  sections: [
    {
      type: "unblockmusic",
      fields: [
        { option: "enabled", kind: "bool", default: false },
        { option: "apptype", kind: "select", options: APP_TYPES, default: "go" },
        {
          option: "musicapptype",
          kind: "select",
          options: MUSIC_SOURCES,
          default: "kuwo",
          depends: LOCAL_ENGINES,
        },
        { option: "cloudserver", kind: "text", depends: { option: "apptype", values: ["cloud"] } },
        { option: "search_limit", kind: "int", min: 0, max: 3, default: "0", depends: { option: "apptype", values: ["go"] } },
        { option: "flac_enabled", kind: "bool", default: true, depends: LOCAL_ENGINES },
        {
          option: "replace_music_source",
          kind: "select",
          options: REPLACE_SOURCES,
          default: "0",
          depends: { option: "apptype", values: ["nodejs"] },
        },
        { option: "local_vip", kind: "bool", default: false, depends: { option: "apptype", values: ["nodejs"] } },
        { option: "autoupdate", kind: "bool", default: true, depends: { option: "apptype", values: ["nodejs"] } },
      ],
    },
    {
      type: "acl_rule",
      multiple: true,
      fields: [
        { option: "ipaddr", kind: "ip" },
        { option: "filter_mode", kind: "select", options: FILTER_MODES, default: "disable" },
      ],
    },
  ],
};
