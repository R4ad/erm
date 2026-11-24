import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";

import { usePageCrumbs } from "@/components/layout/crumbs-context";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ago } from "@/lib/format";
import { useNow, useTitle } from "@/lib/hooks";
import type { AiRunState, ResponseReview, ReviewHistoryEvent, ReviewRisk, ReviewRisks } from "@/lib/types";
import { useSession } from "@/features/session/session";

import { AnswersCard } from "./AnswersCard";
import { serviceTitle, withApprovals } from "./review";
import { EmptyCard, ErrorCard, IntroCard, ResultsCard, RunningCard, type RiskActions } from "./AiPanel";
import { useDeferredApprovals } from "./approvals";
import { CompareDialog, DecisionBar, ReanalyseButton, RejectDialog } from "./Decisions";
import { EditRiskDrawer } from "./EditRiskDrawer";
import { ReturnDialog } from "./ReturnDialog";

// «بررسی یک پاسخنامه» (فریم‌های 12a تا 12c): سربرگ با پیوند بازگشت، ستون پاسخ‌ها در راست و ستون کناری ۴۵۲ پیکسلی
// (پنل شناسایی هوشمند و تاریخچه) در چپ. وضعیت اجرای شناسایی تا وقتی در صف یا در حال اجراست هر ۱٫۵ ثانیه خوانده
// می‌شود و با پایانش ریسک‌ها، تاریخچه و سربرگ دوباره خوانده می‌شوند.

const POLL_MS = 1500;

const DOTS: Record<ReviewHistoryEvent["tone"], string> = {
  neutral: "bg-ink-3",
  info: "bg-info",
  warning: "bg-warning",
  success: "bg-success",
  danger: "bg-danger",
  tangerine: "bg-tangerine-bright",
};

