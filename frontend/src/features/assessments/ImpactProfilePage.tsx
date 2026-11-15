import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { LeaveGuard } from "@/features/forms/leave-guard";
import { useGoTo } from "@/features/session/links";
import { ApiError, bridge, errorMessage, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ago, fa, faText, formatNumber } from "@/lib/format";
import { useNow, useTitle } from "@/lib/hooks";
import { djangoPath } from "@/lib/routes";
import type { AppHref, FormField, FormPageData, FormResult, ImpactGroup, ImpactOverview, ImpactRow } from "@/lib/types";
import { MetaItem } from "@/features/records/dossier";

// پروفایل پیامد به چیدمان فیگما ۰۶: ماتریس «بُعد × ذی‌نفع» که هر خانه‌اش با کلیک در ویرایشگر کناری باز می‌شود.
// هر خانه همان فرم جنگو با پیشوند خودش است (datin-S، 12-F) و همه با هم به همان view فرستاده می‌شوند؛ پیشنهاد سامانه،
// I و بررسی‌های کارت بالا را جنگو از آنچه ذخیره شده حساب می‌کند.

type Values = Record<string, string | string[]>;
type Errors = Record<string, string[]>;

const UNKNOWN = "unknown";

interface CellRef {
  group: ImpactGroup;
  row: ImpactRow;
}

function initialValues(groups: ImpactGroup[]): Values {
  const values: Values = {};
  for (const group of groups) {
    for (const row of group.rows) {
      for (const field of row.fields) {
        if (field.kind === "multiselect") values[field.name] = Array.isArray(field.value) ? field.value : [];
        else {
          const value = typeof field.value === "string" ? field.value : "";
          // مبلغ اعشاری جنگو (42000000000.0000) بی‌صفرهای آخر همان عدد است.
          values[field.name] = /^\d+\.0+$/.test(value) ? value.replace(/\.0+$/, "") : value;
        }
      }
    }
  }
  return values;
}

function text(values: Values, name: string): string {
  const value = values[name];
  return typeof value === "string" ? value : "";
}

function list(values: Values, name: string): string[] {
  const value = values[name];
  return Array.isArray(value) ? value : [];
}

type CellLevel = { kind: "empty" } | { kind: "unknown" } | { kind: "level"; low: number; high: number };

function levelOf(values: Values, prefix: string): CellLevel {
  const level = text(values, `${prefix}-level`);
  if (!level) return { kind: "empty" };
  if (level === UNKNOWN) return { kind: "unknown" };
  const low = Number(level);
  const high = Number(text(values, `${prefix}-level_high`)) || low;
  return { kind: "level", low, high: Math.max(low, high) };
}

function levelText(level: CellLevel): string {
  if (level.kind === "empty") return "–";
  if (level.kind === "unknown") return "؟";
  return level.high > level.low ? `${fa(level.low)}–${fa(level.high)}` : fa(level.low);
}

function levelName(level: CellLevel): string {
  if (level.kind === "empty") return "ثبت‌نشده";
  if (level.kind === "unknown") return "نامعلوم";
  return level.high > level.low ? `سطح ${fa(level.low)} تا ${fa(level.high)}` : `سطح ${fa(level.low)}`;
}

/** رنگ خانه‌ی سطح به ترتیب راهنمای زیر ماتریس: صفر خاکستری، ۱–۲ روشن، ۳ میانه، ۴–۵ پررنگ. */
function levelClasses(level: CellLevel): string {
  if (level.kind === "empty") return "border border-dashed border-line-strong bg-panel text-ink-3";
  if (level.kind === "unknown") return "border border-dashed border-gold bg-gold-subtle text-gold";
  if (level.high === 0) return "bg-subtle text-ink-3";
  if (level.high <= 2) return "bg-brand-subtle text-brand";
  if (level.high === 3) return "bg-brand/20 text-brand";
  return "bg-brand text-on-brand";
}

function maxOf(levels: CellLevel[]): number | null {
  const known = levels.flatMap((level) => (level.kind === "level" ? [level.high] : []));
  return known.length ? Math.max(...known) : null;
}

function LevelBox({ level }: { level: CellLevel }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-8 min-w-8 shrink-0 place-items-center rounded-md px-1.5 text-sm font-semibold tabular",
        levelClasses(level),
      )}
    >
      {levelText(level)}
    </span>
  );
}

