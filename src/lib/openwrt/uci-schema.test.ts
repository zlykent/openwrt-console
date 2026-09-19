import { describe, expect, it } from "vitest";
import {
  candidateSources,
  defaultInstance,
  encodeField,
  fieldKey,
  isValidHostnameValue,
  isValidIpValue,
  isValidMacValue,
  isValidValue,
  planWrite,
  readAppConfig,
  sectionFields,
  sectionKey,
  validateInstances,
  type AppSchema,
  type FieldDef,
  type SectionDef,
} from "./uci-schema";
import { parseUciShow } from "./uci";
import { APP_LIST, APP_REGISTRY } from "./apps";

/** Realistic `uci -q show acme` output: named global section + anonymous cert. */
const ACME_SHOW = [
  "acme.acme=acme",
  "acme.acme.state_dir='/etc/acme'",
  "acme.acme.account_email='admin@example.com'",
  "acme.acme.debug='0'",
  "acme.acme.use_staging='0'",
  "acme.@cert[0]=cert",
  "acme.@cert[0].name='letsencrypt'",
  "acme.@cert[0].enabled='1'",
  "acme.@cert[0].keylength='ec-256'",
  "acme.@cert[0].domains='example.com' 'www.example.com'",
  "acme.@cert[0].validation_method='webroot'",
  "acme.@cert[0].webroot='/var/www'",
].join("\n");

const testSchema: AppSchema = {
  slug: "acme",
  name: "ACME",
  config: "acme",
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
      fields: [
        { option: "name", kind: "text" },
        { option: "enabled", kind: "bool", default: true },
        { option: "domains", kind: "dynamiclist" },
        { option: "keylength", kind: "select", default: "ec-256", options: [{ value: "ec-256", label: "ec-256" }] },
        { option: "days", kind: "int", default: "60" },
        { option: "validation_method", kind: "select" },
        { option: "webroot", kind: "text", depends: { option: "validation_method", values: ["webroot"] } },
      ],
    },
  ],
};

const currentSections = () => parseUciShow(ACME_SHOW);

describe("parseUciShow", () => {
  it("parses named and anonymous sections with values and lists", () => {
    const sections = currentSections();
    expect(sections).toHaveLength(2);

    const global = sections[0];
    expect(global).toMatchObject({ type: "acme", name: "acme", anonymous: false });
    expect(global.options.state_dir).toBe("/etc/acme");
    expect(global.options.account_email).toBe("admin@example.com");

    const cert = sections[1];
    expect(cert).toMatchObject({ type: "cert", name: "@cert[0]", anonymous: true, index: 0 });
    expect(cert.options.domains).toEqual(["example.com", "www.example.com"]);
  });

  it("keeps quoted values containing spaces intact", () => {
    const [sec] = parseUciShow("cfg.sec=type\ncfg.sec.comment='hello world'");
    expect(sec.options.comment).toBe("hello world");
  });
});

describe("readAppConfig", () => {
  it("groups instances by schema sections and applies defaults", () => {
    const state = readAppConfig(testSchema, ACME_SHOW, true);
    expect(state.present).toBe(true);
    expect(state.groups.map((g) => g.type)).toEqual(["acme", "cert"]);

    const [globalGroup, certGroup] = state.groups;
    expect(globalGroup.instances).toHaveLength(1);
    expect(globalGroup.instances[0].ref).toBe("acme");
    expect(globalGroup.instances[0].values).toMatchObject({
      state_dir: "/etc/acme",
      account_email: "admin@example.com",
      debug: false,
      use_staging: false,
    });

    const cert = certGroup.instances[0];
    expect(cert.ref).toBe("@cert[0]");
    expect(cert.values.name).toBe("letsencrypt");
    expect(cert.values.enabled).toBe(true);
    expect(cert.values.domains).toEqual(["example.com", "www.example.com"]);
    // missing option falls back to the field default
    expect(cert.values.days).toBe("60");
  });

  it("returns empty groups when the config is absent", () => {
    const state = readAppConfig(testSchema, "", false);
    expect(state.present).toBe(false);
    expect(state.groups.every((g) => g.instances.length === 0)).toBe(true);
  });
});

