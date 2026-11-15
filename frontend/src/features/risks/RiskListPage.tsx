import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Plus,
  Search,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { count, shortDate } from "@/lib/format";
import { useDebouncedValue, useTitle } from "@/lib/hooks";
import type { RiskFilters, RiskOrdering, RiskPage, RiskRow } from "@/lib/types";

const MAIN_FILTERS = ["status", "unit", "category"] as const;
const MORE_FILTERS = ["service", "tag", "channel", "needs_completion"] as const;
const FILTER_NAMES = ["q", ...MAIN_FILTERS, ...MORE_FILTERS];

const ORDERINGS: { value: RiskOrdering; label: string }[] = [
  { value: "newest", label: "تازه‌ترین ثبت" },
  { value: "oldest", label: "قدیمی‌ترین ثبت" },
  { value: "level", label: "بالاترین سطح" },
  { value: "-level", label: "پایین‌ترین سطح" },
  { value: "code", label: "شماره، صعودی" },
  { value: "-code", label: "شماره، نزولی" },
];

/** هر بار کلیک روی سرستون: جهت اول، جهت دوم، و برگشت به ترتیب پیش‌فرض. */
const CYCLES: Record<"code" | "level" | "created", RiskOrdering[]> = {
  code: ["code", "-code", "newest"],
  level: ["level", "-level", "newest"],
  created: ["newest", "oldest", "newest"],
};

function SortHeader({
  column,
  label,
  ordering,
  onSort,
}: {
  column: keyof typeof CYCLES;
  label: string;
  ordering: RiskOrdering;
  onSort: (ordering: RiskOrdering) => void;
}) {
  const cycle = CYCLES[column];
  const position = cycle.indexOf(ordering);
  const active = column === "created" ? ordering === "newest" || ordering === "oldest" : position >= 0 && position < 2;
  // «بالاترین سطح» و «تازه‌ترین» نزولی‌اند؛ شماره‌ی صعودی صعودی است.
  const descending = ordering === "level" || ordering === "newest" || ordering === "-code";
  const sort = active ? (descending ? "descending" : "ascending") : "none";
  const Icon = !active ? ArrowUpDown : descending ? ArrowDown : ArrowUp;
  const next = cycle[(position + 1) % cycle.length] ?? "newest";
  return (
    <th scope="col" aria-sort={sort}>
      <button
        type="button"
        onClick={() => onSort(next)}
        className={cn(
          "-mx-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:text-fg",
          active && "text-fg",
        )}
      >
        {label}
        <Icon aria-hidden className={cn("size-3.5", !active && "opacity-50")} />
      </button>
    </th>
  );
}

function RiskTableRow({ risk }: { risk: RiskRow }) {
  return (
    <tr>
      <td data-label="شماره" className="w-0">
        <bdi className="code text-accent-text">{risk.code}</bdi>
      </td>
      <td data-primary className="min-w-64">
        <Link
          to={`/risks/${risk.id}`}
          viewTransition
          className="font-medium text-fg transition-colors hover:text-accent-text"
        >
          {risk.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span>{risk.org_unit}</span>
          {risk.service && <span>خدمت {risk.service.name}</span>}
          {risk.needs_completion && (
            <Badge tone="warning" className="h-5 px-2 text-[0.6875rem]">
              نیازمند تکمیل
            </Badge>
          )}
        </div>
      </td>
      <td data-label="سطح">
        <LevelBadge level={risk.level} />
      </td>
      <td data-label="وضعیت">
        <Badge tone={risk.is_active ? "accent" : "neutral"} dot>
          {risk.status.label}
        </Badge>
      </td>
      <td data-label="مالک" className="whitespace-nowrap">
        {risk.owner?.name ?? <span className="text-muted">بی‌مالک</span>}
      </td>
      <td data-label="ثبت" className="whitespace-nowrap text-muted">
        <time dateTime={risk.created_at.iso}>{shortDate(risk.created_at)}</time>
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div role="status" className="flex flex-col divide-y divide-line">
      <span className="sr-only">در حال خواندن رجیستر…</span>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-6 px-5 py-4">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full max-sm:hidden" />
          <Skeleton className="h-6 w-24 rounded-full max-md:hidden" />
        </div>
      ))}
    </div>
  );
}

