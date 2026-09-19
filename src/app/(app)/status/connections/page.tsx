"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConntrack } from "@/hooks/use-openwrt";

export default function StatusConnectionsPage() {
  const t = useTranslations("statusConnections");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch, isFetching } = useConntrack(5000);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = data?.entries ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    // Match against what the table renders (`ip:port`), so filtering by the
    // visible text works, plus the bare port and protocol fields.
    return all.filter((e) =>
      [
        e.proto,
        e.state,
        e.src,
        e.dst,
        e.sport,
        e.dport,
        `${e.src}:${e.sport}`,
        `${e.dst}:${e.dport}`,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [data, filter]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="text-muted-foreground size-4" />
            {t("connections")}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {data.count}
              </Badge>
            ) : null}
          </CardTitle>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("filterPlaceholder")}
            className="h-8 w-56 text-xs"
          />
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded-md" />
              ))}
            </div>
          ) : !data.supported ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center">
              <p className="font-medium">{t("unsupported")}</p>
              <p className="text-muted-foreground max-w-md text-sm">{t("unsupportedHint")}</p>
            </div>
          ) : rows.length > 0 ? (
            <div className="contents">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("proto")}</TableHead>
                    <TableHead>{t("state")}</TableHead>
                    <TableHead>{t("source")}</TableHead>
                    <TableHead>{t("destination")}</TableHead>
                    <TableHead className="text-right">{t("timeout")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e, i) => (
                    <TableRow key={`${e.proto}-${e.src}-${e.sport}-${e.dst}-${e.dport}-${i}`}>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[0.65rem] uppercase">
                          {e.proto}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {e.state || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.src}
                        {e.sport ? <span className="text-muted-foreground">:{e.sport}</span> : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {e.dst}
                        {e.dport ? <span className="text-muted-foreground">:{e.dport}</span> : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                        {e.timeout}s
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {filter ? t("noMatches") : t("noConnections")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
