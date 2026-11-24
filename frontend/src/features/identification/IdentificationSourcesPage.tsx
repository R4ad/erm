import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { buttonClasses } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { IdentificationSources } from "@/lib/types";

import { ResponsesIllustration, SourceIllustration } from "./illustrations";
import { SOURCES, sourceRoute, type Source } from "./sources";

// «شناسایی ریسک» (فریم 11 v2): منبع‌های شناسایی در چیدمان bento. کارت بزرگ پاسخنامه‌هاست با آمار پاسخنامه‌هایی که کاربر
// می‌بیند؛ چهار کارت دیگر هنوز آماده نیستند و به صفحه‌ی «به‌زودی» می‌روند. ثبت دستی ریسک در /identification/manual است.

const CAPTION = "شناسایی ریسک از";

export function IdentificationSourcesPage() {
  useTitle("شناسایی ریسک");
  const query = useQuery({
    queryKey: ["identification-sources"],
    queryFn: ({ signal }) => get<IdentificationSources>("identification/sources/", signal),
  });

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title="شناسایی ریسک"
        description="منبع شناسایی را انتخاب کنید؛ ورودی‌های هر منبع بررسی و به سناریوی ریسک تبدیل می‌شوند."
        breadcrumb={[{ label: "ارزیابی ریسک" }, { label: "شناسایی ریسک" }]}
      />
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,569fr)_minmax(0,551fr)]">
          <ResponsesCard stats={query.data.responses} />
          <ul className="grid gap-4 sm:grid-cols-2">
            {SOURCES.map((source) => (
              <SourceCard key={source.slug} source={source} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STATS = [
  { key: "pending", label: "در انتظار بررسی", dot: "bg-info" },
  { key: "returned", label: "بازگشت برای تکمیل", dot: "bg-tangerine-bright" },
  { key: "identified", label: "شناسایی‌شده", dot: "bg-success" },
] as const;

function ResponsesCard({ stats }: { stats: IdentificationSources["responses"] }) {
  return (
    <section
      aria-labelledby="source-responses"
      className="flex flex-col rounded-hero border border-line bg-panel p-2 shadow-card"
    >
      <div className="aspect-[551/452] overflow-hidden rounded-card lg:aspect-auto lg:h-[28.25rem]">
        <ResponsesIllustration className="h-full w-full" />
      </div>
      <div className="flex flex-col gap-1.5 px-4 pt-5">
        <p className="text-xs text-ink-3">{CAPTION}</p>
        <h2 id="source-responses" className="text-h1 font-bold text-ink">
          پاسخنامه‌ها
        </h2>
        <p className="text-base text-ink-2">پاسخ واحدها به پرسش‌های شناسایی را بررسی کنید.</p>
      </div>
      <ul className="flex flex-wrap gap-2 px-4 pt-4">
        {STATS.map((stat) => (
          <li
            key={stat.key}
            className="inline-flex h-8 items-center gap-2 rounded-full bg-subtle px-3 text-sm text-ink-2"
          >
            <span aria-hidden className={cn("size-2 rounded-full", stat.dot)} />
            <strong className="font-semibold text-ink tabular">{fa(stats[stat.key])}</strong> {stat.label}
          </li>
        ))}
      </ul>
      <div className="flex justify-end px-4 pt-4 pb-2.5">
        <Link to={stats.url} viewTransition className={buttonClasses({ variant: "primary" })}>
          بررسی پاسخنامه‌ها
          <Icon name="arrow-left" className="ltr:rotate-180" />
        </Link>
      </div>
    </section>
  );
}

function SourceCard({ source }: { source: Source }) {
  const id = `source-${source.slug}`;
  return (
    <li className="group relative flex flex-col rounded-bento border border-line bg-panel p-2 shadow-card transition-shadow duration-200 focus-within:shadow-focus hover:shadow-pop">
      <div className="h-[9.375rem] overflow-hidden rounded-item bg-brand-subtle/60">
        <SourceIllustration slug={source.slug} />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-2 pt-4">
        <p className="text-xs text-ink-3">{CAPTION}</p>
        <h2 id={id} className="text-h2 font-bold text-ink">
          {/* پیوند کشیده: کل کارت را می‌پوشاند و نامش همان عنوان منبع است. */}
          <Link
            to={sourceRoute(source.slug)}
            viewTransition
            className="after:absolute after:inset-0 after:rounded-bento focus-visible:outline-none"
          >
            {source.title}
          </Link>
        </h2>
        <p className="text-sm text-ink-2">{source.description}</p>
      </div>
      <div className="flex items-center justify-between gap-2 px-2 pt-4 pb-2">
        <span className="inline-flex h-7 items-center rounded-full bg-subtle px-3 text-xs font-medium text-ink-2">
          به‌زودی
        </span>
        <span
          aria-hidden
          className="grid size-8 place-items-center rounded-full border border-line text-ink-2 transition-colors duration-150 group-hover:border-brand group-hover:text-brand"
        >
          <Icon name="arrow-left" size={16} className="ltr:rotate-180" />
        </span>
      </div>
    </li>
  );
}
