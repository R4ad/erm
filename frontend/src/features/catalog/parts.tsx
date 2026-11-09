import { Link2, PencilLine } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/features/records/dossier";
import { shortDate } from "@/lib/format";
import type { Dependent, Validity } from "@/lib/types";

import { hasValidity } from "./validity";

// تکه‌های مشترک صفحه‌های کاتالوگ (catalog/includes/ در جنگو).

/** بازه‌ی اعتبار (validity.html): «از … تا …» و نشان «منقضی»؛ بی‌بازه خط تیره است. */
export function ValidityText({ validity }: { validity: Validity }) {
  const { from, until, expired } = validity;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 whitespace-nowrap">
      {from && (
        <span>
          از <time dateTime={from.iso}>{shortDate(from)}</time>
        </span>
      )}
      {until && (
        <span>
          تا <time dateTime={until.iso}>{shortDate(until)}</time>
        </span>
      )}
      {!from && !until && <span className="text-muted">-</span>}
      {expired && <Badge tone="neutral">منقضی</Badge>}
    </span>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? "success" : "neutral"} dot>
      {active ? "فعال" : "غیرفعال"}
    </Badge>
  );
}

/** کادر خالی یک بخش پرونده، با همان متن صفحه‌ی جنگو. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

/** پیوند ویرایش یک ردیف؛ نام رکورد در نام دسترس‌پذیر پیوند می‌آید تا «ویرایش»ها از هم جدا باشند. */
export function RowEdit({ href, name }: { href: string; name: string }) {
  return (
    <AppLink href={href} button={{ variant: "ghost", size: "sm" }} aria-label={`ویرایش ${name}`}>
      <PencilLine aria-hidden />
      ویرایش
    </AppLink>
  );
}

/** سرستون بی‌نام ستون کارهای ردیف. */
export function ActionsHeader() {
  return (
    <th scope="col">
      <span className="sr-only">کارها</span>
    </th>
  );
}

/** خدمت‌هایی که کاربر می‌بیند و به این خدمت، تأمین‌کننده یا دارایی وابسته‌اند (dependents_table.html). */
export function DependentsSection({ dependents }: { dependents: Dependent[] }) {
  return (
    <Section id="dependents" title="خدمت‌های وابسته" icon={<Link2 />}>
      {dependents.length ? (
        <Card className="table-shell overflow-clip">
          <table className="data-table">
            <caption className="sr-only">خدمت‌هایی که به این رکورد وابسته‌اند</caption>
            <thead>
              <tr>
                <th scope="col">خدمت</th>
                <th scope="col">شرح</th>
                <th scope="col">اعتبار</th>
              </tr>
            </thead>
            <tbody>
              {dependents.map((item) => (
                <tr key={item.id}>
                  <td data-primary className="min-w-56">
                    <span className="flex flex-wrap items-center gap-2">
                      <AppLink href={item.service.href}>
                        <bdi className="code">{item.service.code}</bdi>
                      </AppLink>
                      <span className="font-medium text-fg">{item.service.name}</span>
                      {item.service.is_critical && <Badge tone="danger">حیاتی</Badge>}
                      {item.is_shared_point && <Badge tone="warning">نقطه‌ی شکست مشترک</Badge>}
                    </span>
                  </td>
                  <td data-label="شرح" data-wide data-empty={item.description ? undefined : ""} className="min-w-48">
                    <span className="text-sm whitespace-pre-line">{item.description}</span>
                  </td>
                  <td data-label="اعتبار" data-empty={hasValidity(item.validity) ? undefined : ""}>
                    <ValidityText validity={item.validity} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <EmptyNote>هیچ خدمتی از خدمت‌هایی که می‌بینید به این وابسته نیست.</EmptyNote>
      )}
    </Section>
  );
}

const CIA: Record<string, string> = { C: "محرمانگی", I: "صحت", A: "دسترس‌پذیری" };

/** برچسب‌های C، I و A یک دارایی، هر کدام با نام کاملش برای صفحه‌خوان. */
export function CiaTags({ letters }: { letters: string[] }) {
  if (!letters.length) return <span className="text-muted">-</span>;
  return (
    <span className="inline-flex gap-1">
      {letters.map((letter) => (
        <abbr key={letter} title={CIA[letter]} className="no-underline">
          <Badge tone="info" className="code">
            {letter}
          </Badge>
          <span className="sr-only"> ({CIA[letter]})</span>
        </abbr>
      ))}
    </span>
  );
}
