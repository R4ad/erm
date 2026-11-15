import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { Alert } from "@/components/ui/states";
import { useRouteOf } from "@/features/session/links";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { faText } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { CodeRef, FormField } from "@/lib/types";

// تکه‌های مشترک صفحه‌های پرونده (ارزیابی، طرح مواجهه، اقدام و پذیرش): بخش‌های شماره‌دار با پیوند #، فهرست
// مشخصات، کادر دلیل‌ها و خطای کار.

/** پیوند به بخش‌های پرونده، زیر سرصفحه. */
export function SectionNav({ label, sections }: { label: string; sections: { id: string; label: string }[] }) {
  return (
    <nav aria-label={label} className="flex flex-wrap gap-2">
      {sections.map((section) => (
        <a
          key={section.id}
          href={`#${section.id}`}
          className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
        >
          {section.label}
        </a>
      ))}
    </nav>
  );
}

export function Section({
  id,
  title,
  icon,
  actions,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold text-fg">
          <span aria-hidden className="text-accent-text [&>svg]:size-5">
            {icon}
          </span>
          {title}
        </h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** یک ردیف از فهرست مشخصات؛ داخل `<dl className="grid … sm:grid-cols-[10rem_1fr]">`. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
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

/** یک کار در منوی «کارهای دیگر» پرونده؛ صفحه‌ای که هنوز در ری‌اکت نیست با برچسب صفحه‌ی فعلی باز می‌شود. */
export function MenuLink({ href, label, icon }: { href: string; label: string; icon: IconName }) {
  const route = useRouteOf()(href);
  const content = (
    <>
      <Icon name={icon} size={16} />
      {label}
    </>
  );
  return (
    <DropdownMenuItem asChild>
      {route ? (
        <Link to={route} viewTransition>
          {content}
        </Link>
      ) : (
        <a href={href}>
          {content}
          <span className="sr-only">({t("shell.classic")})</span>
        </a>
      )}
    </DropdownMenuItem>
  );
}
