import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";
import { exec } from "@/lib/ssh/client";

const schema = z.object({ command: z.string().min(1).max(4000) });

/**
 * Line-based web terminal backend.
 *
 * By design this runs an arbitrary shell command as the authenticated session
 * user (root on the device) — that is the whole point of a terminal. Access is
 * gated entirely by `requireSession()`: the encrypted, httpOnly session cookie
 * must be present and valid, and it can only be created by a successful SSH
 * login. There is no unauthenticated path here.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const cfg = await requireSession();
    const { command } = schema.parse(await req.json());
    const r = await exec(cfg, command, { timeoutMs: 30000 });
    return { stdout: r.stdout, stderr: r.stderr, code: r.code };
  });
}
