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
  /** متن «صفحه‌ی x از y» کنار دکمه‌ها؛ صفحه‌ای که پانویس خودش را دارد آن را خاموش می‌کند. */
  status?: boolean;
}

// صفحه‌بندی فیگما: مربع‌های ۳۲ با حاشیه، صفحه‌ی فعلی پر با رنگ برند، «…» برای صفحه‌های جاافتاده.
export function Pagination({ page, pages, onChange, label = t("pager.label"), status = true }: PaginationProps) {
  if (pages <= 1) return null;
  const item =
    "inline-grid size-8 place-items-center rounded-md border border-line-strong bg-panel text-sm text-ink tabular " +
    "transition-colors duration-150 hover:bg-subtle disabled:pointer-events-none disabled:opacity-40";
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3">
      {status && (
        <p className="text-xs text-ink-3" aria-live="polite">
          {t("pager.status", { page: formatNumber(page), pages: formatNumber(pages) })}
        </p>
      )}
      <ul className="flex items-center gap-1.5">
        <li>
          <button
            type="button"
            className={item}
            disabled={page <= 1}
            aria-label={t("pager.previous")}
            onClick={() => onChange(page - 1)}
          >
            <ChevronRight aria-hidden className="size-4 ltr:-scale-x-100" />
          </button>
        </li>
        {pageWindow(page, pages).map((n, index) =>
          n === "gap" ? (
            <li key={`gap-${index}`} aria-hidden className={cn(item, "pointer-events-none")}>
              …
            </li>
          ) : (
            <li key={n} className="max-sm:hidden">
              <button
                type="button"
                className={cn(item, n === page && "border-brand bg-brand font-semibold text-on-brand hover:bg-brand")}
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
            className={item}
            disabled={page >= pages}
            aria-label={t("pager.next")}
            onClick={() => onChange(page + 1)}
          >
            <ChevronLeft aria-hidden className="size-4 ltr:-scale-x-100" />
          </button>
        </li>
      </ul>
    </nav>
  );
}
