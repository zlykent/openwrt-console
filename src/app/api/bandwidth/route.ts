import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import {
  commitNlbw,
  getNlbwConfig,
  saveNlbwConfig,
  type NlbwConfigInput,
} from "@/lib/openwrt/nlbwmon";

/**
 * luci-app-nlbwmon configuration (`admin/nlbw/config`) plus the `commit`
 * action that the display page links to as "Force reload…".
 */

const configSchema = z.object({
  period: z.enum(["relative", "absolute"]),
  interval: z.string().max(8),
  date: z.string().max(16),
  days: z.string().max(8),
  ifaces: z.array(z.string().max(64)).max(64),
  subnets: z.array(z.string().max(64)).max(64),
  databaseLimit: z.string().max(16),
  databasePrealloc: z.boolean(),
  databaseCompress: z.boolean(),
  databaseGenerations: z.string().max(16),
  commitInterval: z.string().max(16),
  refreshInterval: z.string().max(16),
  databaseDirectory: z.string().max(128),
  protocols: z.string().max(64_000),
});

const actionSchema = z.object({ op: z.enum(["commit"]) });

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getNlbwConfig(cfg);
  });
}

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = configSchema.parse(await req.json()) as NlbwConfigInput;
    await saveNlbwConfig(cfg, body);
    return { ok: true } as const;
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { op } = actionSchema.parse(await req.json());
    if (op === "commit") await commitNlbw(cfg);
    return { ok: true } as const;
  });
}
