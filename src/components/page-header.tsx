import type { ReactNode } from "react";

/**
 * Page action toolbar. The page title itself is rendered by the Topbar (which
 * derives it from the active nav item), so this keeps only the optional
 * subtitle and the right-aligned action slot.
 */
export function PageHeader({
  subtitle,
  children,
}: {
  /** Accepted for call-site compatibility; the Topbar renders the title. */
  title?: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  if (!subtitle && !children) return null;
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      {subtitle ? (
        <p className="text-muted-foreground min-w-0 text-sm">{subtitle}</p>
      ) : (
        <span />
      )}
      {children ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}
