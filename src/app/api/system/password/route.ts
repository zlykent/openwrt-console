import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { mapError, ok } from "@/lib/api/respond";
import { changePassword } from "@/lib/openwrt/system";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/crypto";
import { SESSION_COOKIE } from "@/lib/config";

const schema = z.object({ password: z.string().min(1).max(512) });

export async function POST(req: Request) {
  try {
    const cfg = await requireSession();
    const { password } = schema.parse(await req.json());
    await changePassword(cfg, password);
    // Re-seal the session with the new password so any future reconnect
    // (e.g. after the pooled SSH connection drops) still authenticates.
    const token = await createSessionToken({ ...cfg, password });
    const res = ok({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return mapError(e);
  }
}
