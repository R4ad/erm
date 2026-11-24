import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Info, Pencil, Plus, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckboxControl, Field, FieldError, Select, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, errorMessage, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, shortDate } from "@/lib/format";
import type { ReturnOptions } from "@/lib/types";

import { AiChip } from "./AiPanel";

// «بازگرداندن پاسخنامه برای تکمیل» (فریم 12e): پرسش‌های پیشنهادی AI (همه انتخاب‌شده) و پرسش دلخواه، پیام و مهلت به
// روز کاری. هر پرسش با مداد ویرایش می‌شود؛ پرسش دلخواهی که خالی بماند کنار می‌رود و پرسش AI خالی‌شده به پیشنهاد
// برمی‌گردد. متن‌ها از copy.md و جدول تأییدشده‌ی بخش ۱۰ docs/implementation-plan.md است.

const TITLE = "بازگرداندن پاسخنامه برای تکمیل";
const describe = (respondent: string) =>
  `پرسش‌های انتخاب‌شده برای ${respondent} فرستاده می‌شود و وضعیت پاسخنامه «بازگشت برای تکمیل اطلاعات» می‌شود.`;
const DEFAULT_MESSAGE = "لطفاً پرسش‌های زیر را تکمیل کنید تا سناریوهای ریسک این خدمت دقیق‌تر ثبت شوند.";
const TEXT_LIMIT = 1000;

interface Row {
  key: number;
  text: string;
  original: string;
  ref: string;
  about: string;
  source: "ai" | "custom";
  checked: boolean;
  editing: boolean;
}

type Errors = Partial<Record<string, string[]>>;

function initialRows(options: ReturnOptions): Row[] {
  const rows: Row[] = options.suggestions.map((item, index) => ({
    key: index,
    text: item.text,
    original: item.text,
    ref: item.ref,
    about: item.about,
    source: "ai",
    checked: true,
    editing: false,
  }));
  return rows.length > 0 ? rows : [customRow(0)];
}

function customRow(key: number): Row {
  return { key, text: "", original: "", ref: "", about: "", source: "custom", checked: true, editing: true };
}

/** «ریسک تأییدشده‌ی RK-… حفظ می‌شود. ۱ پیش‌نویس بررسی‌نشده بایگانی می‌شود و پس از ارسال دوباره‌ی …». */
function ReturnNote({ approved, pending }: { approved: string[]; pending: number }) {
  const again = "پس از ارسال دوباره‌ی پاسخنامه، شناسایی هوشمند دوباره انجام می‌شود.";
  const codes = approved.map((code, index) => (
    <span key={code}>
      {index > 0 && "، "}
      <bdi className="code">{code}</bdi>
    </span>
  ));
  return (
    <div className="flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-sm leading-[1.375rem] text-ink">
      <Info aria-hidden className="mt-[0.1875rem] size-4 shrink-0 text-info" />
      <p>
        {approved.length === 1 && <>ریسک تأییدشده‌ی {codes} حفظ می‌شود. </>}
        {approved.length > 1 && <>ریسک‌های تأییدشده‌ی {codes} حفظ می‌شوند. </>}
        {pending > 0 ? `${fa(pending)} پیش‌نویس بررسی‌نشده بایگانی می‌شود و ${again}` : again}
      </p>
    </div>
  );
}

interface QuestionRowProps {
  row: Row;
  titleId: string;
  error?: string[];
  onChange: (changes: Partial<Row>) => void;
  onToggleEdit: () => void;
}

