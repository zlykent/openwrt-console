"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CpuIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useKillProcess, useProcesses } from "@/hooks/use-openwrt";
import type { ProcessInfo } from "@/lib/openwrt/types";
import { formatBytes } from "@/lib/format";

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-md" />
      ))}
    </div>
  );
}

export default function ProcessesPage() {
  const t = useTranslations("processes");
  const tc = useTranslations("common");
  const [auto, setAuto] = useState(true);
  const { data, isLoading, isError, error, refetch, isFetching } = useProcesses(
    auto ? 5000 : undefined,
  );
  const kill = useKillProcess();

  function onKill(p: ProcessInfo, signal: "term" | "kill") {
    kill.mutate(
      { pid: p.pid, signal },
      {
        onSuccess: () => toast.success(t("killed", { pid: p.pid })),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <div className="flex items-center gap-2">
          <Label htmlFor="auto" className="text-muted-foreground text-xs font-normal">
            {tc("autoRefresh")}
          </Label>
          <Switch id="auto" checked={auto} onCheckedChange={setAuto} />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CpuIcon className="text-muted-foreground size-4" />
            {t("running")}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {data.length}
              </Badge>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <TableSkeleton />
          ) : data && data.length > 0 ? (
            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-right">{t("pid")}</TableHead>
                    <TableHead className="w-16 text-right">{t("ppid")}</TableHead>
                    <TableHead className="w-20">{t("user")}</TableHead>
                    <TableHead className="w-16 text-right">{t("cpu")}</TableHead>
                    <TableHead className="w-16 text-right">{t("mem")}</TableHead>
                    <TableHead className="w-20 text-right">{t("vsz")}</TableHead>
                    <TableHead>{t("command")}</TableHead>
                    <TableHead className="w-10 text-right">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((p) => (
                    <TableRow key={p.pid}>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.pid}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                        {p.ppid}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{p.user}</TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.pctCpu.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {p.pctMem.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right font-mono text-xs tabular-nums">
                        {formatBytes(p.vsz * 1024)}
                      </TableCell>
                      <TableCell className="max-w-0 truncate font-mono text-xs" title={p.command}>
                        {p.command}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              disabled={kill.isPending || p.pid <= 1}
                            >
                              <Trash2Icon className="text-destructive size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("killConfirm")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                <span className="font-mono">
                                  PID {p.pid} · {p.command}
                                </span>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                              <AlertDialogAction variant="outline" onClick={() => onKill(p, "term")}>
                                {t("terminate")}
                              </AlertDialogAction>
                              <AlertDialogAction variant="destructive" onClick={() => onKill(p, "kill")}>
                                {t("forceKill")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{tc("noData")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
