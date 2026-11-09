import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleDot, ClipboardList, FilePlus2, Hourglass, ListChecks, Save, Send } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useFormState, useWatch, type FieldPath, type UseFormReturn } from "react-hook-form";
import { useBlocker, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClassicLink } from "@/components/ui/classic-link";
import { Deadline } from "@/components/ui/deadline";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Field, FieldError, Radio, RequiredMark, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, get, put } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, faText, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { QuestionItem, ResponseDetail, TextItem } from "@/lib/types";

import {
  answerField,
  answerKey,
  fieldErrors,
  isAnswered,
  payloadFrom,
  submitSchema,
  valuesFrom,
  type ResponseValues,
} from "./response-form";
import { ResponseStatus } from "./status";
import { StructuredResponse } from "./StructuredResponse";

interface SaveResult {
  message: string;
  response: ResponseDetail;
}

type Form = UseFormReturn<ResponseValues>;

// بخش‌های فرم کامپوننت جدا هستند و همان شیء form را می‌گیرند که هیچ‌وقت عوض نمی‌شود، و react-hook-form شیء
// خطاها را درجا تغییر می‌دهد؛ React Compiler با این دو، خطا و مقدار قبلی را از حافظه نشان می‌داد. پس هر بخش
// به خطای فیلد خودش با useFormState مشترک می‌شود و آن را با getFieldState می‌خواند، و مقدار را با useWatch.

function QuestionField({ question, number, form }: { question: QuestionItem; number: number; form: Form }) {
  const name = answerField(question);
  const id = `question-${question.id}`;
  const formState = useFormState({ control: form.control, name });
  const error = form.getFieldState(name, formState).error?.message;
  const value = useWatch({ control: form.control, name });
  const label = (
    <span className="flex items-start gap-3">
      <span
        aria-hidden
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-surface text-xs font-semibold text-muted tabular"
      >
        {formatNumber(number)}
      </span>
      <span className="flex-1 text-sm leading-7 font-medium text-fg">
        <span className="sr-only">سؤال {formatNumber(number)}: </span>
        {question.text}
      </span>
      {question.required && <RequiredMark />}
    </span>
  );

  if (question.kind === "text") {
    return (
      <div id={id} className="scroll-mt-28">
        <Field label={label} hint={question.help || undefined} error={error} required={false} id={`${id}-input`}>
          <Textarea rows={3} {...form.register(name)} />
        </Field>
      </div>
    );
  }

  const multiple = question.kind === "multiple";
  const helpId = question.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div
      id={id}
      role={multiple ? "group" : "radiogroup"}
      aria-labelledby={`${id}-label`}
      aria-describedby={[helpId, errorId].filter(Boolean).join(" ") || undefined}
      aria-required={!multiple && question.required ? true : undefined}
      aria-invalid={error ? true : undefined}
      className="flex scroll-mt-28 flex-col gap-2.5"
    >
      <div id={`${id}-label`}>{label}</div>
      {question.help && (
        <p id={helpId} className="ps-10 text-xs text-muted">
          {question.help}
        </p>
      )}
      {multiple && <p className="ps-10 text-xs text-muted">هر چند گزینه که درست است را انتخاب کنید.</p>}
      <div className="grid gap-2 ps-10 sm:grid-cols-2">
        {question.options.map((option) =>
          multiple ? (
            <Checkbox key={option.id} card label={option.text} value={String(option.id)} {...form.register(name)} />
          ) : (
            <Radio key={option.id} card label={option.text} value={String(option.id)} {...form.register(name)} />
          ),
        )}
      </div>
      {!multiple && !question.required && value && (
        <div className="ps-10">
          <Button
            variant="link"
            size="sm"
            className="text-xs"
            onClick={() => form.setValue(name, "", { shouldDirty: true })}
          >
            پاک کردن جواب
          </Button>
        </div>
      )}
      <div className="ps-10">
        <FieldError id={errorId} messages={error ? [error] : undefined} />
      </div>
    </div>
  );
}

function ReadonlyAnswer({ question }: { question: QuestionItem }) {
  let text: string;
  if (question.kind === "text") text = typeof question.value === "string" ? question.value : "";
  else {
    const ids = Array.isArray(question.value) ? question.value : question.value === null ? [] : [question.value];
    text = question.options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.text)
      .join("، ");
  }
  return text ? (
    <p className="text-sm leading-7 whitespace-pre-line text-fg/90">{text}</p>
  ) : (
    <p className="text-sm text-muted">بی‌جواب</p>
  );
}