function HistoryCard({ events }: { events: ReviewHistoryEvent[] | undefined }) {
  const now = useNow();
  return (
    <Card
      role="region"
      aria-labelledby="history-title"
      className="flex flex-col gap-3 rounded-card px-5 py-4 shadow-card"
    >
      <h2 id="history-title" className="text-h3 font-semibold text-ink">
        تاریخچه
      </h2>
      {events ? (
        <ol className="flex flex-col">
          {events.map((item, index) => (
            <li key={`${item.at.iso}-${index}`} className="relative flex gap-2.5 pb-3.5 last:pb-0">
              {index < events.length - 1 && (
                <span aria-hidden className="absolute start-[0.2rem] top-3.5 bottom-0 w-px bg-line" />
              )}
              <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOTS[item.tone])} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="text-sm text-ink">{item.actor ? `${item.text} · ${item.actor.name}` : item.text}</p>
                <p className="text-xs text-ink-3">
                  <time dateTime={item.at.iso}>{ago(item.at, now)}</time>
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="skeleton h-3 w-3/4 rounded-lg" />
          <div className="skeleton h-3 w-1/2 rounded-lg" />
        </div>
      )}
    </Card>
  );
}

export function ResponseReviewPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const now = useNow();
  const key = ["response-review", id] as const;

  const detail = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => get<ResponseReview>(`questionnaire-responses/${id}/`, signal),
  });
  const data = detail.data;
  useTitle(data ? `پاسخنامه‌ی ${data.code}` : "بررسی پاسخنامه‌ها");
  usePageCrumbs(
    data
      ? [
          { label: "شناسایی ریسک", to: "/identification" },
          { label: "بررسی پاسخنامه‌ها", to: "/identification/responses" },
          { label: data.code, code: true },
        ]
      : null,
  );

  const risks = useQuery({
    queryKey: [...key, "risks"],
    queryFn: ({ signal }) => get<ReviewRisks>(`questionnaire-responses/${id}/risks/`, signal),
    enabled: Boolean(data),
  });
  const history = useQuery({
    queryKey: [...key, "history"],
    queryFn: ({ signal }) => get<{ events: ReviewHistoryEvent[] }>(`questionnaire-responses/${id}/history/`, signal),
    enabled: Boolean(data),
  });

  const runId = data?.run?.id;
  const runQuery = useQuery({
    queryKey: ["ai-run", runId],
    queryFn: ({ signal }) => get<AiRunState>(`ai-runs/${runId}/`, signal),
    enabled: runId != null && Boolean(data?.run?.active),
    initialData: data?.run ?? undefined,
    refetchInterval: (query) => (query.state.data?.active ? POLL_MS : false),
  });
  const run = runQuery.data?.id === runId ? runQuery.data : (data?.run ?? null);

  // با پایان اجرای شناسایی (موفق، خالی، خطا یا لغو) ریسک‌ها، تاریخچه و سربرگ دوباره خوانده می‌شوند.
  const active = Boolean(run?.active);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) void queryClient.invalidateQueries({ queryKey: ["response-review", id] });
    wasActive.current = active;
  }, [active, id, queryClient]);

  function showRun(next: AiRunState) {
    queryClient.setQueryData(["ai-run", next.id], next);
    queryClient.setQueryData<ResponseReview>(key, (current) => (current ? { ...current, run: next } : current));
  }

  const start = useMutation({
    mutationFn: () => post<{ run_id: number; run: AiRunState }>(`questionnaire-responses/${id}/ai-identification/`, {}),
    onSuccess: (result) => showRun(result.run),
    onError: (error) => toast({ title: errorMessage(error), tone: "danger" }),
  });
  const cancel = useMutation({
    mutationFn: (target: number) => post<AiRunState>(`ai-runs/${target}/cancel/`, {}),
    onSuccess: (result) => {
      showRun(result);
      if (result.status === "cancelled") toast({ title: "شناسایی هوشمند لغو شد.", tone: "info" });
    },
    onError: (error) => toast({ title: errorMessage(error), tone: "danger" }),
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { user } = useSession();
  const approvals = useDeferredApprovals(id);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<ReviewRisk | null>(null);
  const [comparing, setComparing] = useState<{ risk: ReviewRisk; similarId: number } | null>(null);
  const [returning, setReturning] = useState(false);

  if (detail.isPending) return <PageSkeleton />;
  if (detail.isError) return <ErrorState error={detail.error} retry={() => void detail.refetch()} />;
  if (!data) return null;

  const shown = risks.data && withApprovals(risks.data, approvals.approving, user);
  const list = shown?.risks ?? [];
  const pending = list.filter((risk) => risk.status.value === "pending");
  const selected = pending.find((risk) => risk.id === selectedId) ?? pending[0] ?? null;
  const editing = pending.find((risk) => risk.id === editingId) ?? null;

  const actions: RiskActions = {
    compare: (risk) => risk.similar[0] && setComparing({ risk, similarId: risk.similar[0].id }),
    render: data.can_review
      ? (risk) => (
          <DecisionBar
            onApprove={() => approvals.approve(risk.id)}
            onEdit={() => setEditingId(risk.id)}
            onReject={() => setRejecting(risk)}
          />
        )
      : undefined,
  };
  const reanalyse = data.can_review ? (
    <ReanalyseButton
      pending={shown?.counts.pending ?? 0}
      starting={start.isPending}
      onConfirm={async () => {
        // تأییدهای ۱۰ ثانیه‌ی بازگردانی پیش از بایگانی پیش‌نویس‌ها ثبت می‌شوند تا با آن‌ها بایگانی نشوند.
        await approvals.flush();
        await start.mutateAsync().catch(() => undefined);
      }}
    />
  ) : undefined;

  // تأییدهای در انتظار بازگردانی پیش از خواندن گزینه‌های 12e ثبت می‌شوند تا در یادداشت «حفظ می‌شود» بیایند و بایگانی نشوند.
  async function openReturn() {
    await approvals.flush();
    setReturning(true);
  }
  const returnButton = (size: "sm" | "md") =>
    data.can_review ? (
      <Button variant="secondary" size={size} onClick={() => void openReturn()}>
        <MessageSquareText aria-hidden />
        بازگرداندن برای تکمیل
      </Button>
    ) : undefined;

  const side: ReactNode[] = [];
  if (run?.active) {
    side.push(
      <RunningCard key="running" run={run} onCancel={() => cancel.mutate(run.id)} cancelling={cancel.isPending} />,
    );
  } else {
    if (run?.status === "failed") {
      side.push(
        <ErrorCard
          key="error"
          run={run}
          onRetry={data.can_review ? () => start.mutate() : undefined}
          retrying={start.isPending}
        />,
      );
    } else if (run?.status === "empty") {
      side.push(<EmptyCard key="empty" data={data} returnAction={returnButton("sm")} />);
    }
    if (shown && list.length > 0) {
      side.push(
        <ResultsCard
          key="results"
          data={data}
          risks={shown}
          selectedId={selected?.id ?? null}
          onSelect={setSelectedId}
          actions={actions}
          reanalyse={reanalyse}
        />,
      );
    } else if (shown && side.length === 0 && data.can_review) {
      side.push(<IntroCard key="intro" data={data} onStart={() => start.mutate()} starting={start.isPending} />);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          to="/identification/responses"
          viewTransition
          className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        >
          <Icon name="arrow-right" size={16} className="ltr:rotate-180" />
          بازگشت به بررسی پاسخنامه‌ها
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-h1 font-bold text-ink">{serviceTitle(data.service) || data.code}</h1>
              <Badge tone={data.status.tone}>{data.status.label}</Badge>
            </div>
            <p className="text-xs text-ink-3">
              <bdi className="code">{data.code}</bdi>
              {` · ${data.org_unit} · ${data.respondent.name}`}
              {data.submitted_at && ` · ارسال ${ago(data.submitted_at, now)}`}
            </p>
          </div>
          {(data.next || data.can_review) && (
            <div className="flex flex-wrap items-center gap-2">
              {returnButton("md")}
              {data.next ? (
                <Link to={data.next.route} className={buttonClasses({ variant: "ghost" })}>
                  پاسخنامه‌ی بعدی
                  <Icon name="chevron-left" size={18} className="ltr:rotate-180" />
                </Link>
              ) : (
                <Button variant="ghost" onClick={() => toast({ title: "پاسخنامه‌ی دیگری در صف نیست.", tone: "info" })}>
                  پاسخنامه‌ی بعدی
                  <Icon name="chevron-left" size={18} className="ltr:rotate-180" />
                </Button>
              )}
            </div>
          )}
        </div>
      </header>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28.25rem]">
        <AnswersCard data={data} selected={selected} risks={list} />
        <aside aria-label="شناسایی هوشمند و تاریخچه" className="flex min-w-0 flex-col gap-4">
          {risks.isError ? <ErrorState error={risks.error} retry={() => void risks.refetch()} /> : side}
          <HistoryCard events={history.data?.events} />
        </aside>
      </div>
      <EditRiskDrawer
        data={data}
        risk={editing}
        onOpenChange={(open) => !open && setEditingId(null)}
        onApprove={approvals.approve}
      />
      <RejectDialog
        risk={rejecting}
        onOpenChange={(open) => !open && setRejecting(null)}
        onRejected={() => {
          setRejecting(null);
          toast({ title: "ریسک پیشنهادی رد شد.", tone: "success" });
          void queryClient.invalidateQueries({ queryKey: ["response-review", id] });
        }}
      />
      <CompareDialog target={comparing} onOpenChange={(open) => !open && setComparing(null)} />
      {id && <ReturnDialog id={id} respondent={data.respondent.name} open={returning} onOpenChange={setReturning} />}
    </div>
  );
}
