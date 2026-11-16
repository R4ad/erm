import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Navigate, useBlocker, useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldError, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey, type RiskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { ProcessSteps, type StepState } from "@/components/ui/process-step";
import { Chip, SectionPanel, type ChipTone } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { useGoTo } from "@/features/session/links";
import { ApiError, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type {
  AnalysisBand,
  AnalysisControl,
  AnalysisInitiator,
  AnalysisInitiatorValues,
  AnalysisPage as PageData,
  AnalysisPath,
} from "@/lib/types";

// «آنالیز ریسک» به چیدمان فیگما ۱۲: گام تحلیل، پنج شاخص A، B، L، I و امتیاز؛ در ستون اصلی عامل آغازگر با مسیر
// امتیازدهی و جدول A، مسیرهای تحقق و اثربخشی کنترل‌ها؛ در ستون کناری ماتریس A × B، پروفایل پیامد، عدم قطعیت و
// قاعده‌های جلوگیری از اعتباردهی تکراری. A همین‌جا ثبت می‌شود؛ مسیر و آزمون کنترل فرم خودشان را دارند.

const PROCESS: { label: string; state: StepState }[] = [
  { label: "تعیین بافتار", state: "done" },
  { label: "شناسایی", state: "done" },
  { label: "گردآوری شواهد", state: "done" },
  { label: "تحلیل", state: "current" },
  { label: "ارزیابی", state: "upcoming" },
  { label: "تصمیم و اجرا", state: "upcoming" },
  { label: "آزمون و بازسنجی", state: "upcoming" },
  { label: "پایش و گزارش", state: "upcoming" },
];

const RULES = [
  "اثر یک کنترل بر یک مرحله فقط یک‌بار منظور می‌شود؛ کاهش هم‌زمان A و Bc فقط با دو سازوکار مستند.",
  "MFA، PAM، HA و کنترل انتشار در E و Bc ارزیابی می‌شوند، نه در A.",
  "Bc از میانگین E یا رابطه‌ی «۶ منهای E» به دست نمی‌آید.",
  "لاگ، گزارش‌گیری و آموزش عمومی به‌خودی‌خود Bc را کاهش نمی‌دهند.",
  "تعداد مشتری و حجم داده شدت پیامد را تعیین می‌کند، نه A یا B.",
];

type Form = Record<keyof AnalysisInitiatorValues, string>;
type Errors = Partial<Record<keyof AnalysisInitiatorValues | "__all__", string[]>>;

const FIELD_LABELS: Record<keyof AnalysisInitiatorValues, string> = {
  a_basis: "مسیر امتیازدهی",
  a_count: "تعداد آغازگر یکتا",
  a_period_months: "دوره‌ی مشاهده",
  a_coverage: "پوشش ثبت",
  a_level: "سطح A",
  a_high: "کران بالای A",
  a_confidence: "اطمینان A",
  a_rationale: "دلیل A",
};

function toForm(values: AnalysisInitiatorValues): Form {
  const text = (value: string | number | null) => (value === null || value === undefined ? "" : String(value));
  return {
    a_basis: values.a_basis,
    a_count: text(values.a_count),
    a_period_months: text(values.a_period_months),
    a_coverage: text(values.a_coverage),
    a_level: values.a_level,
    a_high: text(values.a_high),
    a_confidence: values.a_confidence,
    a_rationale: values.a_rationale,
  };
}

/** عدد اعشاری با رقم و ممیز فارسی: 0.1 → ۰٫۱ */
function num(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const rounded = Math.round(value * 100) / 100;
  return fa(String(rounded).replace(".", "٫"));
}

function bandText(value: AnalysisBand | null | undefined) {
  if (!value) return "—";
  const [low, high] = value;
  return high === null || high === low ? fa(low) : `${fa(low)} تا ${fa(high)}`;
}

/** رنگ سطح مقیاس‌های ۱ تا ۵ ریسک (L، B، I): ۱ و ۲ سبز، ۳ زرد، ۴ نارنجی، ۵ قرمز. */
function levelKey(value: number | null | undefined): RiskKey {
  if (value === null || value === undefined) return "none";
  if (value <= 2) return "low";
  if (value === 3) return "medium";
  if (value === 4) return "high";
  return "critical";
}

/** رنگ E: هرچه بالاتر بهتر؛ E3 به بالا سبز، E2 زرد و E1 قرمز. */
function eKey(value: number): RiskKey {
  if (value >= 3) return "low";
  if (value === 2) return "medium";
  return "critical";
}

function LevelChip({ value, tone, label }: { value: ReactNode; tone: RiskKey; label?: string }) {
  const classes = RISK_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-md px-1.5 text-sm font-semibold tabular",
        classes.bg,
        classes.fg,
      )}
      aria-label={label}
    >
      {value}
    </span>
  );
}

function StatusMark({ state, label }: { state: "ok" | "partial" | "missing" | null; label: string }) {
  if (state === null) return <span className="text-ink-3">—</span>;
  const map = {
    ok: { icon: "check-circle", className: "text-success", text: "برقرار" },
    partial: { icon: "warning", className: "text-warning", text: "ناقص" },
    missing: { icon: "x-circle", className: "text-danger", text: "برقرار نیست" },
  } as const;
  const item = map[state];
  return (
    <span className="inline-flex items-center" title={`${label}: ${item.text}`}>
      <Icon name={item.icon} size={18} className={item.className} />
      <span className="sr-only">
        {label}: {item.text}
      </span>
    </span>
  );
}

