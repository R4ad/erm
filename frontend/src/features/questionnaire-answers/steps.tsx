import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button, buttonClasses } from "@/components/ui/button";
import {
  Checkbox,
  Field,
  FieldError,
  FieldSet,
  Input,
  Radio,
  RequiredMark,
  Textarea,
  control,
  useFieldControl,
} from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip } from "@/components/ui/section-panel";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import type { AnswerResponse, AnswerSummary, AnswerValues, Choice } from "@/lib/types";

import {
  BASIC,
  BASIC_KEYS,
  STEPS,
  errorId,
  eventGroups,
  fieldId,
  impactOf,
  type BasicKey,
  type Errors,
  type StepKey,
} from "./answers";

// گام‌های ویزارد «پاسخ به پرسشنامه‌ها» طبق فریم‌های 30 تا 30f. هر گام فقط مقدارها و خطاها را نشان می‌دهد و تغییر را
// به ویزارد می‌دهد؛ اعتبارسنجی و ذخیره در AnswerWizard است.

export const POSITION_ID = "answer-step-position";

export type StepStatus = "done" | "todo" | "error";

const messagesOf = (errors: Errors, ...names: string[]) => names.flatMap((name) => errors[name] ?? []);

function describedBy(...ids: (string | false | null | undefined)[]) {
  return ids.filter(Boolean).join(" ") || undefined;
}

/** سرپرسش هر گام (H2 فریم با ستاره‌ی قرمز) و راهنمای زیرش. */
function StepHead({ id, question, hint, htmlFor }: { id: string; question: string; hint: string; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 id={id} tabIndex={-1} className="text-h2 font-semibold text-balance text-ink focus-visible:outline-none">
        {htmlFor ? <label htmlFor={htmlFor}>{question}</label> : question} <RequiredMark />
      </h3>
      <p id={`${id}-hint`} className="text-sm text-ink-2">
        {hint}
      </p>
    </div>
  );
}

// ─────────────────────────────── گام‌نما ───────────────────────────────

