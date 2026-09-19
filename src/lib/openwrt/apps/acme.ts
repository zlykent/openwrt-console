import type { AppSchema } from "../uci-schema";

/**
 * luci-app-acme — Let's Encrypt certificate management.
 * Fields mirror /etc/config/acme as edited by the official LuCI view
 * (global `acme` section + multiple `cert` sections).
 */

const KEYLENGTHS = ["ec-256", "ec-384", "2048", "3048", "4096"].map((v) => ({
  value: v,
  label: v,
}));

const DNS_PROVIDERS = [
  { value: "", label: "none" },
  { value: "dns_ali", label: "Aliyun" },
  { value: "dns_dp", label: "DNSPod" },
  { value: "dns_cf", label: "Cloudflare" },
  { value: "dns_gd", label: "GoDaddy" },
  { value: "dns_lua", label: "LuaDNS" },
  { value: "dns_gcloud", label: "Google Cloud" },
  { value: "dns_linode", label: "Linode" },
  { value: "dns_dgon", label: "DigitalOcean" },
  { value: "dns_namesilo", label: "NameSilo" },
  { value: "dns_he", label: "HE.net" },
  { value: "dns_cfapi", label: "Cloudflare (legacy)" },
];

const DNS_ACTIVE = DNS_PROVIDERS.filter((p) => p.value !== "").map((p) => p.value);

export const acme: AppSchema = {
  slug: "acme",
  name: "ACME (Let's Encrypt)",
  config: "acme",
  service: "acme",
  sections: [
    {
      type: "acme",
      named: "acme",
      fields: [
        { option: "state_dir", kind: "text", default: "/etc/acme" },
        { option: "account_email", kind: "text" },
        { option: "debug", kind: "bool", default: false },
        { option: "use_staging", kind: "bool", default: false },
      ],
    },
    {
      type: "cert",
      multiple: true,
      titleOption: "name",
      tabs: [
        {
          id: "general",
          fields: [
            { option: "enabled", kind: "bool", default: false },
            { option: "name", kind: "text", required: true },
            { option: "keylength", kind: "select", options: KEYLENGTHS, default: "ec-256" },
            { option: "domains", kind: "dynamiclist", required: true },
            { option: "days", kind: "int", min: 1, max: 89 },
          ],
        },
        {
          id: "validation",
          fields: [
            { option: "webroot", kind: "text", default: "/var/run/acme" },
            { option: "standalone", kind: "bool", default: false },
            { option: "dns", kind: "select", options: DNS_PROVIDERS, default: "" },
            { option: "credentials", kind: "dynamiclist", depends: { option: "dns", values: ["*"] } },
            { option: "calias", kind: "text", depends: { option: "dns", values: ["*"] } },
          ],
        },
      ],
    },
  ],
};

export { DNS_ACTIVE };
