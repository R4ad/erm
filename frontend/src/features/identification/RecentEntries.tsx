import { Link } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { SectionPanel as Panel } from "@/components/ui/section-panel";
import { daysLeft, shortDate } from "@/lib/format";
import type { IdentificationRow } from "@/lib/types";

// ─────────────────────────────── ورودی‌های اخیر ───────────────────────────────

export function RecentEntries({ rows, registerUrl }: { rows: IdentificationRow[]; registerUrl: string }) {
  return (
    <Panel
      title="ورودی‌های اخیر شناسایی"
      description="گردش کار: پیش‌نویس ← شناسایی‌شده ← در ارزیابی · ادغام یا تفکیک با حفظ شناسه‌ی مبدأ"
      aside={
        <AppLink href={registerUrl} button={{ variant: "ghost", size: "sm" }}>
          همه‌ی ورودی‌ها
          <Icon name="arrow-left" className="ltr:rotate-180" />
        </AppLink>
      }
      bodyClassName="p-0"
    >
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">ورودی‌های اخیر شناسایی</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">سناریو</th>
                <th scope="col">خدمت · مشتری</th>
                <th scope="col">وضعیت</th>
                <th scope="col">مالک</th>
                <th scope="col">مهلت</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td data-label="کد" data-wide className="code text-xs whitespace-nowrap text-ink-2">
                    {row.code ?? "—"}
                  </td>
                  <td data-primary className="min-w-56">
                    {row.route ? (
                      <Link to={row.route} className="text-base font-medium text-ink hover:text-brand">
                        {row.title}
                      </Link>
                    ) : row.href ? (
                      <AppLink href={row.href} className="text-base font-medium text-ink hover:text-brand">
                        {row.title}
                      </AppLink>
                    ) : (
                      // پاسخ ارسال‌شده‌ی مدیر واحد دیگر ویرایش نمی‌شود و پیوندی ندارد.
                      <span className="text-base font-medium text-ink">{row.title}</span>
                    )}
                    <span className="block text-xs text-ink-2">
                      {[row.category, row.scenario ?? (row.code ? "مورد جدید" : null)].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td data-label="خدمت · مشتری" data-wide className="text-ink-2">
                    {/* ورودی مدیر واحد خدمت ندارد و به جای آن موضوعی را نشان می‌دهد که نوشته، بی مشتری. */}
                    {row.service ? [row.service, row.customer].filter(Boolean).join(" · ") : "—"}
                  </td>
                  <td data-label="وضعیت" data-wide>
                    <Badge tone={row.stage.tone}>{row.stage.label}</Badge>
                  </td>
                  <td data-label="مالک" className="text-ink-2">
                    {row.owner?.name ?? "—"}
                  </td>
                  <td data-label="مهلت" className="whitespace-nowrap text-ink-2 tabular">
                    {row.due ? (
                      <span className={row.due.overdue ? "text-danger" : undefined} title={shortDate(row.due)}>
                        {daysLeft(row.due)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-2">هنوز ورودی شناسایی‌ای ثبت نشده است.</p>
      )}
    </Panel>
  );
}