// ─────────────────────────────── سرصفحه و خلاصه ───────────────────────────────

function SavedState({ data, dirty }: { data: FormPageData; dirty: boolean }) {
  const now = useNow();
  const saved = data.assessment?.saved_at;
  if (dirty) return <Badge tone="warning">تغییرهای ذخیره‌نشده</Badge>;
  if (!saved) return null;
  return (
    <Badge tone="success" title={faText(saved.jalali)}>
      ذخیره شد · {ago(saved, now)}
    </Badge>
  );
}

function OverviewCard({ overview }: { overview: ImpactOverview }) {
  const impact = overview.impact;
  const value = impact ? (impact[0] === impact[1] ? fa(impact[0]) : `${fa(impact[0])}–${fa(impact[1])}`) : "؟";
  return (
    <Card role="region" aria-label="خلاصه‌ی پیامد" className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="flex h-[4.5rem] w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-brand text-on-brand">
          <span className="text-xs">پیامد I</span>
          <span className="text-2xl leading-8 font-bold">{value}</span>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-semibold text-ink">
            {overview.top && impact ? (
              <>
                بیشترین سطح معتبر: <bdi>{overview.top.code}</bdi> ({overview.top.name}) · {overview.top.stakeholder} ={" "}
                {fa(impact[1])}
              </>
            ) : impact ? (
              <>I فعلاً بازه‌ی {value} است</>
            ) : (
              "I هنوز معلوم نیست"
            )}
          </p>
          <p className="text-xs leading-5 text-ink-3">{faText(overview.text)}</p>
        </div>
      </div>
      <ul className="flex shrink-0 flex-col gap-1.5 text-xs md:max-w-[15rem]">
        {overview.checks.map((check) => (
          <li key={check.label} className={cn("flex items-start gap-1.5", check.ok ? "text-ink-2" : "text-warning")}>
            <Icon
              name={check.ok ? "check-circle" : "warning"}
              size={14}
              className={cn("mt-0.5 shrink-0", check.ok ? "text-success" : "text-warning")}
            />
            <span>
              {faText(check.label)}
              <span className="sr-only">{check.ok ? " (برقرار)" : " (برقرار نیست)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────────────── ماتریس ───────────────────────────────

const LEGEND: { label: string; box: string; level: CellLevel }[] = [
  { label: "بدون اثر (با دلیل)", box: "۰", level: { kind: "level", low: 0, high: 0 } },
  { label: "۱–۲", box: "۲", level: { kind: "level", low: 2, high: 2 } },
  { label: "۳", box: "۳", level: { kind: "level", low: 3, high: 3 } },
  { label: "۴–۵", box: "۵", level: { kind: "level", low: 5, high: 5 } },
  { label: "نامعلوم (با دلیل)", box: "؟", level: { kind: "unknown" } },
  { label: "ثبت‌نشده", box: "–", level: { kind: "empty" } },
];

function MatrixCell({
  cell,
  values,
  errors,
  selected,
  onSelect,
}: {
  cell: CellRef;
  values: Values;
  errors: Errors;
  selected: boolean;
  onSelect: () => void;
}) {
  const { row, group } = cell;
  const level = levelOf(values, row.prefix);
  const rationale = text(values, `${row.prefix}-rationale`);
  const evidence = list(values, `${row.prefix}-evidence`).length;
  const failing = row.errors.length > 0 || row.fields.some((field) => errors[field.name]?.length);
  const label = `${row.scale.code} ${row.scale.name}، ${group.name}: ${levelName(level)}${
    level.kind === "empty" ? "" : `، ${evidence ? `${fa(evidence)} شاهد` : "بدون شاهد"}`
  }${failing ? "، ایراد دارد" : ""}`;
  return (
    <td className="p-0">
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={onSelect}
        className={cn(
          "flex min-h-[4.5rem] w-full items-center gap-2.5 px-3 py-2.5 text-start transition-colors",
          "hover:bg-subtle focus-visible:shadow-focus focus-visible:outline-none",
          selected && "bg-brand-subtle shadow-[inset_0_0_0_2px_var(--color-brand)] hover:bg-brand-subtle",
          failing && !selected && "shadow-[inset_0_0_0_2px_var(--color-danger)]",
        )}
      >
        <LevelBox level={level} />
        {level.kind === "empty" ? (
          <span className="text-xs text-ink-3">ثبت‌نشده</span>
        ) : (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className={cn("truncate text-xs", level.kind === "unknown" ? "text-gold" : "text-ink")}>
              {level.kind === "unknown" && "نامعلوم — "}
              {selected ? "در حال ویرایش…" : rationale || "بی‌دلیل"}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                evidence ? "text-ink-3" : level.kind === "unknown" ? "text-gold" : "text-warning",
              )}
            >
              <Icon name="paperclip" size={12} />
              {evidence ? `${fa(evidence)} شاهد` : "بدون شاهد"}
            </span>
          </span>
        )}
      </button>
    </td>
  );
}

function Matrix({
  groups,
  values,
  errors,
  selected,
  onSelect,
  methodHref,
}: {
  groups: ImpactGroup[];
  values: Values;
  errors: Errors;
  selected: string | null;
  onSelect: (prefix: string) => void;
  methodHref: string | undefined;
}) {
  const scales = groups[0]?.rows.map((row) => row.scale) ?? [];
  const titleId = useId();
  return (
    <Card role="region" aria-labelledby={titleId} className="overflow-clip">
      <CardHeader
        titleId={titleId}
        title="ماتریس پیامد"
        description="یک ستون برای داتین و هر بانک متأثر؛ یک ردیف برای هر بُعد روش"
        actions={
          methodHref && (
            <AppLink href={methodHref} button={{ variant: "ghost", size: "sm" }}>
              <Icon name="table" size={16} />
              معیار سطح‌ها در روش
            </AppLink>
          )
        }
      />
      <div className="overflow-x-auto border-t border-line">
        <table className="w-full min-w-[44rem] table-fixed border-collapse text-sm">
          <caption className="sr-only">سطح هر بُعد پیامد برای داتین و هر بانک؛ هر خانه برای ویرایش باز می‌شود</caption>
          <colgroup>
            <col className="w-40" />
            {groups.map((group) => (
              <col key={group.name} />
            ))}
            <col className="w-24" />
          </colgroup>
          <thead className="bg-subtle text-xs text-ink-2">
            <tr>
              <th scope="col" className="px-4 py-3 text-start font-medium">
                بُعد
              </th>
              {groups.map((group) => {
                const top = maxOf(group.rows.map((row) => levelOf(values, row.prefix)));
                return (
                  <th key={group.name} scope="col" className="px-3 py-3 text-start font-medium">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold text-ink">{group.name}</span>
                      <span className="text-brand">بیشینه: {top === null ? "-" : fa(top)}</span>
                    </span>
                  </th>
                );
              })}
              <th scope="col" className="w-24 px-3 py-3 text-center font-medium">
                بیشینه‌ی بُعد
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {scales.map((scale, index) => {
              const cells = groups.flatMap((group) => {
                const row = group.rows[index];
                return row ? [{ group, row }] : [];
              });
              const top = maxOf(cells.map(({ row }) => levelOf(values, row.prefix)));
              return (
                <tr key={scale.code}>
                  <th scope="row" className="px-4 py-2.5 text-start font-medium text-ink">
                    <span className="flex items-center gap-2">
                      <bdi className="code grid h-6 min-w-6 place-items-center rounded-sm bg-subtle px-1 text-xs text-ink-2">
                        {scale.code}
                      </bdi>
                      {scale.name}
                    </span>
                  </th>
                  {cells.map((cell) => (
                    <MatrixCell
                      key={cell.row.prefix}
                      cell={cell}
                      values={values}
                      errors={errors}
                      selected={selected === cell.row.prefix}
                      onSelect={() => onSelect(cell.row.prefix)}
                    />
                  ))}
                  <td className="px-3 text-center text-xl font-bold text-ink tabular">
                    {top === null ? "-" : fa(top)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul
        aria-label="راهنمای رنگ سطح‌ها"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3"
      >
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-1.5 text-xs text-ink-3">
            <span
              aria-hidden
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-sm px-1 text-xs font-semibold",
                levelClasses(item.level),
              )}
            >
              {item.box}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────────────── ویرایشگر خانه ───────────────────────────────

function Segmented({
  legend,
  name,
  value,
  options,
  onChange,
  error,
  disabled,
}: {
  legend: string;
  name: string;
  value: string;
  options: { value: string; label: string; title?: string; wide?: boolean }[];
  onChange: (value: string) => void;
  error?: string[];
  disabled?: boolean;
}) {
  const errorId = useId();
  return (
    <fieldset className="flex flex-col" aria-describedby={error?.length ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-ink">{legend}</legend>
      <div className="flex rounded-md bg-subtle p-1">
        {options.map((option) => (
          <label
            key={option.value}
            title={option.title}
            className={cn(
              "relative flex h-8 min-w-0 cursor-pointer items-center justify-center rounded-md px-1.5 text-sm text-ink-2",
              option.wide ? "flex-[2]" : "flex-1",
              "has-[:focus-visible]:shadow-focus",
              value === option.value && "border border-brand bg-panel font-semibold text-brand shadow-sm",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className="truncate">{option.label}</span>
          </label>
        ))}
      </div>
      {error?.length ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger">
          {error.join(" ")}
        </p>
      ) : null}
    </fieldset>
  );
}

function fieldError(errors: Errors, field: FormField | undefined) {
  return field ? errors[field.name]?.map(faText) : undefined;
}

function evidenceCode(label: string) {
  return label.split(" ")[0] ?? label;
}

function CellEditor({
  cell,
  values,
  errors,
  onChange,
  onApply,
  onCancel,
  busy,
}: {
  cell: CellRef;
  values: Values;
  errors: Errors;
  onChange: (name: string, value: string | string[]) => void;
  onApply: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const { row, group } = cell;
  const titleId = useId();
  const evidenceLabel = useId();
  const field = (part: string) => row.fields.find((item) => item.name === `${row.prefix}-${part}`);
  const level = field("level");
  const high = field("level_high");
  const confidence = field("confidence");
  const actual = field("actual_value");
  const unit = field("unit");
  const basis = field("basis");
  const rationale = field("rationale");
  const evidence = field("evidence");
  const current = levelOf(values, row.prefix);
  const chosen = evidence ? list(values, evidence.name) : [];
  const available = (evidence?.choices ?? []).filter((choice) => choice.value && !chosen.includes(choice.value));
  const suggestion = row.suggestion;
  const facts = group.facts;
  const minutes = (value: number | null) => (value === null ? "ثبت‌نشده" : `${fa(value)} دقیقه`);
  const levelOptions = (level?.choices ?? [])
    .filter((choice) => choice.value !== "")
    .sort((a, b) => Number(a.value === UNKNOWN) - Number(b.value === UNKNOWN))
    .map((choice) => ({
      value: choice.value,
      label: choice.value === UNKNOWN ? "نامعلوم" : fa(choice.value),
      title: faText(choice.label),
      wide: choice.value === UNKNOWN,
    }));
  const applyLabel =
    current.kind === "level" ? `اعمال ${levelName(current)}` : current.kind === "unknown" ? "اعمال «نامعلوم»" : "اعمال";

  return (
    <Card role="region" aria-labelledby={titleId} className="flex flex-col">
      <CardHeader
        titleId={titleId}
        title={`ویرایش خانه: ${row.scale.code} (${row.scale.name}) · ${group.name}`}
        description={
          suggestion && suggestion.level !== null
            ? "پیشنهاد سامانه فقط پیشنهاد است؛ سطح دیگر دلیل می‌خواهد"
            : "سطح ۰ تا ۵ یا «نامعلوم»؛ صفر و نامعلوم هر دو دلیل می‌خواهند"
        }
        actions={
          <Button variant="quiet" size="icon-sm" aria-label="بستن ویرایشگر" onClick={onCancel}>
            <Icon name="x" size={16} />
          </Button>
        }
      />
      <CardContent className="flex flex-col gap-4">
        {suggestion && (
          <div className="flex flex-col gap-1 rounded-md bg-warning-subtle px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
              <Icon name="lightning" size={16} />
              {suggestion.level !== null ? `پیشنهاد سامانه: سطح ${fa(suggestion.level)}` : "پیشنهاد سامانه"}
            </p>
            <p className="text-xs leading-5 text-ink-2">{faText(suggestion.note)}</p>
          </div>
        )}
        {row.provisional_note && (
          <p className="flex items-start gap-1.5 text-xs text-ink-3">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            <span>{faText(row.provisional_note)}</span>
          </p>
        )}
        {!group.is_datin && (row.scale.code === "S" || row.scale.code === "F") && (
          <p className="text-xs text-ink-3">
            {facts.critical ? "خدمت حیاتی" : "خدمت غیرحیاتی"}
            {row.scale.code === "S" && ` · RTO ${minutes(facts.rto)} · MTPD ${minutes(facts.mtpd)}`}
            {row.scale.code === "F" &&
              ` · مبنای مالی بانک ${facts.basis === null ? "ثبت‌نشده" : `${formatNumber(facts.basis)} ریال`}`}
          </p>
        )}
        {row.errors.map((error) => (
          <Alert key={error} tone="danger">
            {faText(error)}
          </Alert>
        ))}
        {level && (
          <Segmented
            legend="سطح"
            name={level.name}
            value={text(values, level.name)}
            options={levelOptions}
            onChange={(value) => {
              onChange(level.name, value);
              if (value === UNKNOWN && high) onChange(high.name, "");
            }}
            error={fieldError(errors, level)}
            disabled={busy}
          />
        )}
        {high && current.kind === "level" && (
          <Field
            label="بازه تا سطح (اختیاری)"
            hint="اگر داده کافی نیست، سطح را بازه بگیرید."
            error={fieldError(errors, high)}
          >
            <Select
              value={text(values, high.name)}
              disabled={busy}
              onChange={(event) => onChange(high.name, event.target.value)}
            >
              {(high.choices ?? []).map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.value ? fa(choice.label) : "بدون بازه"}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {confidence && current.kind === "level" && (
          <Segmented
            legend="اطمینان"
            name={confidence.name}
            value={text(values, confidence.name)}
            options={(confidence.choices ?? [])
              .filter((choice) => choice.value !== "")
              .map((choice) => ({ value: choice.value, label: choice.label }))}
            onChange={(value) => onChange(confidence.name, value)}
            error={fieldError(errors, confidence)}
            disabled={busy}
          />
        )}
        {actual && (
          <Field label={actual.label} hint={actual.help || undefined} error={fieldError(errors, actual)}>
            <Input
              dir="ltr"
              inputMode="decimal"
              value={text(values, actual.name)}
              disabled={busy}
              onChange={(event) => onChange(actual.name, event.target.value)}
            />
          </Field>
        )}
        {unit && (
          <Field label={unit.label} error={fieldError(errors, unit)}>
            <Input
              value={text(values, unit.name)}
              placeholder={unit.placeholder}
              disabled={busy}
              onChange={(event) => onChange(unit.name, event.target.value)}
            />
          </Field>
        )}
        {basis && (
          <Field label={basis.label} hint={basis.help || undefined} error={fieldError(errors, basis)}>
            <Input
              dir="ltr"
              inputMode="numeric"
              value={text(values, basis.name)}
              disabled={busy}
              onChange={(event) => onChange(basis.name, event.target.value)}
            />
          </Field>
        )}
        {rationale && (
          <Field
            label="دلیل"
            required={current.kind !== "empty"}
            hint={rationale.help || undefined}
            error={fieldError(errors, rationale)}
          >
            <Textarea
              rows={3}
              value={text(values, rationale.name)}
              disabled={busy}
              onChange={(event) => onChange(rationale.name, event.target.value)}
            />
          </Field>
        )}
        {evidence && (
          <div className="flex flex-col gap-1.5">
            <p id={evidenceLabel} className="text-sm font-medium text-ink">
              شواهد
            </p>
            <ul aria-labelledby={evidenceLabel} className="flex flex-wrap items-center gap-2">
              {chosen.map((value) => {
                const choice = evidence.choices?.find((item) => item.value === value);
                const code = evidenceCode(choice?.label ?? value);
                return (
                  <li
                    key={value}
                    title={choice?.label}
                    className="flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-panel ps-2.5 pe-1 text-xs"
                  >
                    <Icon name="file-text" size={14} className="text-ink-3" />
                    <bdi className="code text-ink-2">{code}</bdi>
                    <button
                      type="button"
                      aria-label={`برداشتن ${code}`}
                      disabled={busy}
                      onClick={() =>
                        onChange(
                          evidence.name,
                          chosen.filter((item) => item !== value),
                        )
                      }
                      className="grid size-5 place-items-center rounded-full text-ink-3 hover:bg-subtle hover:text-danger"
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </li>
                );
              })}
              <li>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || !available.length}
                      className="h-7 rounded-full border border-dashed border-line-strong"
                    >
                      <Icon name="plus" size={14} />
                      افزودن شاهد
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
                    {available.map((choice) => (
                      <DropdownMenuItem
                        key={choice.value}
                        onSelect={() => onChange(evidence.name, [...chosen, choice.value])}
                      >
                        <Icon name="file-text" size={16} />
                        <span className="truncate">{faText(choice.label)}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            </ul>
            {fieldError(errors, evidence)?.map((error) => (
              <p key={error} className="text-xs text-danger">
                {error}
              </p>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button variant="primary" disabled={busy} onClick={onApply}>
            <Icon name="check" size={18} />
            {applyLabel}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            انصراف
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

/** خانه‌ای که ویرایشگر با آن باز می‌شود: اول خانه‌ی ایراددار، بعد خانه‌ی ثبت‌نشده. */
function firstCell(groups: ImpactGroup[], values: Values): string | null {
  const rows = groups.flatMap((group) => group.rows);
  const failing = rows.find((row) => row.errors.length || row.fields.some((field) => field.errors.length));
  if (failing) return failing.prefix;
  return rows.find((row) => levelOf(values, row.prefix).kind === "empty")?.prefix ?? null;
}

function ImpactProfile({ data, path, onSaved }: { data: FormPageData; path: string; onSaved: () => void }) {
  const groups = data.groups ?? [];
  const assessment = data.assessment;
  const [initial] = useState(() => initialValues(groups));
  const [values, setValues] = useState<Values>(initial);
  const [errors, setErrors] = useState<Errors>(() =>
    Object.fromEntries(
      groups.flatMap((group) =>
        group.rows.flatMap((row) =>
          row.fields.filter((field) => field.errors.length).map((field) => [field.name, field.errors]),
        ),
      ),
    ),
  );
  const [problem, setProblem] = useState("");
  const [selected, setSelected] = useState<string | null>(() => firstCell(groups, initial));
  const snapshot = useRef<Values>({});
  const released = useRef(false);
  const toast = useToast();
  const goTo = useGoTo();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  const cells: CellRef[] = groups.flatMap((group) => group.rows.map((row) => ({ group, row })));
  const cell = cells.find((item) => item.row.prefix === selected) ?? null;
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  const save = useMutation({
    mutationFn: (next: "" | "initiator") =>
      post<FormResult>(bridge("forms", path), { values: next ? { ...values, next } : values }),
    onSuccess: (result) => {
      toast({ title: faText(result.message) });
      released.current = true;
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "form" });
      const route = result.redirect?.route;
      if (result.redirect && (!route || route.split(/[?#]/)[0] !== pathname)) goTo(result.redirect);
      else onSaved();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        setErrors(error.errors);
        setProblem(error.message);
        const failing = cells.find((item) => item.row.fields.some((field) => error.errors[field.name]?.length));
        if (failing) setSelected(failing.row.prefix);
      } else {
        setProblem(errorMessage(error));
      }
    },
  });

  function select(prefix: string) {
    const row = cells.find((item) => item.row.prefix === prefix)?.row;
    if (!row) return;
    snapshot.current = Object.fromEntries(row.fields.map((field) => [field.name, values[field.name] ?? ""]));
    setSelected(prefix);
  }

  function change(name: string, value: string | string[]) {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) =>
      current[name] ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)) : current,
    );
  }

  function cancel() {
    setValues((current) => ({ ...current, ...snapshot.current }));
    setSelected(null);
  }

  function apply() {
    // خانه‌ی بعدی که هنوز ثبت نشده باز می‌شود تا ثبت پشت سر هم پیش برود.
    const index = cells.findIndex((item) => item.row.prefix === selected);
    const next = [...cells.slice(index + 1), ...cells.slice(0, index)].find(
      (item) => levelOf(values, item.row.prefix).kind === "empty",
    );
    if (next) select(next.row.prefix);
    else setSelected(null);
  }

  return (
    <article className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: "ارزیابی ریسک" },
          ...(assessment ? [{ label: assessment.code, to: `/assessments/${assessment.id}`, code: true }] : []),
          { label: "پروفایل پیامد" },
        ]}
      />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          {assessment && (
            <div className="flex flex-wrap items-center gap-2">
              <bdi className="code text-sm font-medium text-ink-2">{assessment.code}</bdi>
              <Badge tone="brand">{assessment.kind.label}</Badge>
              <Badge tone="neutral">{assessment.status.label}</Badge>
              <SavedState data={data} dirty={dirty} />
            </div>
          )}
          <h1 className="text-h1 font-bold text-ink">
            {assessment ? `پروفایل پیامد — ${faText(assessment.risk.title)}` : faText(data.title)}
          </h1>
          {assessment && (
            <dl className="flex flex-wrap gap-x-4 gap-y-1.5">
              <MetaItem icon="list" label="ریسک">
                <AppLink href={assessment.risk.href} className="text-ink">
                  <bdi className="code">{assessment.risk.code}</bdi>
                </AppLink>
              </MetaItem>
              <MetaItem icon="buildings" label="ذی‌نفعان">
                {assessment.stakeholders.join("، ")}
              </MetaItem>
              <MetaItem icon="user" label="ارزیاب">
                {assessment.created_by?.name ?? "-"}
              </MetaItem>
            </dl>
          )}
        </div>
        <div className="flex flex-col gap-2 lg:shrink-0 lg:items-end">
          <div className="flex flex-wrap items-center gap-2 lg:flex-row-reverse lg:justify-start">
            <Button
              variant="primary"
              loading={save.isPending && save.variables === "initiator"}
              disabled={save.isPending}
              onClick={() => save.mutate("initiator")}
            >
              ادامه: عامل آغازگر (A)
              <Icon name="arrow-left" size={18} />
            </Button>
            <Button
              variant="outline"
              loading={save.isPending && save.variables === ""}
              disabled={save.isPending}
              onClick={() => save.mutate("")}
            >
              ذخیره‌ی پیش‌نویس
            </Button>
          </div>
          <p className="flex items-start gap-1 text-xs text-ink-3">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            <span>سطح هر خانه ۰ تا ۵ یا «نامعلوم»؛ صفر و نامعلوم هر دو دلیل می‌خواهد.</span>
          </p>
        </div>
      </header>
      {data.messages.map((message) => (
        <Alert key={message.text} tone={message.level === "error" ? "danger" : "info"}>
          {faText(message.text)}
        </Alert>
      ))}
      {problem && (
        <Alert tone="danger" role="alert">
          {faText(problem)}
        </Alert>
      )}
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.overview && <OverviewCard overview={data.overview} />}
          <Matrix
            groups={groups}
            values={values}
            errors={errors}
            selected={selected}
            onSelect={select}
            methodHref={assessment?.method_version.href}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
          {cell ? (
            <CellEditor
              key={cell.row.prefix}
              cell={cell}
              values={values}
              errors={errors}
              onChange={change}
              onApply={apply}
              onCancel={cancel}
              busy={save.isPending}
            />
          ) : (
            <Card className="p-5 text-sm text-ink-3">برای ثبت یا ویرایش سطح، خانه‌ای از ماتریس را انتخاب کنید.</Card>
          )}
          {data.note && (
            <p className="flex items-start gap-2 rounded-lg bg-subtle px-4 py-3 text-xs leading-5 text-ink-2">
              <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
              <span>{faText(data.note)}</span>
            </p>
          )}
        </div>
      </div>
      <LeaveGuard
        when={dirty}
        released={released}
        description="سطح‌هایی که در ماتریس عوض کرده‌اید هنوز ذخیره نشده است."
      />
    </article>
  );
}

export function ImpactProfilePage() {
  const location = useLocation();
  const path = djangoPath(location);
  const page = useQuery({
    queryKey: ["form", path],
    queryFn: ({ signal }) => get<FormPageData>(bridge("forms", path), signal),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useTitle(page.data?.title ?? (page.isError ? "فرم باز نشد" : "پروفایل پیامد"));

  if (page.isPending) return <PageSkeleton rows={6} />;
  if (page.isError) {
    const error = page.error;
    // ارزیابی دیگر پیش‌نویس نیست و جنگو فرم را نشان نمی‌دهد.
    if (error instanceof ApiError && error.status === 409) {
      const redirect = error.data.redirect as AppHref | undefined;
      return (
        <div className="flex max-w-2xl flex-col gap-6">
          <PageHeader title="این کار الان ممکن نیست" />
          <Alert tone="warning" role="alert">
            {faText(error.message)}
          </Alert>
          {redirect && (
            <div>
              <AppLink href={redirect.href} button={{ variant: "secondary" }}>
                برگشت به پرونده‌ی ارزیابی
              </AppLink>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="پروفایل پیامد باز نشد" />
        <ErrorState error={error} retry={() => page.refetch()} />
      </div>
    );
  }
  return <ImpactProfile key={page.dataUpdatedAt} data={page.data} path={path} onSaved={() => void page.refetch()} />;
}
