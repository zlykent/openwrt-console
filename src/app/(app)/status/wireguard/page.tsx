"use client";

import { useTranslations } from "next-intl";
import { CableIcon, RefreshCwIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWireguardStatus } from "@/hooks/use-openwrt";
import type { WireguardInterface, WireguardPeer } from "@/lib/openwrt/wireguard";
import {
  wgBytesToStr,
  wgHandshakeAgo,
  wgHandshakeUtc,
  wgPeerConnected,
} from "@/lib/openwrt/wireguard-format";

type TFn = (key: string) => string;

/** Official `timestamp_to_str()`: `<UTC string> (<n>s ago)` or `Never`. */
function handshakeLabel(timestamp: number, t: TFn, now: number): string {
  const ago = wgHandshakeAgo(timestamp, now);
  if (ago.kind === "never") return t("never");
  const utc = wgHandshakeUtc(timestamp);
  const suffix =
    ago.kind === "overDay"
      ? t("overDayAgo")
      : `${ago.value}${t(`${ago.kind}Ago`)}`;
  return `${utc} (${suffix})`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-b py-3 last:border-0 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="min-w-0 space-y-1 text-sm">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <span className="font-semibold">{label}:</span>
      <span className="min-w-0 break-all font-mono text-xs">{value}</span>
    </div>
  );
}

/**
 * One peer block: tunnel icon plus the official field list. `now` is the poll's
 * `dataUpdatedAt` so the render stays pure (and stable across re-renders).
 */
function PeerInfo({
  peer,
  iface,
  t,
  now,
}: {
  peer: WireguardPeer;
  iface: WireguardInterface;
  t: TFn;
  now: number;
}) {
  const up = wgPeerConnected(peer.latestHandshake, now);
  return (
    <div className="flex items-start gap-3">
      <div className="flex w-6 shrink-0 flex-col items-center pt-0.5">
        <CableIcon className={up ? "size-4 text-emerald-500" : "text-muted-foreground/50 size-4"} />
        {!up ? <span className="text-muted-foreground text-[0.6rem]">?</span> : null}
      </div>
      <div className="min-w-0 space-y-1">
        <Field label={t("publicKey")} value={peer.publicKey} />
        {peer.endpoint !== "(none)" ? <Field label={t("endpoint")} value={peer.endpoint} /> : null}
        {peer.allowedIps.length > 0 ? (
          <div>
            <span className="font-semibold">{t("allowedIps")}:</span>
            <ul className="mt-0.5 space-y-0.5">
              {peer.allowedIps.map((ip) => (
                <li key={`${iface.name}-${peer.publicKey}-${ip}`} className="font-mono text-xs">
                  <span className="text-muted-foreground mr-2">&bull;</span>
                  {ip}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {peer.persistentKeepalive !== "off" ? (
          <Field label={t("persistentKeepalive")} value={`${peer.persistentKeepalive}s`} />
        ) : null}
        <Field label={t("latestHandshake")} value={handshakeLabel(peer.latestHandshake, t, now)} />
        <Field label={t("dataReceived")} value={wgBytesToStr(peer.transferRx)} />
        <Field label={t("dataTransmitted")} value={wgBytesToStr(peer.transferTx)} />
      </div>
    </div>
  );
}

export default function WireguardStatusPage() {
  const t = useTranslations("wireguard");
  const tc = useTranslations("common");
  const { data, dataUpdatedAt, isLoading, isError, error, refetch, isFetching } =
    useWireguardStatus(5000);

  return (
    <div className="space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")}>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          {tc("refresh")}
        </Button>
      </PageHeader>

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      ) : !data.installed ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="font-medium">{t("notInstalled")}</p>
            <p className="text-muted-foreground mt-1 text-sm">{t("notInstalledHint")}</p>
          </CardContent>
        </Card>
      ) : data.interfaces.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">{t("noInterfaces")}</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CableIcon className="text-muted-foreground size-4" />
              {t("title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {data.interfaces.map((iface) => (
              <section key={iface.name} className="space-y-1">
                <h3 className="mb-2 text-sm font-semibold">
                  {t("interface")} <span className="font-mono">{iface.name}</span>
                </h3>

                <Row label={t("configuration")}>
                  {iface.publicKey === "(none)" ? (
                    <em className="text-muted-foreground">{t("noPublicKey")}</em>
                  ) : (
                    <Field label={t("publicKey")} value={iface.publicKey} />
                  )}
                  {iface.listenPort > 0 ? <Field label={t("listenPort")} value={iface.listenPort} /> : null}
                  {iface.fwmark !== "off" ? <Field label={t("firewallMark")} value={iface.fwmark} /> : null}
                </Row>

                {iface.peers.length === 0 ? (
                  <Row label={t("peer")}>
                    <em className="text-muted-foreground">{t("noPeers")}</em>
                  </Row>
                ) : (
                  iface.peers.map((peer) => (
                    <Row key={`${iface.name}-${peer.publicKey}`} label={t("peer")}>
                      <PeerInfo peer={peer} iface={iface} t={t} now={dataUpdatedAt} />
                    </Row>
                  ))
                )}
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
