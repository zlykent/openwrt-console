import { SESSION_COOKIE } from "@/lib/config";
import { sessionCookieOptions } from "@/lib/auth/crypto";
import { ok } from "@/lib/api/respond";
import { closeConnection, } from "@/lib/ssh/client";
import { getSession } from "@/lib/auth/session";

/** Clear the session cookie and drop any pooled SSH connection for it. */
export async function POST() {
  const session = await getSession();
  if (session) closeConnection(session);
  const res = ok({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