describe("encodeField", () => {
  const certDef = testSchema.sections[1];
  const fields = Object.fromEntries(sectionFields(certDef).map((f) => [f.option, f]));

  it("normalizes booleans to 0/1", () => {
    expect(encodeField(fields.enabled, true)).toBe("1");
    expect(encodeField(fields.enabled, false)).toBe("0");
  });

  it("drops empty entries from lists", () => {
    expect(encodeField(fields.domains, ["a.com", "", "b.com"])).toEqual(["a.com", "b.com"]);
  });
});

describe("defaultInstance", () => {
  it("builds a new instance from field defaults", () => {
    const inst = defaultInstance(testSchema.sections[1]);
    expect(inst.ref).toBeNull();
    expect(inst.type).toBe("cert");
    expect(inst.values.enabled).toBe(true);
    expect(inst.values.keylength).toBe("ec-256");
    expect(inst.values.domains).toEqual([]);
  });

  it("keeps a device-derived default only when that device exists", () => {
    // arpbind's ifname defaults to br-lan, which a router without a bridge
    // does not have: LuCI's ListValue cannot hold it, so neither may we.
    const def: SectionDef = {
      type: "bind",
      fields: [
        { option: "ifname", kind: "select", default: "br-lan", required: true, candidates: "devices" },
      ],
    };
    expect(defaultInstance(def).values.ifname).toBe("br-lan");
    expect(defaultInstance(def, { devices: ["br-lan", "eth0"] }).values.ifname).toBe("br-lan");
    expect(defaultInstance(def, { devices: ["eth0", "sit0"] }).values.ifname).toBe("eth0");
    // No live list (device probe failed): fall back to the declared default.
    expect(defaultInstance(def, { devices: [] }).values.ifname).toBe("br-lan");
  });
});

describe("planWrite", () => {
  const readBack = () => readAppConfig(testSchema, ACME_SHOW, true);

  it("emits no commands when nothing changed", () => {
    const state = readBack();
    const payload = state.groups.flatMap((g) => g.instances);
    expect(planWrite(testSchema, currentSections(), payload)).toEqual([]);
  });

  it("emits uci set only for changed options", () => {
    const state = readBack();
    const payload = state.groups.flatMap((g) => g.instances);
    payload[0].values.account_email = "ops@example.com";
    expect(planWrite(testSchema, currentSections(), payload)).toEqual([
      "uci set 'acme.acme.account_email'='ops@example.com'",
    ]);
  });

  it("encodes booleans as 0/1 and writes list assignments", () => {
    const state = readBack();
    const payload = state.groups.flatMap((g) => g.instances);
    payload[0].values.debug = true;
    payload[1].values.domains = ["a.com", "b.com"];
    expect(planWrite(testSchema, currentSections(), payload)).toEqual([
      "uci set 'acme.acme.debug'='1'",
      // The device's uci rejects the multi-value `set` form, so a list is
      // written by clearing the option and appending each entry. The clear is
      // parenthesised so that it cannot mask an earlier failure in the chain.
      "(uci -q delete 'acme.@cert[0].domains' 2>/dev/null || true) && uci add_list 'acme.@cert[0].domains'='a.com' && uci add_list 'acme.@cert[0].domains'='b.com'",
    ]);
  });

  it("deletes an option cleared back to an empty list", () => {
    const state = readBack();
    const payload = state.groups.flatMap((g) => g.instances);
    payload[1].values.domains = [];
    // No `|| true` guard here: planWrite only emits this delete when the option
    // is actually present on the device, so it cannot fail and abort the chain.
    expect(planWrite(testSchema, currentSections(), payload)).toEqual([
      "uci -q delete 'acme.@cert[0].domains'",
    ]);
  });

  it("creates a new anonymous instance with uci add + option sets", () => {
    const cmds = planWrite(testSchema, currentSections(), [
      {
        ref: null,
        type: "cert",
        values: { name: "second", enabled: true, domains: ["x.io"], keylength: "ec-256", days: "30" },
      },
    ]);
    expect(cmds[0]).toBe("uci -q add acme cert");
    expect(cmds).toContain("uci set 'acme.@cert[-1].name'='second'");
    expect(cmds).toContain(
      "(uci -q delete 'acme.@cert[-1].domains' 2>/dev/null || true) && uci add_list 'acme.@cert[-1].domains'='x.io'",
    );
    expect(cmds).toContain("uci set 'acme.@cert[-1].days'='30'");
    // empty/absent values are skipped
    expect(cmds.some((c) => c.includes(".validation_method"))).toBe(false);
  });

  it("deletes removed instances of a multiple section", () => {
    const cmds = planWrite(testSchema, currentSections(), []);
    expect(cmds).toEqual(["uci -q delete 'acme.@cert[0]'"]);
  });

  it("recreates a missing named section under its canonical name", () => {
    const cmds = planWrite(testSchema, [], [
      {
        ref: "acme",
        type: "acme",
        values: { state_dir: "/etc/acme", account_email: "a@b.c", debug: false, use_staging: false },
      },
    ]);
    expect(cmds[0]).toBe("uci -q add acme acme");
    expect(cmds[1]).toBe("uci -q rename 'acme.@acme[-1]'='acme'");
    // non-default values are written; untouched defaults stay unwritten
    expect(cmds).toContain("uci set 'acme.acme.account_email'='a@b.c'");
    expect(cmds.some((c) => c.includes("state_dir"))).toBe(false);
  });
});

