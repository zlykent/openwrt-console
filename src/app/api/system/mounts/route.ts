import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getMountsState, saveMount, saveSwap } from "@/lib/openwrt/mounts";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getMountsState(cfg);
  });
}

const MountFields = {
  target: z.string().min(1),
  device: z.string().optional(),
  uuid: z.string().optional(),
  label: z.string().optional(),
  fstype: z.string().optional(),
  options: z.string().optional(),
  enabledFsck: z.boolean().optional(),
  // CBI leaves `Flag` without o.default, i.e. disabled. Defaulting to true here
  // would make a caller that omits the field arm an entry for the next apply.
  enabled: z.boolean().default(false),
};

const SwapFields = {
  device: z.string().optional(),
  uuid: z.string().optional(),
  label: z.string().optional(),
  enabled: z.boolean().default(false),
};

/** One endpoint for both entry kinds; the section type decides the writer. */
const BodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mount"), ref: z.string().optional(), ...MountFields }),
  z.object({ kind: z.literal("swap"), ref: z.string().optional(), ...SwapFields }),
]);

export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const body = BodySchema.parse(await req.json());
    if (body.kind === "mount") {
      return await saveMount(
        cfg,
        {
          target: body.target,
          device: body.device,
          uuid: body.uuid,
          label: body.label,
          fstype: body.fstype,
          options: body.options,
          enabledFsck: body.enabledFsck,
          enabled: body.enabled,
        },
        body.ref,
      );
    }
    return await saveSwap(
      cfg,
      {
        device: body.device,
        uuid: body.uuid,
        label: body.label,
        enabled: body.enabled,
      },
      body.ref,
    );
  });
}
