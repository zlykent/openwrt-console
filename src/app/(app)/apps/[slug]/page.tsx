"use client";

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ExternalLinkIcon, RefreshCwIcon, SaveIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { UciForm } from "@/components/uci-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAppConfig, useAppServiceOp, useSaveAppConfig } from "@/hooks/use-openwrt";
import { APP_REGISTRY } from "@/lib/openwrt/apps";
import {
  defaultInstance,
  fieldKey,
  sectionFields,
  validateInstances,
  type AppConfigGroup,
  type FieldDef,
  type FieldIssue,
} from "@/lib/openwrt/uci-schema";

/** Generic schema-driven page for every registered luci-app. */
export default function AppDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const schema = APP_REGISTRY[slug];
  const t = useTranslations("apps");
  const tc = useTranslations("common");
  const { data, isLoading, isError, error, refetch } = useAppConfig(slug);
  const save = useSaveAppConfig(slug);
  const svcOp = useAppServiceOp(slug);
  const [groups, setGroups] = useState<AppConfigGroup[] | null>(null);
  const [seed, setSeed] = useState<AppConfigGroup[] | null>(null);
  const [restart, setRestart] = useState(true);
  const [issues, setIssues] = useState<FieldIssue[]>([]);

  // Re-seed the form whenever a fresh payload arrives. Adjusting state during
  // render is the documented way to react to changed props; an effect would
  // paint the previous payload's form for one extra render.
  if (data && schema && data.state.groups !== seed) {
    setSeed(data.state.groups);
    setGroups(
      data.state.groups.map((g, i) => {
        const def = schema.sections[i];
        if (!def || g.instances.length > 0 || def.multiple) return g;
        // Singleton section absent on the device: edit a draft bound to its
        // canonical name so saving (re)creates it.
        return {
          ...g,
          instances: [{ ...defaultInstance(def, data.candidates), ref: def.named ?? null }],
        };
      }),
    );
  }

  if (!schema) notFound();

  // The Topbar renders the page title (from the nav item or `apps.<slug>.title`).
  const fieldLabel = (f: FieldDef) =>
    t.has(`${slug}.f.${fieldKey(f)}`) ? t(`${slug}.f.${fieldKey(f)}`) : f.option.replace(/_/g, " ");
  const dirty =
    groups && data ? JSON.stringify(groups) !== JSON.stringify(data.state.groups) : false;
  const svc = data?.service;

  /** Translate a rejected field into the message shown next to its widget. */
  function issueText(issue: FieldIssue): string {
    const def = schema?.sections.find((s) => s.type === issue.type);
    const field = def ? sectionFields(def).find((f) => f.option === issue.option) : undefined;
    const label = field ? fieldLabel(field) : issue.option;
    return issue.reason === "required"
      ? t("fieldRequired", { field: label })
      : t("fieldInvalid", { field: label, value: issue.value });
  }

  function onSave() {
    if (!groups || !schema) return;
    const instances = groups.flatMap((g) => g.instances);
    // CBI refuses to store a value its datatype rejects; do the same before
    // anything reaches the device.
    const found = validateInstances(schema, instances);
    setIssues(found);
    if (found.length > 0) {
      const [first] = found;
      toast.error(
        found.length > 1
          ? `${issueText(first)} · ${t("moreIssues", { count: found.length - 1 })}`
          : issueText(first),
      );
      return;
    }
    save.mutate(
      { instances, restart },
      {
        onSuccess: () => toast.success(t("saved")),
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  return (
    <div>
      <PageHeader subtitle={`/etc/config/${schema.config}`}>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCwIcon className="size-4" />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{t("service")}</span>
              {svc ? (
                <>
                  <Badge variant={svc.installed ? "secondary" : "outline"}>
                    {svc.installed ? t("installed") : t("notInstalled")}
                  </Badge>
                  {svc.installed ? (
                    <>
                      <Badge variant={svc.enabled ? "secondary" : "outline"}>
                        {svc.enabled ? tc("enabled") : tc("disabled")}
                      </Badge>
                      <Badge variant={svc.running ? "secondary" : "outline"}>
                        {svc.running ? t("running") : t("stopped")}
                      </Badge>
                    </>
                  ) : null}
                </>
              ) : (
                <Skeleton className="h-5 w-40" />
              )}
            </div>
            {svc?.installed ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                  <Switch
                    checked={svc.enabled}
                    disabled={svcOp.isPending}
                    onCheckedChange={(c) =>
                      svcOp.mutate(c ? "enable" : "disable", {
                        onError: (e) => toast.error((e as Error).message),
                      })
                    }
                  />
                  {tc("enabled")}
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={svcOp.isPending}
                  onClick={() =>
                    svcOp.mutate("restart", {
                      onSuccess: () => toast.success(t("restarted")),
                      onError: (e) => toast.error((e as Error).message),
                    })
                  }
                >
                  {t("restart")}
                </Button>
              </div>
            ) : null}
            {schema.links?.length ? (
              <div className="flex flex-wrap items-center gap-2">
                {schema.links.map((l) => (
                  <Button key={l.href} variant="outline" size="sm" asChild>
                    <a href={l.href} target="_blank" rel="noreferrer noopener">
                      <ExternalLinkIcon className="size-4" />
                      {l.label}
                    </a>
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading || !data || !groups ? (
          <Skeleton className="h-96 w-full rounded-xl" />
        ) : (
          <>
            {!data.state.present ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                {t("noConfigHint")}
              </p>
            ) : null}
            <UciForm
              schema={schema}
              groups={groups}
              onChange={(next) => {
                setGroups(next);
                // Editing clears the marks: they describe the last attempt.
                if (issues.length > 0) setIssues([]);
              }}
              fieldLabel={fieldLabel}
              candidates={data.candidates}
              issues={issues}
              issueText={issueText}
            />
            <div className="flex items-center justify-end gap-3">
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={restart} onCheckedChange={setRestart} />
                {t("restartAfterSave")}
              </label>
              <Button onClick={onSave} disabled={!dirty || save.isPending}>
                <SaveIcon className="size-4" />
                {save.isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