describe("inverted bool fields (udpxy-style `disabled`)", () => {
  const field: FieldDef = { option: "disabled", kind: "bool", invert: true, default: false };
  const inv: AppSchema = {
    slug: "inv",
    name: "inv",
    config: "inv",
    sections: [{ type: "inv", fields: [field] }],
  };

  it("reads stored 1 as form-false", () => {
    const state = readAppConfig(inv, "inv.cfg=inv\ninv.cfg.disabled='1'", true);
    expect(state.groups[0].instances[0].values.disabled).toBe(false);
  });

  it("encodes form values with opposite polarity", () => {
    expect(encodeField(field, true)).toBe("0");
    expect(encodeField(field, false)).toBe("1");
  });

  it("leaves the untouched default unwritten", () => {
    const current = parseUciShow("inv.cfg=inv\n");
    const cmds = planWrite(inv, current, [
      { ref: "cfg", type: "inv", values: { disabled: false } },
    ]);
    expect(cmds).toEqual([]);
  });
});

describe("APP_REGISTRY integrity", () => {
  it("registers every app with matching slug and valid identifiers", () => {
    expect(APP_LIST.length).toBeGreaterThan(0);
    expect(APP_LIST.map((a) => a.slug)).toEqual(
      [...APP_LIST.map((a) => a.slug)].sort((x, y) => x.localeCompare(y)),
    );
    for (const schema of APP_LIST) {
      expect(APP_REGISTRY[schema.slug]).toBe(schema);
      expect(schema.config).toMatch(/^[a-z0-9_-]+$/);
      for (const def of schema.sections) {
        expect(def.type).toMatch(/^[a-z0-9_-]+$/);
        for (const f of sectionFields(def)) {
          expect(f.option).toMatch(/^[A-Za-z0-9_]+$/);
        }
      }
    }
  });
});

describe("candidateSources", () => {
  const find = (slug: string) => APP_LIST.find((a) => a.slug === slug);

  it("collects the live-system sources arpbind's widgets need", () => {
    // The official Lua page fills IP and MAC from the ARP table and the
    // interface ListValue from `sys.net:devices()`, so both must be probed.
    const schema = find("arpbind");
    expect(schema && candidateSources(schema)).toEqual(["neighbours", "devices"]);
  });

  it("probes nothing for an app whose fields are all static", () => {
    const schema = find("vlmcsd");
    expect(schema && candidateSources(schema)).toEqual([]);
  });

  it("reports each source once", () => {
    const schema = find("arpbind");
    const sources = schema ? candidateSources(schema) : [];
    expect(new Set(sources).size).toBe(sources.length);
  });
});

/** arpbind-shaped schema: addresses from the ARP table, interface from the kernel. */
const bindSchema: AppSchema = {
  slug: "bind",
  name: "bind",
  config: "bind",
  sections: [
    {
      type: "bind",
      multiple: true,
      fields: [
        { option: "ipaddr", kind: "ip", required: true, candidates: "neighbours" },
        { option: "macaddr", kind: "mac", required: true, candidates: "neighbours" },
        { option: "ifname", kind: "select", default: "br-lan", required: true, candidates: "devices" },
        { option: "weight", kind: "int", min: 1, max: 10 },
        { option: "gateway", kind: "ip", depends: { option: "weight", values: ["*"] } },
      ],
    },
  ],
};

