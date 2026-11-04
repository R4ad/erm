import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError, get, put } from "../api";
import { ClassicLink, DeadlineText, ErrorNotice, FieldError, Loading, useTitle } from "../components/bits";
import { dateTime, fa, faText } from "../format";
import type { AnswerValue, Errors, QuestionItem, ResponseDetail, TextItem } from "../types";

interface Draft {
  fixed: Record<string, string>;
  new_item: string;
  answers: Record<string, AnswerValue>;
}

interface SaveResult {
  message: string;
  response: ResponseDetail;
}

function draftFrom(response: ResponseDetail): Draft {
  return {
    fixed: Object.fromEntries(response.fixed.map((item) => [item.name, item.value])),
    new_item: response.new_item.value,
    answers: Object.fromEntries(response.questions.map((question) => [String(question.id), question.value])),
  };
}

function TextField({
  item,
  value,
  errors,
  rows = 3,
  onChange,
}: {
  item: TextItem;
  value: string;
  errors?: string[];
  rows?: number;
  onChange: (value: string) => void;
}) {
  const id = `field-${item.name}`;
  const describedBy = [item.help && `${id}-help`, errors?.length && `${id}-error`].filter(Boolean).join(" ");
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {item.label}
      </label>
      {item.help && (
        <p className="field-help" id={`${id}-help`}>
          {item.help}
        </p>
      )}
      <textarea
        id={id}
        className="textarea"
        rows={rows}
        value={value}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <FieldError id={`${id}-error`} messages={errors} />
    </div>
  );
}

function QuestionField({
  question,
  value,
  errors,
  onChange,
}: {
  question: QuestionItem;
  value: AnswerValue;
  errors?: string[];
  onChange: (value: AnswerValue) => void;
}) {
  const id = `question-${question.id}`;
  const describedBy = [question.help && `${id}-help`, errors?.length && `${id}-error`].filter(Boolean).join(" ");
  const label = (
    <>
      <span className="question-text">{question.text}</span>
      {question.required && <span className="required">اجباری</span>}
    </>
  );
  const help = question.help && (
    <p className="field-help" id={`${id}-help`}>
      {question.help}
    </p>
  );

  if (question.kind === "text") {
    return (
      <div className="field">
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
        {help}
        <textarea
          id={id}
          className="textarea"
          rows={3}
          value={(value as string) ?? ""}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <FieldError id={`${id}-error`} messages={errors} />
      </div>
    );
  }

  const multiple = question.kind === "multiple";
  const selected = multiple ? ((value as number[] | null) ?? []) : value;
  return (
    // گروه گزینه‌ها با div ساخته شده، نه fieldset: legend سطر اول ندارد و شماره‌ی سؤال کنار راهنما می‌افتاد.
    <div
      role={multiple ? "group" : "radiogroup"}
      className="field choices"
      aria-labelledby={`${id}-label`}
      aria-invalid={errors?.length ? true : undefined}
      aria-describedby={describedBy || undefined}
    >
      <p className="field-label" id={`${id}-label`}>
        {label}
      </p>
      {help}
      {multiple && <p className="field-help">هر چند گزینه که درست است را انتخاب کنید.</p>}
      {question.options.map((option) => {
        const checked = multiple ? (selected as number[]).includes(option.id) : selected === option.id;
        return (
          <label className="choice" key={option.id}>
            <input
              type={multiple ? "checkbox" : "radio"}
              name={id}
              value={option.id}
              checked={checked}
              onChange={(event) => {
                if (!multiple) return onChange(option.id);
                const current = selected as number[];
                onChange(event.target.checked ? [...current, option.id] : current.filter((pk) => pk !== option.id));
              }}
            />
            <span>{option.text}</span>
          </label>
        );
      })}
      {!multiple && selected !== null && selected !== undefined && !question.required && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          پاک کردن جواب
        </button>
      )}
      <FieldError id={`${id}-error`} messages={errors} />
    </div>
  );
}

function ReadonlyAnswer({ question }: { question: QuestionItem }) {
  let text: string;
  if (question.kind === "text") text = (question.value as string) || "";
  else {
    const ids = Array.isArray(question.value) ? question.value : question.value === null ? [] : [question.value];
    text = question.options
      .filter((option) => ids.includes(option.id))
      .map((option) => option.text)
      .join("، ");
  }
  return <p className="answer-readonly">{text || <span className="status">بی‌جواب</span>}</p>;
}

