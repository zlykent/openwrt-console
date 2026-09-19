"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { SearchIcon } from "lucide-react";
import { ErrorState } from "@/components/error-state";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppsSummary } from "@/hooks/use-openwrt";
import { APP_LIST } from "@/lib/openwrt/apps";

/** Application centre: searchable, alphabetically grouped luci-app catalog. */
export default function AppsPage() {
  const t = useTranslations("apps");
  const [q, setQ] = useState("");
  const { data, isLoading, isError, error, refetch } = useAppsSummary();

  const title = (slug: string, fallback: string) =>
    t.has(`${slug}.title`) ? t(`${slug}.title`) : fallback;

  const apps = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return APP_LIST;
    return APP_LIST.filter(
      (a) => a.slug.includes(query) || title(a.slug, a.name).toLowerCase().includes(query),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const letters = useMemo(() => {
    const map = new Map<string, typeof apps>();
    for (const a of apps) {
      const ch = a.slug[0].toUpperCase();
      map.set(ch, [...(map.get(ch) ?? []), a]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [apps]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader subtitle={t("catalogSubtitle")}>
        <div className="relative w-64">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </PageHeader>

      {isError ? (
        <div className="mb-4">
          <ErrorState error={error} onRetry={() => refetch()} />
        </div>
      ) : null}

      <div className="space-y-6">
        {letters.map(([ch, list]) => (
          <section key={ch} className="space-y-2">
            <h3 className="text-muted-foreground text-xs font-medium">{ch}</h3>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((a) => {
                const st = data?.find((s) => s.slug === a.slug);
                return (
                  <Link key={a.slug} href={`/apps/${a.slug}`}>
                    <Card className="hover:border-primary/40 hover:bg-muted/40 transition-colors">
                      <CardContent className="flex items-start justify-between gap-2 p-4">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {title(a.slug, a.name)}
                          </div>
                          <div className="text-muted-foreground truncate font-mono text-xs">
                            {a.slug}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-1">
                          {st ? (
                            <>
                              {st.running ? (
                                <Badge variant="secondary" className="text-emerald-600 dark:text-emerald-400">
                                  {t("running")}
                                </Badge>
                              ) : st.installed ? (
                                <Badge variant="secondary">{t("stopped")}</Badge>
                              ) : (
                                <Badge variant="outline">{t("notInstalled")}</Badge>
                              )}
                              {st.present ? null : (
                                <Badge variant="outline">{t("noConfig")}</Badge>
                              )}
                            </>
                          ) : isLoading ? (
                            <Skeleton className="h-5 w-16" />
                          ) : (
                            <Badge variant="outline">{t("statusUnknown")}</Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        {apps.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">{t("noResults")}</p>
        ) : null}
      </div>
    </div>
  );
}
