import { describe, expect, it } from "vitest";
import {
  candidateSources,
  planWrite,
  readAppConfig,
  sectionFields,
  validateInstances,
  type SectionInstance,
} from "./uci-schema";
import { parseUciShow } from "./uci";
import { coupleHostDns, DHCP_SCHEMA } from "./dhcp-schema";

/**
 * Verbatim `uci -q show dhcp` of the reference device (dnsmasq 2.86, built
 * without DNSSEC and without TFTP). `localuse` is a legacy option no CBI model
 * declares any more; it has to survive a save untouched.
 */
const DHCP_SHOW = [
  "dhcp.@dnsmasq[0]=dnsmasq",
  "dhcp.@dnsmasq[0].domainneeded='1'",
  "dhcp.@dnsmasq[0].boguspriv='1'",
  "dhcp.@dnsmasq[0].filterwin2k='0'",
  "dhcp.@dnsmasq[0].localise_queries='1'",
  "dhcp.@dnsmasq[0].rebind_protection='1'",
  "dhcp.@dnsmasq[0].rebind_localhost='1'",
  "dhcp.@dnsmasq[0].local='/lan/'",
  "dhcp.@dnsmasq[0].domain='lan'",
  "dhcp.@dnsmasq[0].expandhosts='1'",
  "dhcp.@dnsmasq[0].nonegcache='0'",
  "dhcp.@dnsmasq[0].authoritative='1'",
  "dhcp.@dnsmasq[0].readethers='1'",
  "dhcp.@dnsmasq[0].leasefile='/tmp/dhcp.leases'",
  "dhcp.@dnsmasq[0].resolvfile='/tmp/resolv.conf.d/resolv.conf.auto'",
  "dhcp.@dnsmasq[0].nonwildcard='1'",
  "dhcp.@dnsmasq[0].localservice='1'",
  "dhcp.@dnsmasq[0].filter_aaaa='0'",
  "dhcp.@dnsmasq[0].cachesize='8000'",
  "dhcp.@dnsmasq[0].mini_ttl='3600'",
  "dhcp.@dnsmasq[0].ednspacket_max='1232'",
  "dhcp.@dnsmasq[0].localuse='1'",
  "dhcp.@dnsmasq[0].noresolv='0'",
  "dhcp.@dnsmasq[0].port='53'",
  "dhcp.lan=dhcp",
  "dhcp.lan.interface='lan'",
  "dhcp.lan.start='100'",
  "dhcp.lan.limit='150'",
  "dhcp.lan.leasetime='12h'",
  "dhcp.wan=dhcp",
  "dhcp.wan.interface='wan'",
  "dhcp.wan.ignore='1'",
  "dhcp.odhcpd=odhcpd",
  "dhcp.odhcpd.maindhcp='0'",
  "dhcp.@srvhost[0]=srvhost",
  "dhcp.@srvhost[0].srv='_vlmcs._tcp'",
  "dhcp.@srvhost[0].target='OpenWrt'",
].join("\n");

/** One static lease exactly as the CBI write hook leaves it behind. */
const HOST_SHOW = [
  "dhcp.@host[0]=host",
  "dhcp.@host[0].name='printer'",
  "dhcp.@host[0].mac='00:11:22:33:44:55'",
  "dhcp.@host[0].ip='192.168.3.20'",
  "dhcp.@host[0].dns='1'",
].join("\n");

const read = (show: string) => readAppConfig(DHCP_SCHEMA, show, true);
const instancesOf = (show: string) => read(show).groups.flatMap((g) => g.instances);

describe("DHCP_SCHEMA scope", () => {
  it("declares only the sections the DHCP and DNS page owns", () => {
    // The per-interface `dhcp`, the `odhcpd` and the `srvhost` sections share
    // the file: a schema that named them could rewrite them, one that does not
    // cannot even address them.
    expect(DHCP_SCHEMA.sections.map((s) => s.type)).toEqual(["dnsmasq", "host", "domain"]);
    expect(DHCP_SCHEMA.config).toBe("dhcp");
    expect(DHCP_SCHEMA.service).toBe("dnsmasq");
  });

  it("never declares the DNSSEC flags this dnsmasq cannot honour", () => {
    // `/etc/init.d/dnsmasq` exits 1 when a `dnssec*` option meets a build
    // without DNSSEC support, so offering them would brick the resolver.
    const options = DHCP_SCHEMA.sections.flatMap((s) => sectionFields(s)).map((f) => f.option);
    expect(options).not.toContain("dnssec");
    expect(options).not.toContain("dnsseccheckunsigned");
  });

  it("probes the ARP table and nothing else", () => {
    expect(candidateSources(DHCP_SCHEMA)).toEqual(["neighbours"]);
  });

  it("reads the device config without planning a single write", () => {
    // The strongest guarantee the page can offer: opening it and pressing Save
    // leaves `/etc/config/dhcp` byte-identical, `localuse` and the `lan`/`wan`/
    // `odhcpd`/`srvhost` sections included.
    expect(planWrite(DHCP_SCHEMA, parseUciShow(DHCP_SHOW), instancesOf(DHCP_SHOW))).toEqual([]);
  });

  it("writes only the one option that was edited", () => {
    const payload = instancesOf(DHCP_SHOW);
    payload[0].values.cachesize = "1000";
    expect(planWrite(DHCP_SCHEMA, parseUciShow(DHCP_SHOW), payload)).toEqual([
      "uci set 'dhcp.@dnsmasq[0].cachesize'='1000'",
    ]);
  });
});

