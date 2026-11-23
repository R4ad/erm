import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Location, useNavigate, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/field";
import { FileInput } from "@/components/ui/file-input";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { Chip } from "@/components/ui/section-panel";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { LeaveGuard } from "@/features/forms/leave-guard";
import { ApiError, post } from "@/lib/api";
import { dateTime, fa, faText, fileSize } from "@/lib/format";
import type {
  IdentificationChoices,
  IdentificationDraft,
  IdentificationPage as PageData,
  IdentificationRow,
  IdentificationValues,
} from "@/lib/types";

import {
  REVIEW,
  autoUnit,
  emptyValues,
  fieldId,
  narrative,
  riskTitle,
  stepOfField,
  withTarget,
  type StepKey,
  type Target,
  type WizardMode,
} from "./identification";
import { MODES } from "./modes";
import {
  EntryCriteria,
  EvidencePicker,
  QuestionStep,
  SavedFiles,
  ScenarioTemplate,
  ServiceSuggestions,
  StepNav,
  type Step,
  type StepStatus,
} from "./steps";

// ویزارد شش پرسش جلسه‌ی شناسایی و یک گام «بازبینی»، مشترک «شناسایی ریسک» (mode="identify") و «پاسخ به پرسشنامه‌ها»
// (mode="answer"). بالای ویزارد «الگوی ثبت سناریو» چسبان است و با هر حرف جزء همان پرسش را در جمله پر و
// علامت‌گذاری می‌کند. در شناسایی خدمت از پیشنهادهای پرسش اول انتخاب می‌شود و واحد، مشتری و تعهد از همان می‌آیند؛ در
// پاسخ موضوع آزاد و اجباری است و خدمت را کارشناس ریسک بعداً انتخاب می‌کند. دسته و منبع را عضو GRC تعیین می‌کند.
// بازبینی شاهد (اجباری)، فایل شاهد، پیامد، وابستگی و شرط پذیرش ورودی را دارد. پیش‌نویس با Ctrl+S هم ذخیره می‌شود و
// رفتن با تغییر ذخیره‌نشده پرسیده می‌شود. متن‌های هر حالت در modes.ts است.

type Errors = Partial<Record<string, string[]>>;

interface SaveResult {
  message: string;
  draft?: IdentificationDraft;
  recent?: IdentificationRow[];
  risk?: { id: number; code: string };
  redirect?: string;
}

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

