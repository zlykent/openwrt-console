import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { getSshKeys, setSshKeys } from "@/lib/openwrt/sshkeys";

export async function GET() {
  return handle(async () => {
    const cfg = await requireSession();
    return await getSshKeys(cfg);
  });
}

const SshKeysSchema = z.object({ content: z.string() });

export async function PUT(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { content } = SshKeysSchema.parse(await req.json());
    return await setSshKeys(cfg, content);
  });
}
