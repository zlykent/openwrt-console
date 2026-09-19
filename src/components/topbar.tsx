"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LogOutIcon, UserIcon } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { activeNavItem } from "@/components/app-sidebar";
import { APP_REGISTRY } from "@/lib/openwrt/apps";
import { useBoard } from "@/hooks/use-openwrt";
import { cn } from "@/lib/utils";

export function Topbar({ device }: { device: { host: string; username: string } }) {
  const t = useTranslations("auth");
  const tn = useTranslations("nav");
  const ta = useTranslations("apps");
  const router = useRouter();
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const appSlug = /^\/apps\/([^/]+)$/.exec(pathname)?.[1];
  const app = appSlug ? APP_REGISTRY[appSlug] : undefined;
  const appTitle = app
    ? ta.has(`${app.slug}.title`)
      ? ta(`${app.slug}.title`)
      : app.name
    : null;
  const { data: board } = useBoard();

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      toast.success(t("signedOut"));
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-3 backdrop-blur md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        {/* The only heading on every page: PageHeader deliberately leaves the
            title to the Topbar, so this has to be a real h1 for a11y. Tailwind
            preflight inherits size/weight, so the utilities below still win. */}
        <h1 className="truncate text-sm font-medium">
          {appTitle ?? (active ? tn(active.labelKey) : "")}
        </h1>
      </div>

      <div className="border-border bg-muted/40 flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            board ? "bg-emerald-500" : "bg-destructive",
          )}
        />
        <span className="truncate text-sm font-medium">{device.host}</span>
        {board?.release?.version ? (
          <span className="text-muted-foreground hidden truncate text-xs lg:inline">
            {board.release.distribution} {board.release.version}
          </span>
        ) : null}
      </div>
      <Separator orientation="vertical" className="mx-1 h-4" />
      <LocaleSwitcher />
      <ThemeToggle />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={device.username}>
            <UserIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="text-sm font-medium">{device.username}</div>
            <div className="text-muted-foreground text-xs">
              {device.host}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={logout}
            className="text-destructive focus:text-destructive"
          >
            <LogOutIcon className="size-4" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
