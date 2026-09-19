"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SearchIcon,
  SquareIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useServiceAction, useServices } from "@/hooks/use-openwrt";

export default function ServicesPage() {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useServices();
  const action = useServiceAction();
  const [query, setQuery] = useState("");

  const services = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [data, query]);

  function run(name: string, kind: "start" | "stop" | "restart" | "enable" | "disable") {
    action.mutate(
      { name, action: kind },
      {
        onSuccess: () => toast.success(t("actionOk")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <div className="relative">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tc("search")}
            className="w-44 pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <Card className="min-h-0 flex-1">
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full rounded-md" />
              ))}
            </div>
          ) : services.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("service")}</TableHead>
                  <TableHead>{tc("status")}</TableHead>
                  <TableHead>{t("instances")}</TableHead>
                  <TableHead className="text-center">{t("autostart")}</TableHead>
                  <TableHead className="text-right">{tc("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((s) => {
                  const pids = s.instances
                    .map((i) => i.pid)
                    .filter((p): p is number => typeof p === "number");
                  return (
                    <TableRow key={s.name}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={s.running ? "default" : "secondary"}
                          className="gap-1.5 text-[0.65rem]"
                        >
                          <span
                            className={
                              s.running
                                ? "bg-emerald-400 inline-block size-1.5 rounded-full"
                                : "bg-muted-foreground/40 inline-block size-1.5 rounded-full"
                            }
                          />
                          {s.running ? tc("running") : tc("stopped")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">
                        {pids.length > 0 ? pids.join(", ") : s.instances.length || "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={s.enabled ?? false}
                          disabled={action.isPending}
                          onCheckedChange={(v) => run(s.name, v ? "enable" : "disable")}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {s.running ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={tc("stop")}
                              disabled={action.isPending}
                              onClick={() => run(s.name, "stop")}
                            >
                              <SquareIcon className="size-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title={tc("start")}
                              disabled={action.isPending}
                              onClick={() => run(s.name, "start")}
                            >
                              <PlayIcon className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={tc("restart")}
                            disabled={action.isPending}
                            onClick={() => run(s.name, "restart")}
                          >
                            <RotateCwIcon className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noServices")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