function TextItemField({ item, form, rows = 3, label }: { item: TextItem; form: Form; rows?: number; label?: string }) {
  const name: FieldPath<ResponseValues> = item.name === "new_item" ? "new_item" : `fixed.${item.name}`;
  const formState = useFormState({ control: form.control, name });
  const error = form.getFieldState(name, formState).error?.message;
  return (
    <div id={`field-${item.name}`} className="scroll-mt-28">
      <Field label={label ?? item.label} hint={item.help || undefined} error={error}>
        <Textarea rows={rows} {...form.register(name)} />
      </Field>
    </div>
  );
}

function Meta({ response }: { response: ResponseDetail }) {
  const items: [string, ReactNode][] = [
    ["واحد", response.org_unit],
    ...(!response.is_structured
      ? ([["خدمت", response.service ? <bdi className="code">{response.service}</bdi> : "کل واحد"]] as [
          string,
          ReactNode,
        ][])
      : []),
    [
      "پاسخ‌دهنده",
      <span className="flex flex-col" key="respondent">
        {response.respondent?.name}
        {response.channel.value === "interview" && (
          <span className="text-xs text-muted">مصاحبه، ثبت با {response.recorded_by?.name}</span>
        )}
      </span>,
    ],
    [
      "وضعیت",
      <span className="flex flex-col items-start gap-1" key="status">
        <ResponseStatus row={response} />
        {response.submitted_at && <span className="text-xs text-muted">ارسال {dateTime(response.submitted_at)}</span>}
      </span>,
    ],
  ];
  return (
    <Card className="overflow-clip">
      {/* فاصله‌ی یک‌پیکسلی بین خانه‌ها روی زمینه‌ی خط، جداکننده‌ی هر چیدمان (یک، دو یا چهار ستون) را می‌سازد. */}
      <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1 bg-panel px-5 py-4">
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="text-sm text-fg">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Progress({ questions, form }: { questions: QuestionItem[]; form: Form }) {
  const answers = useWatch({ control: form.control, name: "answers" });
  const answered = questions.filter((question) => isAnswered(answers?.[answerKey(question)])).length;
  const required = questions.filter((question) => question.required);
  const missing = required.filter((question) => !isAnswered(answers?.[answerKey(question)])).length;
  const percent = questions.length ? Math.round((answered / questions.length) * 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className="text-fg">
          {formatNumber(answered)} از {formatNumber(questions.length)} سؤال جواب دارد
        </span>
        {missing > 0 && <span className="text-muted">{formatNumber(missing)} سؤال اجباری مانده</span>}
      </div>
      <div
        role="progressbar"
        aria-label="پیشرفت پاسخ"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full max-w-64 overflow-hidden rounded-full bg-surface"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function EditableResponse({ response, id }: { response: ResponseDetail; id: string }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<ResponseValues>({ defaultValues: valuesFrom(response) });
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<{ label: string; target: string; message: string }[]>([]);
  const [general, setGeneral] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const dirty = form.formState.isDirty;

  const save = useMutation({
    mutationFn: ({ values, submit }: { values: ResponseValues; submit: boolean }) =>
      put<SaveResult>(`responses/${id}/`, payloadFrom(values, response.questions, submit)),
    onSuccess: (result, { submit }) => {
      queryClient.setQueryData(["response", id], result.response);
      void queryClient.invalidateQueries({ queryKey: ["answer-home"] });
      void queryClient.invalidateQueries({ queryKey: ["my-work"] });
      form.reset(valuesFrom(result.response));
      setSummary([]);
      setGeneral(null);
      setConfirming(false);
      toast({ title: faText(result.message), description: submit ? "عضو GRC پاسخ را بررسی می‌کند." : undefined });
    },
    onError: (error) => {
      setConfirming(false);
      if (!(error instanceof ApiError)) {
        setGeneral(error.message);
        return;
      }
      if (error.data.response) {
        // جواب‌ها ذخیره شد ولی ارسال نشد (سؤال اجباری مانده)؛ همین مقدارها حالا ذخیره‌شده‌اند.
        queryClient.setQueryData(["response", id], error.data.response as ResponseDetail);
        form.reset(form.getValues());
      }
      const mapped = fieldErrors(error.errors, response);
      for (const [name, message] of mapped)
        form.setError(name as FieldPath<ResponseValues>, { type: "server", message });
      setGeneral(error.errors.__all__?.join(" ") ?? (mapped.length ? null : error.message));
      showSummary(mapped.map(([name, message]) => ({ name, message })));
    },
  });

  function labelFor(name: string) {
    const index = response.questions.findIndex((question) => answerField(question) === name);
    if (index >= 0) return `سؤال ${formatNumber(index + 1)}`;
    if (name === "new_item") return "ریسک تازه";
    return response.fixed.find((item) => `fixed.${item.name}` === name)?.label ?? name;
  }

  function targetFor(name: string) {
    const question = response.questions.find((item) => answerField(item) === name);
    if (question) return `question-${question.id}`;
    return `field-${name.replace(/^fixed\./, "")}`;
  }

  function showSummary(items: { name: string; message: string }[]) {
    setSummary(items.map(({ name, message }) => ({ label: labelFor(name), target: targetFor(name), message })));
    requestAnimationFrame(() => summaryRef.current?.focus());
  }

  function saveDraft() {
    form.clearErrors();
    setSummary([]);
    save.mutate({ values: form.getValues(), submit: false });
  }

  function requestSubmit() {
    form.clearErrors();
    const result = submitSchema(response.questions).safeParse(form.getValues());
    if (!result.success) {
      const items = result.error.issues.map((issue) => ({ name: issue.path.join("."), message: issue.message }));
      for (const item of items)
        form.setError(item.name as FieldPath<ResponseValues>, { type: "required", message: item.message });
      setGeneral(null);
      showSummary(items);
      return;
    }
    setSummary([]);
    setConfirming(true);
  }

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

  // پیش از بستن برگه یا رفتن به صفحه‌ی دیگر با تغییر ذخیره‌نشده، می‌پرسیم.
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

  function focusTarget(target: string) {
    const element = document.getElementById(target);
    element?.scrollIntoView({ block: "center" });
    element?.querySelector<HTMLElement>("input, textarea, select")?.focus({ preventScroll: true });
  }

  return (
    <>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          requestSubmit();
        }}
        className="flex flex-col gap-6"
      >
        {summary.length > 0 && (
          <Alert
            ref={summaryRef}
            tabIndex={-1}
            role="alert"
            tone="danger"
            className="outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            title={`${formatNumber(summary.length)} مورد پیش از ارسال درست شود:`}
          >
            <ul className="mt-1 flex flex-col gap-1">
              {summary.map((item) => (
                <li key={item.target}>
                  <a
                    href={`#${item.target}`}
                    className="text-fg underline underline-offset-4 hover:text-danger"
                    onClick={(event) => {
                      event.preventDefault();
                      focusTarget(item.target);
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

        <Card>
          <CardHeader
            icon={<ListChecks />}
            title="کارکردها و پرسش‌های جلسه"
            description="همان پرسش‌های ثابت جلسه‌ی شناسایی؛ هر کدام را که برای این واحد معنا دارد پر کنید."
          />
          <CardContent className="flex flex-col gap-5">
            {response.fixed.map((item) => (
              <TextItemField key={item.name} item={item} form={form} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            icon={<ClipboardList />}
            title={
              <span className="flex items-center gap-2">
                سؤال‌ها
                <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted tabular">
                  {formatNumber(response.questions.length)}
                </span>
              </span>
            }
            description="پیش‌نویس را هر وقت خواستید ذخیره کنید؛ فقط هنگام ارسال، سؤال‌های اجباری باید جواب داشته باشند."
          />
          <CardContent>
            {response.questions.length === 0 ? (
              <p className="text-sm text-muted">این پاسخ جواب سؤالی ندارد.</p>
            ) : (
              <ol className="flex flex-col divide-y divide-line">
                {response.questions.map((question, index) => (
                  <li key={question.id} className="py-5 first:pt-1 last:pb-0">
                    <QuestionField question={question} number={index + 1} form={form} />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader icon={<FilePlus2 />} title={response.new_item.label} />
          <CardContent>
            <TextItemField
              item={{ ...response.new_item, name: "new_item" }}
              form={form}
              rows={5}
              label="شرح ریسک تازه"
            />
          </CardContent>
        </Card>

        <PendingRisks response={response} />

        <div className="glass sticky bottom-0 z-30 sm:bottom-4 -mx-(--gutter) border-t border-line px-(--gutter) pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:mx-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-pop">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Progress questions={response.questions} form={form} />
            <p aria-live="polite" className={cn("text-xs", dirty ? "text-warning" : "text-muted")}>
              {save.isPending ? "در حال ذخیره" : dirty ? "تغییرات ذخیره نشده است" : "همه‌ی تغییرات ذخیره شده است"}
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="secondary"
                className="flex-1 sm:flex-none"
                loading={save.isPending && !save.variables?.submit}
                disabled={save.isPending}
                onClick={saveDraft}
                title="Ctrl+S"
              >
                {!(save.isPending && !save.variables?.submit) && <Save aria-hidden />}
                ذخیره‌ی پیش‌نویس
              </Button>
              <Button type="submit" variant="primary" className="flex-1 sm:flex-none" disabled={save.isPending}>
                <Send aria-hidden className="rtl:-scale-x-100" />
                ارسال برای بررسی
              </Button>
            </div>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="پاسخ برای بررسی فرستاده شود؟"
        description="بعد از ارسال، پاسخ تا وقتی عضو GRC آن را برای تکمیل برنگرداند قابل ویرایش نیست. ریسک‌های در انتظار از گزینه‌های «نشانه‌ی ریسک» و «مورد جدید» ساخته می‌شوند."
        confirmLabel="ارسال برای بررسی"
        loading={save.isPending}
        onConfirm={() => save.mutate({ values: form.getValues(), submit: true })}
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
    </>
  );
}

function PendingRisks({ response }: { response: ResponseDetail }) {
  if (!response.pending_risks.length) return null;
  return (
    <Card>
      <CardHeader
        icon={<Hourglass />}
        title="ریسک‌های در انتظار"
        description="از گزینه‌های «نشانه‌ی ریسک» و «مورد جدید» ساخته شده‌اند و عضو GRC تکلیفشان را تعیین می‌کند."
      />
      <ul className="divide-y divide-line border-t border-line">
        {response.pending_risks.map((item, index) => (
          <li key={index} className="flex flex-col gap-2 px-5 py-4">
            <p className="text-sm whitespace-pre-line text-fg/90">{item.description}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <CircleDot aria-hidden className="size-3.5" />
              {item.source}
              <Badge>{item.status.label}</Badge>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReadonlyResponse({ response }: { response: ResponseDetail }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader icon={<ListChecks />} title="کارکردها و پرسش‌های جلسه" />
        <CardContent>
          <dl className="flex flex-col divide-y divide-line">
            {response.fixed.map((item) => (
              <div key={item.name} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="text-sm whitespace-pre-line text-fg/90">
                  {item.value || <span className="text-muted">بی‌جواب</span>}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader icon={<ClipboardList />} title="سؤال‌ها" />
        <CardContent>
          <ol className="flex flex-col divide-y divide-line">
            {response.questions.map((question, index) => (
              <li key={question.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface text-xs text-muted tabular"
                >
                  {formatNumber(index + 1)}
                </span>
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-medium text-fg">
                    <span className="sr-only">سؤال {formatNumber(index + 1)}: </span>
                    {question.text}
                  </p>
                  <ReadonlyAnswer question={question} />
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader icon={<FilePlus2 />} title={response.new_item.label} />
        <CardContent>
          <p className="text-sm whitespace-pre-line text-fg/90">
            {response.new_item.value || <span className="text-muted">ندارد</span>}
          </p>
        </CardContent>
      </Card>
      <PendingRisks response={response} />
    </div>
  );
}

export function ResponseFormPage() {
  const { id = "" } = useParams();
  const query = useQuery({
    queryKey: ["response", id],
    queryFn: ({ signal }) => get<ResponseDetail>(`responses/${id}/`, signal),
  });
  const response = query.data;
  useTitle(response ? response.questionnaire.title : "پاسخ پرسشنامه");

  if (query.isPending) return <PageSkeleton rows={6} />;
  if (query.isError || !response) {
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "پاسخ به سؤال‌ها", to: "/questionnaires" }, { label: response.questionnaire.title }]}
        title={response.questionnaire.title}
        description={response.questionnaire.description || undefined}
        actions={
          <ClassicLink href={response.classic_url} button={{ variant: "ghost", size: "sm" }}>
            این پاسخ در صفحه‌های فعلی
          </ClassicLink>
        }
      />

      {response.return_question && (
        <Alert tone="warning" title="سؤال عضو GRC برای تکمیل پاسخ">
          <p className="whitespace-pre-line">{response.return_question}</p>
          {response.return_due && <Deadline value={response.return_due} label="مهلت جواب" className="mt-2" />}
        </Alert>
      )}

      <Meta response={response} />

      {/* با هر بار ذخیره یا ارسال، پاسخ تازه‌ی سرور جای قبلی را می‌گیرد؛ کلید فرم را با وضعیت ویرایش نگه می‌داریم. */}
      {response.is_structured ? (
        <StructuredResponse key={`structured-${response.id}-${response.can_edit}`} response={response} id={id} />
      ) : response.can_edit ? (
        <EditableResponse key={`edit-${response.id}`} response={response} id={id} />
      ) : (
        <ReadonlyResponse response={response} />
      )}
    </div>
  );
}
