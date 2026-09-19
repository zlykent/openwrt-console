import { describe, expect, it } from "vitest";
import {
  checkForwardingDraft,
  checkRedirectDraft,
  checkRuleDraft,
  checkZoneDraft,
  deleteCmds,
  planRedirect,
  planRule,
  planZone,
  validateRedirectInput,
  validateRuleInput,
  validateZoneInput,
  zoneCascade,
  type RedirectInput,
  type RuleInput,
  type ZoneInput,
} from "./firewall";
import type { UciSection } from "./uci";
import { AppError } from "@/lib/api/errors";

function sec(name: string, type: string, options: Record<string, string | string[]> = {}): UciSection {
  return { name, type, anonymous: name.startsWith("@"), options };
}

/** `uci show firewall` of a stock device: two anonymous zones, one forward. */
const SECS: UciSection[] = [
  sec("@defaults[0]", "defaults", { input: "ACCEPT", output: "ACCEPT", forward: "REJECT", syn_flood: "1" }),
  sec("@zone[0]", "zone", { name: "lan", network: ["lan"], input: "ACCEPT", output: "ACCEPT", forward: "REJECT" }),
  sec("@zone[1]", "zone", { name: "wan", network: ["wan"], input: "REJECT", output: "ACCEPT", forward: "REJECT", masq: "1" }),
  sec("@forwarding[0]", "forwarding", { src: "lan", dest: "wan" }),
  sec("@rule[0]", "rule", { name: "Allow-Ping", src: "wan", proto: "icmp", icmp_type: ["echo-request"], target: "ACCEPT" }),
  sec("kms", "rule", { name: "KMS", src: "lan", dest_port: "1688", target: "ACCEPT" }),
];

const zoneInput: ZoneInput = {
  name: "lan",
  networks: ["lan"],
  input: "ACCEPT",
  output: "ACCEPT",
  forward: "REJECT",
  masq: false,
  mtuFix: false,
  family: "",
  masqSrc: "",
  masqDest: "",
  conntrack: false,
  log: false,
  logLimit: "",
};

const ruleInput: RuleInput = {
  name: "Allow-Ping",
  family: "",
  proto: "icmp",
  icmpType: "echo-request",
  src: "wan",
  srcMac: "",
  srcIp: "",
  srcPort: "",
  dest: "",
  destIp: "",
  destPort: "",
  target: "ACCEPT",
  extra: "",
  weekdays: "",
  monthdays: "",
  startTime: "",
  stopTime: "",
  startDate: "",
  stopDate: "",
  utcTime: false,
  enabled: true,
};

const redirectInput: RedirectInput = {
  name: "",
  target: "DNAT",
  proto: "tcp udp",
  src: "wan",
  srcMac: "",
  srcIp: "",
  srcPort: "",
  srcDip: "",
  srcDport: "8080",
  dest: "lan",
  destIp: "192.168.3.20",
  destPort: "80",
  reflection: true,
  extra: "",
  enabled: true,
};

describe("deleteCmds", () => {
  it("deletes anonymous sections highest index first and named ones last", () => {
    // Anonymous indices count named sections too, and deleting a section
    // renumbers the ones after it, so any other order makes a later `@rule[n]`
    // resolve to the wrong section — or to nothing, which aborts the `&&` chain
    // half way through and leaves a staged delta behind.
    expect(deleteCmds(["@rule[0]", "kms", "@rule[2]", "@rule[1]"])).toEqual([
      "uci -q delete 'firewall.@rule[2]'",
      "uci -q delete 'firewall.@rule[1]'",
      "uci -q delete 'firewall.@rule[0]'",
      "uci -q delete 'firewall.kms'",
    ]);
  });
});

describe("zoneCascade", () => {
  it("collects every rule and forwarding that points at the zone", () => {
    // `kms` names lan as its source; `@rule[0]` names wan only, so it stays.
    const doomed = zoneCascade(SECS, SECS[1]);
    expect(doomed).toEqual(["@zone[0]", "@forwarding[0]", "kms"]);
  });

  it("leaves sections of other zones alone", () => {
    const guest = sec("guest", "zone", { name: "guest" });
    expect(zoneCascade([...SECS, guest], guest)).toEqual(["guest"]);
  });
});

