"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { TerminalCommand } from "@/components/terminal";

const DeviceTerminal = dynamic(
  () => import("@/components/terminal").then((m) => m.DeviceTerminal),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-64 w-full flex-1 rounded-lg" />,
  },
);

const EXAMPLES = [
  "uptime",
  "cat /etc/openwrt_release",
  "ip -4 addr",
  "logread | tail -n 20",
  "df -h",
  "free",
  "uname -a",
];

export default function TerminalPage() {
  const t = useTranslations("terminal");
  const [command, setCommand] = useState<TerminalCommand | null>(null);
  const [clearToken, setClearToken] = useState(0);

  function run(cmd: string) {
    setCommand({ cmd, n: Date.now() });
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => setClearToken((v) => v + 1)}>
          {t("clear")}
        </Button>
      </PageHeader>

      <Card className="flex flex-1 flex-col">
        <CardContent className="flex flex-1 flex-col gap-3">
          <DeviceTerminal command={command} clearToken={clearToken} />

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground mr-1 text-xs">{t("examples")}:</span>
            {EXAMPLES.map((ex) => (
              <Button
                key={ex}
                variant="secondary"
                size="xs"
                className="font-mono"
                onClick={() => run(ex)}
              >
                {ex}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
