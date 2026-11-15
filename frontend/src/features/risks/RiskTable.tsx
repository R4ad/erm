import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { SectionEmpty } from "@/features/records/dossier";
import type { RiskBrief } from "@/lib/types";

/** جدول کوتاه ریسک‌ها در بخش ریسک‌های پرونده‌ی شاهد، سناریو، کنترل و خدمت (risks/includes/risk_table.html جنگو). */
export function RiskTable({ risks, caption, empty }: { risks: RiskBrief[]; caption: string; empty: string }) {
  if (!risks.length) return <SectionEmpty>{empty}</SectionEmpty>;
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">شماره</th>
          <th scope="col">عنوان</th>
          <th scope="col">دسته</th>
          <th scope="col">مالک</th>
          <th scope="col">وضعیت</th>
        </tr>
      </thead>
      <tbody>
        {risks.map((risk) => (
          <tr key={risk.id}>
            <td data-label="شماره" className="w-0">
              <bdi className="code text-accent-text">{risk.code}</bdi>
            </td>
            <td data-primary className="min-w-56">
              <AppLink href={risk.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                {risk.title}
              </AppLink>
              {risk.service && (
                <div className="mt-1 text-xs text-muted">
                  خدمت <bdi className="code">{risk.service}</bdi>
                </div>
              )}
            </td>
            <td data-label="دسته" title={risk.category.name}>
              <bdi className="code">{risk.category.code}</bdi>
              <span className="sr-only"> {risk.category.name}</span>
            </td>
            <td data-label="مالک" data-empty={risk.owner ? undefined : ""} className="whitespace-nowrap">
              {risk.owner?.name}
            </td>
            <td data-label="وضعیت">
              <Badge tone={risk.is_active ? "accent" : "neutral"} dot>
                {risk.status.label}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
