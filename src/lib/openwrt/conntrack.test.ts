import { describe, expect, it } from "vitest";
import { parseConntrack } from "./conntrack";

/** Realistic `/proc/net/nf_conntrack` lines. */
const SAMPLE = [
  "tcp      6 431999 ESTABLISHED src=192.168.1.5 dst=142.250.72.14 sport=44000 dport=443 src=142.250.72.14 dst=192.168.1.5 sport=443 dport=44000 [ASSURED] mark=0 use=2",
  "udp      17 29 src=192.168.1.5 dst=192.168.1.1 sport=53211 dport=53 [UNREPLIED] src=192.168.1.1 dst=192.168.1.5 sport=53 dport=53211 mark=0 use=2",
  "icmp     1 12 src=192.168.1.5 dst=8.8.8.8 type=8 code=0 id=1 src=8.8.8.8 dst=192.168.1.5 type=0 code=0 id=1 mark=0 use=2",
  "",
  "garbage line",
].join("\n");

describe("parseConntrack", () => {
  const rows = parseConntrack(SAMPLE);

  it("skips blank and malformed lines", () => {
    expect(rows).toHaveLength(3);
  });

  it("parses a tcp entry with its state and original tuple", () => {
    const tcp = rows[0];
    expect(tcp).toMatchObject({
      proto: "tcp",
      state: "ESTABLISHED",
      timeout: 431999,
      src: "192.168.1.5",
      dst: "142.250.72.14",
      sport: "44000",
      dport: "443",
    });
  });

  it("keeps the original direction, not the reply tuple", () => {
    const udp = rows[1];
    expect(udp.state).toBe("");
    expect(udp.src).toBe("192.168.1.5");
    expect(udp.sport).toBe("53211");
    expect(udp.dport).toBe("53");
  });

  it("falls back to icmp type/code when ports are absent", () => {
    const icmp = rows[2];
    expect(icmp.proto).toBe("icmp");
    expect(icmp.sport).toBe("8");
    expect(icmp.dport).toBe("0");
  });
});