describe("dnsmasq flag defaults", () => {
  const bare = "dhcp.@dnsmasq[0]=dnsmasq";
  const untouched = () => read(bare).groups.flatMap((g) => g.instances);

  it("shows a flag the init script defaults to on as checked", () => {
    const [dnsmasq] = untouched();
    expect(dnsmasq.values.rebind_protection).toBe(true);
    expect(dnsmasq.values.nonwildcard).toBe(true);
    expect(dnsmasq.values.boguspriv).toBe(true);
    expect(dnsmasq.values.localservice).toBe(false);
  });

  it("leaves every effective default unwritten", () => {
    expect(planWrite(DHCP_SCHEMA, parseUciShow(bare), untouched())).toEqual([]);
  });

  it("turns a default-on flag off with a real 0 rather than by deleting it", () => {
    // Deleting the option would hand it back to `config_get_bool … 1`, i.e.
    // silently re-enable rebind protection while the form shows it off.
    const payload = untouched();
    payload[0].values.rebind_protection = false;
    expect(planWrite(DHCP_SCHEMA, parseUciShow(bare), payload)).toEqual([
      "uci set 'dhcp.@dnsmasq[0].rebind_protection'='0'",
    ]);
  });

  it("turns a default-off flag on the same way", () => {
    const payload = untouched();
    payload[0].values.localservice = true;
    expect(planWrite(DHCP_SCHEMA, parseUciShow(bare), payload)).toEqual([
      "uci set 'dhcp.@dnsmasq[0].localservice'='1'",
    ]);
  });
});

describe("coupleHostDns", () => {
  it("sets dns=1 for a lease that carries a hostname", () => {
    const [lease] = coupleHostDns([
      { ref: null, type: "host", values: { name: "printer", mac: "", ip: "192.168.3.20" } },
    ]);
    expect(lease.values.dns).toBe("1");
  });

  it("drops dns again once the hostname is blank", () => {
    // `name.remove` in the model: without it dnsmasq keeps publishing a name
    // that no longer exists in the config.
    const [lease] = coupleHostDns([
      { ref: "@host[0]", type: "host", values: { name: "  ", ip: "192.168.3.20", dns: "1" } },
    ]);
    expect(lease.values.dns).toBe("");
  });

  it("leaves every other section type alone", () => {
    const others: SectionInstance[] = [
      { ref: "@dnsmasq[0]", type: "dnsmasq", values: { domain: "lan" } },
      { ref: "@domain[0]", type: "domain", values: { name: "nas", ip: "192.168.3.9" } },
    ];
    expect(coupleHostDns(others)).toEqual(others);
  });
});

