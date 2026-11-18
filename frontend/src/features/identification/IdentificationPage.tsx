import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { Link, useBlocker, useNavigate, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FieldError, Input, RequiredMark, Textarea } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProcessSteps, type StepState } from "@/components/ui/process-step";
import { Chip, SectionPanel as Panel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, daysLeft, fa, faText, fileSize, shortDate } from "@/lib/format";
import { useDebouncedValue, useTitle } from "@/lib/hooks";
import type {
  IdentificationAttachment,
  IdentificationChoices,
  IdentificationDraft,
  IdentificationPage as PageData,
  IdentificationPart,
  IdentificationRow,
  IdentificationValues,
} from "@/lib/types";

import {
  REVIEW,
  autoUnit,
  entryChecks,
  matchTargets,
  narrative,
  riskTitle,
  stepOfField,
  withTarget,
  type PartName,
  type StepKey,
  type Target,
  type Unit,
} from "./identification";

// «شناسایی ریسک»: ویزارد شش پرسش جلسه‌ی شناسایی و یک گام «بازبینی». بالای ویزارد «الگوی ثبت سناریو» چسبان است و با
// هر حرف جزء همان پرسش را در جمله پر و علامت‌گذاری می‌کند. خدمت از پیشنهادهای پرسش اول انتخاب می‌شود و واحد، مشتری و
// تعهد از همان می‌آیند؛ دسته و منبع را بعداً عضو GRC تعیین می‌کند. بازبینی شاهد (اجباری)، فایل شاهد، پیامد، وابستگی و
// شرط پذیرش ورودی را دارد. پیش‌نویس با Ctrl+S هم ذخیره می‌شود و رفتن با تغییر ذخیره‌نشده پرسیده می‌شود.

type Errors = Partial<Record<string, string[]>>;

interface SaveResult {
  message: string;
  draft?: IdentificationDraft;
  recent?: IdentificationRow[];
  risk?: { id: number; code: string };
  redirect?: string;
}

const PROCESS: { label: string; state: StepState }[] = [
  { label: "شناسایی", state: "current" },
  { label: "گردآوری شواهد", state: "upcoming" },
  { label: "تحلیل", state: "upcoming" },
  { label: "ارزیابی", state: "upcoming" },
  { label: "تصمیم و اجرا", state: "upcoming" },
  { label: "آزمون و بازسنجی", state: "upcoming" },
  { label: "پایش و گزارش", state: "upcoming" },
];

/** راهنمای هر پرسش، با نمونه‌ای از همان جنس پاسخی که جمله را قابل ارزیابی می‌کند. */
const HINTS: Record<PartName, string> = {
  subject: "نام خدمت یا فرآیند را بنویسید و از فهرست خدمت‌ها انتخاب کنید؛ واحد، مشتری و تعهد از همان خدمت می‌آیند.",
  objective: "تعهد یا خروجی‌ای که مختل می‌شود؛ مثلاً «پردازش دستورها در پنجره‌ی SLA».",
  conditions: "علت یا وضعیتی که زمینه را فراهم می‌کند؛ مثلاً «ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار».",
  customer: "داتین، مشتری مشخص یا هر دو؛ با انتخاب خدمت و تعهد پیشنهاد می‌شود.",
  event: "یک اتفاق مشخص و قابل مشاهده، نه نام کلی تهدید؛ همین عنوان ریسک در رجیستر می‌شود.",
  harm: "آسیب قابل مشاهده و دامنه‌اش؛ مثلاً «توقف پردازش حدود ۹۰ دقیقه برای بانک ملت».",
};

const REVIEW_FIELDS = ["evidence", "evidence_file", "evidence_items", "impact", "dependencies"];

const FIELD_LABELS: Record<string, string> = {
  target: "خدمت",
  org_unit: "واحد",
  mission: "مأموریت و خروجی اصلی",
  impact: "پیامد برای شرکت و مشتری",
  dependencies: "وابستگی و جایگزین",
  evidence: "شاهد، تجربه و تغییر اخیر",
  evidence_file: "فایل شاهد",
  evidence_items: "شواهد پیوندشده",
  category: "دسته‌ی اصلی",
  source: "منبع شناسایی",
  scenario: "سناریوی مرجع",
  tags: "برچسب‌ها",
};

const REQUIRED = "این پرسش برای ارسال اجباری است.";
const SUGGESTIONS_SHOWN = 6;

const fieldId = (name: string) => `identification-${name}`;
const errorId = (name: string) => `${fieldId(name)}-error`;

interface Step {
  key: StepKey;
  /** نام کوتاه گام، همان نشانه‌ی جزء در جمله. */
  label: string;
}

// ─────────────────────────────── الگوی ثبت سناریو ───────────────────────────────

