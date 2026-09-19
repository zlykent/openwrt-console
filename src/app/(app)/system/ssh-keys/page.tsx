"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { KeyIcon, SaveIcon } from "lucide-react";
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
import { useSshKeys, useSaveSshKeys } from "@/hooks/use-openwrt";
import { parseSshKeys } from "@/lib/openwrt/sshkeys-parse";

export default function SshKeysPage() {
  const t = useTranslations("sshKeys");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch } = useSshKeys();
  const save = useSaveSshKeys();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (data) setContent(data.content);
  }, [data]);

  const dirty = data ? content !== data.content : false;
  const keys = parseSshKeys(content);

  function onSave() {
    save.mutate(content, {
      onSuccess: () => toast.success(t("saved")),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="flex flex-col xl:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyIcon className="text-muted-foreground size-4" />
              {t("editor")}
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
                  placeholder={"ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... user@host"}
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {t("authorizedKeys")}
              <Badge variant="secondary" className="tabular-nums">
                {keys.length}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {keys.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">{t("noKeys")}</p>
            ) : (
              <ul className="space-y-2">
                {keys.map((k, i) => (
                  <li key={i} className="rounded-md border p-2.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[0.65rem]">
                        {k.type || t("unknownType")}
                      </Badge>
                      {k.comment ? (
                        <span className="truncate text-xs font-medium">{k.comment}</span>
                      ) : null}
                    </div>
                    <p className="text-muted-foreground mt-1 truncate font-mono text-[0.65rem]">
                      {k.data.slice(0, 32)}…
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
