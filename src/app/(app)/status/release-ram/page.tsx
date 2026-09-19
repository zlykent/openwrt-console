"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowRightIcon, MemoryStickIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useReleaseRam, useSystemInfo } from "@/hooks/use-openwrt";
import { formatBytes } from "@/lib/format";
import type { MemoryInfo } from "@/lib/openwrt/types";

/**
 * luci-app-release_ram (admin/status/release_ram). The official controller runs
 * `sync && echo 3 > /proc/sys/vm/drop_caches` and redirects back to the status
 * overview, so this page exposes the same single action plus the before/after
 * memory figures the redirect would otherwise hide.
 */

function MemoryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-mono text-sm tabular-nums">{formatBytes(value)}</p>
    </div>
  );
}

function MemoryGrid({ memory }: { memory: MemoryInfo }) {
  const t = useTranslations("releaseRam");
  const used = memory.total > 0 ? Math.round((memory.used / memory.total) * 100) : 0;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="text-muted-foreground flex items-center justify-between text-xs">
          <span>{t("used")}</span>
          <span className="font-mono tabular-nums">
            {formatBytes(memory.used)} / {formatBytes(memory.total)} ({used}%)
          </span>
        </div>
        <Progress value={used} />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <MemoryStat label={t("total")} value={memory.total} />
        <MemoryStat label={t("free")} value={memory.free} />
        <MemoryStat label={t("used")} value={memory.used} />
        <MemoryStat label={t("cached")} value={memory.cached} />
        <MemoryStat label={t("buffered")} value={memory.buffered} />
      </div>
    </div>
  );
}

export default function ReleaseRamPage() {
  const t = useTranslations("releaseRam");
  const info = useSystemInfo();
  const release = useReleaseRam();
  const [result, setResult] = useState<{ before: MemoryInfo; after: MemoryInfo; freed: number } | null>(null);

  function onRelease() {
    release.mutate(undefined, {
      onSuccess: (data) => {
        setResult(data);
        toast.success(t("freed", { size: formatBytes(data.freed) }));
        info.refetch();
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button size="sm" onClick={onRelease} disabled={release.isPending}>
          <MemoryStickIcon className={release.isPending ? "size-4 animate-pulse" : "size-4"} />
          {t("action")}
        </Button>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MemoryStickIcon className="size-4" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("hint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {info.isError ? (
              <ErrorState error={info.error} onRetry={() => info.refetch()} />
            ) : info.isLoading || !info.data ? (
              <div className="space-y-3">
                <Skeleton className="h-1 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full rounded-md" />
                  ))}
                </div>
              </div>
            ) : (
              <MemoryGrid memory={info.data.memory} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("command")}</CardTitle>
            <CardDescription>{t("subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
              {t("command")}
            </pre>
            {result ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  {t("freed", { size: formatBytes(result.freed) })}
                </p>
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span>{t("before")}</span>
                  <ArrowRightIcon className="size-3" />
                  <span>{t("after")}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("before")}</p>
                    <MemoryStat label={t("free")} value={result.before.free} />
                    <MemoryStat label={t("used")} value={result.before.used} />
                    <MemoryStat label={t("cached")} value={result.before.cached} />
                  </div>
                  <div className="space-y-3 rounded-md border p-3">
                    <p className="text-muted-foreground text-xs">{t("after")}</p>
                    <MemoryStat label={t("free")} value={result.after.free} />
                    <MemoryStat label={t("used")} value={result.after.used} />
                    <MemoryStat label={t("cached")} value={result.after.cached} />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">—</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
