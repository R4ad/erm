import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { SectionEmpty } from "@/features/records/dossier";
import { fa, faText } from "@/lib/format";
import type { Applicability, ControlRow, Effectiveness } from "@/lib/types";

// تکه‌های مشترک صفحه‌های کنترل و بیانیه‌ی کاربردپذیری (controls/includes/ در جنگو).

/** کاربرد یک کنترل پیوست A (applicability_badge.html): ردیفی که نیست «تعیین‌نشده» است. */
export function ApplicabilityBadge({ value }: { value: Applicability }) {
  if (value.value === "applicable") {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        <Badge tone="success" dot>
          {value.label}
        </Badge>
        {value.implementation && <span className="text-xs text-muted">{value.implementation.label}</span>}
      </span>
    );
  }
  return (
    <Badge tone={value.value === "undetermined" ? "warning" : "neutral"} dot>
      {value.label}
    </Badge>
  );
}

/**
 * E یک ارزیابی اثربخشی (effectiveness_badge.html). اگر الان اعتبار کاهش ندارد (معلق، شاهد کهنه، شرط برقرارنشده)
 * دلیلش کنار آن می‌آید، چون در محاسبه‌ی Bc فقط E1 حساب می‌شود.
 */
export function EffectBadge({ item, compact = false }: { item: Effectiveness; compact?: boolean }) {
  const tone = item.problem ? "neutral" : item.e >= 3 ? "success" : item.e === 2 ? "warning" : "neutral";
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Badge tone={tone}>E{fa(item.e)}</Badge>
      {item.problem && (
        <span className={compact ? "text-xs text-danger" : "text-xs leading-6 text-danger"}>
          {faText(item.problem)}؛ در Bc فقط E۱ حساب می‌شود
        </span>
      )}
    </span>
  );
}

/** شماره‌های پیوست A یک کنترل، هر کدام جدا تا جهت «5.15» در متن راست‌به‌چپ به هم نریزد. */
function IsoCodes({ codes }: { codes: string[] }) {
  return (
    <span className="inline-flex flex-wrap gap-x-2 gap-y-1 text-xs">
      {codes.map((code) => (
        <bdi key={code} className="code">
          {code}
        </bdi>
      ))}
    </span>
  );
}

/** ردیف‌های جدول کنترل‌ها (control_table.html)، برای فهرست کتابخانه و صفحه‌ی پیوست A. */
export function ControlRows({ controls, caption }: { controls: ControlRow[]; caption: string }) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">کد</th>
          <th scope="col">عنوان</th>
          <th scope="col">نوع</th>
          <th scope="col">مسئول</th>
          <th scope="col">پیوست A</th>
          <th scope="col">وضعیت</th>
        </tr>
      </thead>
      <tbody>
        {controls.map((control) => (
          <tr key={control.id}>
            <td data-label="کد" className="w-0">
              <bdi className="code text-accent-text">{control.code}</bdi>
            </td>
            <td data-primary className="min-w-56">
              <AppLink href={control.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                {control.title}
              </AppLink>
              {control.is_key && (
                <div className="mt-1">
                  <Badge tone="accent">کلیدی</Badge>
                </div>
              )}
            </td>
            <td data-label="نوع" className="whitespace-nowrap">
              {control.kind.label}
            </td>
            <td data-label="مسئول" className="whitespace-nowrap">
              {control.owner.name}
            </td>
            <td data-label="پیوست A" data-empty={control.iso_controls.length ? undefined : ""}>
              <IsoCodes codes={control.iso_controls} />
            </td>
            <td data-label="وضعیت">
              <Badge tone={control.is_active ? "success" : "neutral"} dot>
                {control.is_active ? "فعال" : "غیرفعال"}
              </Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ControlTable({ controls, caption, empty }: { controls: ControlRow[]; caption: string; empty: string }) {
  if (!controls.length) return <SectionEmpty>{empty}</SectionEmpty>;
  return <ControlRows controls={controls} caption={caption} />;
}
