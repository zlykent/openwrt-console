import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { AppError } from "@/lib/api/errors";
import { getAppConfig, saveAppConfig, serviceAction } from "@/lib/openwrt/apps-service";
import { serviceName, SERVICE_OPS } from "@/lib/openwrt/uci-schema";
import { APP_REGISTRY } from "@/lib/openwrt/apps";

function schemaOf(slug: string) {
  const schema = APP_REGISTRY[slug];
  if (!schema) throw new AppError(`Unknown application: ${slug}`, 404);
  return schema;
}

const InstanceSchema = z.object({
  ref: z.string().nullable(),
  type: z.string(),
  values: z.record(z.string(), z.union([z.string(), z.boolean(), z.array(z.string())])),
});

const SaveSchema = z.object({
  instances: z.array(InstanceSchema),
  restart: z.boolean().default(false),
});

const OpSchema = z.object({ op: z.enum(SERVICE_OPS) });

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const { slug } = await params;
    const cfg = await requireSession();
    return await getAppConfig(cfg, schemaOf(slug));
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const { slug } = await params;
    const cfg = await requireSession();
    const input = SaveSchema.parse(await req.json());
    return await saveAppConfig(cfg, schemaOf(slug), input.instances, input.restart);
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  return handle(async () => {
    const { slug } = await params;
    const cfg = await requireSession();
    const { op } = OpSchema.parse(await req.json());
    const schema = schemaOf(slug);
    return await serviceAction(cfg, serviceName(schema), op);
  });
}