describe("validateZoneInput", () => {
  it("accepts a uci name of at most 11 characters", () => {
    expect(() => validateZoneInput({ ...zoneInput, name: "guest_1" })).not.toThrow();
  });

  it("rejects a name uci could not address as a section", () => {
    expect(() => validateZoneInput({ ...zoneInput, name: "a b" })).toThrow(AppError);
    expect(() => validateZoneInput({ ...zoneInput, name: "abcdefghijkl" })).toThrow(AppError);
    expect(() => validateZoneInput({ ...zoneInput, name: "" })).toThrow(AppError);
  });

  it("rejects a policy outside ACCEPT/REJECT/DROP", () => {
    expect(() => validateZoneInput({ ...zoneInput, forward: "ACCEPT2" })).toThrow(AppError);
  });

  it("rejects a masq restriction that is not a subnet", () => {
    expect(() => validateZoneInput({ ...zoneInput, masqSrc: "10.0.0.0/8 !10.0.0.5" })).not.toThrow();
    expect(() => validateZoneInput({ ...zoneInput, masqSrc: "10.0.0.0/8;reboot" })).toThrow(AppError);
  });
});

describe("validateRuleInput", () => {
  it("accepts NOTRACK, which is a rule target but never a zone policy", () => {
    expect(() => validateRuleInput({ ...ruleInput, target: "NOTRACK" })).not.toThrow();
  });

  it("rejects datatypes the CBI form would reject", () => {
    expect(() => validateRuleInput({ ...ruleInput, destPort: "http" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, destPort: "80 443 8000-8100" })).not.toThrow();
    expect(() => validateRuleInput({ ...ruleInput, srcMac: "aa:bb:cc" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, weekdays: "Mon Tuesday" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, monthdays: "32" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, startTime: "8:00" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, startDate: "2026-1-1" })).toThrow(AppError);
  });

  it("rejects an extra argument that would start a second config line", () => {
    expect(() => validateRuleInput({ ...ruleInput, extra: "-m comment\nuci commit" })).toThrow(AppError);
  });

  // Port syntax verified against the device: LuCI's datatype is `neg(portrange)`, and
  // `fw3 print` turns "80 443" into one rule per value and "!80" into `! --dport 80`.
  // There is no `or` keyword — a placeholder suggesting one only produces a bad draft.
  it("accepts fw3 port negation but not an `or` keyword or comma separated lists", () => {
    expect(() => validateRuleInput({ ...ruleInput, destPort: "!80" })).not.toThrow();
    expect(() => validateRuleInput({ ...ruleInput, srcPort: "8000:8100" })).not.toThrow();
    expect(() => validateRuleInput({ ...ruleInput, destPort: "80 or 8000-8100" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, monthdays: "1, 15, 28" })).toThrow(AppError);
    expect(() => validateRuleInput({ ...ruleInput, monthdays: "1 15 28" })).not.toThrow();
  });
});

describe("checkZoneDraft", () => {
  it("refuses a second zone under a name that is taken", () => {
    expect(() => checkZoneDraft(SECS, zoneInput)).toThrow(AppError);
    // A named section id counts as taken even when no zone carries that name.
    expect(() => checkZoneDraft(SECS, { ...zoneInput, name: "kms" })).toThrow(AppError);
  });

  it("allows the zone being edited to keep its own name", () => {
    expect(() => checkZoneDraft(SECS, { ...zoneInput, ref: "@zone[0]" })).not.toThrow();
  });
});

describe("checkRuleDraft", () => {
  it("accepts the wildcard and the empty value LuCI's zonelist offers", () => {
    expect(() => checkRuleDraft(SECS, { ...ruleInput, src: "*", dest: "" })).not.toThrow();
  });

  it("rejects a zone that does not exist", () => {
    expect(() => checkRuleDraft(SECS, { ...ruleInput, src: "guest" })).toThrow(AppError);
  });
});

