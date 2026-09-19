"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DownloadIcon,
  FileUpIcon,
  HardDriveDownloadIcon,
  RotateCcwIcon,
  ScrollTextIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useBackupFiles } from "@/hooks/use-openwrt";

/** Best-effort error message extraction from a non-OK BFF response. */
async function errMsg(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    return body?.error?.message ?? res.statusText ?? "Request failed";
  } catch {
    return res.statusText ?? "Request failed";
  }
}

export default function BackupPage() {
  const t = useTranslations("backup");
  const tc = useTranslations("common");
  const files = useBackupFiles();

  const [downloading, setDownloading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [flashing, setFlashing] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [flashFile, setFlashFile] = useState<File | null>(null);
  const [keepConfig, setKeepConfig] = useState(true);
  const restoreRef = useRef<HTMLInputElement>(null);
  const flashRef = useRef<HTMLInputElement>(null);

  async function onDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/system/backup", { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(await errMsg(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openwrt-backup-${new Date().toISOString().slice(0, 10)}.tar.gz`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("backupCreated"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function onRestore() {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const fd = new FormData();
      fd.append("file", restoreFile);
      const res = await fetch("/api/system/backup/restore", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errMsg(res));
      toast.success(t("restoreOk"));
      setRestoreFile(null);
      if (restoreRef.current) restoreRef.current.value = "";
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  async function onFlash() {
    if (!flashFile) return;
    setFlashing(true);
    try {
      const fd = new FormData();
      fd.append("file", flashFile);
      fd.append("keepConfig", keepConfig ? "1" : "0");
      const res = await fetch("/api/system/backup/flash", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await errMsg(res));
      toast.success(t("flashing"));
    } catch (e) {
      toast.error((e as Error).message);
      setFlashing(false);
    }
  }

  return (
    <div>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Download backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DownloadIcon className="text-muted-foreground size-4" />
              {t("downloadBackup")}
            </CardTitle>
            <CardDescription>{t("downloadBackupHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button size="sm" onClick={onDownload} disabled={downloading}>
              <HardDriveDownloadIcon className={downloading ? "size-4 animate-pulse" : "size-4"} />
              {downloading ? t("creating") : t("createDownload")}
            </Button>
          </CardContent>
        </Card>

        {/* Files included */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScrollTextIcon className="text-muted-foreground size-4" />
              {t("includedFiles")}
              {files.data ? (
                <Badge variant="secondary" className="tabular-nums">
                  {files.data.files.length}
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription>{t("includedFilesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            {files.isLoading ? (
              <Skeleton className="h-24 w-full rounded-lg" />
            ) : files.data && files.data.files.length > 0 ? (
              <pre className="bg-muted max-h-40 overflow-auto rounded-lg p-3 font-mono text-xs">
                {files.data.files.join("\n")}
              </pre>
            ) : (
              <p className="text-muted-foreground text-sm">{tc("noData")}</p>
            )}
          </CardContent>
        </Card>

        {/* Restore backup */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcwIcon className="text-muted-foreground size-4" />
              {t("restore")}
            </CardTitle>
            <CardDescription>{t("restoreHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="restore-file">{t("backupFile")}</Label>
              <Input
                id="restore-file"
                ref={restoreRef}
                type="file"
                accept=".gz,.tar.gz,application/gzip"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!restoreFile || restoring}>
                  <FileUpIcon className="size-4" />
                  {restoring ? t("restoring") : t("restoreUpload")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("restoreConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("restoreWarning")}
                    {restoreFile ? ` (${restoreFile.name})` : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onRestore}>
                    {t("restoreUpload")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Flash firmware */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <FileUpIcon className="size-4" />
              {t("flash")}
            </CardTitle>
            <CardDescription>{t("flashHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="flash-file">{t("firmwareImage")}</Label>
              <Input
                id="flash-file"
                ref={flashRef}
                type="file"
                onChange={(e) => setFlashFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <Label htmlFor="keep" className="cursor-pointer text-sm">
                {t("keepConfig")}
              </Label>
              <Switch id="keep" checked={keepConfig} onCheckedChange={setKeepConfig} />
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={!flashFile || flashing}>
                  {flashing ? t("flashing") : t("flashButton")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("flashConfirm")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("flashWarning")}
                    {flashFile ? ` (${flashFile.name})` : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={onFlash}>
                    {t("flashButton")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