describe("static leases", () => {
  it("adds one the way the CBI write hook does", () => {
    const [draft] = coupleHostDns([
      {
        ref: null,
        type: "host",
        values: { name: "printer", mac: "00:11:22:33:44:55", ip: "192.168.3.20", leasetime: "", hostid: "" },
      },
    ]);
    expect(planWrite(DHCP_SCHEMA, parseUciShow(DHCP_SHOW), [draft])).toEqual([
      "uci -q add dhcp host",
      "uci set 'dhcp.@host[-1].name'='printer'",
      "uci set 'dhcp.@host[-1].mac'='00:11:22:33:44:55'",
      "uci set 'dhcp.@host[-1].ip'='192.168.3.20'",
      "uci set 'dhcp.@host[-1].dns'='1'",
    ]);
  });

  it("deletes a removed lease by its anonymous reference", () => {
    expect(planWrite(DHCP_SCHEMA, parseUciShow(HOST_SHOW), [])).toEqual([
      "uci -q delete 'dhcp.@host[0]'",
    ]);
  });

  it("removes the dns option together with a cleared hostname", () => {
    const [lease] = instancesOf(HOST_SHOW);
    lease.values.name = "";
    expect(planWrite(DHCP_SCHEMA, parseUciShow(HOST_SHOW), coupleHostDns([lease]))).toEqual([
      "uci -q delete 'dhcp.@host[0].name'",
      "uci -q delete 'dhcp.@host[0].dns'",
    ]);
  });

  it("keeps every MAC of a list the device stored as one", () => {
    // The upstream JS views write `mac` as a real UCI list where the Lua view
    // writes a single space-separated option; reading only the first entry
    // dropped the others on the next save.
    const show = [
      "dhcp.@host[0]=host",
      "dhcp.@host[0].mac='00:11:22:33:44:55' '00:11:22:33:44:56'",
      "dhcp.@host[0].ip='192.168.3.20'",
    ].join("\n");
    const [lease] = instancesOf(show);
    expect(lease.values.mac).toBe("00:11:22:33:44:55 00:11:22:33:44:56");
    expect(validateInstances(DHCP_SCHEMA, [lease])).toEqual([]);
  });
});

describe("static lease validation", () => {
  const draft = (values: Record<string, string>) =>
    ({ ref: null, type: "host", values: { leasetime: "", hostid: "", dns: "", ...values } }) as SectionInstance;

  it("refuses an address that identifies nobody", () => {
    // `ip.validate` in the model: hostname or MAC must be given alongside.
    const issues = validateInstances(DHCP_SCHEMA, [draft({ ip: "192.168.3.20" })]);
    expect(issues).toEqual([
      {
        index: 0,
        ref: null,
        type: "host",
        option: "ip",
        reason: "atLeastOne",
        value: "192.168.3.20",
        others: ["name", "mac"],
      },
    ]);
  });

  it("accepts the same address once a MAC is present", () => {
    expect(
      validateInstances(DHCP_SCHEMA, [draft({ ip: "192.168.3.20", mac: "00:11:22:33:44:55" })]),
    ).toEqual([]);
  });

  it("accepts the `ignore` literal the datatype allows", () => {
    // `or(ip4addr,'ignore')`: a lease whose address dnsmasq must not hand out.
    expect(validateInstances(DHCP_SCHEMA, [draft({ ip: "ignore", name: "printer" })])).toEqual([]);
    expect(validateInstances(DHCP_SCHEMA, [draft({ ip: "999.1.1.1", name: "printer" })])).toEqual([
      { index: 0, ref: null, type: "host", option: "ip", reason: "invalid", value: "999.1.1.1" },
    ]);
  });

  it("checks every address of a space-separated MAC list", () => {
    const issues = validateInstances(DHCP_SCHEMA, [
      draft({ mac: "00:11:22:33:44:55 zz:zz", ip: "192.168.3.20" }),
    ]);
    expect(issues).toEqual([
      { index: 0, ref: null, type: "host", option: "mac", reason: "invalid", value: "zz:zz" },
    ]);
  });

  it("rejects an address typed into the hostname field", () => {
    const issues = validateInstances(DHCP_SCHEMA, [
      draft({ name: "192.168.3.20", mac: "00:11:22:33:44:55" }),
    ]);
    expect(issues.map((i) => [i.option, i.reason])).toEqual([["name", "invalid"]]);
  });

  it("applies the same rule to custom domains", () => {
    const issues = validateInstances(DHCP_SCHEMA, [
      { ref: null, type: "domain", values: { name: "nas.lan", ip: "not-an-ip", comments: "" } },
    ]);
    expect(issues.map((i) => [i.option, i.reason, i.value])).toEqual([
      ["ip", "invalid", "not-an-ip"],
    ]);
  });
});

describe("rebind whitelist", () => {
  it("accepts hostnames and IPv4 addresses alike", () => {
    // `rd.datatype = "host(1)"` in the model.
    const payload = instancesOf(DHCP_SHOW);
    payload[0].values.rebind_domain = ["ihost.netflix.com", "192.168.3.9"];
    expect(validateInstances(DHCP_SCHEMA, payload)).toEqual([]);
  });

  it("rejects anything else in the list", () => {
    const payload = instancesOf(DHCP_SHOW);
    payload[0].values.rebind_domain = ["ihost.netflix.com", "::bad::"];
    expect(validateInstances(DHCP_SCHEMA, payload).map((i) => [i.option, i.value])).toEqual([
      ["rebind_domain", "::bad::"],
    ]);
  });
});
