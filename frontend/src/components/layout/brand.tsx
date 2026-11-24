import { Link } from "react-router-dom";

import { LogoMark } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

/** نام سامانه در بالای منوی سبز: نشان داتین و نام سامانه. */
export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" viewTransition className={cn("flex min-w-0 flex-1 items-center gap-2.5 rounded-md", className)}>
      <LogoMark size={32} className="shrink-0 text-on-dark" />
      <span className={cn("min-w-0 truncate text-sm font-semibold text-on-dark", compact && "sr-only")}>
        {t("app.name")}
      </span>
    </Link>
  );
}
