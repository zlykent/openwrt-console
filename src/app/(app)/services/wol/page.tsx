"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { AlertTriangleIcon, PowerIcon, ZapIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWakeHost, useWol } from "@/hooks/use-openwrt";
import { WOL_ETHERWAKE, WOL_WOL } from "@/lib/openwrt/wol-shared";

/** Empty value = "Broadcast on all interfaces" in the official ListValue. */
const ALL_INTERFACES = "__all__";

export default function WolPage() {
  const t = useTranslations("wol");
  const { data, isLoading, isError, error, refetch } = useWol();
  const wake = useWakeHost();

  // Official CBI renders a plain <select>; with no stored value the browser
  // shows the first option, so etherwake is the effective initial choice.
  const [binary, setBinary] = useState(WOL_ETHERWAKE);
  const [ifaceChoice, setIfaceChoice] = useState("");
  const [mac, setMac] = useState("");

  // Official default: `iface.default = "br-lan"`, else the first device.
  const defaultIface = useMemo(() => {
    if (!data) return ALL_INTERFACES;
    return data.devices.includes("br-lan") ? "br-lan" : (data.devices[0] ?? ALL_INTERFACES);
  }, [data]);
  const iface = ifaceChoice || defaultIface;

  const showBinary = !!data?.hasEtherwake && !!data?.hasWol;
  // "" = let the server pick (official fallback when only one tool exists).
  const effectiveBinary = showBinary ? binary : "";
  const showIface = !!data?.hasEtherwake && (effectiveBinary === "" || effectiveBinary === WOL_ETHERWAKE);

  const hosts = useMemo(() => data?.hosts ?? [], [data]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = mac.trim();
    if (!value) {
      toast.error(t("macRequired"));
      return;
    }
    wake.mutate(
      {
        binary: effectiveBinary || undefined,
        iface: showIface && iface !== ALL_INTERFACES ? iface : undefined,
        mac: value,
      },
      { onError: (err) => toast.error((err as Error).message) },
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ZapIcon className="text-muted-foreground size-4" />
              {t("title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!data.hasEtherwake && !data.hasWol ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <AlertTriangleIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <span>{t("noUtility")}</span>
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="space-y-4">
              {showBinary ? (
                <div className="grid gap-1.5 sm:max-w-md">
                  <Label htmlFor="wol-binary">{t("binary")}</Label>
                  <Select value={binary} onValueChange={setBinary}>
                    <SelectTrigger id="wol-binary">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={WOL_ETHERWAKE}>Etherwake</SelectItem>
                      <SelectItem value={WOL_WOL}>WoL</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">{t("binaryHint")}</p>
                </div>
              ) : null}

              {showIface ? (
                <div className="grid gap-1.5 sm:max-w-md">
                  <Label htmlFor="wol-iface">{t("iface")}</Label>
                  <Select
                    value={iface}
                    onValueChange={setIfaceChoice}
                  >
                    <SelectTrigger id="wol-iface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_INTERFACES}>{t("allInterfaces")}</SelectItem>
                      {data.devices.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-muted-foreground text-xs">{t("ifaceHint")}</p>
                </div>
              ) : null}

              <div className="grid gap-1.5 sm:max-w-md">
                <Label htmlFor="wol-mac">{t("mac")}</Label>
                <Input
                  id="wol-mac"
                  list="wol-mac-hints"
                  value={mac}
                  onChange={(e) => setMac(e.target.value)}
                  placeholder="00:11:22:33:44:55"
                  className="font-mono"
                  maxLength={64}
                  autoComplete="off"
                />
                <datalist id="wol-mac-hints">
                  {hosts.map((h) => (
                    <option key={h.mac} value={h.mac}>
                      {h.name}
                    </option>
                  ))}
                </datalist>
                <p className="text-muted-foreground text-xs">{t("macHint")}</p>
              </div>

              <div>
                <Button type="submit" disabled={wake.isPending}>
                  <PowerIcon className={wake.isPending ? "size-4 animate-pulse" : "size-4"} />
                  {t("submit")}
                </Button>
              </div>
            </form>

            {hosts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {hosts.map((h) => (
                  <Button
                    key={h.mac}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="font-mono text-xs"
                    onClick={() => setMac(h.mac)}
                  >
                    {h.name === h.mac ? h.mac : `${h.name} · ${h.mac}`}
                  </Button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {wake.data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("resultTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted max-h-[50vh] overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
              {[wake.data.command, ...wake.data.output].join("\n")}
            </pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
