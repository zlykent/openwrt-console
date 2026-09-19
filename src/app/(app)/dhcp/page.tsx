"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  RefreshCwIcon,
  RouterIcon,
  SaveIcon,
  UsersIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { UciForm } from "@/components/uci-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDhcpConfig,
  useLeases,
  useNeighbors,
  useSaveDhcpConfig,
  useServiceAction,
} from "@/hooks/use-openwrt";
import { formatEpoch } from "@/lib/format";
import { DHCP_SCHEMA } from "@/lib/openwrt/dhcp-schema";
import {
  defaultInstance,
  fieldKey,
  sectionFields,
  validateInstances,
  type AppConfigGroup,
  type FieldDef,
  type FieldIssue,
} from "@/lib/openwrt/uci-schema";

function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-1">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full rounded-md" />
      ))}
    </div>
  );
}

/**
 * DHCP and DNS — the console counterpart of LuCI's `admin_network/dhcp`.
 *
 * The editable half (dnsmasq server settings over the four official tabs,
 * static leases, custom domains) is rendered by the shared schema-driven form
 * from {@link DHCP_SCHEMA}, so it validates and writes exactly like the CBI
 * model on the device. The two read-only tables below it are the live state:
 * dnsmasq's current leases and the kernel ARP table.
 */
