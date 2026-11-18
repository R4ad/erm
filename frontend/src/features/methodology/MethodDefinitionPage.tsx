import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel, type ChipTone } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Toggle } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ApprovalState, MethodDefinition, MethodParam } from "@/lib/types";

// «تعریف متدولوژی» به چیدمان فیگما ۱۷: مجموعه‌ی پارامتر نسخه‌دار. ستون اصلی پارامترهای پایه، جدول A × B، آستانه‌ی
// سطوح و قواعد تقدم، اشتها و مرجع مجاز، ابعاد پیامد و پارامترهای پایش؛ ستون کناری نسخه‌ها، تغییرات نسبت به نسخه‌ی
// پایه، گردش تصویب و طبقه‌بندی. متولی روش مقدار پارامترهای پیش‌نویس را همین‌جا عوض می‌کند و برای تصویب می‌فرستد.

const STATUS_TONE: Record<string, ChipTone> = {
  draft: "warning",
  approved: "info",
  active: "success",
  archived: "neutral",
};

const SECTION_IDS: Record<string, string> = {
  base: "method-base",
  likelihood: "method-likelihood",
  impact: "method-impact",
  levels: "method-levels",
  appetite: "method-appetite",
  monitoring: "method-monitoring",
  categories: "method-categories",
};

/** رقم فارسی را برای مقایسه و ارسال به لاتین برمی‌گرداند. */
function latin(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace("٫", ".");
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

// ─────────────────────────────── ویرایش پارامترها ───────────────────────────────

interface Editing {
  editable: boolean;
  values: Record<string, string>;
  set: (key: string, value: string) => void;
  param: (key: string) => MethodParam | undefined;
}

function ParamInput({ edit, paramKey, label }: { edit: Editing; paramKey: string; label?: string }) {
  const param = edit.param(paramKey);
  if (!param) return null;
  if (!edit.editable) {
    return <Input readOnly value={faText(param.text)} aria-label={label} />;
  }
  return (
    <span className="flex items-center gap-2">
      <Input
        inputMode="decimal"
        aria-label={label}
        value={edit.values[paramKey] ?? fa(param.value)}
        onChange={(event) => edit.set(paramKey, event.target.value)}
        className="min-w-0 flex-1"
      />
      <span className="shrink-0 text-xs text-ink-3">{param.unit}</span>
    </span>
  );
}

function beforeHint(base: string | null, ...params: (MethodParam | undefined)[]) {
  const changed = params.filter((param): param is MethodParam => Boolean(param?.before));
  if (!changed.length || !base) return null;
  return (
    <span className="text-warning">
      در <bdi>{base}</bdi>: {changed.map((param) => faText(param.before ?? "")).join(" · ")}
    </span>
  );
}

function BaseParameters({ data, edit }: { data: MethodDefinition; edit: Editing }) {
  const base = data.version.based_on;
  const period = edit.param("a_data_period");
  const coverage = edit.param("a_data_coverage");
  const fixed = (value: string, label: string) => <Input readOnly value={value} aria-label={label} />;
  return (
    <SectionPanel
      id={SECTION_IDS.base}
      title="پارامترهای پایه"
      description="مقادیر عمومی که همه‌ی ارزیابی‌های این نسخه از آن پیروی می‌کنند"
    >
      <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
        <Field
          label="افق ارزیابی پیش‌فرض"
          required
          hint={beforeHint(base, edit.param("horizon")) ?? "افق دیگر فقط با دلیل ثبت‌شده برای سناریو"}
        >
          <ParamInput edit={edit} paramKey="horizon" />
        </Field>
        <Field label="فرمول امتیاز" required hint="بدون گرد کردن یا میانگین نمره‌ی ارزیاب‌ها">
          {fixed("L × I · عدد صحیح ۱ تا ۲۵", "فرمول امتیاز")}
        </Field>
        <Field label="مقیاس احتمال L" required hint="فقط جدول A × B برای تعیین L مجاز است">
          {fixed("۱ تا ۵ · جدول A × B", "مقیاس احتمال L")}
        </Field>
        <Field label="مقیاس پیامد I" required hint="صفر فقط به معنی «اثر ندارد» با دلیل">
          {fixed("۰ تا ۵ · I = بیشینه‌ی ابعاد و ذی‌نفعان", "مقیاس پیامد I")}
        </Field>
        {edit.editable ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">
              کفایت داده‌ی آغازگر <span className="text-danger">*</span>
            </span>
            <span className="grid grid-cols-2 gap-2">
              <ParamInput edit={edit} paramKey="a_data_period" label="کمترین دوره‌ی داده" />
              <ParamInput edit={edit} paramKey="a_data_coverage" label="کمترین پوشش ثبت" />
            </span>
            <span className="text-xs text-ink-3">
              {beforeHint(base, period, coverage) ?? "دوره‌ی داده و پوشش ثبت دامنه‌ی آغازگر برای نرخ A"}
            </span>
          </div>
        ) : (
          <Field
            label="کفایت داده‌ی آغازگر"
            required
            hint={beforeHint(base, period, coverage) ?? "دوره‌ی داده و پوشش ثبت دامنه‌ی آغازگر برای نرخ A"}
          >
            {fixed(
              `حداقل ${faText(period?.text ?? "—")} · پوشش ثبت ${faText(coverage?.text ?? "—").replace(" درصد", "٪")}`,
              "کفایت داده‌ی آغازگر",
            )}
          </Field>
        )}
        <Field
          label="مهلت تکمیل ورودی مبهم"
          hint={beforeHint(base, edit.param("input_return")) ?? "مهلت پیشنهادی جواب پرسش‌های باز ارزیابی"}
        >
          <ParamInput edit={edit} paramKey="input_return" />
        </Field>
      </div>
    </SectionPanel>
  );
}

