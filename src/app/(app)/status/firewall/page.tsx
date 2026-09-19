"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CopyIcon,
  DownloadIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useFirewallStatus } from "@/hooks/use-openwrt";

export default function StatusFirewallPage() {
  const t = useTranslations("statusFirewall");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useFirewallStatus();

  const lineCount = data?.ruleset ? data.ruleset.split("\n").length : 0;

  function onCopy() {
    if (!data?.ruleset) return;
    navigator.clipboard
      .writeText(data.ruleset)
      .then(() => toast.success(t("copied")))
      .catch((e) => toast.error((e as Error).message));
  }

  function onDownload() {
    if (!data?.ruleset) return;
    const blob = new Blob([data.ruleset], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `openwrt-${data.backend}-ruleset-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <Card className="flex flex-1 flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="text-muted-foreground size-4" />
            {t("ruleset")}
            {data ? (
              <Badge variant="outline" className="font-mono text-[0.65rem] uppercase">
                {data.backend}
              </Badge>
            ) : null}
            {data?.supported ? (
              <Badge variant="secondary" className="tabular-nums">
                {t("lineCount", { count: lineCount })}
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onCopy}
              disabled={!data?.supported}
            >
              <CopyIcon className="size-3.5" />
              {t("copy")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={!data?.supported}
            >
              <DownloadIcon className="size-3.5" />
              {t("download")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full rounded" />
              ))}
            </div>
          ) : !data.supported ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
                <ShieldCheckIcon className="size-6" />
              </div>
              <div className="max-w-md">
                <p className="font-medium">{t("unsupported")}</p>
                <p className="text-muted-foreground mt-1 text-sm">{t("unsupportedHint")}</p>
              </div>
            </div>
          ) : data.ruleset.trim() === "" ? (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("empty")}</p>
          ) : (
            <pre className="scrollbar-thin bg-muted/40 min-h-0 flex-1 overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed">
              {data.ruleset}
            </pre>
          )}
          <p className="text-muted-foreground mt-3 text-xs">{t("refreshHint")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
