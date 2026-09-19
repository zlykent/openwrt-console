import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { AppSidebar } from "@/components/app-sidebar";
import { Topbar } from "@/components/topbar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * Authenticated application shell.
 *
 * Auth is enforced here in the Node runtime (not in Edge middleware) so the
 * session decryption key stays consistent with the API route handlers. Only
 * non-secret device fields are passed down to client components.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const device = { host: session.host, port: session.port, username: session.username };

  return (
    <SidebarProvider>
      <AppSidebar device={device} />
      {/* Shell is locked to the viewport so `main` is the only outer scroller;
          pages that want inner scrolling (logs, terminal) can then constrain
          their flex chain with min-h-0. */}
      <SidebarInset className="flex h-dvh min-h-0 flex-col">
        <Topbar device={device} />
        <main className="scrollbar-thin flex-1 overflow-y-auto p-4 md:p-6">
          <div className="flex h-full w-full flex-col">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