// ─────────────────────────────── شاخص‌ها ───────────────────────────────

function Summary({ data, values }: { data: PageData; values: Form }) {
  const { summary, initiator } = data;
  const level = summary.score.level;
  const inherent = summary.score.inherent;
  const rate = rateOf(values);
  const scoreTone = riskKey(level);
  const aNote =
    values.a_basis === "rate" && rate !== null
      ? `${num(Number(values.a_count))} ${countNoun(initiator.count_unit)} در ${periodText(Number(values.a_period_months))}`
      : values.a_basis === "forward"
        ? "از شاهد آینده‌نگر"
        : "هنوز ثبت نشده";
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="عامل آغازگر A"
        icon="lightning"
        tone="brand"
        value={summary.a.value ? faText(summary.a.value) : "—"}
        note={aNote}
      />
      <StatTile
        label="امکان تحقق B"
        icon="flow"
        tone="warning"
        valueTone="warning"
        value={summary.b.value ? faText(summary.b.value) : "—"}
        note={summary.paths ? "بیشینه‌ی B مسیرها · min(B0, Bc)" : "مسیر تحققی ثبت نشده است"}
      />
      <StatTile
        label="احتمال نهایی L"
        icon="gauge"
        tone="warning"
        valueTone="warning"
        value={summary.l.value ? faText(summary.l.value) : "—"}
        note={
          summary.l.a && summary.l.b
            ? `جدول A × B · سطر A${fa(summary.l.a)}، ستون B${fa(summary.l.b)}`
            : "A و B لازم است"
        }
      />
      <StatTile
        label="پیامد I"
        icon="target"
        tone="neutral"
        value={summary.i.value ? faText(summary.i.value) : "—"}
        note={
          summary.i.source
            ? `بیشینه‌ی ${summary.i.dimensions === 5 ? "پنج" : fa(summary.i.dimensions)} بُعد · ${summary.i.source}${fa(summary.i.value)}`
            : "پروفایل پیامد کامل نیست"
        }
      />
      <StatTile
        label="امتیاز جاری L×I"
        icon="chart-bar"
        tone="success"
        className="col-span-2 md:col-span-1"
        valueClassName={scoreTone === "none" ? undefined : RISK_CLASSES[scoreTone].fg}
        value={summary.score.value ? faText(summary.score.value) : "—"}
        note={[
          level?.name,
          inherent ? `ذاتی ${fa(inherent.score)}${inherent.level ? ` ${inherent.level.name}` : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      />
    </div>
  );
}

// ─────────────────────────────── عامل آغازگر ───────────────────────────────

function rateOf(values: Form): number | null {
  if (values.a_basis !== "rate" || values.a_count === "" || !Number(values.a_period_months)) return null;
  return Number(values.a_count) / (Number(values.a_period_months) / 12);
}

function suggestedLevel(rate: number | null, initiator: AnalysisInitiator): number | null {
  if (rate === null) return null;
  const upperClosed = initiator.bound_rule === "upper_closed";
  const band = initiator.bands.find(({ lower, upper }) => {
    const aboveLower = lower === null || (upperClosed ? rate > lower : rate >= lower);
    const belowUpper = upper === null || (upperClosed ? rate <= upper : rate < upper);
    return aboveLower && belowUpper;
  });
  return band ? band.value : null;
}

/** «هر بسته‌ی نامعتبر یکتا، بدون توجه به ...» → «بسته‌ی نامعتبر یکتا» */
function countNoun(unit: string) {
  const noun = unit
    .split(/[،,]/)[0]
    ?.replace(/^هر\s+/, "")
    .trim();
  return noun || "آغازگر یکتا";
}

function periodText(months: number) {
  if (!months) return "";
  if (months === 12) return "سال";
  return months % 12 === 0 ? `${fa(months / 12)} سال` : `${fa(months)} ماه`;
}

function insufficientOf(values: Form, initiator: AnalysisInitiator): string[] {
  if (values.a_basis !== "rate") return [];
  const problems: string[] = [];
  const months = Number(values.a_period_months);
  if (initiator.period_min && months && months < initiator.period_min) {
    problems.push(`دوره‌ی مشاهده کمتر از ${fa(initiator.period_min)} ماه است؛ تعداد مشاهده‌شده کران پایین است.`);
  }
  if (initiator.coverage_min && values.a_coverage !== "" && Number(values.a_coverage) < initiator.coverage_min) {
    problems.push(`پوشش ثبت کمتر از ${num(initiator.coverage_min)}٪ است؛ تعداد مشاهده‌شده کران پایین است.`);
  }
  return problems;
}

function InlineNumber({
  id,
  value,
  onChange,
  label,
  width = "w-16",
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  label: string;
  width?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <input
      id={id}
      inputMode="decimal"
      value={fa(value)}
      disabled={disabled}
      aria-label={label}
      aria-invalid={invalid || undefined}
      onChange={(event) =>
        onChange(
          event.target.value
            .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
            .replace("٫", ".")
            .replace(/[^0-9.]/g, ""),
        )
      }
      className={cn(
        "h-7 rounded-md border border-brand-subtle-strong bg-panel px-2 text-center text-sm font-semibold text-ink tabular outline-none focus:border-brand focus:shadow-focus disabled:border-transparent disabled:bg-transparent aria-invalid:border-danger",
        width,
      )}
    />
  );
}

function InitiatorCard({
  data,
  values,
  errors,
  onChange,
}: {
  data: PageData;
  values: Form;
  errors: Errors;
  onChange: (changes: Partial<Form>) => void;
}) {
  const { initiator } = data;
  const editable = data.assessment.can_edit;
  const ids = useId();
  const rate = rateOf(values);
  const saved = toForm(initiator.values);
  const unchanged = JSON.stringify(values) === JSON.stringify(saved);
  const insufficient = unchanged ? initiator.insufficient : insufficientOf(values, initiator);
  const level = values.a_level && values.a_level !== "unknown" ? Number(values.a_level) : null;

  function setRate(changes: Partial<Form>) {
    const next = { ...values, ...changes };
    const suggestion = suggestedLevel(rateOf(next), initiator);
    onChange({ ...changes, ...(suggestion ? { a_level: String(suggestion) } : {}) });
  }

  return (
    <SectionPanel
      title="عامل آغازگر (A)"
      description="مرز آغازگر پیش از شمارش و پیش از دیدن امتیاز تعیین می‌شود؛ تعریف در تمام مراحل ثابت می‌ماند."
      aside={
        <>
          {editable && (
            <AppLink href={initiator.form_url} button={{ variant: "ghost", size: "sm" }}>
              <Icon name="pencil" />
              ویرایش تعریف
            </AppLink>
          )}
          {initiator.locked ? <Chip tone="success">تأییدشده</Chip> : <Chip tone="warning">نیازمند تکمیل</Chip>}
        </>
      }
      bodyClassName="flex flex-col gap-4"
    >
      <dl className="flex flex-col">
        {initiator.rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 border-b border-line py-2.5 text-sm last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]"
          >
            <dt className="text-ink-3">{row.label}</dt>
            <dd className={row.value ? "text-ink" : "text-ink-3"}>{row.value ? faText(row.value) : "ثبت نشده"}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-col gap-3 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink" id={`${ids}-basis`}>
            مسیر امتیازدهی
          </h3>
          <div
            role="radiogroup"
            aria-labelledby={`${ids}-basis`}
            className="inline-flex rounded-lg border border-line bg-subtle p-1"
          >
            {initiator.basis_choices.map((choice) => {
              const selected = values.a_basis === choice.value;
              return (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={!editable}
                  onClick={() => {
                    if (choice.value === "rate") setRate({ a_basis: "rate" });
                    else onChange({ a_basis: choice.value });
                  }}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-default",
                    selected ? "bg-panel text-brand shadow-sm ring-1 ring-brand" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {selected && <Icon name="check-circle" size={14} />}
                  {choice.value === "rate" ? "نرخ سالانه" : "شاهد آینده‌نگر"}
                </button>
              );
            })}
          </div>
        </div>
        <FieldError messages={errors.a_basis} />

        <div
          className="flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-lg border border-brand-subtle-strong bg-brand-subtle px-4 py-3 text-sm text-ink"
          aria-live="polite"
        >
          {values.a_basis === "rate" ? (
            <>
              <InlineNumber
                id={`${ids}-count`}
                label="تعداد آغازگر یکتا"
                value={values.a_count}
                disabled={!editable}
                invalid={Boolean(errors.a_count)}
                onChange={(value) => setRate({ a_count: value })}
              />
              <span>{countNoun(initiator.count_unit)}</span>
              <span className="text-ink-3" aria-hidden>
                ÷
              </span>
              <InlineNumber
                id={`${ids}-months`}
                label="دوره‌ی مشاهده به ماه"
                value={values.a_period_months}
                width="w-12"
                disabled={!editable}
                invalid={Boolean(errors.a_period_months)}
                onChange={(value) => setRate({ a_period_months: value })}
              />
              <span>ماه مشاهده</span>
              <span className="text-ink-3" aria-hidden>
                =
              </span>
              <span className="font-semibold">{rate === null ? "…" : `${num(rate)} در سال`}</span>
              <Icon name="arrow-left" size={14} className="text-ink-3 ltr:rotate-180" />
            </>
          ) : values.a_basis === "forward" ? (
            <span>سطح A از شاهد آینده‌نگر با دلیل ثبت‌شده انتخاب می‌شود؛ داده‌ی نرخ در این مسیر به کار نمی‌رود.</span>
          ) : (
            <span className="text-ink-2">مسیر امتیازدهی را انتخاب کنید؛ A تا آن موقع ثبت‌نشده است.</span>
          )}
          <span className="ms-auto inline-flex h-6 items-center rounded-full bg-brand px-2.5 text-xs font-semibold text-on-brand">
            A = {values.a_level === "unknown" ? "نامعلوم" : level ? fa(level) : "—"}
            {values.a_high ? ` تا ${fa(values.a_high)}` : ""}
          </span>
        </div>
        <FieldError messages={[...(errors.a_count ?? []), ...(errors.a_period_months ?? [])]} />

        <fieldset disabled={!editable || !values.a_basis}>
          <legend className="sr-only">سطح A</legend>
          <div className="grid grid-cols-5 gap-2">
            {initiator.bands.map((band) => {
              const selected = level === band.value;
              const suggested = values.a_basis === "rate" && suggestedLevel(rate, initiator) === band.value;
              return (
                <label
                  key={band.value}
                  className={cn(
                    "flex min-h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 text-center transition-colors has-focus-visible:shadow-focus has-disabled:cursor-default",
                    selected
                      ? "border-brand bg-brand text-on-brand"
                      : "border-line bg-panel text-ink hover:border-line-strong",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-level`}
                    value={band.value}
                    checked={selected}
                    onChange={() => onChange({ a_level: String(band.value), a_high: "" })}
                    className="sr-only"
                  />
                  <span className="text-sm font-bold">A{fa(band.value)}</span>
                  <span className={cn("text-xs", selected ? "text-on-brand/85" : "text-ink-3")}>
                    {num(band.lower) && num(band.upper)
                      ? `${num(band.lower)} تا ${num(band.upper)}`
                      : band.lower === null
                        ? `کمتر از ${num(band.upper)}`
                        : `${num(band.lower)} یا بیشتر`}
                  </span>
                  {suggested && !selected && <span className="sr-only">(پیشنهاد نرخ)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        <FieldError messages={[...(errors.a_level ?? []), ...(errors.a_high ?? [])]} />

        {insufficient.length > 0 && (
          <Alert tone="warning" title="داده‌ی نرخ برای سطح قطعی کافی نیست:">
            <ul className="mt-1 flex list-disc flex-col gap-0.5 ps-4">
              {insufficient.map((item) => (
                <li key={item}>{faText(item)}</li>
              ))}
            </ul>
          </Alert>
        )}

        {editable && values.a_basis && (
          <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-confidence`} className="text-xs font-medium text-ink-2">
                اطمینان A
              </label>
              <Select
                id={`${ids}-confidence`}
                value={values.a_confidence}
                onChange={(event) => onChange({ a_confidence: event.target.value })}
                aria-invalid={errors.a_confidence ? true : undefined}
              >
                <option value="">انتخاب کنید</option>
                {initiator.confidence_choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </Select>
              <FieldError messages={errors.a_confidence} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-rationale`} className="text-xs font-medium text-ink-2">
                دلیل مسیر و سطح
              </label>
              <input
                id={`${ids}-rationale`}
                value={values.a_rationale}
                onChange={(event) => onChange({ a_rationale: event.target.value })}
                aria-invalid={errors.a_rationale ? true : undefined}
                className="h-10 rounded-md border border-line-strong bg-panel px-3 text-sm text-ink outline-none focus:border-brand focus:shadow-focus aria-invalid:border-danger"
              />
              <FieldError messages={errors.a_rationale} />
            </div>
          </div>
        )}

        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
          {values.a_basis === "rate" && (
            <>
              <span>پوشش ثبت</span>
              <InlineNumber
                id={`${ids}-coverage`}
                label="پوشش ثبت به درصد"
                value={values.a_coverage}
                width="w-12"
                disabled={!editable}
                invalid={Boolean(errors.a_coverage)}
                onChange={(value) => setRate({ a_coverage: value })}
              />
              <span>٪{initiator.coverage_min ? ` (حداقل ${num(initiator.coverage_min)}٪)` : ""} ·</span>
            </>
          )}
          <span>ستون‌های نرخ و شاهد با هم جمع یا میانگین نمی‌شوند · نرخ سالانه، درصد احتمال سناریو نیست.</span>
        </p>
        <FieldError messages={errors.a_coverage} />
      </div>
    </SectionPanel>
  );
}

