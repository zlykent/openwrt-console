import { getSession } from "@/lib/auth/session";
import { handle } from "@/lib/api/respond";

/** Report whether a valid session exists, without ever exposing the password. */
export async function GET() {
  return handle(async () => {
    const s = await getSession();
    if (!s) return { authenticated: false as const };
    return {
      authenticated: true as const,
      device: { host: s.host, port: s.port, username: s.username },
    };
  });
}