export default function DhcpPage() {
  const t = useTranslations("dhcp");
  const ta = useTranslations("apps");
  const tc = useTranslations("common");
  const leases = useLeases();
  const neighbors = useNeighbors(10000);
  const { data, isLoading, isError, error, refetch } = useDhcpConfig();
  const save = useSaveDhcpConfig();
  const svcOp = useServiceAction();

  const [groups, setGroups] = useState<AppConfigGroup[] | null>(null);
  const [seed, setSeed] = useState<AppConfigGroup[] | null>(null);
  const [restart, setRestart] = useState(true);
  const [issues, setIssues] = useState<FieldIssue[]>([]);

  // Re-seed the form whenever a fresh payload arrives. Adjusting state during
  // render is the documented way to react to changed props; an effect would
  // paint the previous payload's form for one extra render.
  if (data && data.state.groups !== seed) {
    setSeed(data.state.groups);
    setGroups(
      data.state.groups.map((g, i) => {
        const def = DHCP_SCHEMA.sections[i];
        if (!def || g.instances.length > 0 || def.multiple) return g;
        // Singleton section absent on the device: edit a draft so that saving
        // creates it (`uci add dhcp dnsmasq`).
        return {
          ...g,
          instances: [{ ...defaultInstance(def, data.candidates), ref: def.named ?? null }],
        };
      }),
    );
  }

  const fieldLabel = (f: FieldDef) =>
    ta.has(`dhcp.f.${fieldKey(f)}`) ? ta(`dhcp.f.${fieldKey(f)}`) : f.option.replace(/_/g, " ");

  const labelOf = (type: string, option: string) => {
    const def = DHCP_SCHEMA.sections.find((s) => s.type === type);
    const field = def ? sectionFields(def).find((f) => f.option === option) : undefined;
    return field ? fieldLabel(field) : option;
  };

  /** Translate a rejected field into the message shown next to its widget. */
  function issueText(issue: FieldIssue): string {
    if (issue.reason === "atLeastOne") {
      return ta("fieldAtLeastOne", {
        field: labelOf(issue.type, issue.option),
        others: (issue.others ?? []).map((o) => labelOf(issue.type, o)).join(" / "),
      });
    }
    const label = labelOf(issue.type, issue.option);
    return issue.reason === "required"
      ? ta("fieldRequired", { field: label })
      : ta("fieldInvalid", { field: label, value: issue.value });
  }

  function onSave() {
    if (!groups) return;
    const instances = groups.flatMap((g) => g.instances);
    // CBI refuses to store a value its datatype rejects; do the same before
    // anything reaches the device.
    const found = validateInstances(DHCP_SCHEMA, instances);
    setIssues(found);
    if (found.length > 0) {
      const [first] = found;
      toast.error(
        found.length > 1
          ? `${issueText(first)} · ${ta("moreIssues", { count: found.length - 1 })}`
          : issueText(first),
      );
      return;
    }
    save.mutate(
      { instances, restart },
      {
        onSuccess: () => {
          toast.success(ta("saved"));
          refetch();
        },
        onError: (e) => toast.error((e as Error).message),
      },
    );
  }

  const busy = leases.isFetching || neighbors.isFetching;
  const dirty = groups && data ? JSON.stringify(groups) !== JSON.stringify(data.state.groups) : false;
  const svc = data?.service;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            refetch();
            leases.refetch();
            neighbors.refetch();
          }}
          disabled={busy || isLoading}
        >
          <RefreshCwIcon className={busy ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{ta("service")}</span>
              {svc ? (
                <>
                  <Badge variant={svc.installed ? "secondary" : "outline"}>
                    {svc.installed ? ta("installed") : ta("notInstalled")}
                  </Badge>
                  {svc.installed ? (
                    <>
                      <Badge variant={svc.enabled ? "secondary" : "outline"}>
                        {svc.enabled ? tc("enabled") : tc("disabled")}
                      </Badge>
                      <Badge variant={svc.running ? "secondary" : "outline"}>
                        {svc.running ? ta("running") : ta("stopped")}
                      </Badge>
                    </>
                  ) : null}
                </>
              ) : (
                <Skeleton className="h-5 w-40" />
              )}
            </div>
            {svc?.installed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={svcOp.isPending}
                onClick={() =>
                  svcOp.mutate(
                    { name: DHCP_SCHEMA.service ?? "dnsmasq", action: "restart" },
                    {
                      onSuccess: () => {
                        toast.success(ta("restarted"));
                        refetch();
                      },
                      onError: (e) => toast.error((e as Error).message),
                    },
                  )
                }
              >
                <RefreshCwIcon className="size-4" />
                {ta("restart")}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {isError ? (
          <Card className="min-h-0 flex-1">
            <CardContent className="flex min-h-0 flex-1 flex-col pt-6">
              <ErrorState error={error} onRetry={() => refetch()} />
            </CardContent>
          </Card>
        ) : isLoading || !data || !groups ? (
          <Card>
            <CardContent className="pt-6">
              <TableSkeleton rows={6} />
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto">
            {!data.state.present ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
                {ta("noConfigHint")}
              </p>
            ) : null}
            <UciForm
              schema={DHCP_SCHEMA}
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
            </div>
            <div className="flex items-center justify-end gap-3">
              <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                <Switch checked={restart} onCheckedChange={setRestart} />
                {ta("restartAfterSave")}
              </label>
              <Button onClick={onSave} disabled={!dirty || save.isPending}>
                <SaveIcon className="size-4" />
                {save.isPending ? tc("saving") : tc("save")}
              </Button>
            </div>
          </>
        )}

        <div className="auto-rows-fr grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Live dnsmasq leases */}
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RouterIcon className="text-muted-foreground size-4" />
                {t("leases")}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {leases.isError ? (
                <ErrorState error={leases.error} onRetry={() => leases.refetch()} />
              ) : leases.isLoading ? (
                <TableSkeleton />
              ) : leases.data && leases.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("hostname")}</TableHead>
                      <TableHead>{t("ip")}</TableHead>
                      <TableHead>{t("mac")}</TableHead>
                      <TableHead className="text-right">{t("expires")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leases.data.map((l) => (
                      <TableRow key={`${l.ip}-${l.mac}`}>
                        <TableCell className="font-medium">
                          {l.hostname || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{l.ip}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{l.mac}</TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                          {l.expires ? formatEpoch(l.expires) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <p className="font-medium">{t("noLeases")}</p>
                  <p className="text-muted-foreground max-w-sm text-sm">{t("noLeasesHint")}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ARP neighbours */}
          <Card className="min-h-0">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersIcon className="text-muted-foreground size-4" />
                {t("neighbors")}
                {neighbors.data ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {neighbors.data.length} {t("clientsCount")}
                  </Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              {neighbors.isError ? (
                <ErrorState
                  error={neighbors.error}
                  onRetry={() => neighbors.refetch()}
                />
              ) : neighbors.isLoading ? (
                <TableSkeleton />
              ) : neighbors.data && neighbors.data.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("ip")}</TableHead>
                      <TableHead>{t("mac")}</TableHead>
                      <TableHead>{t("interface")}</TableHead>
                      <TableHead className="text-right">{t("state")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {neighbors.data.map((n) => (
                      <TableRow key={`${n.ip}-${n.mac}-${n.dev}`}>
                        <TableCell className="font-mono text-xs font-medium">{n.ip}</TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">{n.mac}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{n.dev}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={n.state === "reachable" ? "default" : "secondary"}
                            className="text-[0.65rem]"
                          >
                            {n.state === "reachable" ? t("reachable") : t("stale")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground py-12 text-center text-sm">{t("noNeighbors")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
