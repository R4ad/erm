import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, ClipboardPen, FileQuestion, MessageCircleQuestionMark } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { formatNumber, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { AnswerHome } from "@/lib/types";

import { ResponseStatus } from "./status";

export function AnswerHomePage() {
  useTitle("پاسخ به سؤال‌ها");
  const home = useQuery({
    queryKey: ["answer-home"],
    queryFn: ({ signal }) => get<AnswerHome>("questionnaires/", signal),
  });

  if (home.isPending) return <PageSkeleton />;
  if (home.isError) return <ErrorState error={home.error} retry={() => home.refetch()} />;
  const data = home.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="پاسخ به سؤال‌ها"
        description="پرسشنامه‌ی شناسایی ریسک را برای واحد یا خدمت خود پر کنید. جواب‌ها تا ارسال، پیش‌نویس می‌مانند."
      />

      {data.risk_question_count > 0 && (
        <Alert
          tone="info"
          title={`${formatNumber(data.risk_question_count)} پرسش ریسک منتظر جواب شماست.`}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link to="/questionnaires/risk-questions" viewTransition>
                <MessageCircleQuestionMark aria-hidden />
                جواب دادن
              </Link>
            </Button>
          }
        >
          عضو GRC برای ارزیابی ریسک‌های واحد شما پرسیده است.
        </Alert>
      )}

      <section aria-labelledby="active" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="active" className="text-title font-semibold">
            پرسشنامه‌های فعال
          </h2>
          {!data.can_answer && (
            <p className="text-sm text-muted">
              پاسخ تازه را مدیر واحد برای واحدهای خودش و عضو GRC در مصاحبه می‌سازد. شما واحدی برای پاسخ ندارید.
            </p>
          )}
        </div>
        {data.questionnaires.length === 0 ? (
          <EmptyState
            as="h3"
            icon={<ClipboardList />}
            title="پرسشنامه‌ی فعالی نیست"
            description="عضو GRC پرسشنامه را بعد از آماده شدن سؤال‌ها فعال می‌کند."
          />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.questionnaires.map((questionnaire) => (
              <li key={questionnaire.id}>
                <Card className="group flex h-full flex-col transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong">
                  <CardHeader
                    as="h3"
                    icon={<ClipboardPen />}
                    title={questionnaire.title}
                    description={`${formatNumber(questionnaire.question_count)} سؤال`}
                  />
                  {questionnaire.description && (
                    <p className="line-clamp-3 px-5 text-sm text-muted">{questionnaire.description}</p>
                  )}
                  <div className="mt-auto flex justify-end px-5 pt-4 pb-5">
                    {data.can_answer && (
                      <Button asChild variant="primary" size="sm">
                        <Link to={`/questionnaires/${questionnaire.id}/start`} viewTransition>
                          شروع پاسخ
                          <ArrowLeft aria-hidden className="ltr:-scale-x-100" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="mine" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="mine" className="flex items-center gap-2 text-title font-semibold">
            پاسخ‌های من
            <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted tabular">
              {formatNumber(data.my_responses.length)}
            </span>
          </h2>
          <p className="text-sm text-muted">پاسخ‌هایی که داده‌اید یا در مصاحبه ثبت کرده‌اید.</p>
        </div>
        {data.my_responses.length === 0 ? (
          <EmptyState as="h3" icon={<FileQuestion />} title="هنوز پاسخی نداده‌اید" />
        ) : (
          <Card className="table-shell overflow-clip">
            <table className="data-table">
              <caption className="sr-only">پاسخ‌های من</caption>
              <thead>
                <tr>
                  <th scope="col">پرسشنامه</th>
                  <th scope="col">وضعیت</th>
                  <th scope="col">پاسخ‌دهنده</th>
                  <th scope="col">آخرین تغییر</th>
                  <th scope="col">
                    <span className="sr-only">کار</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.my_responses.map((row) => (
                  <tr key={row.id}>
                    <td data-primary>
                      <Link
                        to={`/responses/${row.id}`}
                        viewTransition
                        className="font-medium text-fg hover:text-accent-text"
                      >
                        {row.questionnaire}
                      </Link>
                      <div className="mt-0.5 text-xs text-muted">
                        {row.org_unit}
                        {row.service && (
                          <>
                            ، خدمت <bdi className="code">{row.service}</bdi>
                          </>
                        )}
                      </div>
                    </td>
                    <td data-label="وضعیت">
                      <ResponseStatus row={row} />
                    </td>
                    <td data-label="پاسخ‌دهنده">
                      <span className="flex flex-col">
                        {row.respondent?.name}
                        {row.channel.value === "interview" && <span className="text-xs text-muted">مصاحبه</span>}
                      </span>
                    </td>
                    <td data-label="آخرین تغییر" className="whitespace-nowrap text-muted">
                      <time dateTime={row.updated_at.iso}>{shortDate(row.updated_at)}</time>
                    </td>
                    <td data-empty={row.is_editable ? undefined : ""} className="text-end">
                      {row.is_editable && (
                        <Button asChild variant="secondary" size="sm">
                          <Link
                            to={`/responses/${row.id}`}
                            viewTransition
                            aria-label={`ادامه‌ی پاسخ ${row.questionnaire}`}
                          >
                            ادامه‌ی پاسخ
                          </Link>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
