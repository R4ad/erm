import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip } from "@/components/ui/icon-chip";
import { LevelBadge } from "@/components/ui/level-badge";
import { RISK_CLASSES, riskKey, type RiskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { Level, ManagementReport } from "@/lib/types";

const DEFAULT_MONTHS = 6;

// خانه‌ی ماتریس: زمینه‌ی کم‌رنگ سطح، حاشیه‌ی همان رنگ و عدد پررنگ؛ خانه‌ی بی‌ریسک خاکستری با «–».
const CELL: Record<RiskKey, string> = {
  low: "border-risk-low/45 bg-risk-low-bg text-risk-low-fg",
  medium: "border-risk-medium/55 bg-risk-medium-bg text-risk-medium-fg",
  high: "border-risk-high/45 bg-risk-high-bg text-risk-high-fg",
  critical: "border-risk-critical/45 bg-risk-critical-bg text-risk-critical-fg",
  none: "border-line bg-subtle text-ink-3",
};

function periodLabel(months: number) {
  return months === 12 ? "یک سال اخیر" : `${fa(months)} ماه اخیر`;
}

function Percent({ value, tone }: { value: number | null | undefined; tone: "brand" | "success" }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value ?? undefined}
      aria-label="درصد"
      className="h-1.5 overflow-hidden rounded-full bg-subtle"
    >
      <div
        className={cn("h-full rounded-full", tone === "brand" ? "bg-brand" : "bg-success")}
        style={{ width: `${value ?? 0}%` }}
      />
    </div>
  );
}

function Kpis({ data }: { data: ManagementReport }) {
  const { kpis } = data;
  const percent = (value: number | null | undefined) => (value === null || value === undefined ? "—" : `${fa(value)}٪`);
  const level = (rank: number): Level | null =>
    data.distribution.find((row) => row.level?.rank === rank)?.level ?? null;
  return (
    // ترتیب کاشی‌ها همان ترتیب دیداری فیگماست، از راست به چپ.
    <section aria-label="شاخص‌ها" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <StatTile
        label="کنترل کلیدی با E3 معتبر"
        value={percent(kpis.key_controls.percent)}
        note={kpis.key_controls.note}
      >
        <Percent value={kpis.key_controls.percent} tone="brand" />
      </StatTile>
      <StatTile label="پوشش خدمات حیاتی" value={percent(kpis.coverage.percent)} note={kpis.coverage.note}>
        <Percent value={kpis.coverage.percent} tone="success" />
      </StatTile>
      <StatTile
        label="بالا"
        value={fa(kpis.high.count ?? 0)}
        note={kpis.high.note}
        aside={<LevelBadge level={level(3)} />}
        valueClassName={RISK_CLASSES.high.fg}
      />
      <StatTile
        label="بحرانی"
        value={fa(kpis.critical.count ?? 0)}
        note={kpis.critical.note}
        aside={<LevelBadge level={level(4)} />}
        valueClassName={RISK_CLASSES.critical.fg}
      />
      <StatTile label="ریسک‌های فعال" value={fa(kpis.active.count ?? 0)} note={kpis.active.note} />
    </section>
  );
}

function Delta({ value, upIsGood }: { value: number; upIsGood: boolean }) {
  if (value === 0) return <span className="text-xs text-ink-3">—</span>;
  const good = value > 0 === upIsGood;
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", good ? "text-success" : "text-danger")}
    >
      <span className="sr-only">{value > 0 ? "افزایش" : "کاهش"} </span>
      {fa(Math.abs(value))}
      <Icon name={value > 0 ? "arrow-up" : "arrow-down"} size={12} />
    </span>
  );
}

