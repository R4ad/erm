import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useFormState, useWatch, type FieldPath, type UseFormReturn } from "react-hook-form";
import { useBlocker, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, FieldError, Input, Radio, RequiredMark, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ago, daysLeft, fa, faText } from "@/lib/format";
import type { FixedItem, QuestionItem, ResponseDetail } from "@/lib/types";

import {
  answerField,
  answerKey,
  fieldErrors,
  isAnswered,
  payloadFrom,
  valuesFrom,
  type ResponseValues,
} from "./response-form";

// پاسخ پرسشنامه به چیدمان فیگما ۱۰: پنج گام (کارکردها، هشت پرسش جلسه، سؤال‌های GRC، مورد جدید، مرور و ارسال)، کارت
// هر پرسش با «خروجی مورد انتظار»، ستون پیشرفت و ذخیره‌ی خودکار. پرسش‌های اجباری را جنگو هنگام ارسال دوباره چک می‌کند.

type Form = UseFormReturn<ResponseValues>;
type StepKey = "functions" | "session" | "grc" | "new" | "review";

interface SaveResult {
  message: string;
  response: ResponseDetail;
}

const STEPS: { key: StepKey; label: string }[] = [
  { key: "functions", label: "کارکردها و تعهدها" },
  { key: "session", label: "هشت پرسش جلسه‌ی شناسایی" },
  { key: "grc", label: "سؤال‌های GRC" },
  { key: "new", label: "مورد جدید" },
  { key: "review", label: "مرور و ارسال" },
];

const SHORT: Record<StepKey, string> = {
  functions: "کارکردها و تعهدها",
  session: "هشت پرسش جلسه",
  grc: "سؤال‌های GRC",
  new: "مورد جدید",
  review: "مرور و ارسال",
};

const AUTOSAVE_MS = 2500;

const fixedName = (name: string) => `fixed.${name}` as FieldPath<ResponseValues>;
const lines = (text: string) => text.split("\n").filter((line) => line.trim());

/** شمارش جواب‌ها و اجباری‌های بی‌جواب هر گام از مقدارهای فعلی فرم. */
function tally(response: ResponseDetail, values: ResponseValues) {
  const fixed = values.fixed ?? {};
  const answers = values.answers ?? {};
  const session = response.fixed.filter((item) => item.section === "session");
  const functions = response.fixed.find((item) => item.section === "functions");
  const filled = functions ? Math.min(lines(fixed[functions.name] ?? "").length, response.function_slots) : 0;
  const missing: { step: StepKey; target: string; label: string }[] = [];
  if (functions?.required && filled === 0) {
    missing.push({ step: "functions", target: "field-functions", label: functions.label });
  }
  session.forEach((item, index) => {
    if (item.required && !isAnswered(fixed[item.name])) {
      missing.push({ step: "session", target: `field-${item.name}`, label: `پرسش ${fa(index + 1)} جلسه` });
    }
  });
  response.questions.forEach((question, index) => {
    if (question.required && !isAnswered(answers[answerKey(question)])) {
      missing.push({ step: "grc", target: `question-${question.id}`, label: `سؤال ${fa(index + 1)} GRC` });
    }
  });
  const counts: Record<StepKey, { done: number; total: number } | null> = {
    functions: functions ? { done: filled, total: response.function_slots } : null,
    session: { done: session.filter((item) => isAnswered(fixed[item.name])).length, total: session.length },
    grc: {
      done: response.questions.filter((question) => isAnswered(answers[answerKey(question)])).length,
      total: response.questions.length,
    },
    new: null,
    review: null,
  };
  const done = (counts.functions?.done ?? 0) + (counts.session?.done ?? 0) + (counts.grc?.done ?? 0);
  const total = (counts.functions?.total ?? 0) + (counts.session?.total ?? 0) + (counts.grc?.total ?? 0);
  return { counts, missing, percent: total ? Math.round((done / total) * 100) : 0 };
}

function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), interval);
    return () => window.clearInterval(timer);
  }, [interval]);
  return now;
}

// ─────────────────────────────── کارت پرسش ───────────────────────────────

function ExpectedChip({ text }: { text: string }) {
  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-md bg-gold-subtle px-2 py-0.5 text-xs font-medium text-gold">
      <Icon name="target" size={12} />
      خروجی مورد انتظار: {text}
    </span>
  );
}

