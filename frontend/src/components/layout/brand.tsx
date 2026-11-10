import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl border border-accent-line/50 bg-gradient-to-b from-accent-soft to-transparent text-accent-text shadow-[0_0_24px_-6px_var(--accent)]",
        className,
      )}
    >
      <ShieldCheck className="size-[1.125rem]" />
    </span>
  );
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" viewTransition className="flex min-w-0 items-center gap-3 rounded-xl">
      <BrandMark />
      <span className={cn("flex min-w-0 flex-col leading-5", compact && "sr-only")}>
        <span className="truncate text-sm font-bold text-fg">{t("app.name")}</span>
        <span className="truncate text-[0.6875rem] text-muted">{t("app.tagline")}</span>
      </span>
    </Link>
  );
}
