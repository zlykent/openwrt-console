"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LoaderCircleIcon, RouterIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

type Defaults = { host: string; port: number; username: string };

export function LoginForm({
  defaults,
  expired,
  next,
}: {
  defaults: Defaults;
  expired?: boolean;
  next?: string;
}) {
  const t = useTranslations("auth");
  const router = useRouter();

  const [host, setHost] = useState(defaults.host);
  const [port, setPort] = useState(String(defaults.port));
  const [username, setUsername] = useState(defaults.username);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          host: host.trim() || undefined,
          port: port.trim() ? Number(port) : undefined,
          username: username.trim() || undefined,
          password,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error?.message ?? t("connectError"));
        return;
      }
      toast.success(t("welcome"));
      router.replace(next ? decodeURIComponent(next) : "/dashboard");
      router.refresh();
    } catch {
      setError(t("connectError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden p-4">
      <div
        className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-[40rem] -translate-x-1/2 rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--primary), transparent 60%)" }}
      />
      <div className="absolute right-3 top-3 flex items-center gap-1">
        <LocaleSwitcher />
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl">
            <RouterIcon className="size-6" />
          </div>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {expired ? (
            <div className="bg-muted text-muted-foreground mb-4 rounded-lg border px-3 py-2 text-sm">
              {t("sessionExpired")}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="host">{t("host")}</Label>
                <Input
                  id="host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="192.168.1.1"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="port">{t("port")}</Label>
                <Input
                  id="port"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  inputMode="numeric"
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {error ? (
              <div className="text-destructive bg-destructive/10 flex items-start gap-2 rounded-lg border border-destructive/20 px-3 py-2 text-sm">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <LoaderCircleIcon className="size-4 animate-spin" /> : null}
              {loading ? t("submitting") : t("submit")}
            </Button>

            <p className="text-muted-foreground text-center text-xs">{t("hint")}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
