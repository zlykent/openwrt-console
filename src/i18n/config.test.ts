import { describe, expect, it } from "vitest";
import { defaultLocale, negotiateLocale } from "./config";

describe("negotiateLocale", () => {
  it("returns undefined for a missing/empty header", () => {
    expect(negotiateLocale(null)).toBeUndefined();
    expect(negotiateLocale(undefined)).toBeUndefined();
    expect(negotiateLocale("")).toBeUndefined();
  });

  it("matches a bare primary subtag", () => {
    expect(negotiateLocale("zh")).toBe("zh");
    expect(negotiateLocale("en")).toBe("en");
  });

  it("collapses region/script variants to the base language", () => {
    expect(negotiateLocale("zh-CN")).toBe("zh");
    expect(negotiateLocale("zh-TW")).toBe("zh");
    expect(negotiateLocale("zh-Hans-CN")).toBe("zh");
    expect(negotiateLocale("en-US")).toBe("en");
    expect(negotiateLocale("en-GB")).toBe("en");
  });

  it("is case-insensitive", () => {
    expect(negotiateLocale("ZH-cn")).toBe("zh");
    expect(negotiateLocale("EN")).toBe("en");
  });

  it("honours quality ordering", () => {
    expect(negotiateLocale("en;q=0.7,zh;q=0.9")).toBe("zh");
    expect(negotiateLocale("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiateLocale("fr;q=0.9,en;q=0.8,zh;q=0.7")).toBe("en");
  });

  it("keeps header order for equal quality", () => {
    expect(negotiateLocale("en,zh")).toBe("en");
    expect(negotiateLocale("zh,en")).toBe("zh");
  });

  it("ignores q=0 (explicitly not acceptable)", () => {
    expect(negotiateLocale("zh;q=0,en;q=0.5")).toBe("en");
    expect(negotiateLocale("zh;q=0")).toBeUndefined();
  });

  it("skips the wildcard and unsupported languages", () => {
    expect(negotiateLocale("*")).toBeUndefined();
    expect(negotiateLocale("fr-CA,de;q=0.8")).toBeUndefined();
    expect(negotiateLocale("*,en;q=0.3")).toBe("en");
  });

  it("tolerates a malformed q value by defaulting to 1", () => {
    expect(negotiateLocale("zh;q=abc")).toBe("zh");
    expect(negotiateLocale("en;q=")).toBe("en");
  });

  it("handles whitespace between entries", () => {
    expect(negotiateLocale("  zh-CN ,  en ;q=0.8  ")).toBe("zh");
  });

  it("exposes a supported defaultLocale as the final fallback", () => {
    expect(defaultLocale).toBe("en");
  });
});
