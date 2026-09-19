"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ClockIcon, SaveIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useCrontab, useSaveCrontab } from "@/hooks/use-openwrt";

export default function CrontabPage() {
  const t = useTranslations("crontab");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch } = useCrontab();
  const save = useSaveCrontab();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (data) setContent(data.content);
  }, [data]);

  const dirty = data ? content !== data.content : false;
  const entries = content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")).length;

  function onSave() {
    save.mutate(content, {
      onSuccess: () => toast.success(t("saved")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card className="flex flex-1 flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClockIcon className="text-muted-foreground size-4" />
            {t("editor")}
            {data ? (
              <Badge variant="secondary" className="tabular-nums">
                {entries} {t("entries")}
              </Badge>
            ) : null}
          </CardTitle>
          <CardDescription>{t("hint")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-3">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading || !data ? (
            <Skeleton className="min-h-72 w-full flex-1 rounded-lg" />
          ) : (
            <>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                spellCheck={false}
                className="min-h-72 flex-1 font-mono text-xs"
                placeholder={"# m h dom mon dow command\n0 0 * * * /etc/init.d/acme start"}
              />
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">{t("formatHint")}</p>
                <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
                  <SaveIcon className="size-4" />
                  {save.isPending ? tc("saving") : tc("save")}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
