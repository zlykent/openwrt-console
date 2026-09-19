import { describe, expect, it } from "vitest";
import { parseTimezoneTable, validateSystemInput } from "./system";
import { AppError } from "@/lib/api/errors";

/** Verbatim shape of `luci.sys.zoneinfo.TZ` as dumped from the device. */
const TZ_DUMP = `Africa/Abidjan|GMT0
Africa/Addis Ababa|EAT-3
Asia/Shanghai|CST-8
Asia/Tokyo|JST-9
Europe/Berlin|CET-1CEST,M3.5.0,M10.5.0/3
`;

describe("parseTimezoneTable", () => {
  it("prepends UTC, which LuCI offers separately from the tzdata table", () => {
    const zones = parseTimezoneTable(TZ_DUMP);
    expect(zones[0]).toEqual({ name: "UTC", tz: "GMT0" });
    expect(zones).toHaveLength(6);
  });

  it("keeps zone names with spaces and POSIX strings with commas", () => {
    const zones = parseTimezoneTable(TZ_DUMP);
    expect(zones).toContainEqual({ name: "Africa/Addis Ababa", tz: "EAT-3" });
    expect(zones).toContainEqual({
      name: "Europe/Berlin",
      tz: "CET-1CEST,M3.5.0,M10.5.0/3",
    });
  });

  it("returns an empty list when the device has no table to read", () => {
    // Empty means "cannot derive", not "no zones": a build without Lua LuCI
    // must leave the POSIX string alone instead of guessing GMT0.
    expect(parseTimezoneTable("")).toEqual([]);
    expect(parseTimezoneTable("lua: not found\n")).toEqual([]);
  });
});

describe("validateSystemInput", () => {
  it("accepts a full payload of valid values", () => {
    expect(() =>
      validateSystemInput({
        hostname: "OpenWrt",
        zonename: "Asia/Shanghai",
        logSize: "64",
        logIp: "192.168.3.10",
        logPort: "514",
        logProto: "udp",
        logFile: "/tmp/system.log",
        conloglevel: "7",
        cronloglevel: "8",
        ntpServers: ["ntp.aliyun.com", "192.168.3.1"],
      }),
    ).not.toThrow();
  });

  it("treats a blank optional field as unset rather than invalid", () => {
    expect(() =>
      validateSystemInput({
        logSize: "",
        logIp: "",
        logPort: "",
        logProto: "",
        logFile: "",
        conloglevel: "",
        cronloglevel: "",
      }),
    ).not.toThrow();
  });

  it("rejects a hostname that is really an address", () => {
    // CBI `hostname` refuses an all-numeric name so an IP cannot masquerade.
    expect(() => validateSystemInput({ hostname: "192.168.3.5" })).toThrow(AppError);
    expect(() => validateSystemInput({ hostname: "-bad-" })).toThrow(AppError);
  });

  it("accepts an address as an NTP server, not only a hostname", () => {
    // CBI `host(0)` allows either; a hostname check alone would reject the very
    // common case of pointing the client at a plain IPv4 or IPv6 address.
    expect(() =>
      validateSystemInput({ ntpServers: ["192.168.3.1", "fd00::1", "pool.ntp.org"] }),
    ).not.toThrow();
  });

  it("rejects values outside each field's datatype", () => {
    expect(() => validateSystemInput({ logIp: "ntp.aliyun.com" })).toThrow(AppError);
    expect(() => validateSystemInput({ logPort: "65536" })).toThrow(AppError);
    expect(() => validateSystemInput({ logSize: "-1" })).toThrow(AppError);
    expect(() => validateSystemInput({ logProto: "sctp" })).toThrow(AppError);
    expect(() => validateSystemInput({ logFile: "system.log" })).toThrow(AppError);
    expect(() => validateSystemInput({ logFile: "/tmp/a b.log" })).toThrow(AppError);
    expect(() => validateSystemInput({ ntpServers: ["ntp pool.org"] })).toThrow(AppError);
  });

  it("keeps the two log level scales apart", () => {
    // conloglevel runs 1..8 while cronloglevel only accepts 5, 8 and 9, so a
    // value that is valid for one is not automatically valid for the other.
    expect(() => validateSystemInput({ conloglevel: "8" })).not.toThrow();
    expect(() => validateSystemInput({ conloglevel: "9" })).toThrow(AppError);
    expect(() => validateSystemInput({ cronloglevel: "9" })).not.toThrow();
    expect(() => validateSystemInput({ cronloglevel: "7" })).toThrow(AppError);
  });
});
