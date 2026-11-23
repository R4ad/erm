import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SectionPanel as Panel } from "@/components/ui/section-panel";
import { ago, fa } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ResponseRow } from "@/lib/types";

// «پاسخنامه‌های اخیر» زیر ویزارد (فریم 30): پاسخنامه‌هایی که کاربر می‌بیند، تازه‌ترین تغییر اول. پاسخنامه‌ای که همین
// حالا فرستاده شده برجسته است (30f).

export function RecentResponses({
  rows,
  allUrl,
  fresh,
}: {
  rows: ResponseRow[];
  allUrl: string;
  fresh: number | null;
}) {
  const now = useNow();
  return (
    <Panel
      title="پاسخنامه‌های اخیر"
      description="گردش کار: پیش‌نویس ← در انتظار بررسی ← شناسایی‌شده یا بررسی‌شده · یا بازگشت برای تکمیل اطلاعات"
      aside={
        <Link to={allUrl} viewTransition className={buttonClasses({ variant: "ghost", size: "sm" })}>
          همه‌ی پاسخنامه‌ها
          <Icon name="arrow-left" className="ltr:rotate-180" />
        </Link>
      }
      bodyClassName="p-0"
    >
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">پاسخنامه‌های اخیر</caption>
            <thead>
              <tr>
                <th scope="col" className="w-[6.875rem]">
                  کد
                </th>
                <th scope="col">پاسخنامه</th>
                <th scope="col">واحد</th>
                <th scope="col">وضعیت</th>
                <th scope="col">پاسخ‌دهنده</th>
                <th scope="col">آخرین تغییر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isFresh = row.id === fresh;
                const counts = `${fa(row.summary.paths)} مسیر تحقق · ${fa(row.summary.events)} رویداد`;
                return (
                  <tr key={row.id} data-fresh={isFresh || undefined}>
                    <td data-label="کد" data-wide className="text-sm whitespace-nowrap text-ink-2">
                      <bdi className="code">{row.code}</bdi>
                    </td>
                    <td data-primary className="min-w-56">
                      <Link to={row.route} viewTransition className="text-base font-medium text-ink hover:text-brand">
                        {row.service || "—"}
                      </Link>
                      <span className={isFresh ? "block text-xs text-brand" : "block text-xs text-ink-2"}>
                        {isFresh ? `تازه ارسال‌شده · ${counts}` : counts}
                      </span>
                    </td>
                    <td data-label="واحد" className="text-ink-2">
                      {row.org_unit}
                    </td>
                    <td data-label="وضعیت" data-wide>
                      <Badge tone={row.status.tone}>{row.status.label}</Badge>
                    </td>
                    <td data-label="پاسخ‌دهنده" className="text-ink-2">
                      {row.respondent?.name ?? "—"}
                    </td>
                    <td data-label="آخرین تغییر" className="whitespace-nowrap text-ink-2 tabular">
                      <time dateTime={row.updated_at.iso}>{ago(row.updated_at, now)}</time>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-2">
          هنوز پاسخنامه‌ای نفرستاده‌اید. با پاسخ به پرسش‌های بالا اولین پاسخنامه را بسازید.
        </p>
      )}
    </Panel>
  );
}
