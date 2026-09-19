"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/errors";

/**
 * The BFF classifies every failure with an `ErrorKind`, so the headline can say
 * what actually went wrong instead of blaming the network for a validation or
 * authentication problem. The server's own message stays as the detail: it
 * carries device output that has no translation.
 */
const TITLE_BY_KIND: Record<string, string> = {
  unauthorized: "unauthorized",
  auth: "sshAuthFailed",
  deviceUnreachable: "deviceUnreachable",
  timeout: "timeout",
  commandFailed: "commandFailed",
  validation: "validation",
  unknown: "unknown",
};

/** Kinds that have a translated hint worth showing when there is no detail. */
const HINT_BY_KIND: Record<string, string> = {
  unauthorized: "unauthorizedHint",
  deviceUnreachable: "deviceUnreachableHint",
};

/** Friendly failure block with an optional retry, used when a query errors. */
export function ErrorState({
  error,
  message,
  onRetry,
}: {
  /** Structured `ApiError`; its kind selects the translated headline. */
  error?: unknown;
  /** Plain text, for callers that have no structured error to hand over. */
  message?: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("common");
  const te = useTranslations("errors");
  const kind = error instanceof ApiError ? error.kind : undefined;
  const detail = error instanceof ApiError ? error.message : message;
  // Callers without a structured error keep the previous behaviour: a failed
  // query is overwhelmingly a connectivity problem, and the hint says how to check.
  const titleKey = TITLE_BY_KIND[kind ?? "deviceUnreachable"] ?? "unknown";
  const hintKey = HINT_BY_KIND[kind ?? "deviceUnreachable"];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-12 text-center">
      <div className="text-destructive bg-destructive/10 flex size-10 items-center justify-center rounded-full">
        <TriangleAlertIcon className="size-5" />
      </div>
      <div className="max-w-sm">
        <p className="font-medium">{te(titleKey)}</p>
        {detail ? (
          <p className="text-muted-foreground mt-1 break-words text-sm">{detail}</p>
        ) : hintKey ? (
          <p className="text-muted-foreground mt-1 text-sm">{te(hintKey)}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