function Meta({ response }: { response: ResponseDetail }) {
  return (
    <dl className="form-meta">
      <div>
        <dt>واحد</dt>
        <dd>{response.org_unit}</dd>
      </div>
      <div>
        <dt>خدمت</dt>
        <dd>{response.service ? <bdi className="code">{response.service}</bdi> : "کل واحد"}</dd>
      </div>
      <div>
        <dt>پاسخ‌دهنده</dt>
        <dd>
          {response.respondent?.name}
          {response.channel?.value === "interview" && (
            <span className="cell-sub">مصاحبه، ثبت با {response.recorded_by?.name}</span>
          )}
        </dd>
      </div>
      <div>
        <dt>وضعیت</dt>
        <dd>
          {response.status.label}
          {response.submitted_at && <span className="cell-sub">ارسال {dateTime(response.submitted_at)}</span>}
        </dd>
      </div>
    </dl>
  );
}

export function ResponseForm() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["response", id], queryFn: () => get<ResponseDetail>(`responses/${id}/`) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const response = query.data;
  useTitle(response ? response.questionnaire.title : "پاسخ پرسشنامه");

  useEffect(() => {
    if (response && draft === null) setDraft(draftFrom(response));
  }, [response, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: (submit: boolean) => put<SaveResult>(`responses/${id}/`, { ...draft, submit }),
    onSuccess: (result) => {
      queryClient.setQueryData(["response", id], result.response);
      queryClient.invalidateQueries({ queryKey: ["answer-home"] });
      queryClient.invalidateQueries({ queryKey: ["my-work"] });
      setDraft(draftFrom(result.response));
      setDirty(false);
      setErrors({});
      setMessage({ kind: "success", text: result.message });
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        const saved = error.data.response as ResponseDetail | undefined;
        if (saved) {
          // جواب‌ها ذخیره شده ولی سؤال اجباری مانده؛ پیش‌نویس همان است که فرستادیم.
          queryClient.setQueryData(["response", id], saved);
          setDirty(false);
        }
        setErrors(error.errors);
      }
      setMessage({ kind: "error", text: error.message });
      setFocusError(true);
    },
  });

  // بعد از ارسال ردشده، اولین سؤالی که جواب لازم دارد پیدا و فوکوس می‌شود تا کاربر دنبالش نگردد.
  const [focusError, setFocusError] = useState(false);
  useEffect(() => {
    if (!focusError) return;
    setFocusError(false);
    const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!invalid) {
      window.scrollTo({ top: 0 });
      return;
    }
    const target = invalid.matches("input, textarea, select") ? invalid : invalid.querySelector<HTMLElement>("input");
    target?.focus({ preventScroll: true });
    invalid.scrollIntoView({ block: "center" });
  }, [focusError]);

  if (query.isPending || (response && !draft)) return <Loading />;
  if (query.isError || !response || !draft) {
    return (
      <div className="page">
        <ErrorNotice error={query.error} retry={() => query.refetch()} />
        <p>
          <Link to="/questionnaires">برگشت به پاسخ به سؤال‌ها</Link>
        </p>
      </div>
    );
  }

  function change(update: (draft: Draft) => Draft) {
    setDraft((current) => (current ? update(current) : current));
    setDirty(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    save.mutate(submitter?.value === "submit");
  }

  const editable = response.can_edit;
  const fixedErrors = (name: string) => errors[name];

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <nav className="crumbs" aria-label="مسیر">
            <Link to="/questionnaires">پاسخ به سؤال‌ها</Link>
          </nav>
          <h1>{response.questionnaire.title}</h1>
          {response.questionnaire.description && <p className="page-lead">{response.questionnaire.description}</p>}
        </div>
        <ClassicLink href={response.classic_url} className="button button-small classic-link">
          این پاسخ در صفحه‌های فعلی
        </ClassicLink>
      </header>

      {message && (
        <p className={message.kind === "success" ? "notice notice-success" : "notice notice-error"} role="status">
          {faText(message.text)}
        </p>
      )}
      {errors.__all__ && (
        <p className="notice notice-error" role="alert">
          {errors.__all__.join(" ")}
        </p>
      )}

      {response.return_question && (
        <div className="notice notice-stamp">
          <p>
            <strong>سؤال عضو GRC برای تکمیل پاسخ:</strong>
          </p>
          <p className="prose">{response.return_question}</p>
          {response.return_due && <DeadlineText value={response.return_due} label="مهلت جواب" />}
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <div className="sheet">
          <div className="form-sheet">
            <Meta response={response} />
          </div>

          <section className="form-sheet divided" aria-labelledby="fixed">
            <div className="section-head">
              <h2 id="fixed">کارکردها و پرسش‌های جلسه</h2>
              <p className="hint">همان پرسش‌های ثابت جلسه‌ی شناسایی؛ هر کدام را که برای این واحد معنا دارد پر کنید.</p>
            </div>
            {response.fixed.map((item) =>
              editable ? (
                <TextField
                  key={item.name}
                  item={item}
                  value={draft.fixed[item.name] ?? ""}
                  errors={fixedErrors(item.name)}
                  onChange={(value) =>
                    change((current) => ({ ...current, fixed: { ...current.fixed, [item.name]: value } }))
                  }
                />
              ) : (
                <div className="field" key={item.name}>
                  <span className="field-label">{item.label}</span>
                  <p className="answer-readonly">{item.value || <span className="status">بی‌جواب</span>}</p>
                </div>
              ),
            )}
          </section>

          <section className="form-sheet divided" aria-labelledby="questions">
            <div className="section-head">
              <h2 id="questions">سؤال‌ها</h2>
              <span className="tally">{fa(response.questions.length)}</span>
              {editable && (
                <p className="hint">
                  پیش‌نویس را هر وقت خواستید ذخیره کنید؛ فقط هنگام ارسال، سؤال‌های اجباری باید جواب داشته باشند.
                </p>
              )}
            </div>
            {response.questions.length === 0 ? (
              <p className="hint">این پاسخ جواب سؤالی ندارد.</p>
            ) : (
              <ol className="questions">
                {response.questions.map((question) => (
                  <li key={question.id}>
                    {editable ? (
                      <QuestionField
                        question={question}
                        value={draft.answers[String(question.id)] ?? null}
                        errors={errors[`question_${question.id}`]}
                        onChange={(value) =>
                          change((current) => ({
                            ...current,
                            answers: { ...current.answers, [String(question.id)]: value },
                          }))
                        }
                      />
                    ) : (
                      <div className="field">
                        <span className="question-text">{question.text}</span>
                        <ReadonlyAnswer question={question} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="form-sheet divided" aria-labelledby="new-item">
            <h2 id="new-item">{response.new_item.label}</h2>
            {editable ? (
              <TextField
                item={{ ...response.new_item, label: "شرح ریسک تازه" }}
                value={draft.new_item}
                errors={errors.new_item}
                rows={5}
                onChange={(value) => change((current) => ({ ...current, new_item: value }))}
              />
            ) : (
              <p className="answer-readonly">{response.new_item.value || <span className="status">ندارد</span>}</p>
            )}
          </section>

          {response.pending_risks.length > 0 && (
            <section className="form-sheet divided" aria-labelledby="pending">
              <div className="section-head">
                <h2 id="pending">ریسک‌های در انتظار</h2>
                <p className="hint">
                  از گزینه‌های «نشانه‌ی ریسک» و «مورد جدید» ساخته شده‌اند و عضو GRC تکلیفشان را تعیین می‌کند.
                </p>
              </div>
              <ul className="ledger">
                {response.pending_risks.map((item, index) => (
                  <li key={index} className="question-card">
                    <p className="prose">{item.description}</p>
                    <p className="work-sub">
                      <span>{item.source}</span>
                      <span>{item.status.label}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editable && (
            <div className="save-bar">
              <span className={dirty ? "save-state is-dirty" : "save-state"} aria-live="polite">
                {save.isPending ? "در حال ذخیره" : dirty ? "تغییرات ذخیره نشده است" : "همه‌ی تغییرات ذخیره شده است"}
              </span>
              <div className="actions">
                <button type="submit" name="action" value="save" className="button" disabled={save.isPending}>
                  ذخیره‌ی پیش‌نویس
                </button>
                <button
                  type="submit"
                  name="action"
                  value="submit"
                  className="button button-primary"
                  disabled={save.isPending}
                >
                  ارسال برای بررسی
                </button>
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