// ─────────────────────────────── جدول A × B ───────────────────────────────

const L_TONE = (value: number) =>
  RISK_CLASSES[value <= 2 ? "low" : value === 3 ? "medium" : value === 4 ? "high" : "critical"];

function LikelihoodTable({ data }: { data: MethodDefinition }) {
  const { likelihood, version } = data;
  return (
    <SectionPanel
      id={SECTION_IDS.likelihood}
      title="جدول احتمال A × B"
      description={`${likelihood.source ? `${likelihood.source} · ` : ""}فقط این جدول برای تعیین L مجاز است`}
      aside={
        <span className="flex flex-wrap items-center gap-2">
          {version.based_on &&
            (likelihood.changed ? (
              <Chip tone="warning">
                {fa(likelihood.changed)} خانه تغییر نسبت به {version.based_on}
              </Chip>
            ) : (
              <Chip tone="success">
                <Icon name="check" size={12} />
                بدون تغییر نسبت به {version.based_on}
              </Chip>
            ))}
          <Button asChild variant="link" size="sm">
            <AppLink href={version.reference}>
              <Icon name="books" />
              معیارها
            </AppLink>
          </Button>
        </span>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <table className="w-full border-separate border-spacing-1.5 text-sm">
        <caption className="sr-only">L برای هر ترکیب A و B</caption>
        <thead>
          <tr>
            <th scope="col" className="w-12 text-xs font-medium text-ink-3">
              A \ B
            </th>
            {[1, 2, 3, 4, 5].map((b) => (
              <th key={b} scope="col" className="text-xs font-medium text-ink-3">
                B{fa(b)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {likelihood.rows.map((row) => (
            <tr key={row.a}>
              <th scope="row" className="text-xs font-medium text-ink-3">
                A{fa(row.a)}
              </th>
              {row.cells.map((cell) => {
                const tone = cell.l ? L_TONE(cell.l) : null;
                return (
                  <td
                    key={cell.b}
                    className={cn(
                      "h-8 rounded-md border text-center font-semibold",
                      tone ? [tone.bg, tone.fg, tone.border] : "border-dashed border-line text-ink-3",
                      cell.changed && "ring-2 ring-warning ring-offset-1",
                    )}
                  >
                    {cell.l ? `L${fa(cell.l)}` : "—"}
                    {cell.changed && <span className="sr-only"> (تغییر کرده)</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="سطوح L">
        {likelihood.names.map((name) => (
          <li key={name.value} className={L_TONE(name.value).fg}>
            L{fa(name.value)} {name.name}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

// ─────────────────────────────── سطوح و قواعد ───────────────────────────────

function LevelsPanel({ data }: { data: MethodDefinition }) {
  const { levels, rules } = data.levels;
  const first = levels[0]?.min ?? 1;
  const total = (levels.at(-1)?.max ?? 25) - first + 1;
  return (
    <SectionPanel
      id={SECTION_IDS.levels}
      title="آستانه‌ی سطوح و قواعد تقدم"
      description="سطح پایه از امتیاز؛ سطح تصمیم از ماتریس، قواعد کف و محدودیت مصوب مشتری"
      bodyClassName="flex flex-col gap-5"
    >
      <div
        className="flex flex-col gap-1.5"
        role="img"
        aria-label={levels.map((level) => `${level.name} ${fa(level.min)} تا ${fa(level.max)}`).join("، ")}
      >
        <div className="flex text-xs font-medium" aria-hidden>
          {levels.map((level) => (
            <span
              key={level.rank}
              className={cn("text-center", RISK_CLASSES[riskKey(level)].fg)}
              style={{ flexGrow: level.max - level.min + 1, flexBasis: 0 }}
            >
              {level.name} {fa(level.min)}–{fa(level.max)}
            </span>
          ))}
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden>
          {levels.map((level) => (
            <span
              key={level.rank}
              className={RISK_CLASSES[riskKey(level)].dot}
              style={{ flexGrow: level.max - level.min + 1, flexBasis: 0 }}
            />
          ))}
        </div>
        <div className="relative h-4 text-xs text-ink-3 tabular" aria-hidden>
          {levels.slice(1).map((level) => (
            <span
              key={level.rank}
              className="absolute top-0 ltr:-translate-x-1/2 rtl:translate-x-1/2"
              style={{ insetInlineStart: `${((level.min - first) / total) * 100}%` }}
            >
              {fa(level.min)}
            </span>
          ))}
        </div>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {rules.map((rule) => (
          <li key={rule.key} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span id={`rule-${rule.key}`} className="text-sm font-medium text-ink">
                  {rule.title}
                </span>
                <span id={`rule-${rule.key}-note`} className="text-xs text-ink-3">
                  {rule.note}
                  {rule.source === "system" && " · قاعده‌ی ثابت سامانه"}
                </span>
              </span>
              <Toggle
                checked
                disabled
                onCheckedChange={() => undefined}
                aria-labelledby={`rule-${rule.key}`}
                aria-describedby={`rule-${rule.key}-note`}
                className="disabled:cursor-default disabled:opacity-100"
              />
            </div>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

// ─────────────────────────────── اشتها ───────────────────────────────

const APPETITE_COLUMNS = [
  ["authority", "مرجع مجاز"],
  ["plan", "مهلت طرح"],
  ["acceptance", "اعتبار پذیرش"],
  ["review", "بازبینی"],
  ["reminder", "یادآوری انقضا"],
] as const;

function AppetitePanel({ data }: { data: MethodDefinition }) {
  return (
    <SectionPanel
      id={SECTION_IDS.appetite}
      title="اشتها، مرجع مجاز و بازبینی دوره‌ای"
      description="پس از تصویب مرجع مجاز نافذ است · حدود تحمل خدمت، قرارداد و مقررات مقدم است"
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">قواعد هر سطح ریسک</caption>
          <thead>
            <tr>
              <th scope="col">سطح</th>
              {APPETITE_COLUMNS.map(([key, label]) => (
                <th key={key} scope="col">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.appetite.map((row) => (
              <tr key={row.rank}>
                <td data-primary>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                      RISK_CLASSES[riskKey(row.level)].bg,
                      RISK_CLASSES[riskKey(row.level)].fg,
                    )}
                  >
                    <span aria-hidden className={cn("size-1.5 rounded-full", RISK_CLASSES[riskKey(row.level)].dot)} />
                    {row.level.name}
                  </span>
                </td>
                {APPETITE_COLUMNS.map(([key, label]) => {
                  const changed = row.changed.includes(key);
                  return (
                    <td key={key} data-label={label} data-wide={key === "plan" || key === "authority" || undefined}>
                      <span
                        className={cn(
                          "inline-block rounded-md border px-2 py-1 text-xs whitespace-nowrap",
                          changed
                            ? "border-warning bg-warning-subtle font-semibold text-warning"
                            : "border-line text-ink-2",
                        )}
                      >
                        {row[key] ? faText(row[key]) : "—"}
                        {changed && <span className="sr-only"> (تغییر نسبت به {data.version.based_on})</span>}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

// ─────────────────────────────── ابعاد پیامد ───────────────────────────────

function ImpactPanel({ data }: { data: MethodDefinition }) {
  return (
    <SectionPanel
      id={SECTION_IDS.impact}
      title="ابعاد پیامد"
      description="پنج بُعد با سطوح ۰ تا ۵ برای هر ذی‌نفع (داتین و مشتری) · I بیشینه‌ی ابعاد است"
      aside={
        <Button asChild variant="link" size="sm">
          <AppLink href={data.version.reference}>
            <Icon name="books" />
            معیارهای سطوح
          </AppLink>
        </Button>
      }
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">ابعاد پیامد این نسخه</caption>
          <thead>
            <tr>
              <th scope="col">نماد</th>
              <th scope="col">بُعد</th>
              <th scope="col">دامنه</th>
              <th scope="col">ذی‌نفع</th>
              <th scope="col">سطوح</th>
            </tr>
          </thead>
          <tbody>
            {data.impact_scales.map((scale) => (
              <tr key={scale.code}>
                <td data-label="نماد" className="w-0">
                  <bdi className="code font-semibold text-brand">{scale.code}</bdi>
                </td>
                <td data-primary className="font-semibold whitespace-nowrap text-ink">
                  {scale.name}
                </td>
                <td data-label="دامنه" data-wide className="min-w-48 text-xs text-ink-2">
                  {scale.scope}
                </td>
                <td data-label="ذی‌نفع" className="text-xs whitespace-nowrap text-ink-2">
                  {scale.stakeholders.join(" · ")}
                </td>
                <td data-label="سطوح">
                  <Link
                    to={`/method/${data.version.number}/impact/${scale.code}`}
                    aria-label={`سطوح بُعد ${scale.name}`}
                    className="inline-flex"
                  >
                    <Chip tone="success">{fa(scale.levels)} سطح تعریف‌شده</Chip>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

// ─────────────────────────────── پارامترهای دیگر ───────────────────────────────

const OTHER_GROUPS = [
  ["impact", "پیامد"],
  ["appetite", "یادآوری پذیرش"],
  ["monitoring", "پایش، شواهد و کالیبراسیون"],
] as const;

function OtherParameters({ data, edit }: { data: MethodDefinition; edit: Editing }) {
  return (
    <SectionPanel
      id={SECTION_IDS.monitoring}
      title="پارامترهای پایش و دیگر پارامترها"
      description="بازسنجی، پوشش و قدمت شواهد کنترل، کالیبراسیون، یادآوری پذیرش و معیارهای S"
      bodyClassName="flex flex-col gap-5"
    >
      {OTHER_GROUPS.map(([group, label]) => {
        const params = data.parameters.filter((param) => param.group === group);
        if (!params.length) return null;
        return (
          <section key={group} aria-label={label} className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold text-ink-3">{label}</h3>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2">
              {params.map((param) => (
                <Field
                  key={param.key}
                  label={param.label}
                  hint={beforeHint(data.version.based_on, param) ?? (param.note || undefined)}
                >
                  <ParamInput edit={edit} paramKey={param.key} />
                </Field>
              ))}
            </div>
          </section>
        );
      })}
    </SectionPanel>
  );
}

// ─────────────────────────────── ستون کناری ───────────────────────────────

function Versions({ data }: { data: MethodDefinition }) {
  return (
    <SectionPanel title="نسخه‌ها" description="ParameterSet نسخه‌دار با سابقه‌ی کامل">
      <ol className="flex flex-col">
        {data.versions.map((version, index) => (
          <li key={version.number} className="relative flex gap-3 pb-4 last:pb-0">
            {index < data.versions.length - 1 && (
              <span
                aria-hidden
                className="absolute top-3 bottom-0 w-px bg-line ltr:left-[0.3125rem] rtl:right-[0.3125rem]"
              />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-panel",
                version.status.value === "draft"
                  ? "bg-warning"
                  : version.status.value === "active"
                    ? "bg-brand"
                    : "bg-line-strong",
              )}
            />
            <Link
              to={`/method/${version.number}`}
              aria-current={version.current ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-1 rounded-md px-2 py-1 -my-1 hover:bg-subtle focus-visible:shadow-focus focus-visible:outline-none",
                version.current && "bg-brand-subtle",
              )}
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <bdi className="code font-bold text-ink">{version.name}</bdi>
                  <Chip tone={STATUS_TONE[version.status.value] ?? "neutral"}>{version.status.label}</Chip>
                </span>
                {version.date && <span className="text-xs text-ink-3 tabular">{faText(version.date.jalali)}</span>}
              </span>
              <span className="text-xs leading-5 text-ink-2">{version.note}</span>
            </Link>
          </li>
        ))}
      </ol>
    </SectionPanel>
  );
}

function Changes({ data }: { data: MethodDefinition }) {
  const base = data.version.based_on;
  return (
    <SectionPanel
      id="method-changes"
      title={base ? `تغییرات ${data.version.name} نسبت به ${base}` : "تغییرات نسخه"}
      aside={data.changes.length > 0 && <Chip tone="warning">{fa(data.changes.length)} تغییر</Chip>}
    >
      {!base ? (
        <p className="text-sm text-ink-3">این نسخه از نسخه‌ی دیگری کپی نشده است.</p>
      ) : data.changes.length ? (
        <ul className="flex flex-col gap-2">
          {data.changes.map((change) => (
            <li key={change.key} className="flex flex-col gap-1 rounded-md bg-subtle px-3 py-2.5">
              <span className="text-sm font-semibold text-ink">{change.label}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-ink-3">
                  <span className="sr-only">از </span>
                  {faText(change.before)}
                </span>
                <Icon name="arrow-left" size={12} className="text-ink-3" />
                <span className="font-semibold text-warning">
                  <span className="sr-only">به </span>
                  {faText(change.after)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">تغییری نسبت به {base} نیست.</p>
      )}
    </SectionPanel>
  );
}

const STEP_STYLE: Record<ApprovalState, { icon: IconName; className: string; label: string }> = {
  done: { icon: "check-circle", className: "bg-success text-white", label: "انجام شد" },
  current: { icon: "clock", className: "bg-brand-subtle text-brand", label: "مرحله‌ی جاری" },
  locked: { icon: "lock", className: "bg-subtle text-ink-3", label: "هنوز نرسیده" },
  skipped: { icon: "info", className: "bg-warning-subtle text-warning", label: "انجام نشده" },
};

function Approval({ data }: { data: MethodDefinition }) {
  return (
    <SectionPanel title="گردش تصویب" bodyClassName="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {data.approval.map((step) => {
          const style = STEP_STYLE[step.state];
          return (
            <li key={step.key} className="flex items-start gap-3">
              <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", style.className)}>
                <Icon name={style.icon} size={14} />
                <span className="sr-only">{style.label}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("text-sm font-semibold", step.state === "locked" ? "text-ink-3" : "text-ink")}>
                  {step.title}
                </span>
                <span className="text-xs text-ink-3">{faText(step.note)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="flex gap-2 border-t border-line pt-3 text-xs leading-5 text-ink-2">
        <Icon name="info" size={14} className="mt-0.5 shrink-0 text-info" />
        ارزیابی‌های موجود با نسخه‌ی خود حفظ می‌شوند؛ بهبود امتیاز ناشی از تغییر روش، بهبود واقعی کنترل گزارش نمی‌شود.
      </p>
    </SectionPanel>
  );
}

function Categories({ data }: { data: MethodDefinition }) {
  return (
    <SectionPanel
      id={SECTION_IDS.categories}
      title="طبقه‌بندی ریسک"
      description="برای تخصیص مالک و گزارش؛ بر امتیاز اثر ندارد"
      bodyClassName="p-0"
    >
      <ul className="flex flex-col divide-y divide-line">
        {data.categories.map((category) => (
          <li key={category.code} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <bdi className="code w-6 shrink-0 text-xs font-semibold text-brand">{category.code}</bdi>
            <span className="min-w-0 flex-1 text-ink">{category.name}</span>
            <span className="text-xs text-ink-3 tabular" aria-label={`${fa(category.risks)} ریسک`}>
              {fa(category.risks)}
            </span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

function SectionNav({ data }: { data: MethodDefinition }) {
  const [active, setActive] = useState("base");
  const items: { key: string; label: string; count: number | null }[] = [
    ...data.groups.map((group) => ({ key: group.key, label: group.label, count: group.changes || null })),
    { key: "categories", label: "طبقه‌بندی", count: data.categories.length },
  ];
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-line bg-panel px-4">
      <nav
        aria-label="بخش‌های روش"
        className="-mb-px flex min-w-0 flex-wrap max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:[contain:inline-size]"
      >
        {items.map((item) => (
          <a
            key={item.key}
            href={`#${SECTION_IDS[item.key]}`}
            aria-current={active === item.key ? "true" : undefined}
            onClick={(event) => {
              event.preventDefault();
              setActive(item.key);
              scrollTo(SECTION_IDS[item.key] ?? "");
            }}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap focus-visible:shadow-focus focus-visible:outline-none",
              active === item.key ? "border-brand text-brand" : "border-transparent text-ink-2 hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== null && (
              <span
                className={cn(
                  "inline-grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full px-1.5 text-xs",
                  item.key === "categories" ? "bg-subtle text-ink-2" : "bg-warning-subtle text-warning",
                )}
              >
                {fa(item.count)}
              </span>
            )}
          </a>
        ))}
      </nav>
      <span className="py-2 text-xs text-ink-3">
        آخرین ذخیره: {faText(data.version.saved.jalali)}
        {data.version.editable && " · متولی روش"}
      </span>
    </div>
  );
}

function Layout({ data, edit, actions }: { data: MethodDefinition; edit: Editing; actions: ReactNode }) {
  return (
    <>
      {actions}
      <SectionNav data={data} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <BaseParameters data={data} edit={edit} />
          <LikelihoodTable data={data} />
          <LevelsPanel data={data} />
          <AppetitePanel data={data} />
          <ImpactPanel data={data} />
          <OtherParameters data={data} edit={edit} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Versions data={data} />
          <Changes data={data} />
          <Approval data={data} />
          <Categories data={data} />
        </div>
      </div>
    </>
  );
}

export function MethodDefinitionPage() {
  useTitle("تعریف متدولوژی");
  const { number } = useParams();
  const queryKey = ["method-definition", number ?? "default"];
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<"submit" | "copy" | null>(null);
  const [notes, setNotes] = useState("");
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<MethodDefinition>(`method/definition/${number ? `?version=${number}` : ""}`, signal),
  });
  const data = query.data;

  const dirty = Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, latin(value).trim()] as const)
      .filter(([key, value]) => {
        const param = data?.parameters.find((item) => item.key === key);
        return param && value !== "" && Number(value) !== Number(param.value);
      }),
  );
  const dirtyCount = Object.keys(dirty).length;

  const fail = (error: Error) => toast({ title: faText(error.message), tone: "danger" });
  const save = useMutation({
    mutationFn: () =>
      post<{ changed: string[]; page: MethodDefinition }>(`method/definition/${data?.version.number}/parameters/`, {
        values: dirty,
      }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result.page);
      setValues({});
      toast({ title: `${fa(result.changed.length)} مقدار در ${result.page.version.name} ذخیره شد` });
    },
    onError: fail,
  });
  const submit = useMutation({
    mutationFn: () =>
      post<MethodDefinition>(`method/definition/${data?.version.number}/submit/`, { change_notes: notes }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      setConfirm(null);
      toast({ title: `${result.version.name} برای بازبینی و تصویب فرستاده شد` });
    },
    onError: (error: Error) => {
      setConfirm(null);
      fail(error);
    },
  });
  const copy = useMutation({
    mutationFn: () => post<MethodDefinition>(`method/definition/${data?.version.number}/copy/`, {}),
    onSuccess: (result) => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["method-definition"] });
      toast({ title: `پیش‌نویس ${result.version.name} ساخته شد` });
      void navigate(`/method/${result.version.number}`);
    },
    onError: (error: Error) => {
      setConfirm(null);
      fail(error);
    },
  });

  const edit: Editing = {
    editable: Boolean(data?.version.editable),
    values,
    set: (key, value) => setValues((current) => ({ ...current, [key]: value })),
    param: (key) => data?.parameters.find((param) => param.key === key),
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تعریف متدولوژی"
        breadcrumb={[{ label: "پیکربندی سامانه" }, { label: "تعریف متدولوژی" }]}
        meta={
          data && (
            <Chip tone={STATUS_TONE[data.version.status.value] ?? "neutral"}>
              <bdi>ParameterSet {data.version.name}</bdi> · {data.version.status.label}
              {data.version.submitted && " · فرستاده‌شده"}
            </Chip>
          )
        }
        description="مجموعه‌ی پارامتر سازمانی نسخه‌دار · هر تغییر نسخه‌ی جدید می‌سازد و پس از تصویب مرجع مجاز نافذ می‌شود؛ هر ارزیابی به نسخه‌ی خود پیوند می‌ماند"
        actions={
          data && (
            <>
              {data.version.based_on && data.changes.length > 0 && (
                <AppLink href={`/method/${data.version.number}/diff`} button={{ variant: "outline" }}>
                  <Icon name="merge" />
                  مقایسه با {data.version.based_on}
                </AppLink>
              )}
              {data.can_copy && (
                <Button variant="outline" onClick={() => setConfirm("copy")}>
                  <Icon name="plus" />
                  ایجاد پیش‌نویس از {data.copy_from}
                </Button>
              )}
              {data.can_submit && (
                <Button
                  onClick={() => {
                    setNotes(data.version.change_notes);
                    setConfirm("submit");
                  }}
                  disabled={dirtyCount > 0}
                  title={dirtyCount ? "اول تغییرهای ذخیره‌نشده را ذخیره کنید" : undefined}
                >
                  <Icon name="signature" />
                  ارسال برای تصویب
                </Button>
              )}
            </>
          )
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !data ? (
        <PageSkeleton rows={8} />
      ) : (
        <Layout
          data={data}
          edit={edit}
          actions={
            data.version.submitted && data.version.status.value === "draft" ? (
              <p className="flex items-center gap-2 rounded-lg border border-info bg-info-subtle px-4 py-3 text-sm text-info">
                <Icon name="info" size={16} />
                این پیش‌نویس برای بازبینی روش‌شناختی و تصویب فرستاده شده است و دیگر ویرایش نمی‌شود.
              </p>
            ) : null
          }
        />
      )}
      {dirtyCount > 0 && (
        <div
          role="region"
          aria-label="تغییرهای ذخیره‌نشده"
          className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 shadow-lg"
        >
          <span className="text-sm text-ink">{fa(dirtyCount)} مقدار تغییر کرده و هنوز ذخیره نشده است.</span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setValues({})} disabled={save.isPending}>
              انصراف
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              ذخیره‌ی تغییرات
            </Button>
          </span>
        </div>
      )}
      <ConfirmDialog
        open={confirm === "submit"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`ارسال ${data?.version.name ?? ""} برای تصویب`}
        description="پس از ارسال، پیش‌نویس در این صفحه ویرایش نمی‌شود و برای بازبینی روش‌شناختی و تصویب مرجع مجاز می‌رود. ارزیابی‌ها تا فعال شدن نسخه با نسخه‌ی فعلی انجام می‌شوند."
        confirmLabel="ارسال برای تصویب"
        loading={submit.isPending}
        confirmDisabled={Boolean(data?.version.based_on) && !notes.trim()}
        onConfirm={() => submit.mutate()}
      >
        <Field
          label={`شرح تغییرات نسبت به ${data?.version.based_on ?? "نسخه‌ی قبلی"}`}
          required={Boolean(data?.version.based_on)}
          hint="مقدار، دلیل و مرجع هر تغییر (بخش ۳۲ سند روش)"
        >
          <Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "copy"}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`ایجاد پیش‌نویس از ${data?.copy_from ?? ""}`}
        description="همه‌ی جدول‌ها و پارامترهای نسخه‌ی فعال در پیش‌نویس تازه کپی می‌شوند؛ هر تغییر روش از همین پیش‌نویس شروع می‌شود."
        confirmLabel="ایجاد پیش‌نویس"
        loading={copy.isPending}
        onConfirm={() => copy.mutate()}
      />
    </div>
  );
}