export function RiskListPage() {
  useTitle("رجیستر ریسک");
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  const [showMore, setShowMore] = useState(() => [...MAIN_FILTERS, ...MORE_FILTERS].some((name) => params.get(name)));

  // اگر نشانی از بیرون عوض شد (جست‌وجوی نوار بالا، دکمه‌ی برگشت)، کادر جست‌وجو هم همان را نشان دهد.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const search = params.toString();
  const filters = useQuery({
    queryKey: ["risk-filters"],
    queryFn: ({ signal }) => get<RiskFilters>("risks/filters/", signal),
    staleTime: 10 * 60_000,
  });
  const risks = useQuery({
    queryKey: ["risks", search],
    queryFn: ({ signal }) => get<RiskPage>(`risks/${search ? `?${search}` : ""}`, signal),
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

  // جست‌وجو هنگام تایپ، بعد از مکث کوتاه؛ نشانی با replace عوض می‌شود تا هر حرف یک قدم تاریخچه نسازد.
  const typed = query.trim();
  const debounced = useDebouncedValue(typed, 350);
  useEffect(() => {
    if (debounced === typed && debounced !== urlQuery) update({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط وقتی تایپ متوقف شد
  }, [debounced]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ q: typed });
  }

  function clear() {
    setQuery("");
    setParams(new URLSearchParams());
  }

  const filtered = FILTER_NAMES.some((name) => params.get(name));
  const page = risks.data;
  const ordering = page?.ordering ?? (params.get("ordering") as RiskOrdering | null) ?? "newest";
  const chips = [...MAIN_FILTERS, ...MORE_FILTERS]
    .map((name) => {
      const value = params.get(name);
      const filter = filters.data?.[name];
      if (!value || !filter) return null;
      const choice = filter.choices.find((option) => option.value === value);
      return { name, label: `${filter.label}: ${choice?.label.trim() ?? value}` };
    })
    .filter((chip): chip is { name: (typeof MAIN_FILTERS)[number] | (typeof MORE_FILTERS)[number]; label: string } =>
      Boolean(chip),
    );

  function sortBy(value: RiskOrdering) {
    update({ ordering: value === "newest" ? "" : value });
  }

  function select(name: string) {
    const filter = filters.data?.[name];
    if (!filter) return null;
    return (
      <Field key={name} label={filter.label}>
        <Select value={params.get(name) ?? ""} onChange={(event) => update({ [name]: event.target.value })}>
          <option value="">همه</option>
          {filter.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="رجیستر ریسک"
        description={
          page
            ? filtered
              ? `${count(page.count, "ریسک")} با این فیلترها، از همه‌ی ریسک‌هایی که اجازه‌ی دیدنشان را دارید.`
              : `${count(page.count, "ریسک")} که اجازه‌ی دیدنشان را دارید؛ تازه‌ترین بالا.`
            : "همه‌ی ریسک‌هایی که اجازه‌ی دیدنشان را دارید."
        }
        actions={
          page?.can_create && (
            <AppLink href={page.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              ثبت ریسک تازه
            </AppLink>
          )
        }
      />

      <Card className="p-4 sm:p-5">
        <form role="search" aria-label="فیلتر رجیستر" onSubmit={submitSearch} className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(16rem,1.4fr)_repeat(3,minmax(0,1fr))]">
            <Field label="جست‌وجو">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  type="search"
                  enterKeyHint="search"
                  value={query}
                  placeholder="کد، عنوان یا شرح"
                  className="ps-10"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </Field>
            {/* در موبایل فیلترها پشت دکمه‌ی «فیلترها» می‌مانند تا نتیجه‌ها زیر چند کادر انتخاب گم نشوند. */}
            <div className={cn("contents", !showMore && "max-md:hidden")}>{MAIN_FILTERS.map(select)}</div>
          </div>
          {showMore && (
            <div id="more-filters" className="grid animate-fade-in gap-4 md:grid-cols-2 xl:grid-cols-4">
              {MORE_FILTERS.map(select)}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showMore}
              aria-controls="more-filters"
              onClick={() => setShowMore((open) => !open)}
            >
              <SlidersHorizontal aria-hidden />
              <span className="md:hidden">{showMore ? "بستن فیلترها" : "فیلترها"}</span>
              <span className="max-md:hidden">{showMore ? "فیلترهای کمتر" : "خدمت، برچسب، کانال ورود و تکمیل"}</span>
            </Button>
            {chips.length > 0 && (
              <ul className="flex flex-wrap items-center gap-2" aria-label="فیلترهای فعال">
                {chips.map((chip) => (
                  <li key={chip.name}>
                    <button
                      type="button"
                      onClick={() => update({ [chip.name]: "" })}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full border border-accent-line/60 bg-accent-soft ps-3 pe-2 text-xs text-fg transition-colors hover:border-accent"
                      aria-label={`برداشتن فیلتر ${chip.label}`}
                    >
                      {chip.label}
                      <X aria-hidden className="size-3.5 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {filtered && (
              <Button variant="link" size="sm" className="ms-auto text-xs" onClick={clear}>
                پاک کردن همه‌ی فیلترها
              </Button>
            )}
            <button type="submit" className="sr-only">
              جست‌وجو
            </button>
          </div>
        </form>
      </Card>

      {risks.isError && !page && <ErrorState error={risks.error} retry={() => risks.refetch()} />}

      {risks.isPending && (
        <Card className="overflow-clip">
          <TableSkeleton />
        </Card>
      )}

      {page && page.results.length === 0 && (
        <EmptyState
          icon={filtered ? <SearchX /> : <ShieldAlert />}
          title={filtered ? "ریسکی با این فیلترها پیدا نشد" : "هنوز ریسکی در رجیستر نیست"}
          description={
            filtered
              ? "فیلترها را کم کنید یا عبارت جست‌وجو را کوتاه‌تر بنویسید."
              : "ریسک‌ها از مصاحبه، پرسشنامه، رخداد و ممیزی وارد رجیستر می‌شوند."
          }
          action={
            filtered && (
              <Button variant="secondary" onClick={clear}>
                پاک کردن فیلترها
              </Button>
            )
          }
        />
      )}

      {page && page.results.length > 0 && (
        <section aria-labelledby="register-results" className="flex flex-col gap-4">
          <Card
            className={cn(
              "table-shell overflow-clip transition-opacity",
              risks.isFetching && risks.isPlaceholderData && "opacity-60",
            )}
            aria-busy={risks.isFetching}
          >
            {/* شمار نتیجه‌ها و مرتب‌سازی روی خود جدول می‌نشینند، نه جدا از آن. */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
              <h2 id="register-results" className="text-sm font-semibold text-fg">
                {count(page.count, "ریسک")}
              </h2>
              <label className="flex items-center gap-2 text-xs text-muted">
                مرتب‌سازی
                <Select
                  className="h-8 w-44 text-xs"
                  value={ordering}
                  onChange={(event) => sortBy(event.target.value as RiskOrdering)}
                >
                  {ORDERINGS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <table className="data-table">
              <caption className="sr-only">
                ریسک‌ها، {ORDERINGS.find((option) => option.value === ordering)?.label}
              </caption>
              <thead>
                <tr>
                  <SortHeader column="code" label="شماره" ordering={ordering} onSort={sortBy} />
                  <th scope="col">عنوان</th>
                  <SortHeader column="level" label="سطح فعلی" ordering={ordering} onSort={sortBy} />
                  <th scope="col">وضعیت</th>
                  <th scope="col">مالک</th>
                  <SortHeader column="created" label="ثبت" ordering={ordering} onSort={sortBy} />
                </tr>
              </thead>
              <tbody>
                {page.results.map((risk) => (
                  <RiskTableRow key={risk.id} risk={risk} />
                ))}
              </tbody>
            </table>
          </Card>
          <Pagination
            page={page.page}
            pages={page.pages}
            label="صفحه‌های رجیستر"
            onChange={(next) => {
              update({ page: String(next) });
              window.scrollTo({ top: 0 });
            }}
          />
        </section>
      )}
    </div>
  );
}