function QuestionCard({
  id,
  number,
  answered,
  required,
  title,
  expected,
  invalid,
  children,
}: {
  id: string;
  number: number;
  answered: boolean;
  required: boolean;
  title: ReactNode;
  expected?: string;
  invalid?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "group flex scroll-mt-28 gap-3 rounded-xl border bg-panel p-4 transition-colors sm:p-5",
        invalid
          ? "border-danger/50"
          : "border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/15",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold tabular",
          answered
            ? "bg-success-subtle text-success"
            : "bg-subtle text-ink-2 group-focus-within:bg-brand group-focus-within:text-on-brand",
        )}
      >
        {answered ? <Icon name="check" size={16} /> : fa(number)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <h3 id={`${id}-title`} className="text-sm leading-7 font-semibold text-ink">
            {title}
            {required && (
              <>
                {" "}
                <RequiredMark />
              </>
            )}
            {answered && <span className="sr-only"> (جواب دارد)</span>}
          </h3>
          {expected && <ExpectedChip text={expected} />}
        </div>
        {children}
      </div>
    </section>
  );
}

/** جواب متنی: پرسش جواب‌داده تا وقتی کاربر رویش نرود متن ساده است (فیگما ۱۰). */
function TextAnswer({
  form,
  name,
  limit,
  label,
  attachUrl,
  attachLimit,
  rows = 3,
}: {
  form: Form;
  name: FieldPath<ResponseValues>;
  limit: number;
  label: string;
  attachUrl: string | null;
  attachLimit: number;
  rows?: number;
}) {
  const value = useWatch({ control: form.control, name }) as string | undefined;
  const formState = useFormState({ control: form.control, name });
  const error = form.getFieldState(name, formState).error?.message as string | undefined;
  const text = typeof value === "string" ? value : "";
  const [editing, setEditing] = useState(() => !text.trim());
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const focusNext = useRef(false);
  useEffect(() => {
    if (editing && focusNext.current) {
      focusNext.current = false;
      ref.current?.focus();
    }
  }, [editing]);
  const errorId = `${name}-error`;
  const { ref: register, ...field } = form.register(name, {
    onBlur: (event: { target: { value: string } }) => {
      if (event.target.value.trim()) setEditing(false);
    },
  });

  if (!editing && !error && text.trim()) {
    return (
      <button
        type="button"
        onClick={() => {
          focusNext.current = true;
          setEditing(true);
        }}
        className="rounded-md text-start text-sm leading-7 whitespace-pre-line text-ink-2 hover:text-ink"
      >
        {text}
        <span className="sr-only"> — ویرایش جواب {label}</span>
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Textarea
          rows={rows}
          maxLength={limit}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="pb-7"
          {...field}
          ref={(element) => {
            register(element);
            ref.current = element;
          }}
        />
        <span className="pointer-events-none absolute bottom-2 start-3 text-xs text-ink-3 tabular" aria-hidden>
          {fa(text.length)} / {fa(limit)} نویسه
        </span>
      </div>
      <FieldError id={errorId} messages={error ? [error] : undefined} />
      {attachUrl && (
        <AppLink href={attachUrl} className="inline-flex w-fit items-center gap-1 text-xs">
          <Icon name="paperclip" size={14} />
          افزودن پیوست (اختیاری) · حداکثر {fa(attachLimit)} مگابایت
        </AppLink>
      )}
    </div>
  );
}

function ChoiceAnswer({ form, question }: { form: Form; question: QuestionItem }) {
  const name = answerField(question);
  const formState = useFormState({ control: form.control, name });
  const error = form.getFieldState(name, formState).error?.message as string | undefined;
  const value = useWatch({ control: form.control, name });
  const multiple = question.kind === "multiple";
  const errorId = `question-${question.id}-error`;
  return (
    <div
      role={multiple ? "group" : "radiogroup"}
      aria-labelledby={`question-${question.id}-title`}
      aria-required={!multiple && question.required ? true : undefined}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-2"
    >
      <div className={cn("grid gap-2", multiple || question.kind === "yes_no" ? "sm:grid-cols-2" : "grid-cols-1")}>
        {question.options.map((option) =>
          multiple ? (
            <Checkbox key={option.id} card label={option.text} value={String(option.id)} {...form.register(name)} />
          ) : (
            <Radio key={option.id} card label={option.text} value={String(option.id)} {...form.register(name)} />
          ),
        )}
      </div>
      {!multiple && !question.required && value && (
        <Button
          variant="link"
          size="sm"
          className="w-fit text-xs"
          onClick={() => form.setValue(name, "", { shouldDirty: true })}
        >
          پاک کردن جواب
        </Button>
      )}
      <FieldError id={errorId} messages={error ? [error] : undefined} />
    </div>
  );
}

// ─────────────────────────────── گام‌ها ───────────────────────────────

function FunctionsStep({ form, item, slots }: { form: Form; item: FixedItem; slots: number }) {
  const name = fixedName(item.name);
  const value = (useWatch({ control: form.control, name }) as string | undefined) ?? "";
  const formState = useFormState({ control: form.control, name });
  const error = form.getFieldState(name, formState).error?.message as string | undefined;
  const rows = value.split("\n");
  const filled = lines(value).length;
  function setLine(index: number, text: string) {
    const next = Array.from({ length: slots }, (_, i) => (i === index ? text : (rows[i] ?? "")));
    while (next.length && !next[next.length - 1]?.trim()) next.pop();
    form.setValue(name, next.join("\n"), { shouldDirty: true });
  }
  return (
    <QuestionCard
      id="field-functions"
      number={1}
      answered={filled > 0}
      required={item.required}
      title={item.label}
      expected={item.expected}
      invalid={Boolean(error)}
    >
      <p className="text-xs text-ink-3">{item.help}</p>
      <ol className="flex flex-col gap-2">
        {Array.from({ length: slots }, (_, index) => (
          <li key={index} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-xs text-ink-3">کارکرد {fa(index + 1)}</span>
            <Input
              aria-label={`کارکرد ${fa(index + 1)}`}
              maxLength={200}
              value={rows[index] ?? ""}
              aria-invalid={error && index === 0 ? true : undefined}
              onChange={(event) => setLine(index, event.target.value.replace(/\n/g, " "))}
            />
          </li>
        ))}
      </ol>
      <FieldError messages={error ? [error] : undefined} />
    </QuestionCard>
  );
}

function SessionStep({ form, response }: { form: Form; response: ResponseDetail }) {
  const items = response.fixed.filter((item) => item.section === "session");
  const values = useWatch({ control: form.control, name: "fixed" }) ?? {};
  return (
    <ol className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li key={item.name}>
          <QuestionCard
            id={`field-${item.name}`}
            number={index + 1}
            answered={isAnswered(values[item.name])}
            required={item.required}
            title={item.label}
            expected={item.expected}
          >
            <TextAnswer
              form={form}
              name={fixedName(item.name)}
              limit={response.text_limit}
              label={item.label}
              attachUrl={response.attach_url}
              attachLimit={response.attach_limit_mb}
            />
          </QuestionCard>
        </li>
      ))}
    </ol>
  );
}

