import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { t } from "@/lib/i18n";

/** شماره‌ی صفحه‌هایی که نشان داده می‌شوند: اول، آخر و دو همسایه‌ی صفحه‌ی فعلی؛ بقیه با «…». */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...wanted].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  sorted.forEach((n, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && n - previous > 1) result.push(n - previous === 2 ? n - 1 : "gap");
    result.push(n);
  });
  return result;
}

interface PaginationProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label?: string;
}

export function Pagination({ page, pages, onChange, label = t("pager.label") }: PaginationProps) {
  if (pages <= 1) return null;
  const item =
    "inline-grid h-9 min-w-9 place-items-center rounded-lg px-2 text-sm tabular transition-colors duration-150 " +
    "hover:bg-surface hover:text-fg disabled:pointer-events-none disabled:opacity-40";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted" aria-live="polite">
        {t("pager.status", { page: formatNumber(page), pages: formatNumber(pages) })}
      </p>
      <ul className="flex items-center gap-1 text-muted">
        <li>
          <button
            type="button"
            className={cn(item, "gap-1 px-3")}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            <ChevronRight aria-hidden className="size-4 ltr:-scale-x-100" />
            <span className="max-sm:sr-only">{t("pager.previous")}</span>
          </button>
        </li>
        {pageWindow(page, pages).map((n, index) =>
          n === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className="px-1">
              …
            </li>
          ) : (
            <li key={n} className="max-sm:hidden">
              <button
                type="button"
                className={cn(item, n === page && "bg-accent-soft font-semibold text-accent-text hover:bg-accent-soft")}
                aria-current={n === page ? "page" : undefined}
                aria-label={t("pager.page", { page: formatNumber(n) })}
                onClick={() => onChange(n)}
              >
                {formatNumber(n)}
              </button>
            </li>
          ),
        )}
        <li>
          <button
            type="button"
            className={cn(item, "gap-1 px-3")}
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            <span className="max-sm:sr-only">{t("pager.next")}</span>
            <ChevronLeft aria-hidden className="size-4 ltr:-scale-x-100" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