const draft = (values: Record<string, string | boolean | string[]>) => ({
  ref: null,
  type: "bind",
  values,
});

describe("isValidIpValue", () => {
  it("accepts IPv4 and IPv6 literals with optional prefix", () => {
    for (const v of ["192.168.3.1", "0.0.0.0", "255.255.255.255", "10.0.0.0/8", "fe80::1", "::", "2001:db8::ff00:42:8329", "::ffff:192.0.2.1", "fe80::1/64"]) {
      expect(isValidIpValue(v)).toBe(true);
    }
  });

  it("rejects malformed addresses", () => {
    // 999.1.1.1 is the value LuCI marks `cbi-input-invalid` and refuses to store.
    for (const v of ["999.1.1.1", "192.168.3", "192.168.03.1", "1.2.3.4/33", "::1/129", "1:2", "fe80::1%eth0", ":::", "hello", ""]) {
      expect(isValidIpValue(v)).toBe(false);
    }
  });
});

describe("isValidMacValue", () => {
  it("accepts colon and hyphen separated octets", () => {
    expect(isValidMacValue("5c:d8:9e:16:72:a7")).toBe(true);
    expect(isValidMacValue("5C-D8-9E-16-72-A7")).toBe(true);
  });

  it("rejects anything else", () => {
    for (const v of ["zz:zz", "5c:d8:9e:16:72", "5c:d8:9e:16:72:a7:00", "5cd89e1672a7", ""]) {
      expect(isValidMacValue(v)).toBe(false);
    }
  });
});

describe("isValidHostnameValue", () => {
  it("accepts DNS labels", () => {
    for (const v of ["lan", "printer", "nas1", "my-host", "a.b.example", "_dmarc", "h1"]) {
      expect(isValidHostnameValue(v)).toBe(true);
    }
  });

  it("rejects addresses, empty and malformed labels", () => {
    // The datatype exists so that an address can never masquerade as a name:
    // `192.168.1.1` is all digits and dots, which CBI refuses.
    for (const v of ["192.168.1.1", "1.2", "", "-lead", "trail-", "a b", "1".repeat(254)]) {
      expect(isValidHostnameValue(v)).toBe(false);
    }
  });
});

describe("isValidValue", () => {
  it("honours extra literals from `or(<datatype>, 'ignore')`", () => {
    const field: FieldDef = { option: "ip", kind: "ip", allowValues: ["ignore"] };
    expect(isValidValue(field, "ignore")).toBe(true);
    expect(isValidValue(field, "192.168.3.20")).toBe(true);
    expect(isValidValue(field, "999.1.1.1")).toBe(false);
  });

  it("checks every token of a `list(<datatype>)` value", () => {
    const field: FieldDef = { option: "mac", kind: "text", itemKind: "mac" };
    expect(isValidValue(field, "00:11:22:33:44:55 00:11:22:33:44:56")).toBe(true);
    expect(isValidValue(field, "00:11:22:33:44:55 zz:zz")).toBe(false);
    expect(isValidValue(field, "")).toBe(true);
  });
});

describe("sectionKey / fieldKey", () => {
  it("falls back to the UCI identifier", () => {
    expect(sectionKey({ type: "host" })).toBe("host");
    expect(fieldKey({ option: "rebind_domain", kind: "text" })).toBe("rebind_domain");
  });

  it("honours the override for options two sections share", () => {
    // dnsmasq's static leases and custom domains both have a `name` and an
    // `ip`, which need distinct labels in one namespace.
    expect(fieldKey({ option: "name", kind: "hostname", labelKey: "domain_name" })).toBe("domain_name");
    expect(sectionKey({ type: "smartdns", labelKey: "advanced" })).toBe("advanced");
  });
});