function GrcStep({ form, response }: { form: Form; response: ResponseDetail }) {
  const answers = useWatch({ control: form.control, name: "answers" }) ?? {};
  if (!response.questions.length) {
    return (
      <p className="rounded-xl border border-line bg-panel p-5 text-sm text-ink-3">این پرسشنامه سؤال GRC ندارد.</p>
    );
  }
  return (
    <ol className="flex flex-col gap-3">
      {response.questions.map((question, index) => (
        <li key={question.id}>
          <QuestionCard
            id={`question-${question.id}`}
            number={index + 1}
            answered={isAnswered(answers[answerKey(question)])}
            required={question.required}
            title={
              <>
                {question.text}
                {question.kind === "multiple" && <span className="font-normal text-ink-3"> (چند انتخاب)</span>}
              </>
            }
          >
            {question.help && <p className="text-xs text-ink-3">{question.help}</p>}
            {question.kind === "text" ? (
              <TextAnswer
                form={form}
                name={answerField(question)}
                limit={response.text_limit}
                label={question.text}
                attachUrl={response.attach_url}
                attachLimit={response.attach_limit_mb}
              />
            ) : (
              <ChoiceAnswer form={form} question={question} />
            )}
          </QuestionCard>
        </li>
      ))}
    </ol>
  );
}

function NewItemStep({ form, response }: { form: Form; response: ResponseDetail }) {
  const value = useWatch({ control: form.control, name: "new_item" });
  return (
    <QuestionCard
      id="field-new_item"
      number={1}
      answered={isAnswered(value)}
      required={false}
      title="ریسک دیگری که در پرسش‌ها نیامد"
      expected="جمله‌ی ریسک با الگوی روش"
    >
      <p className="text-xs leading-5 text-ink-3">{response.new_item.help}</p>
      <TextAnswer
        form={form}
        name="new_item"
        limit={response.text_limit}
        label="شرح ریسک تازه"
        attachUrl={null}
        attachLimit={response.attach_limit_mb}
        rows={5}
      />
    </QuestionCard>
  );
}

