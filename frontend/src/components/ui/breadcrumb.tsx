import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

import { t } from "@/lib/i18n";

export interface Crumb {
  label: string;
  to?: string;
  code?: boolean;
}

/** مسیر صفحه. آخرین تکه صفحه‌ی فعلی است و پیوند ندارد. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label={t("breadcrumb.label")}>
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const label = item.code ? <bdi className="code">{item.label}</bdi> : item.label;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li className="flex items-center">
                {item.to && !last ? (
                  <Link to={item.to} viewTransition className="rounded-md transition-colors hover:text-fg">
                    {label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined} className={last ? "text-fg" : undefined}>
                    {label}
                  </span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="flex items-center text-faint">
                  <ChevronRight className="size-3.5 rtl:-scale-x-100" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
