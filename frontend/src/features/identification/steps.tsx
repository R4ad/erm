import { useRef, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { FieldError, Input, RequiredMark } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip } from "@/components/ui/section-panel";
import { cn } from "@/lib/cn";
import { fa, fileSize } from "@/lib/format";
import { useDebouncedValue } from "@/lib/hooks";
import type {
  IdentificationAttachment,
  IdentificationChoices,
  IdentificationPart,
  IdentificationValues,
} from "@/lib/types";

import {
  entryChecks,
  errorId,
  fieldId,
  matchTargets,
  narrative,
  type PartName,
  type StepKey,
  type Target,
  type Unit,
} from "./identification";
import { WIZARD } from "./modes";

// جزءهای ویزارد شناسایی که «شناسایی ریسک» و «پاسخ به پرسشنامه‌ها» هر دو دارند: الگوی چسبان سناریو، گام‌نما، پیشنهاد
// خدمت (فقط در شناسایی)، گام هر پرسش، «شرط پذیرش ورودی»، پیوند شاهد و فایل‌های پیش‌نویس.

const SUGGESTIONS_SHOWN = 6;

export interface Step {
  key: StepKey;
  /** نام کوتاه گام، همان نشانه‌ی جزء در جمله. */
  label: string;
}

// ─────────────────────────────── الگوی ثبت سناریو ───────────────────────────────

export function ScenarioTemplate({
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

export type StepStatus = "answered" | "empty" | "error";

export function StepNav({
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

export function ServiceSuggestions({
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

export function QuestionStep({
  part,
  value,
  limit,
  messages,
  required,
  hint,
  onChange,
  onEnter,
  children,
}: {
  part: IdentificationPart;
  value: string;
  limit: number;
  messages: string[];
  /** پرسش اول در «شناسایی ریسک» با انتخاب خدمت پاسخ داده می‌شود و خودش اجباری نیست. */
  required: boolean;
  hint: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  children?: ReactNode;
}) {
  const id = fieldId(part.name);
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
        {hint}
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

export function EntryCriteria({ values, unit }: { values: IdentificationValues; unit: Unit | null }) {
  const owner = unit?.owner?.name ?? null;
  const { checks, evidence, met, total } = entryChecks(values, owner);
  return (
    <section aria-labelledby="identification-entry-title" className="flex flex-col gap-3 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-2">
        <h4 id="identification-entry-title" className="flex-1 text-h3 font-semibold text-ink">
          شرط پذیرش ورودی
        </h4>
        <Chip tone={met === total ? "success" : "warning"}>{`${fa(met)} از ${fa(total)}`}</Chip>
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
      <p className="text-xs text-ink-2">{WIZARD.unitLine(unit)}</p>
      <p className="text-xs text-ink-2">{WIZARD.footer}</p>
    </section>
  );
}

export function EvidencePicker({
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

export function SavedFiles({
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
