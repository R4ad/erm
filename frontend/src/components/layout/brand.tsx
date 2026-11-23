import { Link } from "react-router-dom";

import { LogoMark } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** نام سامانه در بالای منوی سبز: نشان داتین و نام دوسطری. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" viewTransition className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-md", className)}>
      <LogoMark size={32} className="shrink-0 text-on-dark" />
      <span className={cn("flex min-w-0 flex-col", compact && "sr-only")}>
        <span className="truncate text-sm font-semibold text-on-dark">{t("app.name")}</span>
        <span className="truncate text-xs text-on-dark-muted">{t("app.tagline")}</span>
      </span>
    </Link>
  );
}