function ScenarioTemplate({
  values,
  parts,
  active,
  ref,
}: {
  values: IdentificationValues;
  parts: IdentificationPart[];
  active: StepKey;
  ref: Ref<HTMLElement>;
}) {
  const filled = parts.filter((part) => values[part.name].trim()).length;
  const text = narrative(values);
  // جمله روی صفحه با هر حرف عوض می‌شود؛ صفحه‌خوان همان را بعد از مکث در تایپ یک‌جا می‌شنود، نه حرف به حرف.
  const announced = useDebouncedValue(text, 700);
  const token = (name: PartName) => {
    const value = values[name].trim();
    const part = parts.find((item) => item.name === name);
    return (
      <span
        data-active={active === name ? "" : undefined}
        className={cn(
          "scenario-token rounded-sm px-0.5",
          value ? "font-semibold text-brand" : "border-b border-dashed border-ink-3 text-ink-2",
        )}
      >
        {value || `[${part?.token ?? name}]`}
      </span>
    );
  };
  return (
    <section
      ref={ref}
      aria-labelledby="scenario-template-title"
      className="sticky top-[calc(var(--topbar-h)+0.5rem)] z-10 rounded-xl border border-brand-subtle-strong bg-panel shadow-card"
    >
      <div className="flex items-center gap-2 px-4 pt-3 sm:px-5">
        <h2 id="scenario-template-title" className="flex-1 text-h3 font-semibold text-ink">
          الگوی ثبت سناریو
        </h2>
        <span className="hidden sm:inline-flex">
          <Chip tone="info">
            پیش‌نمایش زنده
            <Icon name="eye" size={12} />
          </Chip>
        </span>
        <Chip tone={filled === parts.length ? "success" : "neutral"}>{`${fa(filled)} از ${fa(parts.length)} جزء`}</Chip>
      </div>
      <p
        aria-hidden
        className="px-4 pt-1.5 pb-3 text-sm leading-[1.625rem] text-pretty text-ink sm:px-5 sm:pt-2 sm:pb-3.5 sm:text-base sm:leading-8"
      >
        در خدمت یا فرآیند {token("subject")}، به علت یا در شرایط {token("conditions")}، ممکن است {token("event")} رخ دهد
        و انجام {token("objective")} برای {token("customer")} را مختل کند. پیامد قابل مشاهده‌ی آن {token("harm")} است.
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="scenario-sentence-live">
        {announced}
      </p>
    </section>
  );
}

// ─────────────────────────────── گام‌نما ───────────────────────────────

type StepStatus = "answered" | "empty" | "error";

