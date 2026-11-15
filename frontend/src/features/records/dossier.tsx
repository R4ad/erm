import type { ComponentProps, ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/states";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { faText } from "@/lib/format";
import { useActiveSection } from "@/lib/hooks";
import type { CodeRef, FormField } from "@/lib/types";

// تکه‌های مشترک صفحه‌های پرونده (ارزیابی، طرح مواجهه، اقدام و پذیرش): بخش‌های شماره‌دار با پیوند #، فهرست
// مشخصات، کادر دلیل‌ها و خطای کار.

/**
 * فهرست بخش‌های پرونده. در دسکتاپ یک ستون چسبان کنار پرونده است که با پیمایش، بخش جلوی چشم را پررنگ می‌کند، و در
 * عرض کم همان نشان‌های پشت‌سرهم زیر سرصفحه.
 */
export function SectionNav({
  label,
  sections,
  rail = false,
}: {
  label: string;
  sections: { id: string; label: string }[];
  /** در ستون کناری (`DossierLayout`) فهرست عمودی می‌شود؛ بیرون از آن نشان‌های پشت‌سرهم می‌ماند. */
  rail?: boolean;
}) {
  const active = useActiveSection(sections.map((section) => section.id));
  return (
    <nav aria-label={label}>
      <ul className={cn("flex flex-wrap gap-1.5", rail && "lg:flex-col lg:gap-0.5")}>
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors",
                  "hover:border-line-strong hover:text-fg",
                  current && "border-accent-line bg-accent-soft text-fg",
                  // در ستون کناری نشان‌ها به ردیف‌های یک فهرست تبدیل می‌شوند و فقط خط کناری، بخش جاری را نشان می‌دهد.
                  rail &&
                    "lg:rounded-lg lg:border-0 lg:border-s-2 lg:border-transparent lg:bg-transparent lg:px-3 lg:hover:bg-surface",
                  rail && current && "lg:border-s-accent lg:bg-accent-soft",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * یک بخش پرونده: سرصفحه‌ی خودش (آیکون، عنوان، شمار و دکمه‌های همان بخش) و محتوا، همه در یک کارت. همه‌ی بخش‌های
 * همه‌ی پرونده‌ها همین شکل‌اند تا کنار هم یک‌جور خوانده شوند و دکمه‌ی هر بخش کنار نام خودش باشد.
 *
 * محتوا تا لبه‌ی کارت می‌رسد، چون بیشتر بخش‌ها جدول‌اند و خانه‌های جدول فاصله‌ی خودشان را دارند؛ محتوایی که جدول
 * نیست در `SectionBody` و بخش خالی در `SectionEmpty` می‌نشیند.
 */
export function Section({
  id,
  title,
  icon,
  description,
  count,
  actions,
  as,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  description?: ReactNode;
  /** شمار ردیف‌های این بخش، کنار عنوان. */
  count?: number;
  actions?: ReactNode;
  /** سطح عنوان؛ بخشی که خودش زیر یک برگه است h3 می‌شود. */
  as?: "h2" | "h3";
  children: ReactNode;
}) {
  return (
    <Card id={id} asSection aria-labelledby={`${id}-title`} className="table-shell scroll-mt-24 overflow-clip">
      <CardHeader
        titleId={`${id}-title`}
        icon={icon}
        title={title}
        count={count}
        description={description}
        actions={actions}
        as={as}
        className="border-b border-line pb-4"
      />
      {children}
    </Card>
  );
}

/**
 * چیدمان یک پرونده: بخش‌ها در ستون اصلی، و کنارشان یک ستون چسبان با مشخصات رکورد و فهرست بخش‌ها. در عرض کم
 * ستون کناری اول می‌آید (اول مشخصات، بعد نشان‌های بخش‌ها، بعد خود بخش‌ها)، چون همان ترتیب خواندن است.
 */
export function DossierLayout({
  facts,
  factsLabel = "مشخصات",
  sections,
  navLabel,
  children,
}: {
  facts?: ReactNode;
  /** نام ستون کناری برای صفحه‌خوان، مثل «مشخصات کنترل»؛ عنوان دیده‌شده همیشه «مشخصات» است. */
  factsLabel?: string;
  sections: { id: string; label: string }[];
  navLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <aside
        aria-label={factsLabel}
        className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)] lg:order-2 lg:max-h-[calc(100dvh-var(--topbar-h)-3rem)] lg:overflow-y-auto lg:[scrollbar-width:thin]"
      >
        {/* فهرست بخش‌ها بالای مشخصات است: کوتاه‌تر و پرکاربردتر، و با مشخصات بلند از دید بیرون نمی‌رود. */}
        <SectionNav label={navLabel} sections={sections} rail />
        {facts && (
          <Card>
            <CardHeader title="مشخصات" className="pb-2" />
            <div className="px-5 pb-5">{facts}</div>
          </Card>
        )}
      </aside>
      <div className="flex min-w-0 flex-col gap-5 lg:order-1">{children}</div>
    </div>
  );
}

/**
 * بخش یک سند مرجع (مثل روش ارزیابی): عنوان روی یک خط جداکننده و محتوا زیر آن، بدون کارت. سند مرجع خودش پر از
 * جدول و جدول‌های تودرتوست و کارت دور هر بخش فقط یک کادر اضافه می‌شود.
 */
export function DocSection({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-5">
      <div className="flex items-center gap-2.5 border-b border-line pb-3">
        <span aria-hidden className="text-accent-text [&>svg]:size-5">
          {icon}
        </span>
        <h2 id={`${id}-title`} className="text-title font-semibold text-fg">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** محتوای یک بخش که جدول نیست (متن، شبکه‌ی کارت‌ها، فرم): فاصله‌ی خودش را از لبه‌ی کارت می‌گیرد. */
export function SectionBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** بخشی که چیزی در آن نیست: یک خط آرام، نه کادر خط‌چین داخل کادر. */
export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-sm text-muted">{children}</p>;
}

/** فهرست مشخصات یک رکورد: برچسب‌ها در یک ستون باریک و مقدارها کنارشان. همه‌ی پرونده‌ها همین شکل را دارند. */
export function Facts({ className, ...props }: ComponentProps<"dl">) {
  return <dl className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm", className)} {...props} />;
}

/** یک ردیف از فهرست مشخصات؛ داخل `Facts` یا هر `<dl>` دو‌ستونی. ردیف بی‌مقدار اصلاً نوشته نمی‌شود. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

/** متن چندخطی کاربر، با خط‌های خودش؛ خالی با خط تیره. */
export function Prose({ text }: { text: string }) {
  if (!text.trim()) return <span className="text-muted">-</span>;
  return <span className="whitespace-pre-line">{text}</span>;
}

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface/50 p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold text-fg tabular">{children}</span>
    </div>
  );
}

