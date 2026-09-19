"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DownloadIcon,
  PackageIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePackageAction, usePackages } from "@/hooks/use-openwrt";
import type { PackageResult } from "@/lib/openwrt/packages";

const NAME_RE = /^[A-Za-z0-9._+-]+$/;

export default function PackagesPage() {
  const t = useTranslations("packages");
  const tc = useTranslations("common");
  const tt = useTranslations("terminal");
  const { data, isLoading, isError, error, refetch, isFetching } = usePackages();
  const act = usePackageAction();
  const [query, setQuery] = useState("");
  const [installName, setInstallName] = useState("");
  const [result, setResult] = useState<PackageResult | null>(null);

  const packages = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || p.version.toLowerCase().includes(q),
    );
  }, [data, query]);

  function showResult(r: PackageResult) {
    setResult(r);
    if (r.code === 0) toast.success(t("actionOk"));
    else toast.error(`${t("actionOk")} (exit ${r.code})`);
  }

  function onUpdate() {
    act.mutate(
      { action: "update" },
      { onSuccess: showResult, onError: (e) => toast.error((e as Error).message) },
    );
  }

  function onInstall(e: React.FormEvent) {
    e.preventDefault();
    const name = installName.trim();
    if (!NAME_RE.test(name)) {
      toast.error(tc("required"));
      return;
    }
    act.mutate(
      { action: "install", name },
      {
        onSuccess: (r) => {
          showResult(r);
          setInstallName("");
        },
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  function onRemove(name: string) {
    act.mutate(
      { action: "remove", name },
      { onSuccess: showResult, onError: (e) => toast.error((e as Error).message) },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={onUpdate} disabled={act.isPending}>
          <DownloadIcon className={act.isPending ? "size-4 animate-pulse" : "size-4"} />
          {act.isPending ? t("updating") : t("updateLists")}
        </Button>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <Card className="min-h-0 flex-1">
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-8"
              />
            </div>
            <form onSubmit={onInstall} className="flex items-center gap-2">
              <Input
                value={installName}
                onChange={(e) => setInstallName(e.target.value)}
                placeholder={t("installPlaceholder")}
                className="w-44"
              />
              <Button type="submit" size="sm" disabled={act.isPending || !installName.trim()}>
                <PackageIcon className="size-4" />
                {t("install")}
              </Button>
            </form>
          </div>

          {data ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Badge variant="secondary" className="tabular-nums">
                {data.length}
              </Badge>
              {t("installed")}
              {query ? ` · ${packages.length} ${tc("search").toLowerCase()}` : null}
            </div>
          ) : null}

          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-md" />
              ))}
            </div>
          ) : packages.length > 0 ? (
            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{tc("name")}</TableHead>
                    <TableHead>{t("version")}</TableHead>
                    <TableHead className="w-10 text-right">{tc("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {p.version || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon-sm" disabled={act.isPending}>
                              <Trash2Icon className="text-destructive size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("uninstall")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("confirmUninstall", { name: p.name })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => onRemove(p.name)}
                              >
                                {t("uninstall")}
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
            <p className="text-muted-foreground py-12 text-center text-sm">{t("noPackages")}</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={result !== null} onOpenChange={(o) => !o && setResult(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("output")}
              {result ? (
                <Badge variant={result.code === 0 ? "default" : "destructive"}>
                  {tt("exitCode")} {result.code}
                </Badge>
              ) : null}
            </DialogTitle>
            <DialogDescription>opkg</DialogDescription>
          </DialogHeader>
          <pre className="bg-muted max-h-72 overflow-auto rounded-lg p-3 text-xs whitespace-pre-wrap">
            {result?.output || tc("noData")}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
