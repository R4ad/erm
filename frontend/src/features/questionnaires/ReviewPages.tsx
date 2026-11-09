import {
  Briefcase,
  CheckCheck,
  ClipboardList,
  FilePlus2,
  Hourglass,
  Inbox,
  ListChecks,
  MessageSquareReply,
  Plus,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { ActionError, Fact, Prose, Section } from "@/features/records/dossier";
import { count, dateTime, formatNumber, longDate, shortDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import type { PendingRiskRow, ResponseReview, ReviewList } from "@/lib/types";

import { ResponseStatus } from "./status";
import { StructuredResponse } from "./StructuredResponse";

// پاسخ‌های پرسشنامه و بررسی عضو GRC (questionnaires/response_list.html و response_detail.html). فهرست همان فرم
// فیلتر جنگو را دارد و هر کس فقط پاسخ‌هایی را می‌بیند که جنگو نشانش می‌دهد. برگشت با سؤال، ریسک در انتظار تازه،
// ثبت در رجیستر و کنار گذاشتن فرم‌های همان view‌های جنگو هستند و «بررسی تمام شد» با همان view فرستاده می‌شود.

export function ResponseListPage() {
  useTitle("پاسخ‌ها و بررسی");
  const [params] = useSearchParams();
  const page = usePageData<ReviewList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="پاسخ‌های پرسشنامه"
        description={
          page.data
            ? `${count(page.data.count, "پاسخ")}. پاسخ ارسال‌شده منتظر بررسی عضو GRC است.`
            : "پاسخ ارسال‌شده منتظر بررسی عضو GRC است."
        }
        actions={
          page.data && (
            <AppLink href={page.data.queue_url} button={{ variant: "secondary" }}>
              <Inbox aria-hidden />
              صف بررسی (ارسال‌شده)
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر پاسخ‌ها" />
      <ListBody
        query={page}
        label="پاسخ‌ها"
        filtered={filtered}
        empty={{
          icon: <ClipboardList />,
          title: "هنوز پاسخی ثبت نشده",
          filteredTitle: "پاسخی با این مشخصات پیدا نشد",
          description: "مدیر واحد از «پاسخ به سؤال‌ها» پاسخ می‌دهد و عضو GRC مصاحبه را به نام او ثبت می‌کند.",
        }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">پاسخ‌های پرسشنامه</caption>
            <thead>
              <tr>
                <th scope="col">پرسشنامه</th>
                <th scope="col">واحد</th>
                <th scope="col">خدمت</th>
                <th scope="col">پاسخ‌دهنده</th>
                <th scope="col">ارسال</th>
                <th scope="col">ریسک در انتظار</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td data-primary className="min-w-48">
                    <AppLink href={row.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                      {row.questionnaire}
                    </AppLink>
                  </td>
                  <td data-label="واحد">{row.org_unit}</td>
                  <td data-label="خدمت">{row.service ? <bdi className="code">{row.service}</bdi> : "-"}</td>
                  <td data-label="پاسخ‌دهنده">
                    {row.respondent?.name ?? "-"}
                    {row.interview && <span className="text-xs text-muted"> (مصاحبه)</span>}
                  </td>
                  <td data-label="ارسال" className="whitespace-nowrap tabular">
                    {row.submitted_at ? shortDate(row.submitted_at) : "-"}
                  </td>
                  <td data-label="ریسک در انتظار">
                    {row.pending_count ? <Badge tone="warning">{formatNumber(row.pending_count)}</Badge> : "-"}
                  </td>
                  <td data-label="وضعیت">
                    <ResponseStatus row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </div>
  );
}

const PENDING_TONES: Record<string, Tone> = { pending: "warning", converted: "success" };

function PendingItem({ item }: { item: PendingRiskRow }) {
  return (
    <li className="flex flex-col gap-3 px-5 py-4">
      <p className="text-sm leading-7 whitespace-pre-line text-fg/90">{item.description}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
        <Badge tone={PENDING_TONES[item.status.value] ?? "neutral"} dot>
          {item.status.label}
        </Badge>
        <span>منبع: {item.source}</span>
        {item.scenario && (
          <span title={item.scenario.name}>
            سناریو <bdi className="code">{item.scenario.code}</bdi>
          </span>
        )}
        {item.category && (
          <span title={item.category.name}>
            دسته <bdi className="code">{item.category.code}</bdi>
          </span>
        )}
        {item.risk && (
          <span>
            ریسک{" "}
            <AppLink href={item.risk.href} className="code underline underline-offset-4">
              {item.risk.code}
            </AppLink>
          </span>
        )}
      </div>
      {item.status.value === "dismissed" && (
        <p className="text-xs text-muted">
          دلیل: {item.dismiss_reason}
          {item.duplicate_of && (
            <>
              {" "}
              (تکراری با{" "}
              <AppLink href={item.duplicate_of.href} className="code underline underline-offset-4">
                {item.duplicate_of.code}
              </AppLink>
              )
            </>
          )}
        </p>
      )}
      {(item.convert_url || item.dismiss_url) && (
        <div className="flex flex-wrap gap-2">
          {item.convert_url && (
            <AppLink href={item.convert_url} button={{ variant: "primary", size: "sm" }}>
              ثبت در رجیستر
            </AppLink>
          )}
          {item.dismiss_url && (
            <AppLink href={item.dismiss_url} button={{ variant: "secondary", size: "sm" }}>
              کنار گذاشتن
            </AppLink>
          )}
        </div>
      )}
    </li>
  );
}

function PendingRisks({ data }: { data: ResponseReview }) {
  return (
    <Section
      id="pending"
      title="ریسک‌های در انتظار"
      icon={<Hourglass />}
      actions={
        data.review && (
          <AppLink href={data.review.pending_create_url} button={{ variant: "secondary", size: "sm" }}>
            <Plus aria-hidden />
            ریسک در انتظار تازه
          </AppLink>
        )
      }
    >
      {data.pending_risks.length ? (
        <Card className="overflow-clip">
          <ul aria-label="ریسک‌های در انتظار این پاسخ" className="divide-y divide-line">
            {data.pending_risks.map((item) => (
              <PendingItem key={item.id} item={item} />
            ))}
          </ul>
        </Card>
      ) : (
        <p className="text-sm text-muted">ریسک در انتظاری از این پاسخ نیامده است.</p>
      )}
    </Section>
  );
}

/** کارهای عضو GRC روی پاسخ ارسال‌شده. */
function Review({ data }: { data: ResponseReview }) {
  const review = data.review;
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  if (!review) return null;
  return (
    <Section id="review" title="بررسی عضو GRC" icon={<CheckCheck />}>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <p className="text-sm leading-7 text-fg">
            هر ریسک در انتظار را در رجیستر ثبت کنید یا با دلیل کنار بگذارید. اگر جوابی مبهم است، پاسخ را با سؤال مشخص
            برگردانید؛ مهلت جواب پنج روز کاری است.
          </p>
          <ActionError error={action.error} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              disabled={review.undecided}
              loading={action.isPending}
              aria-describedby={review.undecided ? "review-undecided" : undefined}
              onClick={() => setConfirming(true)}
            >
              {!action.isPending && <CheckCheck aria-hidden />}
              بررسی تمام شد
            </Button>
            <AppLink href={review.return_url} button={{ variant: "secondary" }}>
              <Undo2 aria-hidden className="rtl:-scale-x-100" />
              برگشت با سؤال
            </AppLink>
          </div>
          {review.undecided && (
            <p id="review-undecided" className="text-xs text-warning">
              اول همه‌ی ریسک‌های در انتظار را در رجیستر ثبت کنید یا کنار بگذارید.
            </p>
          )}
        </CardContent>
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title="بررسی این پاسخ تمام شود؟"
          description="پاسخ «بررسی‌شده» می‌شود و بعد از آن دیگر برگشت داده نمی‌شود."
          confirmLabel="بررسی تمام شد"
          loading={action.isPending}
          onConfirm={() => {
            setConfirming(false);
            action.mutate({ url: review.reviewed_url, values: {} });
          }}
        />
      </Card>
    </Section>
  );
}

function Answers({ data }: { data: ResponseReview }) {
  if (data.structured) {
    return (
      <Section id="answers" title="خدمات و شاخه‌های اختلال" icon={<ListChecks />}>
        {data.structured.data.length ? (
          <StructuredResponse
            id={String(data.response.id)}
            response={{
              can_edit: false,
              structured_data: data.structured.data,
              structured_questions: data.structured.questions,
            }}
          />
        ) : (
          <p className="text-sm text-muted">خدمتی ثبت نشده است.</p>
        )}
      </Section>
    );
  }
  const answers = data.answers ?? [];
  return (
    <Section id="answers" title="جواب‌ها" icon={<ListChecks />}>
      <Card>
        <CardHeader as="h3" icon={<Briefcase />} title="کارکردها و پرسش‌های جلسه" />
        <CardContent>
          <dl className="flex flex-col divide-y divide-line">
            {(data.fixed ?? []).map((item) => (
              <div key={item.label} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                <dt className="text-xs text-muted">{item.label}</dt>
                <dd className="text-sm text-fg/90">
                  <Prose text={item.value} />
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader as="h3" icon={<ClipboardList />} title="جواب سؤال‌ها" />
        <CardContent>
          {answers.length ? (
            <ol className="flex flex-col divide-y divide-line">
              {answers.map((answer, index) => (
                <li key={answer.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface text-xs text-muted tabular"
                  >
                    {formatNumber(index + 1)}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <p className="text-sm font-medium whitespace-pre-line text-fg">{answer.question}</p>
                    {answer.has_options ? (
                      answer.options.length ? (
                        <p className="flex flex-wrap items-center gap-2 text-sm text-fg/90">
                          {answer.options.map((option) => (
                            <span key={option.text} className="inline-flex items-center gap-1.5">
                              {option.text}
                              {option.indicates_risk && <Badge tone="warning">نشانه‌ی ریسک</Badge>}
                            </span>
                          ))}
                        </p>
                      ) : (
                        <p className="text-sm text-muted">بی‌جواب</p>
                      )
                    ) : answer.text ? (
                      <p className="text-sm leading-7 whitespace-pre-line text-fg/90">{answer.text}</p>
                    ) : (
                      <p className="text-sm text-muted">بی‌جواب</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">هنوز جوابی ثبت نشده است.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader as="h3" icon={<FilePlus2 />} title="مورد جدید" />
        <CardContent>
          <p className="text-sm leading-7 text-fg/90">
            <Prose text={data.new_item ?? ""} />
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}

function Facts({ data }: { data: ResponseReview }) {
  const { response } = data;
  return (
    <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
      <CardHeader title="مشخصات" />
      <CardContent>
        <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-sm">
          <Fact label="پرسشنامه">
            <AppLink href={response.questionnaire.href}>{response.questionnaire.title}</AppLink>
          </Fact>
          <Fact label="واحد">{response.org_unit}</Fact>
          {!response.is_structured && (
            <Fact label="خدمت">
              {response.service ? (
                <>
                  <bdi className="code">{response.service.code}</bdi> {response.service.name}
                </>
              ) : (
                "-"
              )}
            </Fact>
          )}
          <Fact label="پاسخ‌دهنده">
            {response.respondent?.name ?? "-"}
            {response.interview && (
              <span className="block text-xs text-muted">مصاحبه، ثبت با {response.recorded_by?.name}</span>
            )}
          </Fact>
          <Fact label="ارسال">{response.submitted_at ? dateTime(response.submitted_at) : "هنوز ارسال نشده"}</Fact>
          {response.reviewed_at && (
            <Fact label="بررسی">
              {response.reviewed_by?.name}، {longDate(response.reviewed_at)}
            </Fact>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Header({ data }: { data?: ResponseReview }) {
  const response = data?.response;
  return (
    <PageHeader
      breadcrumb={[
        { label: "پاسخ‌ها و بررسی", to: "/questionnaires/responses" },
        { label: response?.questionnaire.title ?? "پاسخ" },
      ]}
      title={response?.questionnaire.title ?? "پاسخ پرسشنامه"}
      description={response && [response.org_unit, response.service?.code].filter(Boolean).join("، ")}
      meta={response && <ResponseStatus row={response} />}
      actions={
        data?.answer_url && (
          <AppLink href={data.answer_url} button={{ variant: "primary" }}>
            <MessageSquareReply aria-hidden />
            ادامه‌ی پاسخ
          </AppLink>
        )
      }
    />
  );
}

export function ResponseReviewPage() {
  const page = usePageData<ResponseReview>();
  useTitle(page.data?.title ?? "پاسخ پرسشنامه");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) return <DetailState query={page} header={<Header />} />;
  const data = page.data;
  const { response } = data;
  return (
    <article className="flex flex-col gap-6">
      <Header data={data} />
      {response.return_question && (
        <Alert tone="warning" title="سؤال برگشت">
          <p className="whitespace-pre-line">{response.return_question}</p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {response.returned_at && <span>برگشت {longDate(response.returned_at)}</span>}
            <Deadline value={response.return_due} label="مهلت جواب" />
          </p>
        </Alert>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Review data={data} />
          <PendingRisks data={data} />
          <Answers data={data} />
        </div>
        <aside aria-label="مشخصات پاسخ">
          <Facts data={data} />
        </aside>
      </div>
    </article>
  );
}