function QuestionRow({ row, titleId, error, onChange, onToggleEdit }: QuestionRowProps) {
  const textId = `return-question-${row.key}`;
  const errorId = `${textId}-error`;
  const field = useRef<HTMLTextAreaElement>(null);
  // با زدن مداد (یا افزودن پرسش دلخواه) نشانگر در همان پرسش است.
  useEffect(() => {
    if (row.editing) field.current?.focus();
  }, [row.editing]);
  return (
    <li
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 transition-colors duration-150",
        row.checked ? "border-brand-subtle-strong bg-brand-subtle" : "border-line bg-panel",
      )}
    >
      <CheckboxControl
        checked={row.checked}
        onChange={(event) => onChange({ checked: event.target.checked })}
        aria-labelledby={textId}
        className="rounded-[5px]"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {row.editing ? (
          <Textarea
            ref={field}
            id={textId}
            rows={2}
            value={row.text}
            maxLength={TEXT_LIMIT}
            placeholder="پرسش خود را بنویسید"
            aria-labelledby={titleId}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => onChange({ text: event.target.value })}
            className="min-h-16 resize-none bg-panel"
          />
        ) : (
          <p id={textId} className="text-base text-ink">
            {row.text}
          </p>
        )}
        <FieldError id={errorId} messages={error} />
        {(row.source === "ai" || row.about) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.source === "ai" && <AiChip />}
            {row.about && (
              <span className="inline-flex h-[1.375rem] items-center rounded-full bg-subtle px-2 text-xs text-ink-2">
                {`درباره‌ی ${row.about}`}
              </span>
            )}
          </div>
        )}
      </div>
      <button
        type="button"
        aria-label="ویرایش"
        aria-pressed={row.editing}
        aria-describedby={textId}
        onClick={onToggleEdit}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-md text-ink-2 transition-colors duration-150",
          "hover:bg-panel hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          row.editing && "bg-panel text-brand",
        )}
      >
        <Pencil aria-hidden className="size-3.5" />
      </button>
    </li>
  );
}

interface ReturnFormProps {
  id: string;
  respondent: string;
  options: ReturnOptions;
  onClose: () => void;
  onReturned: () => void;
}

function ReturnForm({ id, respondent, options, onClose, onReturned }: ReturnFormProps) {
  const toast = useToast();
  const titleId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  const nextKey = useRef(options.suggestions.length + 1);
  const [rows, setRows] = useState(() => initialRows(options));
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [days, setDays] = useState(options.default_days);
  const [errors, setErrors] = useState<Errors>({});

  const written = rows.filter((row) => row.text.trim());
  const chosen = written.filter((row) => row.checked);
  const due = options.deadlines.find((item) => item.days === days) ?? options.deadlines[0];

  const send = useMutation({
    mutationFn: () =>
      post(`questionnaire-responses/${id}/return/`, {
        questions: chosen.map((row) => ({ text: row.text.trim(), ref: row.ref, source: row.source })),
        message: message.trim(),
        due_date: due?.date.iso ?? "",
      }),
    onSuccess: onReturned,
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.errors).length > 0) setErrors(error.errors);
      else toast({ title: errorMessage(error), tone: "danger" });
    },
  });

  function update(key: number, changes: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
    if (changes.checked || changes.text) setErrors((current) => ({ ...current, questions: undefined }));
  }

  function toggleEdit(row: Row) {
    if (!row.editing) return update(row.key, { editing: true });
    if (row.text.trim()) return update(row.key, { editing: false });
    if (row.source === "ai") return update(row.key, { editing: false, text: row.original });
    setRows((current) => current.filter((item) => item.key !== row.key));
    addRef.current?.focus();
  }

  function addCustom() {
    setRows((current) => [...current, customRow(nextKey.current++)]);
  }

  function submit() {
    if (chosen.length === 0) {
      setErrors({ questions: ["دست‌کم یک پرسش انتخاب کنید."] });
      return;
    }
    send.mutate();
  }

  // خطای سرور برای پرسش n ام از پرسش‌های فرستاده‌شده است، نه از ردیف‌های فهرست.
  const rowErrors = new Map(chosen.map((row, index) => [row.key, errors[`questions.${index}`]]));

  return (
    <DialogContent
      title={TITLE}
      description={describe(respondent)}
      footer={
        <>
          <p className="me-auto text-xs text-ink-3" aria-live="polite">
            {`${fa(chosen.length)} از ${fa(written.length)} پرسش انتخاب شده`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onClose}>
              انصراف
            </Button>
            <Button variant="primary" loading={send.isPending} onClick={submit}>
              <ArrowLeft aria-hidden className="ltr:rotate-180" />
              {`بازگرداندن با ${fa(chosen.length)} پرسش`}
            </Button>
          </div>
        </>
      }
    >
      <section aria-labelledby={titleId} className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={titleId} className="text-sm font-semibold text-ink">
            پرسش‌های تکمیلی
          </h3>
          {options.suggestions.length > 0 && (
            <p className="flex items-start gap-1.5 text-xs text-ink-3">
              <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-tangerine" />
              پیشنهادهای AI از روی ابهام‌های پاسخنامه ساخته شده‌اند؛ پیش از ارسال می‌توانید ویرایش کنید.
            </p>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <QuestionRow
              key={row.key}
              row={row}
              titleId={titleId}
              error={rowErrors.get(row.key)}
              onChange={(changes) => update(row.key, changes)}
              onToggleEdit={() => toggleEdit(row)}
            />
          ))}
        </ul>
        <button
          ref={addRef}
          type="button"
          onClick={addCustom}
          disabled={rows.length >= options.max_questions}
          className={cn(
            "flex min-h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5",
            "text-sm font-medium text-brand transition-colors duration-150 hover:bg-brand-subtle",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
          )}
        >
          <Plus aria-hidden className="size-4" />
          افزودن پرسش دلخواه
        </button>
        <FieldError messages={errors.questions} />
      </section>
      <Field label="پیام به پاسخ‌دهنده (اختیاری)" error={errors.message?.join(" ")}>
        <Textarea
          rows={2}
          value={message}
          maxLength={TEXT_LIMIT}
          onChange={(event) => setMessage(event.target.value)}
          className="min-h-16 resize-none"
        />
      </Field>
      <Field label="مهلت تکمیل" error={errors.due_date?.join(" ")}>
        <Select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-[2.875rem]">
          {options.deadlines.map((item) => (
            <option key={item.days} value={item.days}>
              {`${fa(item.days)} روز کاری · تا ${shortDate(item.date)}`}
            </option>
          ))}
        </Select>
      </Field>
      <ReturnNote approved={options.approved} pending={options.pending} />
    </DialogContent>
  );
}

