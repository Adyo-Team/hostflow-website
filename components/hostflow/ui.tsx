"use client";
import type { ComponentProps, ReactNode } from "react";
import { Button as PrimitiveButton } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Compose the installed primitives; keep their accessibility and behavior.
export function Button({
  className,
  size = "default",
  ...props
}: ComponentProps<typeof PrimitiveButton>) {
  return (
    <PrimitiveButton
      size={size}
      className={cn("hf-button", size === "default" && "h-11", className)}
      {...props}
    />
  );
}
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="hf-page-header">
      <div className="min-w-0">
        {eyebrow && <p className="hf-overline mb-3">{eyebrow}</p>}
        <h1 className="hf-heading break-words">{title}</h1>
        {description && <div className="hf-subtitle">{description}</div>}
        {children}
      </div>
      {actions && <div className="hf-page-actions">{actions}</div>}
    </header>
  );
}
export function StatusBadge({
  tone = "neutral",
  children,
}: {
  tone?: "success" | "warning" | "neutral";
  children: ReactNode;
}) {
  return <span className={"hf-status hf-status-" + tone}>{children}</span>;
}
export function FilterBar({
  className,
  children,
  ...props
}: ComponentProps<"div">) {
  return (
    <div className={cn("hf-filter-bar", className)} {...props}>
      {children}
    </div>
  );
}
export function PageLoading({
  label = "Chargement",
  variant = "list",
  header = true,
}: {
  label?: string;
  variant?: "list" | "detail" | "form" | "dashboard";
  header?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="hf-loading"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      {header && (
        <div className="hf-loading-header">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-60 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
      )}
      {variant === "list" ? (
        <>
          <Skeleton className="h-24 w-full" />
          <div className="hf-panel p-5 space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </>
      ) : variant === "dashboard" ? (
        <>
          <Skeleton className="h-36 w-full" />
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        </>
      ) : (
        <div className="hf-panel p-5 sm:p-6 grid sm:grid-cols-2 gap-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-11 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export function Pager({
  page,
  total,
  setPage,
  pageSize = 30,
  embedded = false,
}: {
  page: number;
  total: number;
  setPage: (page: number) => void;
  pageSize?: number;
  embedded?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav
      aria-label="Pagination"
      className={cn("hf-pagination", embedded && "hf-pagination-embedded")}
    >
      <span className="hf-muted">
        {total} résultat{total > 1 ? "s" : ""} · page {page} / {pages}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Précédent
        </Button>
        <Button
          variant="outline"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Suivant
        </Button>
      </div>
    </nav>
  );
}
