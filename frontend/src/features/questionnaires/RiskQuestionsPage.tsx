import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, MessageCircleQuestionMark, Send } from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { Field, Textarea } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, get, post } from "@/lib/api";
import { faText, formatNumber, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { RiskQuestion } from "@/lib/types";
import { z } from "@/lib/zod";

const schema = z.object({ answer: z.string().trim().min(1, "جواب را بنویسید.") });
type Values = z.infer<typeof schema>;

interface CardProps {
  question: RiskQuestion;
  hidden: boolean;
  onSending: (id: number) => void;
  onFailed: (id: number) => void;
}

function QuestionCard({ question, hidden, onSending, onFailed }: CardProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { answer: "" } });
  const send = useMutation({
    mutationFn: (values: Values) =>
      post<{ message: string }>(`risk-questions/${question.id}/answer/`, { answer: values.answer.trim() }),
    // کارت همان لحظه از فهرست کنار می‌رود و اگر سرور نپذیرفت با همان متن برمی‌گردد.
    onMutate: () => onSending(question.id),
    onSuccess: (result) => {
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries({ queryKey: ["risk-questions"] });
      void queryClient.invalidateQueries({ queryKey: ["my-work"] });
      void queryClient.invalidateQueries({ queryKey: ["answer-home"] });
    },
    onError: (error) => {
      onFailed(question.id);
      const messages = error instanceof ApiError ? error.errors.answer : undefined;
      if (messages?.length) form.setError("answer", { type: "server", message: messages.join(" ") });
      form.setFocus("answer");
    },
  });
  const general =
    send.isError && !(send.error instanceof ApiError && send.error.errors.answer) ? send.error.message : null;

  return (
    <li hidden={hidden}>
      <Card className="overflow-clip">
        <form noValidate onSubmit={form.handleSubmit((values) => send.mutate(values))}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Link
                  to={`/risks/${question.risk.id}`}
                  viewTransition
                  className="code text-accent-text hover:underline"
                >
                  {question.risk.code}
                </Link>
                <span className="font-medium text-fg">{question.risk.title}</span>
              </p>
              <p className="text-xs text-muted">
                واحد {question.risk.org_unit}، پرسش {question.asked_by?.name}، {longDate(question.asked_at)}
              </p>
            </div>
            {question.due ? <Deadline value={question.due} label="مهلت جواب" /> : <Badge>بدون مهلت</Badge>}
          </div>
          <div className="flex flex-col gap-4 px-5 py-5">
            {general && (
              <Alert tone="danger" role="alert">
                {general}
              </Alert>
            )}
            <Field
              label={<span className="text-base leading-8 font-medium whitespace-pre-line">{question.text}</span>}
              error={form.formState.errors.answer?.message}
            >
              <Textarea rows={4} placeholder="جواب خود را بنویسید" {...form.register("answer")} />
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={send.isPending}>
                {!send.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
                {send.isPending ? "در حال ثبت" : "ثبت جواب"}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </li>
  );
}

export function RiskQuestionsPage() {
  useTitle("پرسش‌های ریسک");
  const questions = useQuery({
    queryKey: ["risk-questions"],
    queryFn: ({ signal }) => get<{ questions: RiskQuestion[] }>("risk-questions/", signal),
  });
  const [sending, setSending] = useState<Set<number>>(() => new Set());
  const list = useRef<HTMLUListElement>(null);

  function hide(id: number) {
    setSending((current) => new Set(current).add(id));
    // فوکوس از کارت پنهان‌شده به جواب پرسش بعدی می‌رود تا صفحه‌کلید سر جایش بماند.
    requestAnimationFrame(() => {
      list.current?.querySelector<HTMLTextAreaElement>("li:not([hidden]) textarea")?.focus();
    });
  }

  function show(id: number) {
    setSending((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  if (questions.isPending) return <PageSkeleton rows={3} />;
  if (questions.isError) return <ErrorState error={questions.error} retry={() => questions.refetch()} />;

  const items = questions.data.questions;
  const visible = items.filter((question) => !sending.has(question.id));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "پاسخ به سؤال‌ها", to: "/questionnaires" }, { label: "پرسش‌های ریسک" }]}
        title="پرسش‌های ریسک"
        description="عضو GRC برای ارزیابی ریسک‌های واحد شما این‌ها را پرسیده است. با جواب شما ارزیابی ادامه پیدا می‌کند."
        meta={visible.length > 0 && <Badge tone="accent">{formatNumber(visible.length)} پرسش باز</Badge>}
      />
      {visible.length === 0 && (
        <EmptyState
          icon={items.length ? <CheckCheck /> : <MessageCircleQuestionMark />}
          title="پرسش بازی منتظر جواب شما نیست"
          description="پرسش تازه‌ی هر ریسک در «کارهای من» هم دیده می‌شود."
          action={
            <Button asChild variant="secondary">
              <Link to="/" viewTransition>
                کارهای من
              </Link>
            </Button>
          }
        />
      )}
      <ul ref={list} className="flex flex-col gap-5" aria-label="پرسش‌های باز">
        {items.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            hidden={sending.has(question.id)}
            onSending={hide}
            onFailed={show}
          />
        ))}
      </ul>
    </div>
  );
}