/** فهرست دلیل‌ها یا شرط‌هایی که جنگو برگردانده است؛ یک مورد بی‌نشانه‌ی فهرست. */
export function Reasons({
  tone,
  title,
  items,
}: {
  tone: "danger" | "warning" | "info";
  title?: string;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <Alert tone={tone} title={title}>
      <ul className={cn("flex flex-col gap-1", items.length > 1 && "list-disc ps-5")}>
        {items.map((item) => (
          <li key={item}>{faText(item)}</li>
        ))}
      </ul>
    </Alert>
  );
}

/** پیام خطای کاری که view جنگو نپذیرفت. */
export function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert tone="danger" role="alert">
      {faText(errorMessage(error))}
    </Alert>
  );
}

/** کادر توضیح یک کار، از توصیف فیلد همان فرم جنگو. */
export function NotesField({
  field,
  value,
  onChange,
  disabled,
  label,
  hint,
  error,
  required,
}: {
  field?: FormField | null;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}) {
  return (
    <Field
      label={label ?? field?.label ?? "توضیح"}
      hint={hint ?? (field?.help || undefined)}
      error={error}
      required={required ?? field?.required}
    >
      <Textarea
        rows={field?.rows ?? 2}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** پیوند کدها (شاهد، کنترل، ارزیابی) پشت سر هم؛ خالی با خط تیره. */
export function CodeLinks({ items }: { items: CodeRef[] }) {
  if (!items.length) return <span className="text-muted">-</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {items.map((item) => (
        <AppLink key={item.code} href={item.href} className="code text-xs">
          {item.code}
        </AppLink>
      ))}
    </span>
  );
}