function answerText(question: QuestionItem, value: string | string[] | undefined) {
  if (question.kind === "text") return typeof value === "string" ? value : "";
  const ids = (Array.isArray(value) ? value : value ? [value] : []).map(Number);
  return question.options
    .filter((option) => ids.includes(option.id))
    .map((option) => option.text)
    .join("، ");
}

function ReviewList({
  title,
  items,
  onEdit,
}: {
  title: string;
  items: { key: string; label: string; value: string; required: boolean }[];
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col pt-4 gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Icon name="pencil" size={14} />
            ویرایش
          </Button>
        </div>
        <dl className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <div key={item.key} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-xs text-ink-3">{item.label}</dt>
              <dd className="text-sm whitespace-pre-line text-ink">
                {item.value.trim() || (
                  <span className={item.required ? "text-danger" : "text-ink-3"}>
                    {item.required ? "اجباری، بی‌جواب" : "بی‌جواب"}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ReviewStep({ form, response, go }: { form: Form; response: ResponseDetail; go: (step: StepKey) => void }) {
  const values = useWatch({ control: form.control }) as ResponseValues;
  const fixed = values.fixed ?? {};
  const answers = values.answers ?? {};
  return (
    <div className="flex flex-col gap-3">
      {response.fixed
        .filter((item) => item.section === "functions")
        .map((item) => (
          <ReviewList
            key={item.name}
            title={SHORT.functions}
            onEdit={() => go("functions")}
            items={[{ key: item.name, label: item.label, value: fixed[item.name] ?? "", required: item.required }]}
          />
        ))}
      <ReviewList
        title={SHORT.session}
        onEdit={() => go("session")}
        items={response.fixed
          .filter((item) => item.section === "session")
          .map((item) => ({
            key: item.name,
            label: item.label,
            value: fixed[item.name] ?? "",
            required: item.required,
          }))}
      />
      {response.questions.length > 0 && (
        <ReviewList
          title={SHORT.grc}
          onEdit={() => go("grc")}
          items={response.questions.map((question) => ({
            key: String(question.id),
            label: question.text,
            value: answerText(question, answers[answerKey(question)]),
            required: question.required,
          }))}
        />
      )}
      <ReviewList
        title={SHORT.new}
        onEdit={() => go("new")}
        items={[{ key: "new_item", label: "ریسک تازه", value: values.new_item ?? "", required: false }]}
      />
      {response.attachments.length > 0 && (
        <Card>
          <CardContent className="flex flex-col pt-4 gap-2">
            <h3 className="text-sm font-semibold text-ink">پیوست‌ها</h3>
            <ul className="flex flex-col gap-1.5 text-sm">
              {response.attachments.map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-1.5">
                  <Icon name="paperclip" size={14} className="text-ink-3" />
                  <a href={attachment.href} className="text-brand hover:underline">
                    <bdi>{attachment.name}</bdi>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      <p className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-4 py-3 text-xs leading-5 text-ink-2">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
        با ارسال، از گزینه‌هایی که نشانه‌ی ریسک‌اند و از «مورد جدید» ریسک در انتظار ساخته می‌شود و عضو GRC تکلیفشان را
        تعیین می‌کند.
      </p>
    </div>
  );
}

// ─────────────────────────────── سرصفحه، گام‌نما و ستون کناری ───────────────────────────────

function SaveChip({
  saving,
  dirty,
  failed,
  saved,
}: {
  saving: boolean;
  dirty: boolean;
  failed: boolean;
  saved: string;
}) {
  if (saving) return <Badge tone="neutral">در حال ذخیره…</Badge>;
  if (failed) return <Badge tone="danger">ذخیره نشد</Badge>;
  if (dirty) return <Badge tone="warning">تغییرات ذخیره نشده</Badge>;
  return <Badge tone="success">ذخیره‌ی خودکار {saved}</Badge>;
}

function Stepper({
  step,
  counts,
  percent,
  onSelect,
}: {
  step: StepKey;
  counts: ReturnType<typeof tally>["counts"];
  percent: number;
  onSelect: (step: StepKey) => void;
}) {
  // در صفحه‌ی باریک گام‌نما افقی اسکرول می‌شود؛ گام جاری فقط افقی در دید آورده می‌شود (صفحه عمودی جابه‌جا نمی‌شود).
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const container = list.current;
    const current = container?.querySelector<HTMLElement>("[aria-current=step]");
    if (!container || !current) return;
    const box = container.getBoundingClientRect();
    const item = current.getBoundingClientRect();
    if (item.left < box.left) container.scrollLeft -= box.left - item.left;
    else if (item.right > box.right) container.scrollLeft += item.right - box.right;
  }, [step]);
  return (
    <Card className="flex flex-col gap-3 p-3 sm:p-4">
      <ol ref={list} aria-label="گام‌های پاسخ" className="flex gap-2 overflow-x-auto">
        {STEPS.map((item, index) => {
          const current = item.key === step;
          const count = counts[item.key];
          const complete = Boolean(count && count.total > 0 && count.done === count.total);
          return (
            <li key={item.key} className="flex-1">
              <button
                type="button"
                aria-current={current ? "step" : undefined}
                onClick={() => onSelect(item.key)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start transition-colors",
                  current ? "bg-brand-subtle" : "hover:bg-subtle",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    complete && !current
                      ? "bg-success-subtle text-success"
                      : current
                        ? "bg-brand text-on-brand"
                        : "bg-subtle text-ink-2",
                  )}
                >
                  {complete && !current ? <Icon name="check" size={14} /> : fa(index + 1)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={cn("truncate text-sm", current ? "font-semibold text-brand" : "font-medium text-ink")}
                  >
                    {item.label}
                  </span>
                  {item.key !== "review" && (
                    <span className="text-xs text-ink-3">
                      {count ? `${fa(count.done)} از ${fa(count.total)}` : "اختیاری"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3 px-1">
        <span className="shrink-0 text-xs text-ink-3">پیشرفت کل</span>
        <div
          role="progressbar"
          aria-label="پیشرفت کل پاسخ"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle"
        >
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium text-ink-2 tabular">{fa(percent)}٪</span>
      </div>
    </Card>
  );
}

function SideProgress({
  step,
  counts,
  missing,
  newItem,
}: {
  step: StepKey;
  counts: ReturnType<typeof tally>["counts"];
  missing: ReturnType<typeof tally>["missing"];
  newItem: boolean;
}) {
  const here = missing.filter((item) => item.step === step).length;
  return (
    <Card>
      <CardContent className="flex flex-col pt-4 gap-3.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold text-ink">پیشرفت پاسخ</h2>
          <p className="text-xs text-ink-3">ارسال بدون پاسخ سؤال‌های اجباری پذیرفته نمی‌شود</p>
        </div>
        <ul className="flex flex-col gap-3">
          {STEPS.filter((item) => item.key !== "review").map((item) => {
            const count = counts[item.key];
            const percent = count ? (count.total ? (count.done / count.total) * 100 : 100) : newItem ? 100 : 0;
            return (
              <li key={item.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink">{SHORT[item.key]}</span>
                  <span className="text-ink-2 tabular">
                    {count ? `${fa(count.done)} از ${fa(count.total)}` : "اختیاری"}
                  </span>
                </div>
                <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-subtle">
                  <div
                    className={cn("h-full rounded-full", percent === 100 ? "bg-success" : "bg-brand")}
                    style={{ width: `${Math.max(percent, 2)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        {here > 0 && (
          <p className="flex items-center gap-1.5 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning">
            <Icon name="warning" size={14} />
            {fa(here)} سؤال اجباری در این بخش باقی مانده است.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BeforeSubmit() {
  const notes = [
    "پاسخ برای یک واحد و در صورت نیاز یک خدمت همان واحد است؛ برای هر پرسشنامه، واحد و خدمت فقط یک پاسخ باز وجود دارد.",
    "با ارسال، از گزینه‌هایی که نشانه‌ی ریسک‌اند و از «مورد جدید» ریسک در انتظار ساخته می‌شود.",
    "بعد از ارسال، پاسخ فقط وقتی ویرایش می‌شود که عضو GRC آن را با یک سؤال مشخص برگرداند.",
  ];
  return (
    <Card>
      <CardContent className="flex flex-col pt-4 gap-3">
        <h2 className="text-sm font-semibold text-ink">پیش از ارسال بدانید</h2>
        <ul className="flex flex-col gap-2.5">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2 text-xs leading-5 text-ink-2">
              <Icon name="info" size={14} className="mt-0.5 shrink-0 text-ink-3" />
              {note}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

const INTRO: Record<StepKey, string> = {
  functions: "سه تا پنج کارکرد اصلی و تعهدهای قابل مشاهده‌ی واحد؛ پرسش‌های بعدی درباره‌ی همین‌هاست.",
  session: "خروجی مورد انتظار هر پرسش راهنمای پاسخ است. فهرست دارایی و نام تهدید شرط جواب دادن نیست.",
  grc: "سؤال‌هایی که عضو GRC برای این پرسشنامه طراحی کرده است. پیش‌نویس بی‌جواب هم ذخیره می‌شود.",
  new: "هر ریسک دیگری که در پرسش‌ها نیامده است، با شرح آزاد.",
  review: "پیش از ارسال جواب‌ها را مرور کنید. بعد از ارسال، پاسخ فقط با برگشت عضو GRC ویرایش می‌شود.",
};

export function ResponseWizard({ response, id }: { response: ResponseDetail; id: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const form = useForm<ResponseValues>({ defaultValues: valuesFrom(response) });
  const values = useWatch({ control: form.control }) as ResponseValues;
  const { counts, missing, percent } = tally(response, values);
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<{ label: string; target: string; step: StepKey; message: string }[]>([]);
  const [general, setGeneral] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // آخرین مقدار ذخیره‌شده؛ «ذخیره نشده» یعنی فرم با آن فرق دارد. فرم بعد از ذخیره reset نمی‌شود تا چیزی که کاربر
  // در فاصله‌ی ذخیره‌ی خودکار نوشته دست نخورد.
  const [saved, setSaved] = useState(() => JSON.stringify(valuesFrom(response)));
  const dirty = JSON.stringify(values) !== saved;
  const now = useNow();

  // بی‌پارامتر، صفحه روی نخستین گامی باز می‌شود که اجباری بی‌جواب دارد؛ این گام با پر شدن جواب‌ها عوض نمی‌شود.
  const [opening] = useState<StepKey>(() => missing[0]?.step ?? "functions");
  const requested = params.get("step");
  const step: StepKey = STEPS.find((item) => item.key === requested)?.key ?? opening;
  const index = STEPS.findIndex((item) => item.key === step);
  const prev = STEPS[index - 1];
  const next = STEPS[index + 1];

  // تمرکز بعد از رندر گام تازه جابه‌جا می‌شود (نه با تأخیر)، تا فوکوس فیلدی را که کاربر همان لحظه رویش رفته نگیرد.
  const pending = useRef<{ step: StepKey; focus?: string } | null>(null);
  const [navigations, setNavigations] = useState(0);
  function go(target: StepKey, focus?: string) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("step", target);
    setParams(nextParams, { replace: true });
    pending.current = { step: target, focus };
    setNavigations((count) => count + 1);
  }
  useEffect(() => {
    const target = pending.current;
    if (!target || target.step !== step) return;
    pending.current = null;
    if (target.focus) {
      const element = document.getElementById(target.focus);
      element?.scrollIntoView?.({ block: "center" });
      element?.querySelector<HTMLElement>("textarea, input, button")?.focus({ preventScroll: true });
    } else {
      window.scrollTo?.({ top: 0 });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [step, navigations]);

  const save = useMutation({
    mutationFn: ({ sent, submit }: { sent: ResponseValues; submit: boolean; silent?: boolean }) =>
      put<SaveResult>(`responses/${id}/`, payloadFrom(sent, response.questions, submit)),
    onSuccess: (result, { sent, submit, silent }) => {
      queryClient.setQueryData(["response", id], result.response);
      void queryClient.invalidateQueries({ queryKey: ["answer-home"] });
      void queryClient.invalidateQueries({ queryKey: ["my-work"] });
      setSaved(JSON.stringify(sent));
      // ذخیره‌ی بی‌صدا به پنجره‌ی تأیید و فهرست خطاهای باز دست نمی‌زند.
      if (silent) return;
      setSummary([]);
      setGeneral(null);
      setConfirming(false);
      toast({ title: faText(result.message), description: submit ? "عضو GRC پاسخ را بررسی می‌کند." : undefined });
    },
    onError: (error, { silent }) => {
      if (silent) return;
      setConfirming(false);
      if (!(error instanceof ApiError)) {
        setGeneral(error.message);
        return;
      }
      if (error.data.response) {
        queryClient.setQueryData(["response", id], error.data.response as ResponseDetail);
        setSaved(JSON.stringify(form.getValues()));
      }
      const mapped = fieldErrors(error.errors, response);
      for (const [name, message] of mapped)
        form.setError(name as FieldPath<ResponseValues>, { type: "server", message });
      setGeneral(error.errors.__all__?.join(" ") ?? (mapped.length ? null : error.message));
      showSummary(mapped.map(([name, message]) => ({ ...locate(name), message })));
    },
  });

  function locate(name: string): { label: string; target: string; step: StepKey } {
    const question = response.questions.findIndex((item) => answerField(item) === name);
    const item = response.questions[question];
    if (item) return { label: `سؤال ${fa(question + 1)} GRC`, target: `question-${item.id}`, step: "grc" };
    if (name === "new_item") return { label: "ریسک تازه", target: "field-new_item", step: "new" };
    const fixed = name.replace(/^fixed\./, "");
    if (fixed === "functions") return { label: "کارکردها", target: "field-functions", step: "functions" };
    const session = response.fixed.filter((item) => item.section === "session");
    const at = session.findIndex((item) => item.name === fixed);
    return { label: at >= 0 ? `پرسش ${fa(at + 1)} جلسه` : fixed, target: `field-${fixed}`, step: "session" };
  }

  function showSummary(items: { label: string; target: string; step: StepKey; message: string }[]) {
    setSummary(items);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function saveDraft(silent = false) {
    if (!silent) {
      form.clearErrors();
      setSummary([]);
    }
    save.mutate({ sent: form.getValues(), submit: false, silent });
  }

  function requestSubmit() {
    form.clearErrors();
    if (missing.length) {
      for (const item of missing) {
        const question = response.questions.find((entry) => `question-${entry.id}` === item.target);
        const name = question ? answerField(question) : fixedName(item.target.replace(/^field-/, ""));
        form.setError(name, { type: "required", message: "این پرسش اجباری است و جواب لازم دارد." });
      }
      setGeneral(null);
      showSummary(missing.map((item) => ({ ...item, message: "اجباری است و جواب ندارد" })));
      return;
    }
    setSummary([]);
    setConfirming(true);
  }

  // ذخیره‌ی خودکار: چند ثانیه بعد از آخرین تغییر، پیش‌نویس بی‌صدا ذخیره می‌شود.
  useEffect(() => {
    if (!dirty || save.isPending) return;
    const timer = window.setTimeout(() => saveDraft(true), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  });

  // Ctrl+S پیش‌نویس را ذخیره می‌کند، مثل هر ویرایشگری.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!save.isPending) saveDraft();
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

  const functions = response.fixed.find((item) => item.section === "functions");
  const interview = response.channel.value === "interview";
  const unit = response.org_unit.startsWith("واحد") ? response.org_unit : `واحد ${response.org_unit}`;
  const title = `${response.questionnaire.title} — ${unit}`;

  return (
    <article className="flex flex-col gap-5">
      <Breadcrumb items={[{ label: "شناسایی ریسک", to: "/identification" }, { label: response.questionnaire.title }]} />
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={response.status.value === "returned" ? "warning" : "neutral"}>{response.status.label}</Badge>
            <Badge tone="info">کانال: {response.channel.label}</Badge>
            <SaveChip saving={save.isPending} dirty={dirty} failed={save.isError} saved={ago(response.saved_at, now)} />
          </div>
          <h1 className="text-h1 font-bold text-ink">{title}</h1>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            <div className="flex items-center gap-1.5">
              <Icon name="user" size={16} className="text-ink-3" />
              <dt className="text-ink-3">پاسخ‌دهنده:</dt>
              <dd className="font-medium text-ink">
                {response.respondent?.name}
                {response.respondent_title && ` (${response.respondent_title})`}
              </dd>
            </div>
            {response.service_name && (
              <div className="flex items-center gap-1.5">
                <Icon name="layers" size={16} className="text-ink-3" />
                <dt className="text-ink-3">خدمت:</dt>
                <dd className="font-medium text-ink">{response.service_name}</dd>
              </div>
            )}
            {response.due && (
              <div className="flex items-center gap-1.5">
                <Icon name="clock" size={16} className="text-ink-3" />
                <dt className="text-ink-3">مهلت:</dt>
                <dd className={cn("font-medium", response.due.overdue ? "text-danger" : "text-ink")}>
                  {response.status.value === "draft" ? "۵ روز کاری، " : ""}
                  {daysLeft(response.due)}
                </dd>
              </div>
            )}
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-row-reverse">
          <Button
            variant="outline"
            loading={save.isPending && !save.variables?.silent && !save.variables?.submit}
            disabled={save.isPending}
            onClick={() => saveDraft()}
            title="Ctrl+S"
          >
            ذخیره‌ی پیش‌نویس
          </Button>
          <Button variant="ghost" onClick={() => go("review")}>
            <Icon name="eye" size={18} />
            پیش‌نمایش
          </Button>
        </div>
      </header>

      {interview && (
        <p className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm text-info">
          <Icon name="chat" size={18} className="mt-0.5 shrink-0" />
          {response.recorded_by?.name} (عضو GRC) پاسخ‌های جلسه‌ی مصاحبه را به نام {response.respondent?.name} ثبت
          می‌کند؛ پاسخ مال همین واحد{response.service_name ? " و همین خدمت" : ""} است.
        </p>
      )}
      {response.return_question && (
        <Alert tone="warning" title="سؤال عضو GRC برای تکمیل پاسخ">
          <p className="whitespace-pre-line">{response.return_question}</p>
        </Alert>
      )}

      <Stepper step={step} counts={counts} percent={percent} onSelect={(target) => go(target)} />

      {summary.length > 0 && (
        <Alert
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          tone="danger"
          className="outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          title={`${fa(summary.length)} مورد پیش از ارسال درست شود:`}
        >
          <ul className="mt-1 flex flex-col gap-1">
            {summary.map((item) => (
              <li key={item.target}>
                <a
                  href={`#${item.target}`}
                  className="text-ink underline underline-offset-4 hover:text-danger"
                  onClick={(event) => {
                    event.preventDefault();
                    go(item.step, item.target);
                  }}
                >
                  {item.label}
                </a>
                : {item.message}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {general && (
        <Alert tone="danger" role="alert">
          {faText(general)}
        </Alert>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          requestSubmit();
        }}
        className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 ref={headingRef} tabIndex={-1} className="text-h3 font-bold text-ink outline-none">
              {STEPS[index]?.label}
            </h2>
            <p className="text-sm text-ink-2">{INTRO[step]}</p>
          </div>
          {step === "functions" && functions && (
            <FunctionsStep form={form} item={functions} slots={response.function_slots} />
          )}
          {step === "session" && <SessionStep form={form} response={response} />}
          {step === "grc" && <GrcStep form={form} response={response} />}
          {step === "new" && <NewItemStep form={form} response={response} />}
          {step === "review" && <ReviewStep form={form} response={response} go={(target) => go(target)} />}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            {prev ? (
              <Button variant="link" onClick={() => go(prev.key)}>
                <Icon name="arrow-right" size={18} className="rtl:rotate-0 ltr:rotate-180" />
                قبلی: {SHORT[prev.key]}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button variant="primary" onClick={() => go(next.key)}>
                بعدی: {SHORT[next.key]}
                <Icon name="arrow-left" size={18} className="ltr:rotate-180" />
              </Button>
            ) : (
              <Button type="submit" variant="primary" disabled={save.isPending && !save.variables?.silent}>
                <Icon name="check-circle" size={18} />
                ارسال برای بررسی
              </Button>
            )}
          </div>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24" aria-label="پیشرفت و راهنما">
          <SideProgress step={step} counts={counts} missing={missing} newItem={isAnswered(values.new_item)} />
          <BeforeSubmit />
        </aside>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="پاسخ برای بررسی فرستاده شود؟"
        description="بعد از ارسال، پاسخ تا وقتی عضو GRC آن را برای تکمیل برنگرداند قابل ویرایش نیست. ریسک‌های در انتظار از گزینه‌های «نشانه‌ی ریسک» و «مورد جدید» ساخته می‌شوند."
        confirmLabel="ارسال برای بررسی"
        loading={save.isPending}
        onConfirm={() => save.mutate({ sent: form.getValues(), submit: true })}
      />
      <ConfirmDialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => !open && blocker.reset?.()}
        title="تغییرات ذخیره نشده است"
        description="اگر از این صفحه بروید، جواب‌هایی که بعد از آخرین ذخیره نوشته‌اید از دست می‌رود."
        cancelLabel="ماندن در صفحه"
        confirmLabel="رفتن بدون ذخیره"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
      />
    </article>
  );
}
