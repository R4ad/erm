import { Bell, BellRing, Check, ClipboardCheck, History } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, Fact, NotesField, Prose, Reasons, Section } from "@/features/records/dossier";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { count, dateTime } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { MonitoringNotice, NoticeList, ReviewDetail } from "@/lib/types";

// اعلان‌های پایش و کار بازبینی ریسک بخش ۲۱ (actions/notices.html و review_detail.html). هر کس فقط اعلان‌های خودش
// را برای ریسک‌هایی که می‌بیند دارد؛ «خواندم» و ثبت نتیجه‌ی بازبینی با همان view جنگو فرستاده می‌شوند. اعلان فقط
// درون سامانه است و به ایمیل یا پیامک فرستاده نمی‌شود.

function NoticeItem({ notice }: { notice: MonitoringNotice }) {
  const action = useBridgeAction();
  return (
    <li className={cn("flex gap-3 px-4 py-4 sm:gap-4 sm:px-5", !notice.read && "bg-accent-soft/30")}>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border [&_svg]:size-4",
          notice.read ? "border-line bg-surface text-muted" : "border-accent-line/60 bg-accent-soft text-accent-text",
        )}
      >
        {notice.read ? <Bell /> : <BellRing />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm leading-7 text-fg">
          <AppLink href={notice.href} className={cn("hover:text-accent-text", !notice.read && "font-medium")}>
            <bdi className="code">{notice.risk.code}</bdi>: {notice.message}
          </AppLink>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{dateTime(notice.created_at)}</span>
            {!notice.read && <Badge tone="accent">تازه</Badge>}
          </p>
          {notice.read_url && (
            <Button
              variant="secondary"
              size="sm"
              loading={action.isPending}
              aria-label={`خواندم: ${notice.risk.code}، ${notice.message}`}
              onClick={() => notice.read_url && action.mutate({ url: notice.read_url, values: {} })}
            >
              {!action.isPending && <Check aria-hidden />}
              خواندم
            </Button>
          )}
        </div>
        <ActionError error={action.error} />
      </div>
    </li>
  );
}

export function NoticeListPage() {
  useTitle("اعلان‌های پایش");
  const page = usePageData<NoticeList>();
  const notices = page.data?.notices ?? [];
  const unread = notices.filter((notice) => !notice.read).length;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="اعلان‌های پایش"
        description={
          page.data
            ? `${count(unread, "اعلان")} خوانده‌نشده. اعلان فقط درون سامانه است و صد اعلان آخر نشان داده می‌شود.`
            : "اعلان فقط درون سامانه است و صد اعلان آخر نشان داده می‌شود."
        }
      />
      {page.isPending ? (
        <PageSkeleton rows={4} />
      ) : page.isError && !page.data ? (
        <ErrorState error={page.error} retry={() => page.refetch()} />
      ) : notices.length ? (
        <Card className="overflow-clip">
          <ul aria-label="اعلان‌ها" className="divide-y divide-line">
            {notices.map((notice) => (
              <NoticeItem key={notice.id} notice={notice} />
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState
          icon={<Bell />}
          title="اعلانی ثبت نشده است"
          description="یادآوری سررسید، انقضای پذیرش و کارهای بازبینی این‌جا می‌آیند."
        />
      )}
    </div>
  );
}

function CompleteBox({ data }: { data: ReviewDetail }) {
  const complete = data.complete;
  const [result, setResult] = useState("");
  const action = useBridgeAction();
  if (!complete) return null;
  // خطای فیلد نتیجه کنار همان کادر و خطای کل فرم (مثل «ارزیابی کامل سالانه با ارزیابی جاری تأییدشده تازه پایان
  // می‌یابد») بالای آن.
  const error = action.error instanceof ApiError ? action.error : null;
  const fieldError = error?.errors.result?.join(" ");
  const general = error?.errors.__all__ ?? [];
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <Reasons tone="danger" items={general} />
        {action.error && !error && <ActionError error={action.error} />}
        <NotesField
          field={complete.result}
          value={result}
          onChange={setResult}
          disabled={action.isPending}
          error={fieldError}
        />
        <div>
          <Button
            variant="primary"
            loading={action.isPending}
            onClick={() => action.mutate({ url: complete.url, values: { result } })}
          >
            {!action.isPending && <Check aria-hidden />}
            ثبت نتیجه بررسی
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewHeader({ data }: { data?: ReviewDetail }) {
  const review = data?.review;
  return (
    <PageHeader
      breadcrumb={[{ label: "کارهای من", to: "/" }, { label: review ? `بازبینی ${review.risk.code}` : "بازبینی" }]}
      title={review ? `${review.trigger.label}: ${review.risk.code}` : "بازبینی ریسک"}
      meta={
        review &&
        (review.completed_at ? (
          <Badge tone="success" dot>
            نتیجه ثبت شده
          </Badge>
        ) : (
          <Badge tone="warning" dot>
            باز
          </Badge>
        ))
      }
      actions={
        review && (
          <AppLink href={review.risk.href} button={{ variant: "secondary" }}>
            پرونده‌ی ریسک
          </AppLink>
        )
      }
    />
  );
}

export function ReviewDetailPage() {
  const page = usePageData<ReviewDetail>();
  useTitle(page.data?.title ?? "بازبینی ریسک");
  if (!page.data) return <DetailState query={page} header={<ReviewHeader />} />;
  const data = page.data;
  const { review } = data;
  return (
    <article className="flex flex-col gap-6">
      <ReviewHeader data={data} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="reason" title="منبع، دامنه و دلیل" icon={<History />}>
            <Card>
              <CardContent className="pt-5 text-sm leading-7 text-fg/90">
                <Prose text={review.reason} />
              </CardContent>
            </Card>
          </Section>
          <Section id="result" title="نتیجه" icon={<ClipboardCheck />}>
            {review.completed_at ? (
              <Alert
                tone="success"
                title={`ثبت در ${dateTime(review.completed_at)} توسط ${review.completed_by?.name ?? "-"}`}
              >
                <p className="whitespace-pre-line">{review.result}</p>
              </Alert>
            ) : data.complete ? (
              <CompleteBox data={data} />
            ) : (
              <p className="text-sm text-muted">
                نتیجه را مسئول بازبینی یا عضو GRC ثبت می‌کند. ثبت نتیجه ارزیابی تاریخی را بازنویسی نمی‌کند.
              </p>
            )}
          </Section>
        </div>
        <aside aria-label="مشخصات بازبینی">
          <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <CardHeader title="مشخصات" />
            <CardContent>
              <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-3 text-sm">
                <Fact label="ریسک">
                  <AppLink href={review.risk.href}>
                    <bdi className="code">{review.risk.code}</bdi> {review.risk.title}
                  </AppLink>
                </Fact>
                <Fact label="محرک">{review.trigger.label}</Fact>
                <Fact label="مهلت آغاز">
                  <Deadline value={review.due} label="مهلت آغاز بررسی" />
                </Fact>
                <Fact label="مسئول">{review.responsible?.name ?? "-"}</Fact>
                {review.assessment && (
                  <Fact label="ارزیابی">
                    <AppLink href={review.assessment.href} className="code">
                      {review.assessment.code}
                    </AppLink>
                  </Fact>
                )}
                <Fact label="ثبت">
                  {dateTime(review.created_at)}
                  {review.created_by && <span className="block text-xs text-muted">{review.created_by.name}</span>}
                </Fact>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}
