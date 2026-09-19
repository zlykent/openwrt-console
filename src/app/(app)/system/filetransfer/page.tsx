"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  DownloadIcon,
  FileUpIcon,
  PackageCheckIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api/http";
import type { FtFile } from "@/lib/openwrt/filetransfer";

/**
 * luci-app-filetransfer (admin/system/filetransfer): upload into
 * `/tmp/upload/`, download any device path (directories tarred) and manage
 * the upload list including `opkg --force-depends install` for `.ipk` files.
 */
export default function FileTransferPage() {
  const t = useTranslations("filetransfer");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [path, setPath] = useState("");
  const [installLog, setInstallLog] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["filetransfer", "list"],
    queryFn: () => apiFetch<{ files: FtFile[] }>("/api/filetransfer"),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["filetransfer", "list"] });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("ulfile", file);
      return apiFetch<{ path: string }>("/api/filetransfer/upload", {
        method: "POST",
        body: form,
      });
    },
    onSuccess: (res) => {
      toast.success(`${t("savedTo")} "${res.path}"`);
      if (fileRef.current) fileRef.current.value = "";
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const act = useMutation({
    mutationFn: (body: { action: "remove" | "install"; name: string }) =>
      apiFetch<{ output?: string }>("/api/filetransfer", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: (res, body) => {
      if (body.action === "install") {
        setInstallLog(res.output ?? "");
        toast.success(t("installOk"));
      } else {
        toast.success(t("removeOk"));
      }
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error(t("noFile"));
      return;
    }
    upload.mutate(file);
  }

  function onDownload() {
    const target = path.trim();
    if (!target) {
      toast.error(t("noPath"));
      return;
    }
    // Anchor download so the Content-Disposition name comes from the server.
    const a = document.createElement("a");
    a.href = `/api/filetransfer/download?name=${encodeURIComponent(target)}`;
    a.download = "";
    a.click();
  }

  const files = list.data?.files ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* ---- Upload (official SimpleForm "upload") ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UploadIcon className="text-muted-foreground size-4" />
              {t("upload")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ft-file">{t("selectFile")}</Label>
              <Input
                id="ft-file"
                ref={fileRef}
                type="file"
                className="file:text-foreground h-9 file:mr-3 file:border-0 file:bg-transparent file:text-sm"
              />
              <p className="text-muted-foreground text-xs">{t("uploadHint")}</p>
            </div>
            <Button onClick={onUpload} disabled={upload.isPending}>
              <FileUpIcon className={upload.isPending ? "size-4 animate-pulse" : "size-4"} />
              {t("upload")}
            </Button>
          </CardContent>
        </Card>

        {/* ---- Download (official SimpleForm "download") ---- */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DownloadIcon className="text-muted-foreground size-4" />
              {t("downloadTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ft-path">{t("downloadPath")}</Label>
              <Input
                id="ft-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/tmp/upload/example.tar.gz"
                className="font-mono"
                autoComplete="off"
              />
              <p className="text-muted-foreground text-xs">{t("downloadHint")}</p>
            </div>
            <Button onClick={onDownload} variant="outline">
              <DownloadIcon className="size-4" />
              {t("download")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ---- Upload file list (official Table section) ---- */}
      <Card className="min-h-0 flex-1">
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-3">
          {list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colMtime")}</TableHead>
                  <TableHead>{t("colMode")}</TableHead>
                  <TableHead>{t("colSize")}</TableHead>
                  <TableHead className="text-right">{t("colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                      {t("empty")}
                    </TableCell>
                  </TableRow>
                ) : (
                  files.map((f) => (
                    <TableRow key={f.name}>
                      <TableCell className="font-mono">{f.name}</TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {f.mtime}
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {f.modestr}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {f.size}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {f.ipk ? (
                            <Button
                              variant="outline"
                              size="xs"
                              disabled={act.isPending}
                              onClick={() => act.mutate({ action: "install", name: f.name })}
                            >
                              <PackageCheckIcon className="size-3.5" />
                              {t("install")}
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="xs"
                            className="text-destructive"
                            disabled={act.isPending}
                            onClick={() => act.mutate({ action: "remove", name: f.name })}
                          >
                            <Trash2Icon className="size-3.5" />
                            {t("remove")}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}

          {installLog ? (
            <pre className="border-destructive/40 bg-destructive/5 max-h-48 overflow-auto rounded-lg p-3 font-mono text-xs whitespace-pre-wrap">
              {installLog}
            </pre>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
