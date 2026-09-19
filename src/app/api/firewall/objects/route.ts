import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { AppError } from "@/lib/api/errors";
import {
  addForwarding,
  saveRedirect,
  saveRule,
  saveZone,
} from "@/lib/openwrt/firewall";

/**
 * Every string field is required — an empty string means "unset" — so that a
 * partial payload cannot silently blank an option it never mentioned. Value
 * checking (allowed policies, port/IP/MAC datatypes, zone existence) lives in
 * `lib/openwrt/firewall`, next to the LuCI options it mirrors.
 */
const zoneSchema = z.object({
  ref: z.string().optional(),
  name: z.string(),
  networks: z.array(z.string()),
  input: z.string(),
  output: z.string(),
  forward: z.string(),
  masq: z.boolean(),
  mtuFix: z.boolean(),
  family: z.string(),
  masqSrc: z.string(),
  masqDest: z.string(),
  conntrack: z.boolean(),
  log: z.boolean(),
  logLimit: z.string(),
});

const ruleSchema = z.object({
  ref: z.string().optional(),
  name: z.string(),
  family: z.string(),
  proto: z.string(),
  icmpType: z.string(),
  src: z.string(),
  srcMac: z.string(),
  srcIp: z.string(),
  srcPort: z.string(),
  dest: z.string(),
  destIp: z.string(),
  destPort: z.string(),
  target: z.string(),
  extra: z.string(),
  weekdays: z.string(),
  monthdays: z.string(),
  startTime: z.string(),
  stopTime: z.string(),
  startDate: z.string(),
  stopDate: z.string(),
  utcTime: z.boolean(),
  enabled: z.boolean(),
});

const redirectSchema = z.object({
  ref: z.string().optional(),
  name: z.string(),
  /** "DNAT" (port forward) or "SNAT" (source NAT). */
  target: z.string(),
  proto: z.string(),
  src: z.string(),
  srcMac: z.string(),
  srcIp: z.string(),
  srcPort: z.string(),
  srcDip: z.string(),
  srcDport: z.string(),
  dest: z.string(),
  destIp: z.string(),
  destPort: z.string(),
  reflection: z.boolean(),
  extra: z.string(),
  enabled: z.boolean(),
});

const forwardingSchema = z.object({
  src: z.string().min(1),
  dest: z.string().min(1),
});

const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("zone"), zone: zoneSchema }),
  z.object({ kind: z.literal("rule"), rule: ruleSchema }),
  z.object({ kind: z.literal("redirect"), redirect: redirectSchema }),
  z.object({ kind: z.literal("forwarding"), forwarding: forwardingSchema }),
]);

async function dispatch(body: z.infer<typeof bodySchema>, requireRef: boolean) {
  const cfg = await requireSession();
  switch (body.kind) {
    case "zone":
      if (requireRef && !body.zone.ref) throw new AppError("zone ref is required");
      return await saveZone(cfg, body.zone);
    case "rule":
      if (requireRef && !body.rule.ref) throw new AppError("rule ref is required");
      return await saveRule(cfg, body.rule);
    case "redirect":
      if (requireRef && !body.redirect.ref) throw new AppError("redirect ref is required");
      return await saveRedirect(cfg, body.redirect);
    case "forwarding":
      return await addForwarding(cfg, body.forwarding);
  }
}

/** Create (POST) or update (PUT) firewall zones/rules/redirects/forwardings. */
export async function POST(req: Request) {
  return handle(async () => dispatch(bodySchema.parse(await req.json()), false));
}

export async function PUT(req: Request) {
  return handle(async () => dispatch(bodySchema.parse(await req.json()), true));
}