/** هشت کارت گام: گام فعلی سبز، انجام‌شده با تیک، بعدی با شماره؛ گامی که خطا دارد قرمز. */
export function StepNav({
  index,
  status,
  onJump,
}: {
  index: number;
  status: (key: StepKey) => StepStatus;
  onJump: (target: number) => void;
}) {
  const said = { done: "پاسخ دارد", todo: "بی‌پاسخ", error: "خطا دارد" } as const;
  return (
    <nav aria-label="گام‌های پاسخنامه">
      <ol className="grid grid-cols-8 gap-1 sm:gap-2">
        {STEPS.map((step, position) => {
          const current = position === index;
          const state = status(step.key);
          return (
            <li key={step.key} className="min-w-0">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onJump(position)}
                title={step.label}
                className={cn(
                  "flex h-10 w-full flex-col items-center justify-center gap-1.5 rounded-md border px-1.5 transition-colors duration-150 focus-visible:shadow-focus focus-visible:outline-none sm:h-full sm:min-h-[4.75rem] sm:py-2.5",
                  current && "border-brand bg-brand text-on-brand",
                  !current && state === "error" && "border-danger-solid bg-danger-subtle text-danger",
                  !current && state !== "error" && "border-line bg-panel text-ink-2 hover:bg-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-[1.375rem] shrink-0 place-items-center rounded-full text-xs font-semibold tabular",
                    current
                      ? "bg-on-brand/20"
                      : state === "done"
                        ? "bg-success-subtle text-success"
                        : state === "error"
                          ? "bg-panel"
                          : "bg-subtle text-ink",
                  )}
                >
                  {current ? (
                    fa(position + 1)
                  ) : state === "error" ? (
                    <Icon name="warning" size={13} />
                  ) : state === "done" ? (
                    <Icon name="check" size={13} />
                  ) : (
                    fa(position + 1)
                  )}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "hidden max-w-full text-center text-xs leading-[1.125rem] sm:line-clamp-2",
                    current ? "font-semibold" : "font-medium text-ink",
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">{`گام ${fa(position + 1)}: ${step.label}، ${said[state]}`}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─────────────────────────────── گام ۱ تا ۴ ───────────────────────────────

function Counter({ id, length, limit, show }: { id: string; length: number; limit: number; show: boolean }) {
  return (
    <span
      id={id}
      aria-hidden={show ? undefined : true}
      className="pointer-events-none absolute end-4 bottom-2.5 text-xs text-ink-3 tabular"
    >
      {/* فریم 30b شمارنده را چپ‌به‌راست نشان می‌دهد: «۱۶۰ / ۵۰۰». جهت فقط روی متن است تا end-4 در RTL بماند. */}
      <span dir="ltr">{`${fa(length)} / ${fa(limit)}`}</span>
    </span>
  );
}

/** پرسش یک‌خطی (گام ۱ تا ۴). */
export function BasicStep({
  name,
  value,
  limit,
  errors,
  onChange,
  children,
}: {
  name: BasicKey;
  value: string;
  limit: number;
  errors: Errors;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  const id = fieldId(name);
  const messages = messagesOf(errors, name);
  return (
    <div className="flex flex-col gap-4">
      <StepHead id={`${id}-question`} question={BASIC[name].question} hint={BASIC[name].hint} htmlFor={id} />
      <div className="flex flex-col gap-1.5">
        <Input
          id={id}
          value={value}
          maxLength={limit}
          autoComplete="off"
          placeholder="پاسخ کوتاه و مشخص"
          required
          aria-invalid={messages.length ? true : undefined}
          aria-describedby={describedBy(POSITION_ID, `${id}-question-hint`, messages.length > 0 && errorId(name))}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 rounded-md px-4 text-base"
          data-enter-next
        />
        <FieldError id={errorId(name)} messages={messages} />
      </div>
      {children}
    </div>
  );
}

/** واحد پاسخنامه‌ی تازه برای مدیری که چند واحد دارد. */
export function UnitChoice({
  units,
  value,
  errors,
  onChange,
}: {
  units: Choice[];
  value: string;
  errors: Errors;
  onChange: (value: string) => void;
}) {
  return (
    <FieldSet legend="واحد" required error={errors.org_unit} id={fieldId("org_unit")}>
      <div className="grid gap-2 sm:grid-cols-2">
        {units.map((unit) => (
          <Radio
            key={unit.value}
            card
            name="org_unit"
            value={unit.value}
            label={unit.label}
            checked={value === unit.value}
            onChange={() => onChange(unit.value)}
          />
        ))}
      </div>
    </FieldSet>
  );
}

// ─────────────────────────────── گام ۵: مسیر تحقق ───────────────────────────────

export function PathsStep({
  values,
  limit,
  maxPaths,
  errors,
  onChange,
  onAdd,
  onRemove,
}: {
  values: AnswerValues;
  limit: number;
  maxPaths: number;
  errors: Errors;
  onChange: (key: string, description: string) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  const id = fieldId("paths");
  const missing = messagesOf(errors, "paths");
  return (
    <div className="flex flex-col gap-4">
      <StepHead
        id={`${id}-question`}
        question="این علت یا شرایط چگونه می‌تواند به اختلال در خدمت منجر شود؟"
        hint="زنجیره‌ی رخدادها را از علت تا اختلال در خدمت، گام‌به‌گام شرح دهید. اگر این علت از چند راه متفاوت به اختلال می‌رسد، برای هر راه یک مسیر جدا اضافه کنید."
      />
      {values.conditions.trim() && (
        <p className="inline-flex max-w-full items-baseline gap-1 self-start rounded-md bg-subtle px-2.5 py-1.5 text-xs">
          <span className="shrink-0 text-ink-2">عامل و وضعیت:</span>
          <span className="min-w-0 font-medium text-ink">{values.conditions}</span>
        </p>
      )}
      <ol className="flex flex-col gap-5">
        {values.paths.map((path, position) => {
          const name = `paths.${path.key}`;
          const field = fieldId(name);
          const messages = messagesOf(errors, name);
          const near = path.description.length > limit * 0.8;
          return (
            <li key={path.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={field}>
                  <Chip tone="brand">{`مسیر تحقق ${fa(position + 1)}`}</Chip>
                </label>
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`حذف مسیر تحقق ${fa(position + 1)}`}
                  onClick={() => onRemove(path.key)}
                >
                  <Icon name="x" />
                </Button>
              </div>
              <div className="relative">
                <Textarea
                  id={field}
                  rows={2}
                  value={path.description}
                  maxLength={limit}
                  aria-invalid={messages.length ? true : undefined}
                  aria-describedby={describedBy(
                    POSITION_ID,
                    messages.length > 0 && errorId(name),
                    near && `${field}-count`,
                  )}
                  onChange={(event) => onChange(path.key, event.target.value)}
                  className="min-h-20 resize-none px-4 pt-3 pb-8 leading-7"
                />
                <Counter id={`${field}-count`} length={path.description.length} limit={limit} show={near} />
              </div>
              <FieldError id={errorId(name)} messages={messages} />
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          id={fieldId("paths-add")}
          disabled={values.paths.length >= maxPaths}
          aria-describedby={missing.length ? errorId("paths") : undefined}
          onClick={onAdd}
          className="flex h-12 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong text-sm font-medium text-brand transition-colors duration-150 hover:bg-brand-subtle focus-visible:shadow-focus focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent"
        >
          <Icon name="plus" size={18} />
          افزودن مسیر تحقق
        </button>
        <FieldError id={errorId("paths")} messages={missing} />
      </div>
    </div>
  );
}

// ─────────────────────────────── گام ۶: رویداد مشخص ───────────────────────────────

export function EventsStep({
  values,
  limit,
  errors,
  choosing,
  onText,
  onMode,
  onChoose,
}: {
  values: AnswerValues;
  limit: number;
  errors: Errors;
  /** مسیرهایی که «انتخاب از رویدادهای قبلی» را زده‌اند. */
  choosing: Set<string>;
  onText: (event: string, text: string) => void;
  onMode: (path: string, mode: "new" | "previous") => void;
  onChoose: (path: string, event: string) => void;
}) {
  const groups = eventGroups(values);
  const owner = (event: string) => values.paths.findIndex((path) => path.event === event);
  return (
    <div className="flex flex-col gap-4">
      <StepHead
        id={`${fieldId("events")}-question`}
        question="در هر مسیر تحقق، چه رویداد مشخصی ممکن است رخ دهد؟"
        hint="برای هر مسیر یک رویداد جدید بنویسید؛ یا اگر این مسیر به همان رویدادِ یکی از مسیرهای قبلی می‌رسد، آن را انتخاب کنید تا پیامدش هم دوباره پرسیده نشود."
      />
      <ol className="flex flex-col gap-4">
        {values.paths.map((path, position) => {
          const name = `paths.${path.key}.event`;
          const field = fieldId(name);
          const messages = messagesOf(errors, name, `events.${path.event}`);
          // رویدادهایی که مسیرهای پیش از این مسیر نوشته‌اند.
          const previous = groups.filter((group) => {
            const first = owner(group.key);
            return first < position && first >= 0 && group.text.trim();
          });
          const picking = choosing.has(path.key) || (owner(path.event) < position && owner(path.event) >= 0);
          const group = groups.find((item) => item.key === path.event);
          const chosen = picking ? previous.find((item) => item.key === path.event) : undefined;
          const text = values.events.find((event) => event.key === path.event)?.text ?? "";
          return (
            <li
              key={path.key}
              className="flex flex-col gap-3 rounded-lg border border-line px-4 pt-3.5 pb-4"
              aria-labelledby={`${field}-path`}
            >
              <p className="flex min-w-0 items-center gap-2">
                <span id={`${field}-path`}>
                  <Chip tone="brand">{`مسیر تحقق ${fa(position + 1)}`}</Chip>
                </span>
                <span className="min-w-0 truncate text-xs text-ink-2">{path.description}</span>
              </p>
              {previous.length > 0 && (
                <div
                  role="group"
                  aria-label={`رویداد مسیر تحقق ${fa(position + 1)}`}
                  className="inline-flex gap-1 self-start rounded-md bg-subtle p-1"
                >
                  {(
                    [
                      ["new", "رویداد جدید", "plus"],
                      ["previous", "انتخاب از رویدادهای قبلی", "link"],
                    ] as const
                  ).map(([mode, label, icon]) => {
                    const active = (mode === "previous") === picking;
                    return (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={active}
                        onClick={() => !active && onMode(path.key, mode)}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-sm px-3 text-sm transition-[background-color,color,box-shadow] duration-150 focus-visible:shadow-focus focus-visible:outline-none",
                          active ? "bg-panel font-semibold text-ink shadow-card" : "text-ink-2 hover:text-ink",
                        )}
                      >
                        <Icon name={icon} size={15} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
              {picking ? (
                <fieldset
                  id={field}
                  className="flex flex-col gap-2"
                  aria-describedby={describedBy(messages.length > 0 && errorId(name))}
                >
                  <legend className="sr-only">انتخاب از رویدادهای قبلی</legend>
                  {previous.map((item) => {
                    const from = item.paths[0] ?? 1;
                    return (
                      <Radio
                        key={item.key}
                        card
                        name={`event-${path.key}`}
                        value={item.key}
                        checked={path.event === item.key}
                        onChange={() => onChoose(path.key, item.key)}
                        label={
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Chip tone="tangerine">{`رویداد ${fa(item.number)}`}</Chip>
                            <span className="min-w-0 flex-1 text-sm font-medium">{item.text}</span>
                            <span className="text-xs text-ink-2">{`از مسیر ${fa(from)}`}</span>
                          </span>
                        }
                      />
                    );
                  })}
                  {chosen && (
                    <p className="flex items-start gap-1.5 text-xs text-ink-2">
                      <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                      {`پیامدِ رویداد ${fa(chosen.number)} به این مسیر هم نسبت داده می‌شود و در گام بعد دوباره پرسیده نمی‌شود.`}
                    </p>
                  )}
                </fieldset>
              ) : (
                <div className="relative">
                  <Input
                    id={field}
                    value={text}
                    maxLength={limit}
                    autoComplete="off"
                    aria-labelledby={`${field}-path ${field}-number`}
                    aria-invalid={messages.length ? true : undefined}
                    aria-describedby={describedBy(POSITION_ID, messages.length > 0 && errorId(name))}
                    onChange={(event) => onText(path.event, event.target.value)}
                    className="h-11 ps-4 pe-24"
                    data-enter-next
                  />
                  <span id={`${field}-number`} className="absolute end-3 top-1/2 -translate-y-1/2">
                    <Chip tone="tangerine">{`رویداد ${fa(group?.number ?? 1)}`}</Chip>
                  </span>
                </div>
              )}
              <FieldError id={errorId(name)} messages={messages} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─────────────────────────────── گام ۷: نوع و دامنه‌ی پیامد ───────────────────────────────

function Flow({ items }: { items: { label: string; tone: "brand" | "tangerine" | "neutral" }[] }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      {items.map((item, position) => (
        <span key={item.label} className="flex items-center gap-2">
          {position > 0 && (
            <span aria-hidden className="text-xs text-ink-3">
              ←
            </span>
          )}
          <Chip tone={item.tone}>{item.label}</Chip>
        </span>
      ))}
    </p>
  );
}

/** نوع پیامد: چند بُعد پیامد روش؛ ظاهر select فریم و فهرست تیک‌ها در کارت شناور. */
function ImpactTypes({
  types,
  value,
  onChange,
}: {
  types: Choice[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  // دکمه aria-required نمی‌پذیرد؛ الزامی بودن را ستاره‌ی برچسب و پیام خطا می‌گویند.
  const field = useFieldControl({});
  const aria = { id: field.id, "aria-describedby": field["aria-describedby"], "aria-invalid": field["aria-invalid"] };
  const chosen = types.filter((type) => value.includes(type.value));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...aria}
          className={cn(control, "flex h-[2.625rem] items-center justify-between gap-2 px-3 text-start")}
        >
          <span className={cn("min-w-0 truncate", !chosen.length && "text-ink-3")}>
            {chosen.length ? chosen.map((type) => type.label).join("، ") : "انتخاب نوع پیامد"}
          </span>
          <Icon name="chevron-down" size={16} className="shrink-0 text-ink-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-60 p-2">
        <fieldset className="flex flex-col">
          <legend className="sr-only">نوع پیامد</legend>
          {types.map((type) => (
            <div key={type.value} className="rounded-md px-2 py-2 transition-colors duration-150 hover:bg-subtle">
              <Checkbox
                label={type.label}
                checked={value.includes(type.value)}
                onChange={(event) =>
                  onChange(
                    types
                      .map((item) => item.value)
                      .filter((code) => (code === type.value ? event.target.checked : value.includes(code))),
                  )
                }
              />
            </div>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

export function ImpactsStep({
  values,
  types,
  limits,
  errors,
  onChange,
}: {
  values: AnswerValues;
  types: Choice[];
  limits: { text: number; impact: number };
  errors: Errors;
  onChange: (event: string, change: Partial<{ types: string[]; scope: string; description: string }>) => void;
}) {
  const groups = eventGroups(values).filter((group) => group.text.trim());
  return (
    <div className="flex flex-col gap-4">
      <StepHead
        id={`${fieldId("impacts")}-question`}
        question="پیامد قابل مشاهده‌ی هر رویداد و دامنه‌ی آن چیست؟"
        hint="برای هر رویداد مشخص یک پیامد ثبت کنید. رویدادی که در چند مسیر تکرار شده، فقط یک بار پرسیده می‌شود."
      />
      <Flow
        items={[
          { label: `${fa(values.paths.length)} مسیر تحقق`, tone: "brand" },
          { label: `${fa(groups.length)} رویداد مشخص`, tone: "tangerine" },
          { label: `${fa(groups.length)} پیامد`, tone: "neutral" },
        ]}
      />
      <ol className="flex flex-col gap-4">
        {groups.map((group) => {
          const impact = impactOf(values, group.key);
          const name = `impacts.${group.key}`;
          return (
            <li
              key={group.key}
              aria-labelledby={`${fieldId(name)}-event`}
              className="flex flex-col gap-3.5 rounded-lg border border-line px-4 pt-3.5 pb-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={`${fieldId(name)}-event`} className="flex min-w-0 items-center gap-2">
                  <Chip tone="tangerine">{`رویداد ${fa(group.number)}`}</Chip>
                  <span className="min-w-0 text-sm font-semibold text-ink">{group.text}</span>
                </p>
                <p className="flex items-center gap-1.5 text-xs text-ink-3">
                  {group.paths.length > 1 ? "از مسیرهای" : "از مسیر"}
                  {group.paths.map((number) => (
                    <Chip key={number} tone="brand">{`مسیر ${fa(number)}`}</Chip>
                  ))}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[15rem_minmax(0,1fr)]">
                <Field label="نوع پیامد" required error={errors[`${name}.types`]} id={fieldId(`${name}.types`)}>
                  <ImpactTypes
                    types={types}
                    value={impact.types}
                    onChange={(next) => onChange(group.key, { types: next })}
                  />
                </Field>
                <Field
                  label="دامنه‌ی پیامد قابل مشاهده"
                  required
                  hint="با عدد بیان کنید: مدت، تعداد، مبلغ یا ذی‌نفعان متأثر."
                  error={errors[`${name}.scope`]}
                  id={fieldId(`${name}.scope`)}
                >
                  <Input
                    value={impact.scope}
                    maxLength={limits.text}
                    autoComplete="off"
                    onChange={(event) => onChange(group.key, { scope: event.target.value })}
                    data-enter-next
                  />
                </Field>
              </div>
              <Field
                label="شرح پیامد"
                required
                hint="شرح کوتاه و قابل فهم برای مالک ریسک؛ حداکثر ۱۲۰ نویسه."
                error={errors[`${name}.description`]}
                id={fieldId(`${name}.description`)}
              >
                <Input
                  value={impact.description}
                  maxLength={limits.impact}
                  autoComplete="off"
                  onChange={(event) => onChange(group.key, { description: event.target.value })}
                  data-enter-next
                />
              </Field>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ─────────────────────────────── گام ۸: بازبینی ───────────────────────────────

export function ReviewStep({
  values,
  types,
  missing,
  onEdit,
}: {
  values: AnswerValues;
  types: Choice[];
  /** شمار پرسش‌های اجباری بی‌پاسخ. */
  missing: number;
  onEdit: (step: StepKey) => void;
}) {
  const groups = eventGroups(values);
  const label = (code: string) => types.find((type) => type.value === code)?.label ?? code;
  const summary = {
    paths: values.paths.length,
    events: groups.length,
    impacts: groups.filter((group) => {
      const impact = impactOf(values, group.key);
      return impact.types.length && impact.scope.trim() && impact.description.trim();
    }).length,
  };
  const stepLabel = (key: StepKey) => STEPS.find((step) => step.key === key)?.label ?? key;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3
          id={fieldId("review")}
          tabIndex={-1}
          className="text-h2 font-semibold text-balance text-ink focus-visible:outline-none"
        >
          پیش از ارسال، پاسخ‌ها را بازبینی کنید
        </h3>
        <p className="text-sm text-ink-2">
          برای اصلاح هر پاسخ روی نماد ویرایش یا مرحله‌ی مربوط در بالا بزنید. پس از ارسال، پاسخنامه برای کارشناس ریسک
          فرستاده می‌شود.
        </p>
      </div>
      {missing ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3.5 py-2.5 text-sm text-warning"
        >
          <Icon name="warning" size={18} className="mt-0.5 shrink-0" />
          {`${fa(missing)} پرسش اجباری بی‌پاسخ مانده است؛ پیش از ارسال آن‌ها را کامل کنید.`}
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-lg bg-success-subtle px-3.5 py-2.5 text-sm text-success">
          <Icon name="check-circle" size={18} className="mt-0.5 shrink-0" />
          همه‌ی پرسش‌های اجباری پاسخ داده شده‌اند؛ پاسخنامه آماده‌ی ارسال است.
        </p>
      )}

      <section aria-labelledby="answer-review-basic" className="flex flex-col gap-2.5">
        <h4 id="answer-review-basic" className="text-sm font-semibold text-ink">
          پاسخ‌های پایه
        </h4>
        <dl className="divide-y divide-line rounded-lg border border-line">
          {BASIC_KEYS.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[8.5rem_minmax(0,1fr)_auto]"
            >
              <dt className="col-span-1 text-sm text-ink-2 sm:col-span-1">{stepLabel(key)}</dt>
              <dd className="order-3 col-span-2 text-sm text-ink sm:order-none sm:col-span-1">
                {values[key].trim() || "—"}
              </dd>
              <dd className="row-start-1 justify-self-end sm:row-auto">
                <Button
                  variant="quiet"
                  size="icon-sm"
                  aria-label={`ویرایش ${stepLabel(key)}`}
                  onClick={() => onEdit(key)}
                >
                  <Icon name="pencil" />
                </Button>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="answer-review-paths" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 id="answer-review-paths" className="text-sm font-semibold text-ink">
            مسیرها، رویدادها و پیامدها
          </h4>
          <Flow
            items={[
              { label: `${fa(summary.paths)} مسیر`, tone: "brand" },
              { label: `${fa(summary.events)} رویداد`, tone: "tangerine" },
              { label: `${fa(summary.impacts)} پیامد`, tone: "neutral" },
            ]}
          />
        </div>
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] gap-6 px-4 text-xs text-ink-3 md:grid"
        >
          <span>مسیر تحقق</span>
          <span>رویداد مشخص</span>
          <span>پیامد</span>
        </div>
        <ol className="flex flex-col gap-2.5">
          {groups.map((group) => {
            const impact = impactOf(values, group.key);
            return (
              <li
                key={group.key}
                className="grid items-center gap-3 rounded-lg border border-line p-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] md:gap-6"
              >
                <ul className="relative flex flex-col gap-2">
                  {group.paths.map((number) => {
                    const path = values.paths[number - 1];
                    return (
                      <li key={number} className="flex flex-col gap-1.5 rounded-md bg-subtle p-2.5">
                        <Chip tone="brand">{`مسیر تحقق ${fa(number)}`}</Chip>
                        <span className="line-clamp-2 text-xs leading-5 text-ink-2">{path?.description}</span>
                      </li>
                    );
                  })}
                </ul>
                <div className="relative flex flex-col items-start gap-1.5">
                  <FlowArrow />
                  <Chip tone="tangerine">{`رویداد ${fa(group.number)}`}</Chip>
                  <span className="text-sm font-semibold text-ink">{group.text || "—"}</span>
                </div>
                <div className="relative flex flex-col items-start gap-1.5">
                  <FlowArrow />
                  {impact.types.length > 0 && <Chip>{impact.types.map(label).join("، ")}</Chip>}
                  <span className="text-sm text-ink">{impact.scope || "—"}</span>
                  {impact.description && <span className="text-xs text-ink-2">{impact.description}</span>}
                </div>
              </li>
            );
          })}
        </ol>
        <Button variant="link" className="self-start" onClick={() => onEdit("paths")}>
          <Icon name="pencil" size={15} />
          ویرایش مسیرها و رویدادها
        </Button>
      </section>
    </div>
  );
}

/** پیکان میان ستون‌های بازبینی (30e)، فقط در چیدمان سه‌ستونی. */
function FlowArrow() {
  return (
    <span aria-hidden className="absolute -start-4 top-1/2 hidden -translate-y-1/2 text-xs text-ink-3 md:block">
      ←
    </span>
  );
}

// ─────────────────────────────── ارسال موفق (30f) ───────────────────────────────

export function SentState({
  response,
  summary,
  onRestart,
}: {
  response: AnswerResponse;
  summary: AnswerSummary;
  onRestart: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // پیام موفقیت جای گام‌ها را می‌گیرد و فوکوس به سرش می‌رود تا صفحه‌خوان آن را بخواند.
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col items-center gap-3.5 px-6 py-11 text-center">
      <span aria-hidden className="grid size-[4.5rem] place-items-center rounded-full bg-success-subtle">
        <span className="grid size-11 place-items-center rounded-full bg-success text-on-brand">
          <Icon name="check" size={22} />
        </span>
      </span>
      <h3 ref={heading} tabIndex={-1} className="mt-1 text-h2 font-semibold text-ink focus-visible:outline-none">
        پاسخنامه با موفقیت ارسال شد
      </h3>
      <div className="flex flex-col text-sm leading-[1.625rem] text-ink-2">
        <p>
          پاسخنامه‌ی <bdi className="code rounded-sm bg-subtle px-1.5 py-0.5 text-xs text-ink">{response.code}</bdi>{" "}
          برای کارشناس ریسک فرستاده شد.
        </p>
        <p>نتیجه‌ی بررسی در «کارهای من» به شما اعلام می‌شود.</p>
      </div>
      <p className="flex flex-wrap justify-center gap-2">
        <Chip tone="brand">{`${fa(summary.paths)} مسیر تحقق`}</Chip>
        <Chip tone="tangerine">{`${fa(summary.events)} رویداد مشخص`}</Chip>
        <Chip>{`${fa(summary.impacts)} پیامد`}</Chip>
      </p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">
        <Button variant="primary" size="lg" onClick={onRestart}>
          <Icon name="plus" />
          پاسخ به پرسشنامه‌ی جدید
        </Button>
        <Link
          to={`/identification/responses/${response.id}`}
          viewTransition
          className={buttonClasses({ variant: "secondary", size: "lg" })}
        >
          <Icon name="eye" />
          مشاهده‌ی پاسخنامه
        </Link>
      </div>
    </div>
  );
}
