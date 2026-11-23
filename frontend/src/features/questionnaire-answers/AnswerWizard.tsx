import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { type Location, useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { Chip } from "@/components/ui/section-panel";
import { Alert } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { LeaveGuard } from "@/features/forms/leave-guard";
import { ApiError, errorMessage, post } from "@/lib/api";
import { fa, faText, shortDate } from "@/lib/format";
import type {
  AnswerResponse,
  AnswerSaveResult,
  AnswerSummary,
  AnswerValues,
  QuestionnaireAnswersData,
} from "@/lib/types";

import {
  BASIC_KEYS,
  STEPS,
  eventGroups,
  fieldId,
  impactOf,
  newKey,
  sharedBy,
  sharedMessage,
  stepIndex,
  stepOfField,
  stepProblems,
  tidy,
  type BasicKey,
  type Errors,
  type StepKey,
} from "./answers";
import {
  BasicStep,
  EventsStep,
  ImpactsStep,
  POSITION_ID,
  PathsStep,
  ReviewStep,
  SentState,
  StepNav,
  UnitChoice,
  type StepStatus,
} from "./steps";

// ویزارد هشت‌گامی «پاسخ به پرسشنامه‌ها» (فریم‌های 30 تا 30f). مدیر واحد پرسش‌های جلسه‌ی شناسایی را پاسخ می‌دهد؛ پیش‌نویس
// با «ذخیره‌ی پیش‌نویس» یا Ctrl+S ذخیره و نشانی‌اش ?response= می‌شود، و رفتن با تغییر ذخیره‌نشده پرسیده می‌شود. ارسال
// پاسخنامه را برای کارشناس ریسک می‌فرستد و پیام موفقیت (30f) جای گام‌ها را می‌گیرد.

const BLANK: AnswerValues = {
  service: "",
  objective: "",
  conditions: "",
  responsibility: "",
  paths: [],
  events: [],
  impacts: [],
};

const UNIT_REQUIRED = "واحد را انتخاب کنید.";

export function AnswerWizard({
  data,
  onSaved,
  onSent,
}: {
  data: QuestionnaireAnswersData;
  /** پاسخنامه‌ای که همین فرم ذخیره کرده (یا "" بعد از ارسال)، تا تغییر نشانی فرم را از نو نسازد. */
  onSaved: (id: string) => void;
  /** پاسخنامه‌ی تازه ارسال‌شده برای برجسته شدن در جدول، یا null. */
  onSent: (id: number | null) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [values, setValues] = useState<AnswerValues>(data.values);
  const [saved, setSaved] = useState(() => JSON.stringify(data.values));
  const [response, setResponse] = useState<AnswerResponse | null>(data.response);
  const [unit, setUnit] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [index, setIndex] = useState(() => Math.min(Math.max((data.response?.step ?? 1) - 1, 0), STEPS.length - 1));
  const [direction, setDirection] = useState<"forward" | "back" | "none">("none");
  const [focusRequest, setFocusRequest] = useState<{ field: string; n: number } | null>(null);
  const [sent, setSent] = useState<{ response: AnswerResponse; summary: AnswerSummary } | null>(null);
  // مسیرهایی که «انتخاب از رویدادهای قبلی» را زده‌اند و رویداد مسیر خودشان کنار گذاشته شده است؛ متن آن رویداد اینجا
  // می‌ماند تا برگشت به «رویداد جدید» آن را برگرداند.
  const [choosing, setChoosing] = useState<Set<string>>(() => new Set());
  const ownEvents = useRef(new Map<string, { key: string; text: string }>());
  // نشانی‌ای که خود ویزارد بعد از ذخیره به آن می‌رود و هشدار ترک صفحه جلویش را نمی‌گیرد؛ ref است چون جواب سرور ممکن
  // است پیش از رندر بعدی برسد.
  const ownSearch = useRef<string | null>(null);

  const step = STEPS[index] ?? STEPS[0];
  const needsUnit = !response && data.units.length > 0;
  const dirty = !sent && JSON.stringify(values) !== saved;

  function allProblems(current = values): Errors {
    const found: Errors = Object.assign({}, ...STEPS.map((item) => stepProblems(current, item.key)));
    if (needsUnit && !unit) found.org_unit = [UNIT_REQUIRED];
    return found;
  }

  function problemsOf(key: StepKey): Errors {
    const found = stepProblems(values, key);
    if (key === "service" && needsUnit && !unit) found.org_unit = [UNIT_REQUIRED];
    return found;
  }

  // فیلد پرسش یا خطا بعد از هر جابه‌جایی فوکوس می‌گیرد، نه هنگام باز شدن صفحه.
  useEffect(() => {
    if (!focusRequest) return;
    const element = document.getElementById(fieldId(focusRequest.field));
    const target = element?.matches("input, textarea, select, button, h3")
      ? element
      : element?.querySelector<HTMLElement>("input:checked, input, textarea, select, button");
    target?.focus();
  }, [focusRequest]);

  function primaryField(key: StepKey): string {
    const first = values.paths[0];
    if (key === "paths") return first ? `paths.${first.key}` : "paths-add";
    if (key === "events") return first ? `paths.${first.key}.event` : "events-question";
    if (key === "impacts") {
      const group = eventGroups(values).find((item) => item.text.trim());
      return group ? `impacts.${group.key}.types` : "impacts-question";
    }
    if (key === "review") return "review";
    return key;
  }

  function goTo(target: number, field?: string) {
    const next = Math.max(0, Math.min(target, STEPS.length - 1));
    if (next !== index) setDirection(next > index ? "forward" : "back");
    setIndex(next);
    setFocusRequest((current) => ({
      field: field ?? primaryField(STEPS[next]?.key ?? "review"),
      n: (current?.n ?? 0) + 1,
    }));
  }

  /** اولین فیلد خطادار به ترتیب گام‌ها؛ ویزارد به همان گام می‌رود. */
  function showFirstError(found: Errors) {
    const names = Object.keys(found).filter((name) => found[name]?.length);
    for (const [position, item] of STEPS.entries()) {
      const name = names.find((field) => stepOfField(field) === item.key);
      if (!name) continue;
      // خطای طول رویداد روی ورودی همان مسیری است که رویداد را دارد.
      const owner = name.startsWith("events.") && values.paths.find((path) => `events.${path.event}` === name);
      goTo(position, owner ? `paths.${owner.key}.event` : name);
      return;
    }
  }

  function next() {
    const found = problemsOf(step.key);
    if (Object.keys(found).length) {
      setErrors((current) => ({ ...current, ...found }));
      showFirstError(found);
      return;
    }
    goTo(index + 1);
  }

  function clear(...names: string[]) {
    if (names.some((name) => errors[name])) {
      setErrors((current) => Object.fromEntries(Object.entries(current).filter(([name]) => !names.includes(name))));
    }
  }

  function update(change: (current: AnswerValues) => AnswerValues, ...names: string[]) {
    setValues((current) => change(current));
    clear(...names);
  }

  // ─── گام ۵ تا ۷ ───

  function addPath() {
    const path = { key: newKey("p"), description: "", event: newKey("e") };
    update(
      (current) => ({
        ...current,
        paths: [...current.paths, path],
        events: [...current.events, { key: path.event, text: "" }],
      }),
      "paths",
    );
    setFocusRequest((current) => ({ field: `paths.${path.key}`, n: (current?.n ?? 0) + 1 }));
  }

  function removePath(key: string) {
    const other = sharedBy(values, key);
    if (other) {
      setErrors((current) => ({ ...current, [`paths.${key}`]: [sharedMessage(other)] }));
      return;
    }
    const position = values.paths.findIndex((path) => path.key === key);
    const following = values.paths[position + 1] ?? values.paths[position - 1];
    update((current) => tidy({ ...current, paths: current.paths.filter((path) => path.key !== key) }), `paths.${key}`);
    setFocusRequest((current) => ({
      field: following ? `paths.${following.key}` : "paths-add",
      n: (current?.n ?? 0) + 1,
    }));
  }

  function setEventText(event: string, text: string) {
    const paths = values.paths.filter((path) => path.event === event).map((path) => `paths.${path.key}.event`);
    update(
      (current) => ({
        ...current,
        events: current.events.map((item) => (item.key === event ? { ...item, text } : item)),
      }),
      ...paths,
      `events.${event}`,
    );
  }

  function setEventMode(pathKey: string, mode: "new" | "previous") {
    const path = values.paths.find((item) => item.key === pathKey);
    if (!path) return;
    if (mode === "previous") {
      // رویداد خود مسیر کنار می‌رود تا تا انتخاب یکی از قبلی‌ها، رویدادی بی‌متن جای آن باشد.
      const own = values.events.find((event) => event.key === path.event);
      const owner = values.paths.findIndex((item) => item.event === path.event);
      if (own && values.paths[owner]?.key === pathKey) ownEvents.current.set(pathKey, own);
      const placeholder = newKey("e");
      update(
        (current) =>
          tidy({
            ...current,
            paths: current.paths.map((item) => (item.key === pathKey ? { ...item, event: placeholder } : item)),
            events: [...current.events, { key: placeholder, text: "" }],
          }),
        `paths.${pathKey}.event`,
      );
      setChoosing((current) => new Set(current).add(pathKey));
      return;
    }
    const own = ownEvents.current.get(pathKey);
    const restored = own && !values.paths.some((item) => item.event === own.key) ? own : { key: newKey("e"), text: "" };
    update(
      (current) =>
        tidy({
          ...current,
          paths: current.paths.map((item) => (item.key === pathKey ? { ...item, event: restored.key } : item)),
          events: [...current.events.filter((event) => event.key !== restored.key), restored],
        }),
      `paths.${pathKey}.event`,
    );
    setChoosing((current) => {
      const nextSet = new Set(current);
      nextSet.delete(pathKey);
      return nextSet;
    });
    setFocusRequest((current) => ({ field: `paths.${pathKey}.event`, n: (current?.n ?? 0) + 1 }));
  }

  function chooseEvent(pathKey: string, event: string) {
    update(
      (current) =>
        tidy({
          ...current,
          paths: current.paths.map((item) => (item.key === pathKey ? { ...item, event } : item)),
        }),
      `paths.${pathKey}.event`,
    );
  }

  function setImpact(event: string, change: Partial<{ types: string[]; scope: string; description: string }>) {
    const name = `impacts.${event}`;
    update(
      (current) => {
        const impact = { ...impactOf(current, event), ...change };
        return { ...current, impacts: [...current.impacts.filter((item) => item.event !== event), impact] };
      },
      ...Object.keys(change).map((field) => `${name}.${field}`),
    );
  }

  // ─── ذخیره و ارسال ───

  // مقدارهای فرستاده‌شده همراه درخواست می‌روند، چون onSuccess مقدارهای آخرین رندر را می‌بیند و متنی که در همین فاصله
  // نوشته شده نباید ذخیره‌شده حساب شود.
  const save = useMutation({
    mutationFn: ({ submit, values: sent }: { submit: boolean; values: AnswerValues }) =>
      post<AnswerSaveResult>("questionnaire-answers/", {
        response: response?.id ?? null,
        values: sent,
        step: index + 1,
        submit,
        org_unit: needsUnit ? unit : null,
      }),
    onSuccess: (result, { submit, values: sentValues }) => {
      setErrors({});
      setSaved(JSON.stringify(sentValues));
      setResponse(result.response);
      if (submit) {
        // پاسخنامه‌ی ارسال‌شده دیگر با ?response= باز نمی‌شود؛ نشانی به ویزارد خالی برمی‌گردد و فرم سر جایش می‌ماند.
        // اول همه کهنه می‌شوند و بعد ویزارد خالی جواب تازه‌ی همین ارسال را می‌گیرد تا دوباره خوانده نشود.
        void queryClient.invalidateQueries({ queryKey: ["questionnaire-answers"], refetchType: "none" });
        queryClient.setQueryData<QuestionnaireAnswersData>(["questionnaire-answers", ""], {
          ...data,
          response: null,
          values: BLANK,
          recent: result.recent,
        });
        void queryClient.invalidateQueries({ queryKey: ["mywork"] });
        onSaved("");
        const nextParams = new URLSearchParams(params);
        nextParams.delete("response");
        ownSearch.current = nextParams.size ? `?${nextParams.toString()}` : "";
        setParams(nextParams, { replace: true });
        setSent({ response: result.response, summary: result.summary ?? { paths: 0, events: 0, impacts: 0 } });
        onSent(result.response.id);
        return;
      }
      toast({ title: faText(result.message) });
      const id = String(result.response.id);
      queryClient.setQueryData<QuestionnaireAnswersData>(["questionnaire-answers", id], {
        ...data,
        response: result.response,
        values: sentValues,
        recent: result.recent,
      });
      onSaved(id);
      if (params.get("response") !== id) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("response", id);
        ownSearch.current = `?${nextParams.toString()}`;
        setParams(nextParams, { replace: true });
      }
    },
    onError: (error, { submit }) => {
      if (error instanceof ApiError && error.errors && Object.keys(error.errors).length) {
        const found = error.errors as Errors;
        setErrors(found);
        toast({ title: faText(error.message), tone: "danger" });
        showFirstError(found);
        return;
      }
      toast({
        title: submit ? errorMessage(error) : "پیش‌نویس ذخیره نشد. اتصال را بررسی کنید و دوباره ذخیره کنید.",
        tone: "danger",
      });
    },
  });

  function saveDraft() {
    if (!save.isPending && !sent) save.mutate({ submit: false, values: tidy(values) });
  }

  function trySubmit() {
    const found = allProblems();
    if (Object.keys(found).length) {
      setErrors((current) => ({ ...current, ...found }));
      showFirstError(found);
      return;
    }
    if (!save.isPending) save.mutate({ submit: true, values: tidy(values) });
  }

  function restart() {
    setValues(BLANK);
    setSaved(JSON.stringify(BLANK));
    setResponse(null);
    setUnit("");
    setErrors({});
    setChoosing(new Set());
    ownEvents.current.clear();
    setSent(null);
    onSent(null);
    setDirection("none");
    setIndex(0);
    setFocusRequest((current) => ({ field: "service", n: (current?.n ?? 0) + 1 }));
  }

  // Ctrl+S پیش‌نویس را ذخیره می‌کند. Enter در ورودی یک‌خطی گام به گام بعد می‌رود (در متن چندخطی خط تازه است) و در
  // بازبینی، بیرون از دکمه و پیوند، ارسال می‌کند.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveDraft();
        return;
      }
      if (event.key !== "Enter" || sent || event.isComposing || event.shiftKey || event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input[data-enter-next]")) {
        event.preventDefault();
        next();
        return;
      }
      if (step.key !== "review" || target?.closest("button, a, input, textarea, select, [role='dialog']")) return;
      event.preventDefault();
      trySubmit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // همین صفحه با پاسخنامه‌ی دیگر (مثلاً ردیفی از جدول) فرم را از نو می‌سازد، جز نشانی‌ای که همین فرم رفته است.
  const replacesForm = (current: Location, nextLocation: Location) =>
    nextLocation.search !== ownSearch.current &&
    new URLSearchParams(current.search).get("response") !== new URLSearchParams(nextLocation.search).get("response");

  function status(key: StepKey): StepStatus {
    if (Object.keys(errors).some((name) => errors[name]?.length && stepOfField(name) === key)) return "error";
    if (key === "review") return "todo";
    if (!(BASIC_KEYS as string[]).includes(key) && !values.paths.length) return "todo";
    return Object.keys(problemsOf(key)).length ? "todo" : "done";
  }

  const missing = Object.keys(allProblems()).length;
  const chip = sent
    ? { label: "ارسال‌شده", tone: "success" as const }
    : step.key === "review" && !missing
      ? { label: "آماده‌ی ارسال", tone: "success" as const }
      : response?.returned
        ? { label: response.status.label, tone: "warning" as const }
        : response
          ? { label: "پیش‌نویس", tone: "neutral" as const }
          : { label: "ورودی تازه", tone: "neutral" as const };
  const returned = !sent ? response?.returned : null;

  return (
    <div className="mx-auto flex w-full max-w-[52.5rem] flex-col gap-4">
      {returned && (
        <Alert tone="warning" title="این پاسخنامه برای تکمیل اطلاعات بازگردانده شده است">
          <div className="mt-1 flex flex-col gap-3">
            {returned.message && (
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-ink-2">پیام کارشناس ریسک</span>
                <p className="text-ink">{returned.message}</p>
              </div>
            )}
            {returned.questions.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-2">پرسش‌های تکمیلی</span>
                <ol className="flex list-inside list-decimal flex-col gap-1.5 text-ink">
                  {returned.questions.map((question, position) => (
                    <li key={position}>
                      {question.text}
                      {question.step && question.about && (
                        <button
                          type="button"
                          onClick={() => goTo((question.step ?? 1) - 1)}
                          className="ms-2 inline-flex h-[1.375rem] items-center rounded-full bg-panel px-2.5 text-xs font-medium text-brand hover:bg-brand-subtle focus-visible:shadow-focus focus-visible:outline-none"
                        >
                          {`درباره‌ی ${question.about}`}
                        </button>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {returned.due && <Chip tone="warning">{`مهلت تکمیل: تا ${shortDate(returned.due)}`}</Chip>}
          </div>
        </Alert>
      )}

      <Card role="region" aria-labelledby="answer-wizard-title" className="flex flex-col">
        <div className={sent ? "border-b border-line" : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-5 pb-3.5 sm:px-6">
            <h2 id="answer-wizard-title" className="text-h3 font-semibold text-ink">
              پرسش‌های جلسه‌ی شناسایی
            </h2>
            <Chip tone={chip.tone}>{chip.label}</Chip>
          </div>
          {!sent && (
            <>
              <div className="flex items-center gap-3 px-4 sm:px-6">
                <div
                  role="progressbar"
                  aria-label="پیشرفت پاسخنامه"
                  aria-valuemin={1}
                  aria-valuemax={STEPS.length}
                  aria-valuenow={index + 1}
                  aria-valuetext={`گام ${fa(index + 1)} از ${fa(STEPS.length)}: ${step.label}`}
                  className="h-1 flex-1 overflow-hidden rounded-full bg-line"
                >
                  <div
                    className="wizard-progress h-full rounded-full bg-brand"
                    style={{ transform: `scaleX(${(index + 1) / STEPS.length})` }}
                  />
                </div>
                <span id={POSITION_ID} className="shrink-0 text-xs text-ink-2 tabular">
                  {`گام ${fa(index + 1)} از ${fa(STEPS.length)}`}
                </span>
              </div>
              <div className="px-4 pt-4 pb-6 sm:px-6">
                <StepNav index={index} status={status} onJump={(target) => goTo(target)} />
              </div>
            </>
          )}
        </div>

        {sent ? (
          <SentState response={sent.response} summary={sent.summary} onRestart={restart} />
        ) : (
          <>
            <div className="overflow-x-clip border-t border-line px-4 py-7 sm:px-6">
              <section key={step.key} className="wizard-step" data-direction={direction} aria-label={step.label}>
                {(BASIC_KEYS as string[]).includes(step.key) ? (
                  <BasicStep
                    name={step.key as BasicKey}
                    value={values[step.key as BasicKey]}
                    limit={data.limits.text}
                    errors={errors}
                    onChange={(value) => update((current) => ({ ...current, [step.key]: value }), step.key)}
                  >
                    {step.key === "service" && needsUnit && (
                      <UnitChoice
                        units={data.units}
                        value={unit}
                        errors={errors}
                        onChange={(value) => {
                          setUnit(value);
                          clear("org_unit");
                        }}
                      />
                    )}
                  </BasicStep>
                ) : step.key === "paths" ? (
                  <PathsStep
                    values={values}
                    limit={data.limits.path}
                    maxPaths={data.limits.paths}
                    errors={errors}
                    onChange={(key, description) =>
                      update(
                        (current) => ({
                          ...current,
                          paths: current.paths.map((path) => (path.key === key ? { ...path, description } : path)),
                        }),
                        `paths.${key}`,
                      )
                    }
                    onAdd={addPath}
                    onRemove={removePath}
                  />
                ) : step.key === "events" ? (
                  <EventsStep
                    values={values}
                    limit={data.limits.text}
                    errors={errors}
                    choosing={choosing}
                    onText={setEventText}
                    onMode={setEventMode}
                    onChoose={chooseEvent}
                  />
                ) : step.key === "impacts" ? (
                  <ImpactsStep
                    values={values}
                    types={data.impact_types}
                    limits={data.limits}
                    errors={errors}
                    onChange={setImpact}
                  />
                ) : (
                  <ReviewStep
                    values={values}
                    types={data.impact_types}
                    missing={missing}
                    onEdit={(key) => goTo(stepIndex(key))}
                  />
                )}
              </section>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-4 sm:px-6">
              <Button variant="secondary" size="lg" disabled={index === 0} onClick={() => goTo(index - 1)}>
                <Icon name="arrow-right" className="ltr:rotate-180" />
                قبلی
              </Button>
              <p className="hidden items-center gap-1.5 text-xs text-ink-2 lg:flex">
                <Kbd>Enter</Kbd> {step.key === "review" ? "ارسال" : "گام بعد"} · <Kbd>Ctrl</Kbd>+<Kbd>S</Kbd> ذخیره
              </p>
              <div className="ms-auto flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="lg"
                  loading={save.isPending && save.variables?.submit === false}
                  disabled={save.isPending}
                  onClick={saveDraft}
                  title="Ctrl+S"
                >
                  ذخیره‌ی پیش‌نویس
                </Button>
                {step.key === "review" ? (
                  <Button
                    variant="primary"
                    size="lg"
                    loading={save.isPending && save.variables?.submit === true}
                    disabled={save.isPending}
                    onClick={trySubmit}
                  >
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
          </>
        )}
      </Card>

      <LeaveGuard
        when={dirty && !save.isPending}
        replaces={replacesForm}
        description="اگر از این صفحه بروید، چیزی که بعد از آخرین ذخیره نوشته‌اید از دست می‌رود."
      />
    </div>
  );
}