export function IdentificationWizard({
  data,
  mode,
  onDraftSaved,
  onSubmitted,
  focusFirst = false,
}: {
  data: PageData;
  mode: WizardMode;
  onDraftSaved: (id: string) => void;
  /** بعد از «ارسال برای شناسایی» در حالتی که به ریسک نمی‌رود (answer)، تا صفحه فرم خالی تازه بسازد. */
  onSubmitted?: () => void;
  /** فرمی که بعد از ارسال از نو ساخته شده فوکوس را روی پرسش اول می‌گذارد، چون دکمه‌ی ارسال از صفحه رفته است. */
  focusFirst?: boolean;
}) {
  const config = MODES[mode];
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
  const [focusRequest, setFocusRequest] = useState<{ field: string; n: number } | null>(
    focusFirst ? { field: parts[0]?.name ?? "subject", n: 0 } : null,
  );
  const shell = useRef<HTMLDivElement>(null);
  // جایی که خود ویزارد بعد از جواب سرور به آن می‌رود و هشدار «تغییرات ذخیره نشده» (LeaveGuard) جلویش را نمی‌گیرد:
  // leaving برای ریسک تازه یا فرم خالی بعد از ارسال (این فرم کنار می‌رود)، ownSearch برای ?draft= پیش‌نویسی که همین
  // حالا ذخیره شد. ref است نه state، چون جواب سریع سرور ممکن است پیش از رندر بعدی برسد و هشدار هنوز با مقدارهای پیش از
  // ذخیره تصمیم بگیرد.
  const leaving = useRef(false);
  const ownSearch = useRef<string | null>(null);
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
    if (key === "subject" && config.services) return values.target ? "answered" : "empty";
    return values[key].trim() ? "answered" : "empty";
  }

  /** مشکل‌هایی که ارسال را نگه می‌دارند، برای یک گام. */
  function problems(key: StepKey): Errors {
    if (key === REVIEW) {
      return values.evidence.trim() ? {} : { evidence: ["شاهد یا فرض قابل آزمون را بنویسید؛ برای ارسال اجباری است."] };
    }
    if (key === "subject" && config.services) {
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
          target: [`واحد مالک «${chosen.service.name}» فعال نیست؛ خدمت دیگری انتخاب کنید.`],
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

  // مقدارهای فرستاده‌شده همراه درخواست می‌روند، چون onSuccess مقدارهای آخرین رندر را می‌بیند و متنی که در همین فاصله
  // نوشته شده نباید ذخیره‌شده حساب شود.
  const save = useMutation({
    mutationFn: ({ submit, values }: { submit: boolean; values: IdentificationValues }) => {
      const payload = { values, submit, draft: draft?.id ?? null, remove_attachments: removed };
      const url = `${config.endpoint}/`;
      if (!file) return post<SaveResult>(url, payload);
      const body = new FormData();
      body.set("payload", JSON.stringify(payload));
      body.set("evidence_file", file);
      return post<SaveResult>(url, body);
    },
    onSuccess: (result, { submit, values: sent }) => {
      setErrors({});
      setSummary(false);
      setConfirming(false);
      setSaved(JSON.stringify(sent));
      setFile(null);
      setRemoved([]);
      toast({ title: faText(result.message) });
      // جدول صفحه‌ی دیگر هم ورودی‌های همین کاربر را نشان می‌دهد (برای کسی که هر دو صفحه را دارد)؛ کهنه علامت می‌خورد
      // تا رفتن به آن تازه بخواند.
      for (const { endpoint } of Object.values(MODES)) {
        if (endpoint !== config.endpoint) void queryClient.invalidateQueries({ queryKey: [endpoint] });
      }
      if (submit && result.redirect) {
        // ورودی با ارسال پاک شده است و دوباره خواندن ?draft= همین حالا ۴۰۴ می‌دهد؛ داده‌ی شناسایی فقط کهنه علامت
        // می‌خورد تا بازگشت به صفحه تازه بخواند.
        void queryClient.invalidateQueries({ queryKey: ["identification"], refetchType: "none" });
        void queryClient.invalidateQueries({ queryKey: ["risks"] });
        leaving.current = true;
        navigate(result.redirect);
        return;
      }
      if (submit) {
        // پاسخ ارسال‌شده دیگر در این فرم نیست: فرم خالی با ردیف «در حال شناسایی» در جدول از نو ساخته می‌شود.
        queryClient.setQueryData<PageData>([config.endpoint, ""], {
          ...data,
          values: emptyValues(sent),
          draft: null,
          recent: result.recent ?? data.recent,
        });
        // نشانی هنوز ?draft= دارد؛ برداشتن داده‌ی پیش‌نویس همین حالا آن را دوباره می‌خواند. کهنه علامت می‌خورد تا
        // بازگشت به آن نشانی از سرور بخواند که دیگر پیش‌نویسی نیست.
        if (draft) {
          void queryClient.invalidateQueries({
            queryKey: [config.endpoint, String(draft.id)],
            exact: true,
            refetchType: "none",
          });
        }
        leaving.current = true;
        onSubmitted?.();
        return;
      }
      if (result.draft) {
        const id = String(result.draft.id);
        setDraft(result.draft);
        // داده‌ی نشانی تازه همین فرم است، تا با ?draft= دوباره خوانده و از نو ساخته نشود و گام و فوکوس سر جایش بماند.
        queryClient.setQueryData<PageData>([config.endpoint, id], {
          ...data,
          values: sent,
          draft: result.draft,
          recent: result.recent ?? data.recent,
        });
        onDraftSaved(id);
        const nextParams = new URLSearchParams(params);
        nextParams.set("draft", id);
        ownSearch.current = `?${nextParams.toString()}`;
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
        if (!save.isPending) save.mutate({ submit: false, values });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  // همین صفحه با ورودی دیگر (مثلاً ردیفی از جدول) هم فرم را از نو می‌سازد (useWizardPage)، جز پیش‌نویسی که همین فرم
  // ذخیره کرده است.
  const replacesForm = (current: Location, next: Location) =>
    next.search !== ownSearch.current &&
    new URLSearchParams(current.search).get("draft") !== new URLSearchParams(next.search).get("draft");

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
              <Chip tone="neutral">{`${draft.status.label} · ${dateTime(draft.saved_at)}`}</Chip>
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
                required={part.name !== "subject" || !config.services}
                hint={config.hints[part.name]}
                onChange={(value) => set(part.name, value)}
                onEnter={next}
              >
                {part.name === "subject" && config.services && (
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
                  <p className="text-sm text-ink-2">{config.reviewIntro}</p>
                </div>
                <figure className="flex flex-col gap-2 rounded-lg bg-subtle px-4 py-3.5">
                  <figcaption className="text-xs font-medium text-ink-2">جمله‌ی کامل سناریو</figcaption>
                  <blockquote className="text-base leading-8 text-pretty text-ink">{narrative(values)}</blockquote>
                  {title && (
                    <p className="text-xs text-ink-2">
                      {config.titleLabel}: <span className="font-medium text-ink">{title}</span>
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
                <EntryCriteria values={values} unit={unit} mode={mode} />
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
              loading={save.isPending && save.variables?.submit === false}
              disabled={save.isPending}
              onClick={() => save.mutate({ submit: false, values })}
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
        title={config.confirmTitle}
        description={config.confirmDescription(Boolean(values.scenario))}
        confirmLabel="ارسال برای شناسایی"
        loading={save.isPending}
        onConfirm={() => save.mutate({ submit: true, values })}
      />
      <LeaveGuard
        when={dirty && !save.isPending}
        released={leaving}
        replaces={replacesForm}
        description="اگر از این صفحه بروید، چیزی که بعد از آخرین ذخیره نوشته‌اید از دست می‌رود."
      />
    </div>
  );
}
