import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ago, fa } from "@/lib/format";
import { useDebouncedValue, useNow, useTitle } from "@/lib/hooks";
import type {
  Deadline,
  QuestionnaireResponsesPage,
  ResponseStatusValue,
  ReviewQueueCard,
  ReviewRow,
} from "@/lib/types";

// «بررسی پاسخنامه‌ها» (فریم 11a): صف «در انتظار بررسی» برای کارشناس ریسک (قدیمی‌ترین ارسال اول، فوری‌ترین با دکمه‌ی
// اصلی) و جدول همه‌ی پاسخنامه‌هایی که کاربر می‌بیند. تب، واحد، جستجو و صفحه در نشانی می‌مانند تا برگشت و پیوند همان
// نما را باز کند.

const TABS: { value: "" | ResponseStatusValue; label: string }[] = [
  { value: "", label: "همه" },
  { value: "submitted", label: "در انتظار بررسی" },
  { value: "returned", label: "بازگشت برای تکمیل" },
  { value: "identified", label: "شناسایی‌شده" },
  { value: "reviewed", label: "بررسی‌شده" },
  { value: "draft", label: "پیش‌نویس" },
];
const STEP_COUNT = 8;
const TABLE_ID = "all-responses";

export function ReviewResponsesPage() {
  useTitle("بررسی پاسخنامه‌ها");
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [text, setText] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setText(urlQuery);
  }

  const search = params.toString();
  const query = useQuery({
    queryKey: ["questionnaire-responses", search],
    queryFn: ({ signal }) =>
      get<QuestionnaireResponsesPage>(`questionnaire-responses/${search ? `?${search}` : ""}`, signal),
    placeholderData: keepPreviousData,
  });

  function update(changes: Record<string, string>, options: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: options.replace });
  }

  // جستجو هنگام تایپ، بعد از مکث کوتاه؛ نشانی با replace عوض می‌شود تا هر حرف یک قدم تاریخچه نسازد.
  const typed = text.trim();
  const debounced = useDebouncedValue(typed, 350);
  useEffect(() => {
    if (debounced === typed && debounced !== urlQuery) update({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط وقتی تایپ متوقف شد
  }, [debounced]);

  function showWaiting() {
    update({ status: "submitted" });
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(TABLE_ID)?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  const data = query.data;
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="بررسی پاسخنامه‌ها"
        description="پاسخنامه‌های ارسال‌شده‌ی واحدها را بررسی کنید و هر کدام را به سناریوی ریسک تبدیل یا برای تکمیل بازگردانید."
        breadcrumb={[{ label: "شناسایی ریسک", to: "/identification" }, { label: "بررسی پاسخنامه‌ها" }]}
      />
      {!data ? (
        query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : (
          <PageSkeleton rows={8} />
        )
      ) : (
        <>
          {data.queue && <ReviewQueue queue={data.queue} onShowAll={showWaiting} />}
          <SectionPanel
            id={TABLE_ID}
            title="همه‌ی پاسخنامه‌ها"
            description={`${fa(data.year_total)} پاسخنامه در دوره‌ی ارزیابی ${fa(data.year)}`}
            aside={
              <form
                role="search"
                aria-label="همه‌ی پاسخنامه‌ها"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  update({ q: typed });
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <label className="relative w-full sm:w-[17.5rem]">
                  <span className="sr-only">جستجوی کد، خدمت یا پاسخ‌دهنده</span>
                  <Icon
                    name="search"
                    size={16}
                    className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
                  />
                  <input
                    type="search"
                    enterKeyHint="search"
                    value={text}
                    placeholder="جستجوی کد، خدمت یا پاسخ‌دهنده…"
                    onChange={(event) => setText(event.target.value)}
                    className="h-[2.125rem] w-full rounded-md border border-line-strong bg-panel ps-9 pe-3 text-sm text-ink placeholder:text-ink-3 focus:border-focus focus:shadow-focus focus:outline-none"
                  />
                </label>
                <UnitFilter units={data.units} value={params.get("unit") ?? ""} onChange={(unit) => update({ unit })} />
              </form>
            }
            bodyClassName="p-0"
          >
            <Tabs value={params.get("status") ?? ""} onValueChange={(status) => update({ status })}>
              <TabsList className="px-3" aria-label="وضعیت">
                {TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value} count={fa(data.counts[tab.value || "all"])}>
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <TabsContent value={params.get("status") ?? ""} className="pt-0" aria-busy={query.isFetching}>
                <ResponsesTable rows={data.rows} />
              </TabsContent>
            </Tabs>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
              <p className="text-xs text-ink-3" aria-live="polite">
                {data.page.count
                  ? `نمایش ${fa(data.page.start)} تا ${fa(data.page.end)} از ${fa(data.page.count)} پاسخنامه`
                  : ""}
              </p>
              <Pagination
                page={data.page.number}
                pages={data.page.pages}
                status={false}
                onChange={(page) => update({ page: page > 1 ? String(page) : "" })}
              />
            </div>
          </SectionPanel>
        </>
      )}
    </div>
  );
}

function UnitFilter({
  units,
  value,
  onChange,
}: {
  units: QuestionnaireResponsesPage["units"];
  value: string;
  onChange: (unit: string) => void;
}) {
  const selected = units.find((unit) => unit.value === value);
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" className={cn(selected && "border-brand text-brand")}>
          <Icon name="funnel" />
          {selected?.label ?? "همه‌ی واحدها"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="">همه‌ی واحدها</DropdownMenuRadioItem>
          {units.map((unit) => (
            <DropdownMenuRadioItem key={unit.value} value={unit.value}>
              {unit.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** چیپ مهلت بررسی: گذشته «۴ روز · دیرکرد»، امروز «مهلت امروز»، و بعد «۲ روز». */
function DueChip({ due }: { due: Deadline | null }) {
  if (!due) return null;
  if (due.days_left < 0) {
    return (
      <Chip tone="danger">
        <Icon name="warning" size={14} />
        {`${fa(-due.days_left)} روز · دیرکرد`}
      </Chip>
    );
  }
  return (
    <Chip tone={due.days_left === 0 ? "warning" : "neutral"}>
      <Icon name="clock" size={14} />
      {due.days_left === 0 ? "مهلت امروز" : `${fa(due.days_left)} روز`}
    </Chip>
  );
}

function ReviewQueue({
  queue,
  onShowAll,
}: {
  queue: NonNullable<QuestionnaireResponsesPage["queue"]>;
  onShowAll: () => void;
}) {
  return (
    <section aria-labelledby="review-queue" className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="review-queue" className="text-h2 font-bold text-ink">
              در انتظار بررسی
            </h2>
            <span className="inline-grid h-[1.375rem] min-w-[1.375rem] place-items-center rounded-full bg-brand px-1.5 text-xs font-semibold text-on-brand tabular">
              {fa(queue.count)}
            </span>
            {queue.overdue > 0 && (
              <Chip tone="danger">
                <Icon name="warning" size={14} />
                {`${fa(queue.overdue)} مورد با دیرکرد`}
              </Chip>
            )}
          </div>
          <p className="text-xs text-ink-3">قدیمی‌ترین پاسخنامه‌ها اول می‌آیند · مهلت بررسی ۳ روز کاری از زمان ارسال</p>
        </div>
        {queue.count > 0 && (
          <Link
            to={{ search: "?status=submitted" }}
            onClick={(event) => {
              event.preventDefault();
              onShowAll();
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            {`مشاهده‌ی هر ${fa(queue.count)} پاسخنامه`}
            <Icon name="arrow-left" size={16} className="ltr:rotate-180" />
          </Link>
        )}
      </div>
      {queue.cards.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {queue.cards.map((card, index) => (
            <QueueCard key={card.id} card={card} urgent={index === 0} />
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-line-strong px-5 py-6 text-center text-sm text-ink-2">
          پاسخنامه‌ای در انتظار بررسی نیست.
        </p>
      )}
    </section>
  );
}

function QueueCard({ card, urgent }: { card: ReviewQueueCard; urgent: boolean }) {
  const titleId = `queue-${card.id}`;
  const late = Boolean(card.review_due?.overdue);
  return (
    <li
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 rounded-card border bg-panel px-4 pt-4 pb-3.5 shadow-card",
        late ? "border-danger" : "border-line",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <bdi className="code text-sm text-ink-2">{card.code}</bdi>
        <DueChip due={card.review_due} />
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 id={titleId} className="text-h3 font-bold text-ink">
          {card.service || "—"}
        </h3>
        <p className="text-xs text-ink-3">
          {card.org_unit}
          {card.respondent && ` · ${card.respondent.name}`}
        </p>
      </div>
      <p className="flex flex-wrap gap-1.5">
        <Chip tone="brand">{`${fa(card.summary.paths)} مسیر تحقق`}</Chip>
        <Chip tone="tangerine">{`${fa(card.summary.events)} رویداد`}</Chip>
        <Chip>{`${fa(card.summary.impacts)} پیامد`}</Chip>
      </p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="text-xs text-ink-3 tabular">
          {card.submitted_at && `ارسال ${fa(card.submitted_at.jalali)}`}
        </span>
        <Link
          to={card.route}
          viewTransition
          aria-describedby={titleId}
          className={buttonClasses({ variant: urgent ? "primary" : "secondary", size: "sm" })}
        >
          شروع بررسی
        </Link>
      </div>
    </li>
  );
}

function RowSummary({ row }: { row: ReviewRow }) {
  if (row.status.value === "draft") {
    return <>{`در حال تکمیل · گام ${fa(row.step)} از ${fa(STEP_COUNT)}`}</>;
  }
  if (row.status.value === "returned" && row.return_note) {
    return <>{`بازگشت: ${row.return_note}`}</>;
  }
  const counts = `${fa(row.summary.paths)} مسیر تحقق · ${fa(row.summary.events)} رویداد`;
  const late = row.review_due && row.review_due.days_left < 0 ? -row.review_due.days_left : 0;
  return (
    <>
      {counts}
      {late > 0 && (
        <>
          {" · "}
          <span className="text-danger">{`${fa(late)} روز دیرکرد`}</span>
        </>
      )}
      {row.risks.length > 0 && (
        <>
          {" ← "}
          {row.risks.map((code, index) => (
            <span key={code}>
              {index > 0 && "، "}
              <bdi className="code">{code}</bdi>
            </span>
          ))}
        </>
      )}
      {row.status.value === "reviewed" && row.all_dismissed && " · همه‌ی پیشنهادها رد شد"}
    </>
  );
}

function ResponsesTable({ rows }: { rows: ReviewRow[] }) {
  const now = useNow();
  if (!rows.length) {
    return <p className="px-5 py-8 text-center text-sm text-ink-2">پاسخنامه‌ای با این جستجو یا فیلتر پیدا نشد.</p>;
  }
  return (
    <div className="table-shell">
      <table className="data-table">
        <caption className="sr-only">همه‌ی پاسخنامه‌ها</caption>
        <thead>
          <tr>
            <th scope="col" className="w-[6.875rem]">
              کد
            </th>
            <th scope="col">پاسخنامه</th>
            <th scope="col">واحد</th>
            <th scope="col">وضعیت</th>
            <th scope="col">پاسخ‌دهنده</th>
            <th scope="col">آخرین تغییر</th>
            <th scope="col" className="w-[5.25rem]">
              <span className="sr-only">اقدام</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td data-label="کد" data-wide className="text-sm whitespace-nowrap text-ink-2">
                <bdi className="code">{row.code}</bdi>
              </td>
              <td data-primary className="min-w-56">
                <span className="block text-base font-medium text-ink">{row.service || "—"}</span>
                <span className="block text-xs text-ink-2">
                  <RowSummary row={row} />
                </span>
              </td>
              <td data-label="واحد" className="text-ink-2">
                {row.org_unit}
              </td>
              <td data-label="وضعیت" data-wide>
                <Badge tone={row.status.tone}>{row.status.label}</Badge>
              </td>
              <td data-label="پاسخ‌دهنده" className="text-ink-2">
                {row.respondent?.name ?? "—"}
              </td>
              <td data-label="آخرین تغییر" className="whitespace-nowrap text-ink-2 tabular">
                <time dateTime={row.updated_at.iso}>{ago(row.updated_at, now)}</time>
              </td>
              <td data-label="اقدام" className="whitespace-nowrap">
                {row.action ? (
                  <Link
                    to={row.route}
                    viewTransition
                    className="text-sm font-semibold text-brand hover:underline"
                    aria-label={`${row.action === "review" ? "بررسی" : "مشاهده"} ${row.code}`}
                  >
                    {row.action === "review" ? "بررسی" : "مشاهده"}
                  </Link>
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