// ─────────────────────────────── مسیرها و کنترل‌ها ───────────────────────────────

function PathsCard({ data }: { data: PageData }) {
  const { paths } = data;
  const scenario = paths.b;
  return (
    <SectionPanel
      title="مسیرهای تحقق (B0 · Bc · B)"
      description="B هر مسیر = min(B0, Bc) · B سناریو = بیشینه‌ی مسیرها؛ کنترل خوب یک مسیر، مسیر باز دیگر را جبران نمی‌کند."
      aside={
        paths.add_url && (
          <AppLink href={paths.add_url} button={{ variant: "ghost", size: "sm" }}>
            <Icon name="plus" />
            افزودن مسیر
          </AppLink>
        )
      }
      bodyClassName="p-0"
    >
      {paths.rows.length ? (
        <>
          <div className="table-shell">
            <table className="data-table">
              <caption className="sr-only">مسیرهای تحقق و B هر مسیر</caption>
              <thead>
                <tr>
                  <th scope="col">مسیر</th>
                  <th scope="col">B0</th>
                  <th scope="col">موانع پیشگیرانه و سطح E</th>
                  <th scope="col">Bc</th>
                  <th scope="col">B مسیر</th>
                </tr>
              </thead>
              <tbody>
                {paths.rows.map((path) => (
                  <PathRow key={path.id} path={path} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line bg-subtle px-5 py-3 text-sm">
            <span className="font-medium text-ink">
              B سناریو = بیشینه‌ی {paths.highs.map((value) => fa(value)).join(" و ")}
            </span>
            <Chip tone="warning">B = {bandText(scenario)}</Chip>
            {paths.rows.length > 1 && (
              <span className="text-xs text-ink-3">
                همه‌ی مسیرها به یک رویداد اصلی و با همان آغازگر می‌رسند؛ مسیر با آغازگر متفاوت ارزیابی جداگانه‌ی A
                می‌خواهد.
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">هنوز مسیر تحققی ثبت نشده است؛ B سناریو از مسیرها می‌آید.</p>
      )}
      {paths.problems.length > 0 && (
        <div className="px-5 pb-4">
          <Alert tone="warning">{paths.problems.map(faText).join(" ")}</Alert>
        </div>
      )}
    </SectionPanel>
  );
}

function PathRow({ path }: { path: AnalysisPath }) {
  return (
    <tr>
      <td data-primary className="min-w-52">
        <span className="flex items-start gap-2">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-base font-semibold text-ink">{path.name}</span>
            {path.description && <span className="text-xs text-ink-3">{path.description}</span>}
          </span>
          {path.edit_url && (
            <AppLink
              href={path.edit_url}
              button={{ variant: "ghost", size: "icon-sm" }}
              aria-label={`ویرایش مسیر ${path.name}`}
            >
              <Icon name="pencil" />
            </AppLink>
          )}
        </span>
      </td>
      <td data-label="B0">
        <LevelChip
          value={bandText(path.b0)}
          tone={levelKey(path.b0?.[1] ?? path.b0?.[0])}
          label={`B0 ${bandText(path.b0)}`}
        />
      </td>
      <td data-label="موانع و E" data-wide>
        {path.controls.length ? (
          <ul className="flex flex-col gap-1.5">
            {path.controls.map((control) => (
              <li key={control.code} className="flex items-center gap-2 text-sm text-ink-2">
                <span>{control.title}</span>
                <span
                  className={cn(
                    "inline-flex h-[1.375rem] items-center rounded-full px-2 text-xs font-semibold",
                    RISK_CLASSES[eKey(control.e)].bg,
                    RISK_CLASSES[eKey(control.e)].fg,
                  )}
                  title={control.note ? faText(control.note) : undefined}
                >
                  E{fa(control.e)}
                  {control.e < control.recorded_e && (
                    <span className="sr-only"> (ثبت‌شده E{fa(control.recorded_e)})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-ink-3">مانع پیشگیرانه‌ی معتبری ندارد</span>
        )}
      </td>
      <td data-label="Bc">
        <LevelChip value={bandText(path.bc)} tone={levelKey(path.bc?.[1])} label={`Bc ${bandText(path.bc)}`} />
      </td>
      <td data-label="B مسیر">
        <span className="inline-flex items-center gap-1.5">
          <LevelChip value={bandText(path.b)} tone={levelKey(path.b?.[1])} label={`B مسیر ${bandText(path.b)}`} />
          {path.determining && <span className="sr-only">(تعیین‌کننده‌ی B سناریو)</span>}
        </span>
      </td>
    </tr>
  );
}

function ControlsCard({ controls }: { controls: AnalysisControl[] }) {
  const testable = controls.filter((control) => control.test_url);
  return (
    <SectionPanel
      title="اثربخشی کنترل‌ها (E)"
      description="چهار وضعیت جدا ثبت می‌شود؛ سطح E با احراز همه‌ی شروط تعیین می‌شود و میانگین، شکست یک شرط کلیدی را نمی‌پوشاند."
      aside={
        testable.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Icon name="check-square" />
                ثبت آزمون
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {testable.map((control) => (
                <DropdownMenuItem key={control.code} asChild>
                  <AppLink href={control.test_url ?? "#"} className="text-ink no-underline hover:no-underline">
                    <bdi className="code text-xs text-ink-3">{control.code}</bdi> {control.title}
                  </AppLink>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
      bodyClassName="p-0"
    >
      {controls.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">اثربخشی کنترل‌های ریسک</caption>
            <thead>
              <tr>
                <th scope="col">کنترل</th>
                <th scope="col">وجود</th>
                <th scope="col">کفایت طراحی</th>
                <th scope="col">پوشش اجرا</th>
                <th scope="col">اثربخشی عملیاتی</th>
                <th scope="col">E</th>
                <th scope="col">شاهد</th>
              </tr>
            </thead>
            <tbody>
              {controls.map((control) => {
                const test = control.test;
                const mark = (value: boolean | undefined) =>
                  test === null ? null : value ? ("ok" as const) : ("partial" as const);
                return (
                  <tr key={control.code}>
                    <td data-primary className="min-w-48">
                      <AppLink href={control.href} className="text-base font-semibold text-ink hover:text-brand">
                        {control.title}
                      </AppLink>
                      <span className="block text-xs text-ink-3">
                        <bdi className="code">{control.code}</bdi> ·{" "}
                        {control.preventive ? `مسئول: ${control.owner || "—"}` : `کنترل ${control.kind.label}`}
                      </span>
                    </td>
                    <td data-label="وجود">
                      <StatusMark state={test ? (test.exists ? "ok" : "missing") : null} label="وجود" />
                    </td>
                    <td data-label="طراحی">
                      <StatusMark state={mark(test?.design_ok)} label="کفایت طراحی" />
                    </td>
                    <td data-label="پوشش">
                      <StatusMark state={test ? test.coverage : null} label="پوشش اجرا" />
                    </td>
                    <td data-label="عملیاتی">
                      {control.preventive ? (
                        <StatusMark state={mark(test?.operating_ok)} label="اثربخشی عملیاتی" />
                      ) : (
                        <span className="text-xs text-ink-3">در پیامد</span>
                      )}
                    </td>
                    <td data-label="E">
                      {control.preventive && test ? (
                        <span title={test.problem ? faText(test.problem) : undefined}>
                          <LevelChip value={`E${fa(test.e)}`} tone={eKey(test.e)} />
                        </span>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    <td data-label="شاهد" data-wide className="text-xs text-ink-2">
                      {!control.preventive ? (
                        <span className="text-ink-3">در پیامد و زمان بازیابی لحاظ می‌شود، نه در Bc</span>
                      ) : control.evidence ? (
                        <span>
                          {control.evidence.code && control.evidence.href ? (
                            <AppLink href={control.evidence.href}>
                              <bdi className="code">{control.evidence.code}</bdi>
                            </AppLink>
                          ) : null}
                          {control.evidence.note && ` · ${faText(control.evidence.note)}`}
                        </span>
                      ) : (
                        <span className="text-ink-3">آزمونی ثبت نشده</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">کنترلی به این ریسک وصل نیست.</p>
      )}
    </SectionPanel>
  );
}

// ─────────────────────────────── ستون کناری ───────────────────────────────

function MatrixCard({ matrix }: { matrix: PageData["matrix"] }) {
  const { a, b, l } = matrix;
  const at = (row: number, column: number) => matrix.rows.find((item) => item.a === row)?.cells[column - 1] ?? null;
  let note = "";
  if (a && b && l) {
    if (b > 1) {
      const lowerB = at(a, b - 1);
      note =
        lowerB === l
          ? `کاهش B از ${fa(b)} به ${fa(b - 1)} در سطر A${fa(a)} رتبه‌ی L را تغییر نمی‌دهد؛ ${
              a > 1 && (at(a - 1, b) ?? l) < l
                ? "در این نمونه کاهش A رتبه‌ی L را پایین می‌آورد."
                : "در این نمونه کاهش پیامد امتیاز را بهبود می‌دهد."
            }`
          : `کاهش B از ${fa(b)} به ${fa(b - 1)} در سطر A${fa(a)} رتبه‌ی L را از ${fa(l)} به ${fa(lowerB)} می‌رساند.`;
    } else {
      note = `B در پایین‌ترین سطح است؛ بهبود از کاهش A یا پیامد می‌آید.`;
    }
  }
  const legend: [string, RiskKey][] = [
    ["L۱–۲", "low"],
    ["L۳", "medium"],
    ["L۴", "high"],
    ["L۵", "critical"],
  ];
  return (
    <SectionPanel
      title="ماتریس احتمال A × B"
      description="رتبه‌ی سازمانی L؛ درصد احتمال نیست"
      aside={l ? <Chip tone={l >= 4 ? "danger" : l === 3 ? "warning" : "success"}>L = {fa(l)}</Chip> : undefined}
      bodyClassName="flex flex-col gap-3"
    >
      <table className="w-full table-fixed border-separate border-spacing-1.5">
        <caption className="sr-only">جدول احتمال: سطر A و ستون B؛ خانه‌ی این ارزیابی پررنگ است</caption>
        <thead>
          <tr>
            <td className="w-8" />
            {[1, 2, 3, 4, 5].map((column) => (
              <th
                key={column}
                scope="col"
                className={cn("pb-1 text-xs font-medium", column === b ? "text-brand" : "text-ink-3")}
              >
                B{fa(column)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.a}>
              <th scope="row" className={cn("text-xs font-medium", row.a === a ? "text-brand" : "text-ink-3")}>
                A{fa(row.a)}
              </th>
              {row.cells.map((cell, index) => {
                const current = row.a === a && index + 1 === b;
                const tone = RISK_CLASSES[levelKey(cell)];
                return (
                  <td
                    key={index}
                    aria-current={current ? "true" : undefined}
                    className={cn(
                      "h-10 rounded-md text-center text-sm font-semibold tabular",
                      tone.bg,
                      tone.fg,
                      current && "ring-2 ring-brand ring-inset",
                    )}
                  >
                    {cell === null ? "—" : fa(cell)}
                    {current && <span className="sr-only"> (این ارزیابی)</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="flex flex-wrap items-center gap-3 text-xs text-ink-2" aria-label="راهنمای رنگ">
        {legend.map(([label, key]) => (
          <li key={label} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={cn("size-3 rounded-sm", RISK_CLASSES[key].bg)} />
            {label}
          </li>
        ))}
      </ul>
      {note && <p className="border-t border-line pt-3 text-xs leading-5 text-ink-2">{note}</p>}
    </SectionPanel>
  );
}

function ImpactCard({ impacts, href, editable }: { impacts: PageData["impacts"]; href: string; editable: boolean }) {
  const top = impacts.i?.[1] ?? null;
  return (
    <SectionPanel
      title="پروفایل پیامد"
      description="I = بیشینه‌ی سطح معتبر در ابعاد و ذی‌نفعان (۰ تا ۵)"
      aside={top !== null ? <Chip tone="warning">I = {bandText(impacts.i)}</Chip> : undefined}
      bodyClassName="flex flex-col"
    >
      <ul className="flex flex-col divide-y divide-line">
        {impacts.rows.map((row) => {
          const leading = top !== null && row.level === top;
          return (
            <li key={row.code} className="flex items-center gap-3 py-2.5">
              <span className="w-4 shrink-0 text-sm font-bold text-brand">{row.code}</span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-sm font-medium text-ink">{row.name}</span>
                <span className="truncate text-xs text-ink-3" title={row.note}>
                  {row.note ? faText(row.note) : row.missing ? "ثبت نشده" : "—"}
                </span>
              </span>
              <span className="flex shrink-0 gap-0.5" dir="ltr" aria-hidden>
                {[1, 2, 3, 4, 5].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      "h-1.5 w-4 rounded-full",
                      row.level !== null && step <= row.level ? (leading ? "bg-gold" : "bg-brand") : "bg-line",
                    )}
                  />
                ))}
              </span>
              <span className="w-4 shrink-0 text-center text-sm font-semibold text-ink tabular">
                {row.level === null ? (row.unknown ? "؟" : "—") : fa(row.level)}
                <span className="sr-only"> از ۵</span>
              </span>
            </li>
          );
        })}
      </ul>
      {editable && (
        <AppLink href={href} className="mt-2 self-start text-xs">
          ویرایش پروفایل پیامد
        </AppLink>
      )}
    </SectionPanel>
  );
}

function UncertaintyCard({ uncertainty }: { uncertainty: PageData["uncertainty"] }) {
  const tones: Record<string, ChipTone> = { high: "success", medium: "warning", low: "danger" };
  return (
    <SectionPanel
      title="عدم قطعیت و شواهد"
      aside={
        uncertainty.confidence ? (
          <Chip tone={tones[uncertainty.confidence_key] ?? "neutral"}>اطمینان {uncertainty.confidence}</Chip>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-3"
    >
      <ul className="flex flex-col gap-2">
        {uncertainty.items.map((item) => (
          <li key={item.text} className="flex items-start gap-2 text-sm text-ink">
            <Icon
              name={item.ok ? "check-circle" : "warning"}
              size={16}
              className={cn("mt-0.5 shrink-0", item.ok ? "text-success" : "text-warning")}
            />
            <span>{faText(item.text)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
        <span>بازه‌ی محتمل L</span>
        <Chip tone="neutral">{bandText(uncertainty.l_range)}</Chip>
      </div>
    </SectionPanel>
  );
}

function RulesCard() {
  return (
    <SectionPanel title="قواعد جلوگیری از اعتباردهی تکراری">
      <ul className="flex flex-col gap-2.5">
        {RULES.map((rule) => (
          <li key={rule} className="flex items-start gap-2 text-xs leading-5 text-ink-2">
            <Icon name="info" size={14} className="mt-0.5 shrink-0 text-brand" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

function Analysis({ data }: { data: PageData }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const action = useBridgeAction();
  const [values, setValues] = useState<Form>(() => toForm(data.initiator.values));
  const [saved, setSaved] = useState(() => JSON.stringify(toForm(data.initiator.values)));
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(values) !== saved;
  const { assessment, risk, submit } = data;

  const save = useMutation({
    mutationFn: () => post<{ message: string; analysis: PageData }>(`analysis/${assessment.id}/`, { values }),
    onSuccess: (result) => {
      setErrors({});
      const next = toForm(result.analysis.initiator.values);
      setValues(next);
      setSaved(JSON.stringify(next));
      queryClient.setQueryData(["analysis", String(assessment.id)], result.analysis);
      toast({ title: faText(result.message) });
    },
    onError: (error) => {
      setErrors(error instanceof ApiError && error.errors ? (error.errors as Errors) : { __all__: [error.message] });
    },
  });

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !save.isPending && currentLocation.pathname !== nextLocation.pathname,
  );

  function change(changes: Partial<Form>) {
    setValues((current) => ({ ...current, ...changes }));
    const names = Object.keys(changes) as (keyof Form)[];
    if (names.some((name) => errors[name])) {
      setErrors((current) =>
        Object.fromEntries(Object.entries(current).filter(([name]) => !names.includes(name as keyof Form))),
      );
    }
  }

  const errorList = Object.entries(errors).filter(
    (entry): entry is [keyof AnalysisInitiatorValues, string[]] => entry[0] !== "__all__" && Boolean(entry[1]?.length),
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="آنالیز ریسک"
        breadcrumb={[{ label: "ارزیابی ریسک", to: "/assessments" }, { label: "آنالیز ریسک" }]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <AppLink href={risk.href} className="code text-sm text-ink-2 no-underline hover:text-brand">
              {risk.code}
            </AppLink>
            <Badge tone="brand">{risk.status.label}</Badge>
            <Chip>
              {risk.category.code} {risk.category.name}
            </Chip>
          </span>
        }
        description={`${faText(risk.narrative || risk.title)} · افق ${fa(assessment.horizon_months)} ماه · مجموعه‌ی پارامتر v${assessment.method_number}`}
        actions={
          <>
            {assessment.can_edit && (
              <Button
                variant="outline"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate()}
                title="Ctrl+S"
              >
                ذخیره
              </Button>
            )}
            {submit.can_submit ? (
              <Button
                disabled={dirty || action.isPending}
                onClick={() => setConfirming(true)}
                title={dirty ? "اول تغییرها را ذخیره کنید" : undefined}
              >
                ارسال برای کنترل کیفیت
                <Icon name="arrow-left" className="ltr:rotate-180" />
              </Button>
            ) : (
              <AppLink href={assessment.href} button={{ variant: "outline" }}>
                پرونده‌ی ارزیابی
                <bdi className="code text-xs">{assessment.code}</bdi>
              </AppLink>
            )}
          </>
        }
      />
      <Card
        className="overflow-x-auto px-5 py-[0.9375rem]"
        role="region"
        tabIndex={0}
        aria-label="گام‌های فرایند مدیریت ریسک"
      >
        <ProcessSteps steps={PROCESS} className="min-w-[44rem]" />
      </Card>

      {!assessment.can_edit && (
        <Alert tone="info" title={`ارزیابی ${assessment.code} ${assessment.status.label} است`}>
          آنالیز فقط برای دیدن است؛ ویرایش A، مسیرها و آزمون کنترل‌ها در پیش‌نویس ارزیابی انجام می‌شود.
        </Alert>
      )}
      {errorList.length > 0 && (
        <Alert tone="danger" role="alert" title="عامل آغازگر ذخیره نشد:">
          <ul className="mt-1 flex flex-col gap-0.5">
            {errorList.map(([name, messages]) => (
              <li key={name}>
                {FIELD_LABELS[name]}: {messages.map(faText).join(" ")}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {errors.__all__ && (
        <Alert tone="danger" role="alert">
          {faText(errors.__all__.join(" "))}
        </Alert>
      )}
      {data.problems.length > 0 && (
        <Alert tone="warning" title="نتیجه هنوز حساب نمی‌شود:">
          {data.problems.map(faText).join(" ")}
        </Alert>
      )}

      <Summary data={data} values={values} />

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <InitiatorCard data={data} values={values} errors={errors} onChange={change} />
          <PathsCard data={data} />
          <ControlsCard controls={data.controls} />
        </div>
        <aside className="flex flex-col gap-4" aria-label="ماتریس احتمال، پیامد و عدم قطعیت">
          <MatrixCard matrix={data.matrix} />
          <ImpactCard impacts={data.impacts} href={assessment.impact_url} editable={assessment.can_edit} />
          <UncertaintyCard uncertainty={data.uncertainty} />
          <RulesCard />
        </aside>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="ارزیابی برای کنترل کیفیت فرستاده شود؟"
        description={
          submit.problems.length ? (
            <span className="flex flex-col gap-1">
              <span>پیش از ارسال این موارد باید درست شود:</span>
              {submit.problems.map((problem) => (
                <span key={problem}>• {faText(problem)}</span>
              ))}
            </span>
          ) : (
            `ارزیابی ${assessment.code} قفل می‌شود و عضو GRC دیگری آن را تأیید، برگشت یا به کارگروه ارجاع می‌دهد.`
          )
        }
        confirmLabel="ارسال برای کنترل کیفیت"
        confirmDisabled={submit.problems.length > 0}
        loading={action.isPending}
        onConfirm={() => {
          if (submit.url)
            action.mutate({ url: submit.url, values: { notes: "" } }, { onSettled: () => setConfirming(false) });
        }}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="تغییرات A ذخیره نشده است"
        description="اگر از این صفحه بروید، تغییرهای عامل آغازگر از دست می‌رود."
        cancelLabel="ماندن در صفحه"
        confirmLabel="رفتن بدون ذخیره"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}

export function AnalysisPage() {
  useTitle("آنالیز ریسک");
  const { pk = "" } = useParams();
  const query = useQuery({
    queryKey: ["analysis", pk],
    queryFn: ({ signal }) => get<PageData>(`analysis/${pk}/`, signal),
  });
  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.isError) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="آنالیز ریسک" breadcrumb={[{ label: "آنالیز ریسک" }]} />
        <ErrorState error={query.error} retry={() => query.refetch()} />
      </div>
    );
  }
  return <Analysis key={pk} data={query.data} />;
}

/** «آنالیز ریسک» در منو: تازه‌ترین پیش‌نویس ارزیابی کاربر را باز می‌کند، وگرنه به کارتابل ارزیابی راه نشان می‌دهد. */
export function AnalysisIndexPage() {
  useTitle("آنالیز ریسک");
  const goTo = useGoTo();
  const query = useQuery({
    queryKey: ["analysis", "latest"],
    queryFn: ({ signal }) => get<{ assessment: number | null; workspace_url: string }>("analysis/", signal),
    staleTime: 0,
  });
  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (query.data.assessment) return <Navigate to={`/analysis/${query.data.assessment}`} replace />;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="آنالیز ریسک"
        description="A، مسیرهای تحقق، اثربخشی کنترل‌ها و پیامد یک ارزیابی پیش‌نویس"
        breadcrumb={[{ label: "آنالیز ریسک" }]}
      />
      <EmptyState
        icon="gauge"
        title="پیش‌نویس ارزیابی‌ای برای آنالیز ندارید"
        description="از کارتابل ارزیابی، ارزیابی تازه‌ای برای ریسک ارسال‌شده شروع کنید."
        action={
          <Button onClick={() => goTo(query.data.workspace_url)}>
            کارتابل ارزیابی
            <Icon name="arrow-left" className="ltr:rotate-180" />
          </Button>
        }
      />
    </div>
  );
}