function Distribution({ data }: { data: ManagementReport }) {
  const max = Math.max(1, ...data.distribution.map((row) => row.count));
  return (
    <Card role="region" aria-labelledby="distribution">
      <CardHeader
        titleId="distribution"
        title="توزیع سطح تصمیم"
        description={`تعداد ریسک‌های فعال در هر سطح · تغییر نسبت به ${periodLabel(data.months).replace(" اخیر", "")} قبل`}
      />
      <div className="flex flex-col gap-4 px-4 pt-3 pb-4">
        <ul className="flex flex-col gap-3.5">
          {data.distribution.map((row) => {
            const key = riskKey(row.level);
            return (
              <li key={row.label} className="flex items-center gap-4">
                <span className="flex w-24 shrink-0">
                  <LevelBadge level={row.level} />
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-subtle">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(row.count / max) * 100}%`, backgroundColor: RISK_CLASSES[key].solid }}
                  />
                </span>
                <span className="w-8 shrink-0 text-sm font-semibold text-ink tabular">{fa(row.count)}</span>
                <span className="flex w-10 shrink-0 justify-end">
                  <Delta value={row.delta} upIsGood={row.up_is_good} />
                </span>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center gap-2 rounded-md bg-subtle px-3 py-2 text-xs text-ink-2">
          <Icon name="info" size={14} className="shrink-0 text-ink-3" />
          جمع یا میانگین امتیازهای ترتیبی ساخته نمی‌شود؛ مقایسه فقط بر اساس شمارش سطح است.
        </p>
      </div>
    </Card>
  );
}

function Matrix({ data }: { data: ManagementReport }) {
  return (
    <Card role="region" aria-labelledby="matrix">
      <CardHeader
        titleId="matrix"
        title="ماتریس L × I"
        description="تعداد ریسک جاری در هر خانه؛ رنگ = سطح تصمیم نسخه‌ی روش"
      />
      <div className="px-4 pt-3 pb-4">
        <table className="w-full border-separate border-spacing-1 text-center">
          <caption className="sr-only">تعداد ریسک‌ها بر حسب احتمال (L) و پیامد (I)</caption>
          <tbody>
            {data.matrix.rows.map((row) => (
              <tr key={row.likelihood}>
                <th scope="row" className="w-9 text-xs font-medium text-ink-3">
                  <span className="code">L{row.likelihood}</span>
                </th>
                {row.cells.map((cell) => {
                  const key = cell.count ? riskKey(cell.level) : "none";
                  return (
                    <td key={cell.impact} className="p-0">
                      <span
                        title={cell.level ? `سطح ${cell.level.name}` : undefined}
                        className={cn(
                          "grid h-11 place-items-center rounded-md border text-sm font-semibold tabular",
                          CELL[key],
                        )}
                      >
                        {cell.count ? fa(cell.count) : "–"}
                        <span className="sr-only">
                          {" "}
                          ریسک در L{row.likelihood} و I{cell.impact}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td />
              {[1, 2, 3, 4, 5].map((impact) => (
                <th key={impact} scope="col" className="pt-1 text-xs font-medium text-ink-3">
                  <span className="code">I{impact}</span>
                </th>
              ))}
            </tr>
          </tfoot>
        </table>
        <p className="mt-3 text-xs text-ink-3">
          محور I از راست به چپ و L از پایین به بالا زیاد می‌شود.
          {data.matrix.unassessed > 0 && ` ${fa(data.matrix.unassessed)} ریسک بدون ارزیابی جاری در ماتریس نیست.`}
        </p>
      </div>
    </Card>
  );
}

function Overdue({ data }: { data: ManagementReport }) {
  return (
    <Card role="region" aria-labelledby="overdue" className="overflow-clip">
      <CardHeader
        titleId="overdue"
        title="اقدام‌های معوق بالا و بحرانی"
        description={`${fa(data.overdue.length)} اقدام · مرتب بر اساس سطح و تأخیر`}
        actions={
          <Link to="/actions" viewTransition className={buttonClasses({ variant: "ghost", size: "sm" })}>
            همه‌ی اقدام‌ها
            <Icon name="arrow-left" />
          </Link>
        }
        className="pb-3"
      />
      {data.overdue.length === 0 ? (
        <p className="border-t border-line px-4 py-10 text-center text-sm text-ink-3">
          اقدام معوقی در سطح بالا و بحرانی نیست.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-start text-sm">
            <thead className="bg-subtle text-xs text-ink-3">
              <tr className="[&>th]:h-9 [&>th]:px-4 [&>th]:text-start [&>th]:font-medium [&>th]:whitespace-nowrap">
                <th scope="col">کد</th>
                <th scope="col">عنوان اقدام</th>
                <th scope="col">سطح ریسک</th>
                <th scope="col">مالک اقدام</th>
                <th scope="col">خدمت</th>
                <th scope="col">تأخیر</th>
              </tr>
            </thead>
            <tbody>
              {data.overdue.map((row) => (
                <tr
                  key={row.key}
                  className="border-t border-line transition-colors hover:bg-subtle/60 [&>td]:h-[3.25rem] [&>td]:px-4"
                >
                  <td className="code text-ink-2">
                    {row.route ? (
                      <Link to={row.route} viewTransition className="hover:text-brand">
                        {row.code}
                      </Link>
                    ) : (
                      row.code
                    )}
                  </td>
                  <td className="w-full max-w-0 truncate text-ink">{faText(row.title)}</td>
                  <td>
                    <LevelBadge level={row.level} />
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{row.owner ?? "—"}</td>
                  <td className="whitespace-nowrap text-ink-2">{row.service ?? "—"}</td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-danger">
                      <Icon name="clock" size={14} />
                      {fa(row.days)} روز تأخیر
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ListCard({
  id,
  title,
  description,
  empty,
  children,
}: {
  id: string;
  title: string;
  description: string;
  empty?: string | null;
  children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id} className="overflow-clip">
      <CardHeader titleId={id} title={title} description={description} className="border-b border-line pb-3" />
      {empty ? <p className="px-4 py-10 text-center text-sm text-ink-3">{empty}</p> : <ul>{children}</ul>}
    </Card>
  );
}

function Acceptances({ data }: { data: ManagementReport }) {
  return (
    <ListCard id="acceptances" title="پذیرش‌های نیازمند توجه" description="بر اساس قاعده‌های پذیرش زمان‌دار">
      {data.acceptances.map((row) => (
        <li key={row.key} className="border-b border-line last:border-b-0">
          <Link
            to={row.route}
            viewTransition
            className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-subtle/60"
          >
            <IconChip icon={row.icon as IconName} tone={row.tone} />
            <span className="flex-1 text-base font-medium text-ink">{row.label}</span>
            <span className="text-stat font-bold text-ink tabular">{fa(row.count)}</span>
            <Icon name="chevron-left" size={16} className="text-ink-3" />
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Changes({ data }: { data: ManagementReport }) {
  return (
    <ListCard
      id="changes"
      title="تغییر سطح در دوره"
      description={`${periodLabel(data.months)} · تغییر ناشی از نسخه‌ی روش جدا علامت می‌خورد`}
      empty={data.changes.length ? null : "در این دوره سطح هیچ ریسکی عوض نشده است."}
    >
      {data.changes.map((row) => (
        <li key={row.key} className="border-b border-line last:border-b-0">
          <Link
            to={row.route ?? "/risks"}
            viewTransition
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-subtle/60"
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-base font-semibold text-ink">{faText(row.title)}</span>
              <span className="code text-xs text-ink-3">{row.code}</span>
            </span>
            <span className="flex items-center gap-2">
              <LevelBadge level={row.before} />
              <Icon name="arrow-left" size={14} className="text-ink-3" label="به" />
              <LevelBadge level={row.after} />
              <Badge tone={row.reason.tone} className="ms-1">
                {row.reason.label}
              </Badge>
            </span>
          </Link>
        </li>
      ))}
    </ListCard>
  );
}

function Concentration({ data }: { data: ManagementReport }) {
  const rows = data.concentration.slice(0, 5);
  const max = Math.max(1, ...rows.map((row) => row.risks));
  return (
    <Card role="region" aria-labelledby="concentration">
      <CardHeader
        titleId="concentration"
        title="تمرکز وابستگی و نقطه‌ی شکست مشترک"
        description="تعداد ریسک‌های فعال وابسته"
      />
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-3">وابستگی مشترکی بین خدمت‌ها ثبت نشده است.</p>
      ) : (
        <ul className="flex flex-col gap-4 px-4 pt-3 pb-4">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-col gap-2">
              <span className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-ink">{faText(row.target)}</span>
                <span className="shrink-0 text-xs text-ink-3">{fa(row.risks)} ریسک</span>
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-subtle">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${(row.risks / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ManagementReportPage() {
  useTitle("گزارش مدیریتی");
  const [params, setParams] = useSearchParams();
  const months = Number(params.get("months")) || DEFAULT_MONTHS;
  const report = useQuery({
    queryKey: ["management-report", months],
    queryFn: ({ signal }) => get<ManagementReport>(`reports/management/?months=${months}`, signal),
    placeholderData: (previous) => previous,
  });

  if (report.isPending) return <PageSkeleton rows={6} />;
  if (report.isError) return <ErrorState error={report.error} retry={() => report.refetch()} />;
  const data = report.data;

  function choose(value: string) {
    const next = new URLSearchParams(params);
    if (Number(value) === DEFAULT_MONTHS) next.delete("months");
    else next.set("months", value);
    setParams(next, { replace: true });
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="گزارش مدیریتی"
        meta={<Badge>وضعیت جاری · {longDate(data.today)}</Badge>}
        description="شمارش‌ها فقط بر اساس آخرین ارزیابی جاری تأییدشده‌ی هر ریسک است؛ ارزیابی ذاتی و هدف شمرده نمی‌شوند."
        actions={
          <>
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Icon name="calendar" />
                  دوره‌ی تغییرات: {periodLabel(data.months)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>دوره‌ی تغییرات</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={String(data.months)} onValueChange={choose}>
                  {data.periods.map((value) => (
                    <DropdownMenuRadioItem key={value} value={String(value)}>
                      {periodLabel(value)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <a
              href={`/api/reports/management/export/?months=${data.months}`}
              download
              className={buttonClasses({ variant: "secondary" })}
            >
              <Icon name="download" />
              خروجی Excel
            </a>
          </>
        }
      />
      <Kpis data={data} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)]">
        <Distribution data={data} />
        <Matrix data={data} />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Overdue data={data} />
        <Acceptances data={data} />
      </div>
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,62fr)_minmax(0,38fr)]">
        <Changes data={data} />
        <Concentration data={data} />
      </div>
    </div>
  );
}