describe("validateInstances", () => {
  it("requires every mandatory field of a newly added rule", () => {
    const issues = validateInstances(bindSchema, [draft({ ipaddr: "", macaddr: "", ifname: "", weight: "" })]);
    expect(issues.map((i) => i.option)).toEqual(["ipaddr", "macaddr", "ifname"]);
    expect(issues.every((i) => i.reason === "required" && i.index === 0 && i.ref === null)).toBe(true);
  });

  it("leaves a partial rule already on the device editable", () => {
    // LuCI stores address-less rules happily (both widgets are optional);
    // demanding the missing values would block every unrelated save.
    const stored = [{ ref: "@bind[0]", type: "bind", values: { ipaddr: "", macaddr: "", ifname: "eth0" } }];
    expect(validateInstances(bindSchema, stored)).toEqual([]);
  });

  it("rejects values their datatype refuses", () => {
    const issues = validateInstances(bindSchema, [
      draft({ ipaddr: "999.1.1.1", macaddr: "zz:zz", ifname: "eth0", weight: "99" }),
    ]);
    expect(issues).toEqual([
      { index: 0, ref: null, type: "bind", option: "ipaddr", reason: "invalid", value: "999.1.1.1" },
      { index: 0, ref: null, type: "bind", option: "macaddr", reason: "invalid", value: "zz:zz" },
      { index: 0, ref: null, type: "bind", option: "weight", reason: "invalid", value: "99" },
    ]);
  });

  it("skips hidden fields and reports the instance index", () => {
    const issues = validateInstances(bindSchema, [
      draft({ ipaddr: "192.168.3.1", macaddr: "5c:d8:9e:16:72:a7", ifname: "eth0" }),
      // `gateway` is invisible while `weight` is empty, so its junk is not written.
      draft({ ipaddr: "192.168.3.2", macaddr: "9c:2d:cd:2d:c3:3d", ifname: "eth0", gateway: "::bad::" }),
      draft({ ipaddr: "nope", macaddr: "9c:2d:cd:2d:c3:3d", ifname: "eth0" }),
    ]);
    expect(issues).toEqual([
      { index: 2, ref: null, type: "bind", option: "ipaddr", reason: "invalid", value: "nope" },
    ]);
  });
});

describe("planWrite drafts", () => {
  const noteSchema: AppSchema = {
    slug: "note",
    name: "note",
    config: "note",
    sections: [{ type: "note", multiple: true, fields: [{ option: "text", kind: "text" }] }],
  };

  it("creates no section for a draft that carries nothing", () => {
    expect(planWrite(noteSchema, [], [defaultInstance(noteSchema.sections[0])])).toEqual([]);
  });

  it("creates the section once the draft holds a value", () => {
    expect(planWrite(noteSchema, [], [{ ref: null, type: "note", values: { text: "hi" } }])).toEqual([
      "uci -q add note note",
      "uci set 'note.@note[-1].text'='hi'",
    ]);
  });

  it("deletes removed anonymous sections from the highest index down", () => {
    const current = parseUciShow(
      [
        "bind.@bind[0]=bind",
        "bind.@bind[0].ipaddr='192.168.3.1'",
        "bind.@bind[1]=bind",
        "bind.@bind[1].ipaddr='192.168.3.2'",
        "bind.@bind[2]=bind",
        "bind.@bind[2].ipaddr='192.168.3.3'",
      ].join("\n"),
    );
    // Removing `@bind[0]` first would renumber the rest of the config, so an
    // ascending chain deletes the wrong section and then aborts on an index
    // that no longer exists — with the earlier deletes left staged.
    expect(planWrite(bindSchema, current, [])).toEqual([
      "uci -q delete 'bind.@bind[2]'",
      "uci -q delete 'bind.@bind[1]'",
      "uci -q delete 'bind.@bind[0]'",
    ]);
  });

  it("keeps the surviving section when others are removed", () => {
    const current = parseUciShow(
      [
        "bind.@bind[0]=bind",
        "bind.@bind[0].ipaddr='192.168.3.1'",
        "bind.@bind[1]=bind",
        "bind.@bind[1].ipaddr='192.168.3.2'",
        "bind.@bind[2]=bind",
        "bind.@bind[2].ipaddr='192.168.3.3'",
      ].join("\n"),
    );
    const keep = [{ ref: "@bind[1]", type: "bind", values: { ipaddr: "192.168.3.2" } }];
    expect(planWrite(bindSchema, current, keep)).toEqual([
      "uci -q delete 'bind.@bind[2]'",
      "uci -q delete 'bind.@bind[0]'",
    ]);
  });
});
