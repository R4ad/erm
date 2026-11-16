import { useQuery } from "@tanstack/react-query";
import { CircleDot, ClipboardList, FilePlus2, Hourglass, ListChecks } from "lucide-react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { dateTime, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { QuestionItem, ResponseDetail } from "@/lib/types";

import { ResponseWizard } from "./ResponseWizard";
import { ResponseStatus } from "./status";
import { StructuredResponse } from "./StructuredResponse";

// پاسخ قابل ویرایش کلاسیک گام‌به‌گام در ResponseWizard است (فیگما ۱۰)؛ این صفحه پاسخ ارسال‌شده را فقط‌خواندنی و
// پرسشنامه‌ی شاخه‌ای را با StructuredResponse نشان می‌دهد.

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
  // پاسخ کلاسیک قابل ویرایش، گام‌به‌گام به چیدمان فیگما ۱۰.
  if (!response.is_structured && response.can_edit) {
    return <ResponseWizard key={`edit-${response.id}`} response={response} id={id} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: "پاسخ به سؤال‌ها", to: "/questionnaires" }, { label: response.questionnaire.title }]}
        title={response.questionnaire.title}
        description={response.questionnaire.description || undefined}
        actions={
          <AppLink href={response.classic_url} button={{ variant: "ghost", size: "sm" }}>
            پرونده‌ی پاسخ
          </AppLink>
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
      ) : (
        <ReadonlyResponse response={response} />
      )}
    </div>
  );
}
