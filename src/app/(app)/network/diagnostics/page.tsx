"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ActivityIcon, PlayIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRunDiagnostic } from "@/hooks/use-openwrt";
import type { DiagResult } from "@/lib/openwrt/types";

type Tool = DiagResult["tool"];
const TOOLS: Tool[] = ["ping", "traceroute", "nslookup"];

export default function DiagnosticsPage() {
  const t = useTranslations("diagnostics");
  const tc = useTranslations("common");
  const run = useRunDiagnostic();
  const [tool, setTool] = useState<Tool>("ping");
  const [target, setTarget] = useState("openwrt.org");
  // Keep the last successful output on screen: a mutation error clears
  // `run.data`, which would otherwise wipe the result while the operator is
  // still reading it.
  const [result, setResult] = useState<DiagResult | null>(null);

  function onRun(e: React.FormEvent) {
    e.preventDefault();
    const value = target.trim();
    if (!value) {
      toast.error(tc("required"));
      return;
    }
    run.mutate(
      { tool, target: value },
      {
        onSuccess: (data) => setResult(data),
        onError: (err) => toast.error((err as Error).message),
      },
    );
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ActivityIcon className="text-muted-foreground size-4" />
            {t("run")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onRun} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tool">{t("tool")}</Label>
              <Select value={tool} onValueChange={(v) => setTool(v as Tool)}>
                <SelectTrigger id="tool" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOOLS.map((x) => (
                    <SelectItem key={x} value={x}>
                      {t(x)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="target">{t("target")}</Label>
              <Input
                id="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={t("targetPlaceholder")}
                maxLength={253}
              />
            </div>
            <Button type="submit" size="sm" disabled={run.isPending}>
              <PlayIcon className={run.isPending ? "size-4 animate-pulse" : "size-4"} />
              {run.isPending ? t("running") : t("start")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className="font-mono">
                {result.tool} {result.target}
              </span>
              <Badge variant={result.code === 0 ? "default" : "destructive"} className="tabular-nums">
                {t("exitCode")} {result.code ?? "—"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="bg-muted max-h-[50vh] overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
              {result.stdout || t("noOutput")}
            </pre>
            {result.stderr.trim() ? (
              <pre className="max-h-40 overflow-auto rounded-lg border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs whitespace-pre-wrap">
                {result.stderr}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