interface ReturnDialogProps {
  id: string;
  respondent: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** مودال 12e؛ با بازگرداندن پیام موفقیت می‌آید و سربرگ، ریسک‌ها و تاریخچه‌ی پاسخنامه دوباره خوانده می‌شوند. */
export function ReturnDialog({ open, onOpenChange, ...props }: ReturnDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ReturnBody {...props} onClose={() => onOpenChange(false)} />}
    </Dialog>
  );
}

/** گزینه‌ها با هر باز شدن تازه خوانده می‌شوند (شمار پیش‌نویس‌ها و ریسک‌های تأییدشده عوض می‌شود). */
function ReturnBody({ id, respondent, onClose }: { id: string; respondent: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const options = useQuery({
    queryKey: ["return-options", id],
    queryFn: ({ signal }) => get<ReturnOptions>(`questionnaire-responses/${id}/return-options/`, signal),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  function returned() {
    onClose();
    toast({ title: `پاسخنامه برای تکمیل به ${respondent} بازگردانده شد.`, tone: "success" });
    void queryClient.invalidateQueries({ queryKey: ["response-review", id] });
    void queryClient.invalidateQueries({ queryKey: ["questionnaire-responses"] });
  }

  if (options.data) {
    return (
      <ReturnForm id={id} respondent={respondent} options={options.data} onClose={onClose} onReturned={returned} />
    );
  }
  return (
    <DialogContent
      title={TITLE}
      description={describe(respondent)}
      footer={
        <Button variant="secondary" className="ms-auto" onClick={onClose}>
          انصراف
        </Button>
      }
    >
      {options.isError ? (
        <ErrorState error={options.error} retry={() => void options.refetch()} />
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
        </div>
      )}
    </DialogContent>
  );
}
