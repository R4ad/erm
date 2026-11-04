import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { ApiError, get, post } from "../api";
import { DeadlineText, ErrorNotice, FieldError, Loading, RiskCode, useTitle } from "../components/bits";
import { faText, longDate } from "../format";
import type { RiskQuestion } from "../types";

function QuestionItem({ question, onAnswered }: { question: RiskQuestion; onAnswered: (message: string) => void }) {
  const [answer, setAnswer] = useState("");
  const send = useMutation({
    mutationFn: () => post<{ message: string }>(`risk-questions/${question.id}/answer/`, { answer }),
    onSuccess: (result) => onAnswered(result.message),
  });
  const errors = send.error instanceof ApiError ? send.error.errors.answer : undefined;
  const id = `answer-${question.id}`;

  function submit(event: FormEvent) {
    event.preventDefault();
    send.mutate();
  }

  return (
    <li>
      <form className="form-sheet" onSubmit={submit} noValidate>
        <div className="work-row without-level flush">
          <div>
            <p className="work-sub">
              <span>
                <RiskCode risk={question.risk} /> {question.risk.title}
              </span>
              <span>واحد {question.risk.org_unit}</span>
            </p>
            <p className="work-sub">
              پرسش {question.asked_by?.name}، {longDate(question.asked_at)}
            </p>
          </div>
          <DeadlineText value={question.due} label="مهلت جواب" />
        </div>
        <div className="field">
          <label className="field-label question-text question-lead" htmlFor={id}>
            {question.text}
          </label>
          <textarea
            id={id}
            className="textarea"
            rows={4}
            value={answer}
            aria-invalid={errors ? true : undefined}
            aria-describedby={errors ? `${id}-error` : undefined}
            onChange={(event) => setAnswer(event.target.value)}
          />
          <FieldError id={`${id}-error`} messages={errors} />
          {send.isError && !errors && <ErrorNotice error={send.error} />}
        </div>
        <div className="actions">
          <button type="submit" className="button button-primary" disabled={send.isPending}>
            {send.isPending ? "در حال ثبت" : "ثبت جواب"}
          </button>
        </div>
      </form>
    </li>
  );
}

export function RiskQuestions() {
  useTitle("پرسش‌های ریسک");
  const queryClient = useQueryClient();
  const questions = useQuery({
    queryKey: ["risk-questions"],
    queryFn: () => get<{ questions: RiskQuestion[] }>("risk-questions/"),
  });
  const [messages, setMessages] = useState<string[]>([]);

  function answered(message: string) {
    setMessages((current) => [...current, message]);
    queryClient.invalidateQueries({ queryKey: ["risk-questions"] });
    queryClient.invalidateQueries({ queryKey: ["my-work"] });
    queryClient.invalidateQueries({ queryKey: ["answer-home"] });
  }

  const list = questions.data?.questions;

  return (
    <div className="page">
      <header className="page-head">
        <div className="page-head-text">
          <nav className="crumbs" aria-label="مسیر">
            <Link to="/questionnaires">پاسخ به سؤال‌ها</Link>
          </nav>
          <h1>پرسش‌های ریسک</h1>
          <p className="page-lead">
            عضو GRC برای ارزیابی ریسک‌های واحد شما این‌ها را پرسیده است. با جواب شما ارزیابی ادامه پیدا می‌کند.
          </p>
        </div>
      </header>

      {messages.map((message, index) => (
        <p key={index} className="notice notice-success" role="status">
          {faText(message)}
        </p>
      ))}

      {questions.isPending && <Loading />}
      {questions.isError && <ErrorNotice error={questions.error} retry={() => questions.refetch()} />}
      {list && list.length === 0 && (
        <div className="sheet empty">
          <h2>پرسش بازی منتظر جواب شما نیست</h2>
          <p className="hint">پرسش تازه‌ی هر ریسک در «کارهای من» هم دیده می‌شود.</p>
          <Link className="button" to="/">
            کارهای من
          </Link>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="ledger sheet">
          {list.map((question) => (
            <QuestionItem key={question.id} question={question} onAnswered={answered} />
          ))}
        </ul>
      )}
    </div>
  );
}