describe("checkForwardingDraft", () => {
  it("refuses a zone forwarding to itself", () => {
    expect(() => checkForwardingDraft(SECS, { src: "lan", dest: "lan" })).toThrow(AppError);
  });

  it("refuses a pair that is already forwarded, like add_forwarding_to", () => {
    expect(() => checkForwardingDraft(SECS, { src: "lan", dest: "wan" })).toThrow(AppError);
    expect(() => checkForwardingDraft(SECS, { src: "wan", dest: "lan" })).not.toThrow();
  });
});

describe("checkRedirectDraft", () => {
  it("requires the fields fw3 needs to build a rule", () => {
    expect(() => checkRedirectDraft(SECS, { ...redirectInput, srcDport: "" }, "DNAT")).toThrow(AppError);
    expect(() => checkRedirectDraft(SECS, { ...redirectInput, destIp: "" }, "DNAT")).toThrow(AppError);
    expect(() => checkRedirectDraft(SECS, { ...redirectInput, target: "SNAT", srcDip: "" }, "SNAT")).toThrow(
      AppError,
    );
  });

  it("refuses to turn a port forward into a source NAT", () => {
    const existing = sec("@redirect[0]", "redirect", { target: "DNAT", src: "wan", dest: "lan" });
    const secs = [...SECS, existing];
    expect(() =>
      checkRedirectDraft(secs, { ...redirectInput, ref: "@redirect[0]", target: "SNAT" }, "SNAT"),
    ).toThrow(/Cannot change/);
  });
});

describe("validateRedirectInput", () => {
  it("normalises the target and rejects anything else", () => {
    expect(validateRedirectInput({ ...redirectInput, target: "dnat" })).toBe("DNAT");
    expect(() => validateRedirectInput({ ...redirectInput, target: "MASQUERADE" })).toThrow(AppError);
  });
});

describe("planZone", () => {
  it("creates a new zone as a named section", () => {
    const { ref, cmds } = planZone(SECS, { ...zoneInput, name: "guest", networks: ["guest"] });
    expect(ref).toBe("guest");
    expect(cmds[0]).toBe("uci set 'firewall.guest'='zone'");
    expect(cmds).toContain("uci set 'firewall.guest.name'='guest'");
  });

  it("writes nothing when the draft matches the stored section", () => {
    // This build's `uci set` moves an existing option to the end of its section,
    // so a redundant write is visible churn in /etc/config/firewall.
    expect(planZone(SECS, { ...zoneInput, ref: "@zone[0]" }).cmds).toEqual([]);
  });

  it("rewrites every section that points at a renamed zone", () => {
    const { cmds } = planZone(SECS, { ...zoneInput, ref: "@zone[0]", name: "lan2" });
    expect(cmds).toContain("uci set 'firewall.@zone[0].name'='lan2'");
    expect(cmds).toContain("uci set 'firewall.@forwarding[0].src'='lan2'");
    expect(cmds).toContain("uci set 'firewall.kms.src'='lan2'");
    // Neither the wan zone nor a rule that does not name lan is touched.
    expect(cmds.some((c) => c.includes("@zone[1]") || c.includes("@rule[0]"))).toBe(false);
  });

  it("leaves log_limit alone while logging is off, as the CBI depends on log", () => {
    const logged = sec("@zone[0]", "zone", { name: "lan", network: ["lan"], log: "1", log_limit: "10/minute" });
    const secs = [logged];
    const off = planZone(secs, { ...zoneInput, ref: "@zone[0]", networks: ["lan"] }).cmds;
    expect(off.join(" ")).not.toMatch(/log_limit/);
    const on = planZone(secs, {
      ...zoneInput,
      ref: "@zone[0]",
      networks: ["lan"],
      log: true,
      logLimit: "5/minute",
    }).cmds;
    expect(on).toContain("uci set 'firewall.@zone[0].log_limit'='5/minute'");
  });

  it("writes masq_src as a uci list", () => {
    const { cmds } = planZone(SECS, { ...zoneInput, name: "guest", masqSrc: "10.0.0.0/8 192.168.0.0/16" });
    expect(cmds.join(" && ")).toMatch(/add_list 'firewall\.guest\.masq_src'='10\.0\.0\.0\/8'/);
    expect(cmds.join(" && ")).toMatch(/add_list 'firewall\.guest\.masq_src'='192\.168\.0\.0\/16'/);
  });
});