function StepNav({
  steps,
  index,
  status,
  onJump,
}: {
  steps: Step[];
  index: number;
  status: (key: StepKey) => StepStatus;
  onJump: (target: number) => void;
}) {
  const said = { answered: "پاسخ دارد", empty: "بی‌پاسخ", error: "خطا دارد" } as const;
  return (
    <nav aria-label="گام‌های ثبت سناریو">
      <ol className="grid grid-cols-7 gap-1 md:gap-1.5">
        {steps.map((step, position) => {
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
                  "flex h-10 w-full items-center justify-center rounded-md border text-sm transition-colors duration-150 focus-visible:shadow-focus focus-visible:outline-none md:h-full md:min-h-16 md:flex-col md:gap-1 md:px-1.5 md:py-2",
                  current && "border-brand bg-brand text-on-brand",
                  !current && state === "error" && "border-danger-solid bg-danger-subtle text-danger",
                  !current &&
                    state === "answered" &&
                    "border-transparent bg-brand-subtle text-brand hover:bg-brand-subtle-strong",
                  !current && state === "empty" && "border-line bg-panel text-ink-2 hover:bg-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular transition-colors duration-150",
                    current ? "bg-on-brand/20" : state === "answered" ? "bg-panel" : "bg-subtle",
                  )}
                >
                  {state === "error" && !current ? (
                    <Icon name="warning" size={14} />
                  ) : state === "answered" && !current ? (
                    <Icon name="check" size={14} />
                  ) : (
                    fa(position + 1)
                  )}
                </span>
                <span
                  aria-hidden
                  className="hidden max-w-full text-center text-xs leading-[1.125rem] font-medium md:line-clamp-2"
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

// ─────────────────────────────── پرسش اول: پیشنهاد خدمت ───────────────────────────────

function ServiceSuggestions({
  targets,
  query,
  chosen,
  onChoose,
  onClear,
}: {
  targets: Target[];
  query: string;
  chosen: Target | undefined;
  onChoose: (target: Target) => void;
  onClear: () => void;
}) {
  const list = useRef<HTMLUListElement>(null);
  const matches = matchTargets(query, targets);
  const shown = matches.slice(0, SUGGESTIONS_SHOWN);
  const more = matches.length - shown.length;

  // کلیدهای جهت بالا و پایین بین پیشنهادها جابه‌جا می‌شوند (Tab هم کار می‌کند).
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    event.preventDefault();
    const next = event.key === "ArrowDown" ? Math.min(at + 1, buttons.length - 1) : at - 1;
    if (next < 0) document.getElementById(fieldId("subject"))?.focus();
    else buttons[next]?.focus();
  }

  return (
    <div className="flex flex-col gap-2">
      {chosen && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-success-subtle px-3 py-2 text-sm text-ink">
          <Icon name="check-circle" size={16} className="shrink-0 text-success" />
          <span className="min-w-0 flex-1">
            خدمت انتخاب‌شده: <span className="font-medium">{chosen.label}</span>
          </span>
          <Button variant="link" size="sm" onClick={onClear}>
            برداشتن
          </Button>
        </div>
      )}
      <p id="identification-suggestions-label" className="text-xs font-medium text-ink-2">
        پیشنهاد از فهرست خدمت‌ها
        {matches.length > 0 && ` (${fa(matches.length)})`}
      </p>
      {shown.length ? (
        <ul ref={list} aria-labelledby="identification-suggestions-label" className="grid gap-1.5 sm:grid-cols-2">
          {shown.map((target) => {
            const selected = chosen?.value === target.value;
            return (
              <li key={target.value}>
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChoose(target)}
                  onKeyDown={onKeyDown}
                  className={cn(
                    "flex min-h-11 w-full items-start gap-2 rounded-lg border px-3 py-2 text-start transition-colors duration-150 focus-visible:shadow-focus focus-visible:outline-none",
                    selected
                      ? "border-brand bg-brand-subtle"
                      : "border-line bg-panel hover:border-line-strong hover:bg-subtle",
                  )}
                >
                  <Icon
                    name={selected ? "check-circle" : "buildings"}
                    size={16}
                    className={cn("mt-0.5 shrink-0", selected ? "text-brand" : "text-ink-3")}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className={cn("text-sm font-medium", selected ? "text-brand" : "text-ink")}>
                      {target.service.name}
                    </span>
                    <span className="text-xs text-ink-2">
                      {[target.customer ?? "همه‌ی مشتریان", target.commitment].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">
          خدمتی با این نام در فهرست نیست؛ نام دیگری بنویسید یا از واحد مالک بخواهید خدمت را در کاتالوگ ثبت کند.
        </p>
      )}
      {more > 0 && <p className="text-xs text-ink-2">{`${fa(more)} خدمت دیگر؛ برای دیدنشان بیشتر بنویسید.`}</p>}
    </div>
  );
}

// ─────────────────────────────── گام پرسش ───────────────────────────────

function QuestionStep({
  part,
  value,
  limit,
  messages,
  onChange,
  onEnter,
  children,
}: {
  part: IdentificationPart;
  value: string;
  limit: number;
  messages: string[];
  onChange: (value: string) => void;
  onEnter: () => void;
  children?: ReactNode;
}) {
  const id = fieldId(part.name);
  const required = part.name !== "subject";
  const nearLimit = value.length > limit * 0.8;
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h2 font-semibold text-balance text-ink">
        <label htmlFor={id}>
          {part.label}
          {required && (
            <>
              {" "}
              <RequiredMark />
            </>
          )}
        </label>
      </h3>
      <p id={`${id}-hint`} className="text-sm text-ink-2">
        {HINTS[part.name]}
      </p>
      <Input
        id={id}
        value={value}
        maxLength={limit}
        autoComplete="off"
        placeholder="پاسخ کوتاه و مشخص"
        required={required}
        aria-invalid={messages.length ? true : undefined}
        aria-describedby={[
          "identification-step-position",
          `${id}-hint`,
          messages.length ? errorId(part.name) : null,
          nearLimit ? `${id}-count` : null,
        ]
          .filter(Boolean)
          .join(" ")}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing && !event.shiftKey && !event.ctrlKey) {
            event.preventDefault();
            onEnter();
          }
          if (event.key === "ArrowDown" && part.name === "subject") {
            const first = document.querySelector<HTMLButtonElement>(
              '[aria-labelledby="identification-suggestions-label"] button',
            );
            if (first) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        className="h-12 scroll-mt-[calc(var(--topbar-h)+var(--template-h,10rem)+1.5rem)] px-3.5 text-h3"
      />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <FieldError id={errorId(part.name)} messages={messages.length ? messages : undefined} />
        </div>
        {nearLimit && (
          <span id={`${id}-count`} className="shrink-0 text-xs text-ink-2 tabular">
            {`${fa(value.length)} از ${fa(limit)} نویسه`}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────── بازبینی ───────────────────────────────

function EntryCriteria({ values, unit }: { values: IdentificationValues; unit: Unit | null }) {
  const owner = unit?.owner?.name ?? null;
  const { checks, evidence, met } = entryChecks(values, owner);
  return (
    <section aria-labelledby="identification-entry-title" className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="identification-entry-title" className="flex-1 text-h3 font-semibold text-ink">
          شرط پذیرش ورودی
        </h4>
        <Chip tone={met === 5 ? "success" : "warning"}>{`${fa(met)} از ۵`}</Chip>
      </div>
      <p className="-mt-2 text-sm text-ink-2">سناریوی قابل ارزیابی این پنج شاخص را دارد.</p>
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {checks.map((check) => (
          <li key={check.key} className="flex items-start gap-2 text-sm text-ink">
            <Icon
              name={check.met ? "check-circle" : "x-circle"}
              size={16}
              className={cn("mt-0.5 shrink-0", check.met ? "text-success" : "text-ink-3")}
            />
            <span className={check.met ? "font-medium" : "text-ink-2"}>
              {check.label}
              <span className="sr-only">{check.met ? " (برقرار)" : " (برقرار نیست)"}</span>
            </span>
          </li>
        ))}
        <li className="flex items-start gap-2 text-sm">
          <Icon
            name={evidence === "met" ? "check-circle" : evidence === "assumption" ? "warning" : "x-circle"}
            size={16}
            className={cn(
              "mt-0.5 shrink-0",
              evidence === "met" ? "text-success" : evidence === "assumption" ? "text-warning" : "text-ink-3",
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span className={evidence === "missing" ? "text-ink-2" : "font-medium text-ink"}>
              شاهد یا فرض قابل آزمون
              <span className="sr-only">
                {evidence === "met" ? " (برقرار)" : evidence === "assumption" ? " (فرض)" : " (برقرار نیست)"}
              </span>
            </span>
            {evidence === "assumption" && (
              <span className="text-xs text-ink-2">با عدم قطعیت زیاد و اقدام جمع‌آوری شاهد ثبت می‌شود</span>
            )}
          </span>
        </li>
      </ul>
      {unit ? (
        <p className="text-xs text-ink-2">{`ریسک برای واحد «${unit.label.split(" · ")[0]}» ثبت می‌شود.`}</p>
      ) : (
        <p className="text-xs text-ink-2">واحد ریسک بعد از انتخاب خدمت در پرسش اول مشخص می‌شود.</p>
      )}
      <p className="text-xs text-ink-2">
        عبارت مبهم با سؤال مشخص و مهلت ۵ روز کاری به واحد بازمی‌گردد. دسته و منبع را عضو GRC پیش از ارزیابی تعیین
        می‌کند.
      </p>
    </section>
  );
}

function EvidencePicker({
  choices,
  selected,
  onChange,
  evidenceUrl,
}: {
  choices: IdentificationChoices["evidence"];
  selected: string[];
  onChange: (items: string[]) => void;
  evidenceUrl: string;
}) {
  const items = choices.filter((choice) => selected.includes(choice.value));
  return (
    <div className="flex flex-wrap items-center gap-2" id={fieldId("evidence_items")}>
      {items.map((item) => (
        <span
          key={item.value}
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-subtle ps-2.5 pe-1 text-xs font-medium text-ink-2"
        >
          <Icon name="link" size={12} />
          <span className="truncate">
            <bdi className="code">{item.code}</bdi> · {item.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(selected.filter((value) => value !== item.value))}
            className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-line"
            aria-label={`برداشتن پیوند شاهد ${item.code}`}
          >
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <Icon name="link" />
            پیوند به شاهد ثبت‌شده
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-80 flex-col gap-2 overflow-y-auto p-3">
          <p className="text-xs text-ink-2">شاهد معتبری را که این سناریو را پشتیبانی می‌کند انتخاب کنید.</p>
          {choices.length ? (
            <ul className="flex flex-col gap-1">
              {choices.map((choice) => (
                <li key={choice.value}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-subtle">
                    <input
                      type="checkbox"
                      checked={selected.includes(choice.value)}
                      onChange={(event) =>
                        onChange(
                          event.target.checked
                            ? [...selected, choice.value]
                            : selected.filter((value) => value !== choice.value),
                        )
                      }
                      className="mt-1 size-4 shrink-0 accent-brand"
                    />
                    <span>
                      <bdi className="code text-xs text-ink-2">{choice.code}</bdi> {choice.label}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-2">شاهد معتبری که بتوانید ببینید ثبت نشده است.</p>
          )}
          <AppLink href={evidenceUrl} className="text-xs">
            ثبت شاهد تازه در کتابخانه‌ی شواهد
          </AppLink>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SavedFiles({
  files,
  removed,
  onToggle,
}: {
  files: IdentificationAttachment[];
  removed: number[];
  onToggle: (id: number) => void;
}) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-col gap-1.5" aria-label="فایل‌های شاهد پیش‌نویس">
      {files.map((file) => {
        const gone = removed.includes(file.id);
        return (
          <li key={file.id} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-2 text-sm">
            <Icon name="paperclip" size={16} className="shrink-0 text-ink-3" />
            <span className={cn("min-w-0 flex-1 truncate", gone ? "text-ink-2 line-through" : "text-ink")}>
              {file.name}
            </span>
            <span className="shrink-0 text-xs text-ink-2 tabular">{fileSize(file.size)}</span>
            <Button
              variant="link"
              size="sm"
              aria-label={`${gone ? "بازگرداندن" : "برداشتن"} ${file.name}`}
              onClick={() => onToggle(file.id)}
            >
              {gone ? "بازگرداندن" : "برداشتن"}
            </Button>
          </li>
        );
      })}
      {removed.length > 0 && <li className="text-xs text-ink-2">فایل برداشته‌شده با ذخیره‌ی بعدی پاک می‌شود.</li>}
    </ul>
  );
}

// ─────────────────────────────── ورودی‌های اخیر ───────────────────────────────

function RecentEntries({ rows, registerUrl }: { rows: IdentificationRow[]; registerUrl: string }) {
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
                    ) : (
                      <AppLink href={row.href ?? "#"} className="text-base font-medium text-ink hover:text-brand">
                        {row.title}
                      </AppLink>
                    )}
                    <span className="block text-xs text-ink-2">
                      {[row.category, row.scenario ?? (row.code ? "مورد جدید" : null)].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td data-label="خدمت · مشتری" data-wide className="text-ink-2">
                    {row.service ? `${row.service} · ${row.customer ?? "همه"}` : "—"}
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

// ─────────────────────────────── ویزارد ───────────────────────────────

function IdentificationWizard({ data, onDraftSaved }: { data: PageData; onDraftSaved: (id: string) => void }) {
  const choices = data.choices as IdentificationChoices;
  const parts = data.parts;
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState<IdentificationValues>(data.values);
  const [saved, setSaved] = useState(() => JSON.stringify(data.values));
  const [draft, setDraft] = useState<IdentificationDraft | null>(data.draft);
  const [file, setFile] = useState<File | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [summary, setSummary] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [index, setIndex] = useState(0);
  // جهت آخرین جابه‌جایی برای CSS؛ گام اول هنگام باز شدن صفحه حرکت ندارد.
  const [direction, setDirection] = useState<"forward" | "back" | "none">("none");
  const [focusRequest, setFocusRequest] = useState<{ field: string; n: number } | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const template = useRef<HTMLElement>(null);
  const limit = data.text_limit;

  const steps: Step[] = [
    ...parts.map((part) => ({ key: part.name, label: part.token })),
    { key: REVIEW, label: "بازبینی" },
  ];
  const step: Step = steps[index] ?? { key: REVIEW, label: "بازبینی" };
  const part = parts.find((item) => item.name === step.key);
  const chosen = choices.target.find((item) => item.value === values.target);
  const unit = autoUnit(choices, values.target);
  const dirty = JSON.stringify(values) !== saved || file !== null || removed.length > 0;

  // فیلدی که پرسش یا خطا را دارد بعد از هر جابه‌جایی فوکوس می‌گیرد، نه هنگام باز شدن صفحه.
  useEffect(() => {
    if (!focusRequest) return;
    const element = document.getElementById(fieldId(focusRequest.field));
    const control = element?.matches("input, textarea, select, button")
      ? element
      : element?.querySelector<HTMLElement>("input, textarea, select, button");
    if (!control) return;
    control.focus({ preventScroll: true });
    // پرسش (یا برچسب فیلد خطادار) درست زیر الگوی چسبان می‌نشیند، تا نه پرسش پشت الگو پنهان شود و نه فیلد زیر لبه‌ی
    // صفحه؛ اگر هر دو دیده می‌شوند صفحه تکان نمی‌خورد. جابه‌جایی آنی است، نه انیمیشن.
    const sticky = template.current;
    const anchor =
      shell.current?.querySelector<HTMLLabelElement>(".wizard-step h3 label")?.htmlFor === control.id
        ? shell.current.querySelector<HTMLElement>(".wizard-step h3")
        : (document.querySelector<HTMLElement>(`label[for="${control.id}"]`) ?? control);
    // بدون چیدمان (مثلاً jsdom آزمون‌ها) چیزی برای اندازه گرفتن نیست.
    if (!sticky || !anchor || !sticky.offsetHeight) return;
    const line = (parseFloat(getComputedStyle(sticky).top) || 0) + sticky.offsetHeight + 12;
    const top = anchor.getBoundingClientRect().top;
    if (top < line || control.getBoundingClientRect().bottom > window.innerHeight - 16) {
      window.scrollBy({ top: top - line, behavior: "instant" });
    }
  }, [focusRequest]);

  // ارتفاع الگوی چسبان، تا فیلدی که فوکوس می‌گیرد زیر آن پنهان نماند (scroll-margin).
  useEffect(() => {
    const element = template.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        shell.current?.style.setProperty(
          "--template-h",
          `${Math.ceil(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height)}px`,
        );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  function stepErrors(key: StepKey): string[] {
    const fields = key === REVIEW ? REVIEW_FIELDS : key === "subject" ? ["subject", "target", "org_unit"] : [key];
    const own = Object.entries(errors).filter(([name]) =>
      name === "__all__" ? false : key === REVIEW ? stepOfField(name, parts) === REVIEW : fields.includes(name),
    );
    return own.flatMap(([, messages]) => messages ?? []);
  }

  function status(key: StepKey): StepStatus {
    if (stepErrors(key).length) return "error";
    if (key === REVIEW) return values.evidence.trim() ? "answered" : "empty";
    if (key === "subject") return values.target ? "answered" : "empty";
    return values[key].trim() ? "answered" : "empty";
  }

  /** مشکل‌هایی که ارسال را نگه می‌دارند، برای یک گام. */
  function problems(key: StepKey): Errors {
    if (key === REVIEW) {
      return values.evidence.trim() ? {} : { evidence: ["شاهد یا فرض قابل آزمون را بنویسید؛ برای ارسال اجباری است."] };
    }
    if (key === "subject") {
      if (!values.target) {
        return {
          target: [
            values.subject.trim()
              ? "خدمت را از پیشنهادهای زیر انتخاب کنید تا واحد و مشتری از آن بیاید."
              : "خدمت یا فرآیند را بنویسید و از پیشنهادهای فهرست خدمت‌ها انتخاب کنید.",
          ],
        };
      }
      if (!unit && chosen) {
        return {
          target: [
            `واحد مالک «${chosen.service.name}» جزو واحدهایی نیست که برایشان ریسک شناسایی می‌کنید؛ خدمتی از واحد خودتان انتخاب کنید.`,
          ],
        };
      }
      return {};
    }
    return values[key].trim() ? {} : { [key]: [REQUIRED] };
  }

  function goTo(target: number, field?: string) {
    const next = Math.max(0, Math.min(target, steps.length - 1));
    if (next !== index) setDirection(next > index ? "forward" : "back");
    setIndex(next);
    setFocusRequest((current) => ({
      field: field ?? primaryField(steps[next]?.key ?? REVIEW),
      n: (current?.n ?? 0) + 1,
    }));
  }

  function primaryField(key: StepKey) {
    return key === REVIEW ? "evidence" : key;
  }

  function next() {
    const found = problems(step.key);
    if (Object.keys(found).length) {
      setErrors((current) => ({ ...current, ...found }));
      setFocusRequest((current) => ({ field: primaryField(step.key), n: (current?.n ?? 0) + 1 }));
      return;
    }
    goTo(index + 1);
  }

  function clear(...names: string[]) {
    if (names.some((name) => errors[name])) {
      setErrors((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !names.includes(name))));
    }
  }

  function set<K extends keyof IdentificationValues>(name: K, value: IdentificationValues[K]) {
    setValues((current) => ({ ...current, [name]: value }));
    clear(name, ...(name === "subject" ? ["target", "org_unit"] : []));
  }

  function chooseTarget(target: Target) {
    setValues((current) => withTarget(current, target));
    clear("subject", "target", "org_unit", "customer", "objective");
  }

  function chooseFile(next: File | null) {
    clear("evidence_file");
    if (!next) return setFile(null);
    const extension = `.${next.name.split(".").pop()?.toLowerCase() ?? ""}`;
    const allowed = data.attachment.accept.split(",");
    const problem = !allowed.includes(extension)
      ? `این نوع فایل پذیرفته نمی‌شود؛ نوع‌های مجاز: ${allowed.map((ext) => ext.slice(1)).join("، ")}.`
      : next.size > data.attachment.max_size
        ? `حجم فایل بیش از ${fileSize(data.attachment.max_size)} است.`
        : null;
    if (problem) {
      setErrors((current) => ({ ...current, evidence_file: [problem] }));
      setFile(null);
      return;
    }
    setFile(next);
  }

  /** همه‌ی گام‌ها پیش از باز کردن پرسش ارسال؛ اولین گام ناقص با فوکوس روی فیلدش باز می‌شود. */
  function trySubmit() {
    const found: Errors = Object.assign({}, ...steps.map((item) => problems(item.key)));
    if (!Object.keys(found).length) {
      setConfirming(true);
      return;
    }
    setErrors((current) => ({ ...current, ...found }));
    setSummary(true);
    showFirstError(found);
  }

  function showFirstError(found: Errors) {
    const names = Object.keys(found).filter((name) => found[name]?.length);
    const ordered = steps.findIndex((item) => names.some((name) => stepOfField(name, parts) === item.key));
    if (ordered < 0) return;
    const key = steps[ordered]?.key ?? REVIEW;
    const field =
      key === REVIEW ? (REVIEW_FIELDS.find((name) => names.includes(name)) ?? "evidence") : primaryField(key);
    goTo(ordered, field);
  }

  const save = useMutation({
    mutationFn: (submit: boolean) => {
      const payload = { values, submit, draft: draft?.id ?? null, remove_attachments: removed };
      if (!file) return post<SaveResult>("identification/", payload);
      const body = new FormData();
      body.set("payload", JSON.stringify(payload));
      body.set("evidence_file", file);
      return post<SaveResult>("identification/", body);
    },
    onSuccess: (result, submit) => {
      setErrors({});
      setSummary(false);
      setConfirming(false);
      setSaved(JSON.stringify(values));
      setFile(null);
      setRemoved([]);
      toast({ title: faText(result.message) });
      if (submit && result.redirect) {
        void queryClient.invalidateQueries({ queryKey: ["identification"] });
        void queryClient.invalidateQueries({ queryKey: ["risks"] });
        navigate(result.redirect);
        return;
      }
      if (result.draft) {
        const id = String(result.draft.id);
        setDraft(result.draft);
        // داده‌ی نشانی تازه همین فرم است، تا با ?draft= دوباره خوانده و از نو ساخته نشود و گام و فوکوس سر جایش بماند.
        queryClient.setQueryData<PageData>(["identification", id], {
          ...data,
          values,
          draft: result.draft,
          recent: result.recent ?? data.recent,
        });
        onDraftSaved(id);
        const nextParams = new URLSearchParams(params);
        nextParams.set("draft", id);
        nextParams.delete("new");
        setParams(nextParams, { replace: true });
      }
    },
    onError: (error) => {
      setConfirming(false);
      if (error instanceof ApiError && error.errors) {
        const found = error.errors as Errors;
        setErrors(found);
        setSummary(true);
        // کاربر به گام همان پرسشی می‌رود که سرور ردش کرده است.
        showFirstError(found);
      } else {
        setErrors({ __all__: [error.message] });
      }
    },
  });

  // Ctrl+S پیش‌نویس را ذخیره می‌کند.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!save.isPending) save.mutate(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const errorList = Object.entries(errors).filter(
    (entry): entry is [string, string[]] => entry[0] !== "__all__" && Boolean(entry[1]?.length),
  );
  const labelOf = (name: string) => FIELD_LABELS[name] ?? parts.find((item) => item.name === name)?.label ?? name;
  const missing = parts.filter((item) => status(item.name) !== "answered");
  const title = riskTitle(values.event, chosen?.service.name ?? null);

  return (
    <div ref={shell} className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <ScenarioTemplate ref={template} values={values} parts={parts} active={step.key} />

      {summary && errorList.length > 0 && (
        <Alert role="alert" tone="danger" title={`${fa(errorList.length)} مورد پیش از ارسال درست شود:`}>
          <ul className="mt-1 flex flex-col gap-1">
            {errorList.map(([name, messages]) => (
              <li key={name}>
                <a
                  href={`#${fieldId(name)}`}
                  className="text-ink underline underline-offset-4 hover:text-danger"
                  onClick={(event) => {
                    event.preventDefault();
                    const key = stepOfField(name, parts);
                    goTo(
                      steps.findIndex((item) => item.key === key),
                      key === REVIEW ? name : primaryField(key),
                    );
                  }}
                >
                  {labelOf(name)}
                </a>
                : {messages.join(" ")}
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

      <Card role="region" aria-labelledby="identification-wizard-title" className="flex flex-col">
        <div className="flex flex-col gap-3 border-b border-line px-4 pt-4 pb-3.5 sm:px-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="identification-wizard-title" className="flex-1 text-h3 font-semibold text-ink">
              پرسش‌های جلسه‌ی شناسایی
            </h2>
            {dirty ? (
              <Chip tone="warning">تغییر ذخیره‌نشده</Chip>
            ) : draft ? (
              <Chip tone="neutral">{`پیش‌نویس · ${dateTime(draft.saved_at)}`}</Chip>
            ) : (
              <Chip tone="neutral">ورودی تازه</Chip>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div
              role="progressbar"
              aria-label="پیشرفت ثبت سناریو"
              aria-valuemin={1}
              aria-valuemax={steps.length}
              aria-valuenow={index + 1}
              aria-valuetext={`گام ${fa(index + 1)} از ${fa(steps.length)}: ${step.label}`}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-line"
            >
              <div
                className="wizard-progress h-full rounded-full bg-brand"
                style={{ transform: `scaleX(${(index + 1) / steps.length})` }}
              />
            </div>
            <span id="identification-step-position" className="shrink-0 text-xs font-medium text-ink-2 tabular">
              {`گام ${fa(index + 1)} از ${fa(steps.length)}`}
            </span>
          </div>
          <StepNav steps={steps} index={index} status={status} onJump={(target) => goTo(target)} />
        </div>

        <div className="overflow-x-clip px-4 py-5 sm:px-5">
          <section key={step.key} className="wizard-step" data-direction={direction} aria-label={step.label}>
            {part ? (
              <QuestionStep
                part={part}
                value={values[part.name]}
                limit={limit}
                messages={stepErrors(part.name)}
                onChange={(value) => set(part.name, value)}
                onEnter={next}
              >
                {part.name === "subject" && (
                  <ServiceSuggestions
                    targets={choices.target}
                    query={values.subject}
                    chosen={chosen}
                    onChoose={chooseTarget}
                    onClear={() => set("target", "")}
                  />
                )}
              </QuestionStep>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-h2 font-semibold text-ink">بازبینی پیش از ارسال</h3>
                  <p className="text-sm text-ink-2">
                    جمله‌ی زیر همان شرحی است که در رجیستر ثبت می‌شود؛ هر جزء را از گام خودش اصلاح کنید.
                  </p>
                </div>
                <figure className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3.5">
                  <figcaption className="text-xs font-medium text-ink-2">جمله‌ی کامل سناریو</figcaption>
                  <blockquote className="text-base leading-8 text-pretty text-ink">{narrative(values)}</blockquote>
                  {title && (
                    <p className="text-xs text-ink-2">
                      عنوان ریسک در رجیستر: <span className="font-medium text-ink">{title}</span>
                    </p>
                  )}
                </figure>
                {missing.length > 0 && (
                  <Alert tone="warning" title={`${fa(missing.length)} پرسش هنوز پاسخ ندارد`}>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {missing.map((item) => (
                        <li key={item.name}>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => goTo(steps.findIndex((entry) => entry.key === item.name))}
                          >
                            {item.token}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </Alert>
                )}
                <Field
                  label="شاهد، تجربه و تغییر اخیر"
                  required
                  hint="شاهد یا فرض قابل آزمون؛ نبود شاهد به معنی رد ریسک نیست."
                  error={errors.evidence}
                  id={fieldId("evidence")}
                >
                  <Textarea
                    rows={3}
                    maxLength={limit}
                    value={values.evidence}
                    onChange={(event) => set("evidence", event.target.value)}
                    className="scroll-mt-[calc(var(--topbar-h)+var(--template-h,10rem)+1.5rem)]"
                  />
                </Field>
                <div className="flex flex-col gap-3">
                  <Field
                    label="پیوست فایل شاهد"
                    hint={`اختیاری؛ تا ${fileSize(data.attachment.max_size)}. فایل با «ذخیره‌ی پیش‌نویس» یا «ارسال» بارگذاری و به ریسک پیوست می‌شود.`}
                    error={errors.evidence_file}
                    id={fieldId("evidence_file")}
                  >
                    <FileInput
                      value={file}
                      onChange={chooseFile}
                      accept={data.attachment.accept}
                      maxSize={data.attachment.max_size}
                    />
                  </Field>
                  <SavedFiles
                    files={draft?.attachments ?? []}
                    removed={removed}
                    onToggle={(id) =>
                      setRemoved((current) =>
                        current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
                      )
                    }
                  />
                  <EvidencePicker
                    choices={choices.evidence}
                    selected={values.evidence_items}
                    onChange={(items) => set("evidence_items", items)}
                    evidenceUrl={data.evidence_url}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="پیامد برای شرکت و مشتری" hint="اختیاری" error={errors.impact} id={fieldId("impact")}>
                    <Input
                      value={values.impact}
                      maxLength={limit}
                      onChange={(event) => set("impact", event.target.value)}
                    />
                  </Field>
                  <Field
                    label="وابستگی و جایگزین"
                    hint="اختیاری"
                    error={errors.dependencies}
                    id={fieldId("dependencies")}
                  >
                    <Input
                      value={values.dependencies}
                      maxLength={limit}
                      onChange={(event) => set("dependencies", event.target.value)}
                    />
                  </Field>
                </div>
                <EntryCriteria values={values} unit={unit} />
              </div>
            )}
          </section>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3.5 sm:px-5">
          <Button variant="outline" size="lg" disabled={index === 0} onClick={() => goTo(index - 1)}>
            <Icon name="arrow-right" className="ltr:rotate-180" />
            قبلی
          </Button>
          <p className="hidden flex-1 items-center gap-1.5 text-xs text-ink-2 lg:flex">
            {step.key !== REVIEW && (
              <>
                <Kbd>Enter</Kbd> گام بعد ·
              </>
            )}
            <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> ذخیره‌ی پیش‌نویس
          </p>
          <div className="ms-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="lg"
              aria-label="ذخیره‌ی پیش‌نویس"
              loading={save.isPending && save.variables === false}
              disabled={save.isPending}
              onClick={() => save.mutate(false)}
              title="Ctrl+S"
            >
              <span aria-hidden className="sm:hidden">
                ذخیره
              </span>
              <span aria-hidden className="hidden sm:inline">
                ذخیره‌ی پیش‌نویس
              </span>
            </Button>
            {step.key === REVIEW ? (
              <Button variant="primary" size="lg" disabled={save.isPending} onClick={trySubmit}>
                ارسال برای شناسایی
                <Icon name="arrow-left" className="ltr:rotate-180" />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={next}>
                بعدی
                <Icon name="arrow-left" className="ltr:rotate-180" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="ورودی برای شناسایی فرستاده شود؟"
        description={
          values.scenario
            ? "ریسک با پیوند به سناریوی مرجع کتابخانه در رجیستر ثبت می‌شود؛ عضو GRC دسته‌ی آن را تعیین می‌کند و برای ارزیابی می‌فرستد یا با پرسش مشخص برمی‌گرداند."
            : "ریسک به‌عنوان «مورد جدید» بدون سناریوی مرجع در رجیستر ثبت می‌شود؛ عضو GRC دسته‌ی آن را تعیین می‌کند و برای ارزیابی می‌فرستد یا با پرسش مشخص برمی‌گرداند."
        }
        confirmLabel="ارسال برای شناسایی"
        loading={save.isPending}
        onConfirm={() => save.mutate(true)}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="تغییرات ذخیره نشده است"
        description="اگر از این صفحه بروید، چیزی که بعد از آخرین ذخیره نوشته‌اید از دست می‌رود."
        cancelLabel="ماندن در صفحه"
        confirmLabel="رفتن بدون ذخیره"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </div>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

export function IdentificationPage() {
  useTitle("شناسایی ریسک");
  const [params] = useSearchParams();
  const draft = params.get("draft") ?? "";
  const fresh = params.get("new") ?? "";
  // رفتن به پیش‌نویس دیگر فرم را از نو می‌سازد؛ پیش‌نویسی که همین فرم ذخیره کرده نه.
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState({ draft, fresh, key: `${draft}-${fresh}` });
  if (formKey.draft !== draft || formKey.fresh !== fresh) {
    const keep = saved === draft && formKey.fresh === fresh;
    setFormKey({ draft, fresh, key: keep ? formKey.key : `${draft}-${fresh}` });
  }
  const query = useQuery({
    queryKey: ["identification", draft],
    queryFn: ({ signal }) => get<PageData>(`identification/${draft ? `?draft=${draft}` : ""}`, signal),
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="شناسایی ریسک"
        description="ثبت سناریو با شش پرسش جلسه‌ی شناسایی طبق الگوی بخش ۴ روش · افق پیش‌فرض ۱۲ ماه · دارایی ورودی اجباری نیست"
        breadcrumb={[{ label: "شناسایی ریسک" }]}
      />
      <Card
        className="overflow-x-auto px-5 py-[0.9375rem]"
        role="region"
        tabIndex={0}
        aria-label="گام‌های فرایند مدیریت ریسک"
      >
        <ProcessSteps steps={PROCESS} className="min-w-[40rem]" />
      </Card>
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          {query.data.can_identify && query.data.choices ? (
            <IdentificationWizard key={formKey.key} data={query.data} onDraftSaved={setSaved} />
          ) : (
            <Alert tone="info" title="ثبت ورودی شناسایی با مدیر واحد و عضو GRC است">
              ورودی‌های اخیری را که به آن‌ها دسترسی دارید پایین همین صفحه می‌بینید.
            </Alert>
          )}
          <RecentEntries rows={query.data.recent} registerUrl={query.data.register_url} />
        </>
      )}
    </div>
  );
}