describe("planRule", () => {
  it("writes nothing when the draft matches the stored section", () => {
    expect(planRule(SECS, { ...ruleInput, ref: "@rule[0]" }, "").cmds).toEqual([]);
  });

  it("enables a rule by removing the option, the way opt_enabled does", () => {
    const disabled = sec("@rule[0]", "rule", { name: "Allow-Ping", src: "wan", proto: "icmp", icmp_type: ["echo-request"], target: "ACCEPT", enabled: "0" });
    const cmds = planRule([disabled], { ...ruleInput, ref: "@rule[0]", enabled: true }, "").cmds;
    expect(cmds).toEqual(["(uci -q delete 'firewall.@rule[0].enabled' 2>/dev/null || true)"]);
  });

  it("disables a rule by writing an explicit 0, since fw3 defaults it to on", () => {
    const cmds = planRule(SECS, { ...ruleInput, ref: "@rule[0]", enabled: false }, "").cmds;
    expect(cmds).toContain("uci set 'firewall.@rule[0].enabled'='0'");
  });

  it("keeps a stock rule that is enabled and carries no enabled option", () => {
    expect(planRule(SECS, { ...ruleInput, ref: "@rule[0]", enabled: true }, "").cmds).not.toContain(
      "uci set 'firewall.@rule[0].enabled'='1'",
    );
  });

  it("clears a blanked field instead of leaving the old value behind", () => {
    const cmds = planRule(SECS, { ...ruleInput, ref: "@rule[0]", proto: "" }, "").cmds;
    expect(cmds).toEqual(["(uci -q delete 'firewall.@rule[0].proto' 2>/dev/null || true)"]);
  });

  it("writes weekdays and monthdays as one space separated option", () => {
    const cmds = planRule(SECS, { ...ruleInput, ref: "@rule[0]", weekdays: "Mon Wed", monthdays: "1 15" }, "").cmds;
    expect(cmds).toContain("uci set 'firewall.@rule[0].weekdays'='Mon Wed'");
    expect(cmds).toContain("uci set 'firewall.@rule[0].monthdays'='1 15'");
  });
});

describe("planRedirect", () => {
  it("omits reflection on a source NAT rule, where the option means nothing", () => {
    const cmds = planRedirect(SECS, { ...redirectInput, target: "SNAT", srcDip: "203.0.113.5" }, "SNAT", "cfg03").cmds;
    expect(cmds.join(" ")).not.toMatch(/reflection/);
    expect(cmds).toContain("uci set 'firewall.cfg03.target'='SNAT'");
  });

  it("keeps NAT loopback on by removing the option, which is fw3's default", () => {
    const cmds = planRedirect(SECS, redirectInput, "DNAT", "cfg03").cmds;
    expect(cmds.join(" ")).not.toMatch(/reflection/);
  });

  it("writes an explicit 0 when NAT loopback is turned off", () => {
    const cmds = planRedirect(SECS, { ...redirectInput, reflection: false }, "DNAT", "cfg03").cmds;
    expect(cmds).toContain("uci set 'firewall.cfg03.reflection'='0'");
  });

  it("writes src_mac as a uci list, unlike a rule where it is one option", () => {
    const cmds = planRedirect(
      SECS,
      { ...redirectInput, srcMac: "aa:bb:cc:dd:ee:ff 11:22:33:44:55:66" },
      "DNAT",
      "cfg03",
    ).cmds;
    expect(cmds.join(" && ")).toMatch(/add_list 'firewall\.cfg03\.src_mac'='aa:bb:cc:dd:ee:ff'/);
  });

  it("edits the addressed section rather than the placeholder ref", () => {
    const existing = sec("@redirect[0]", "redirect", {
      target: "DNAT",
      src: "wan",
      dest: "lan",
      src_dport: "8080",
      dest_ip: "192.168.3.20",
      dest_port: "80",
      proto: "tcp udp",
    });
    const { ref, cmds } = planRedirect(
      [...SECS, existing],
      { ...redirectInput, ref: "@redirect[0]", destPort: "8081" },
      "DNAT",
      "",
    );
    expect(ref).toBe("@redirect[0]");
    expect(cmds).toEqual(["uci set 'firewall.@redirect[0].dest_port'='8081'"]);
  });
});
