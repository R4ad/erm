import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip, type ChipTone as IconTone } from "@/components/ui/icon-chip";
import { RISK_CLASSES } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { TargetRisksPage as PageData, TargetRow } from "@/lib/types";

// «لیست ریسک‌های هدف» به چیدمان فیگما ۱۶: چهار کاشی، نمودار مسیر امتیاز جاری به هدف روی محور ۱ تا ۲۵، جدول ریسک‌های
// هدف با پروفایل پیامد و معیار پذیرش، و چهار قاعده‌ی هدف.

// بازه‌های سطح روی محور امتیاز، مثل ماتریس نسخه‌ی روش: پایین ۱–۴، متوسط ۵–۹، بالا ۱۰–۱۵، بحرانی ۱۶–۲۵.
const BANDS = [
  { name: "پایین", from: 1, to: 4.5, key: "low" },
  { name: "متوسط", from: 4.5, to: 9.5, key: "medium" },
  { name: "بالا", from: 9.5, to: 15.5, key: "high" },
  { name: "بحرانی", from: 15.5, to: 25, key: "critical" },
] as const;
const TICKS = [1, 4, 5, 9, 10, 15, 16, 20, 25];
const MINOR_TICKS = new Set([4, 9, 16]); // روی موبایل جا نمی‌شوند

function scoreKey(score: number) {
  return score >= 16 ? "critical" : score >= 10 ? "high" : score >= 5 ? "medium" : "low";
}

/** موقعیت امتیاز روی محور، از راست (۱) به چپ (۲۵)، به درصد از راست. */
function at(score: number) {
  return ((Math.min(Math.max(score, 1), 25) - 1) / 24) * 100;
}

const RULES: { icon: IconName; tone: IconTone; title: string; text: string }[] = [
  {
    icon: "target",
    tone: "brand",
    title: "هدف قابل آزمون",
    text: "At، Bt، It با فرض‌های صریح؛ معیار آزمون و موعد تحقق الزامی است.",
  },
  {
    icon: "clock",
    tone: "warning",
    title: "وعده، امتیاز را کم نمی‌کند",
    text: "خرید ابزار یا برنامه‌ی مانور تا اجرای واقعی، امتیاز جاری را کاهش نمی‌دهد.",
  },
  {
    icon: "flow",
    tone: "info",
    title: "پس از اقدام",
    text: "ارزیابی جاری جدید با شواهد واقعی؛ همان باقیمانده‌ی واقعی است.",
  },
  {
    icon: "warning",
    tone: "danger",
    title: "هدف بالاتر از اشتها",
    text: "اقدام بیشتر یا استثنای زمان‌دار با مجوز مرجع مجاز لازم است.",
  },
];

function ScoreBox({ score }: { score: number }) {
  const tone = RISK_CLASSES[scoreKey(score)];
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-1.5 text-sm font-bold",
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      {fa(score)}
    </span>
  );
}

// ─────────────────────────────── نمودار ───────────────────────────────

function PathChart({ rows }: { rows: TargetRow[] }) {
  return (
    <SectionPanel
      title="مسیر امتیاز جاری به هدف"
      description="هر ردیف: امتیاز جاری (دایره‌ی توپر) تا امتیاز هدف پس از اثبات (حلقه) · محور ۱ تا ۲۵ از راست به چپ"
      aside={
        <ul className="flex items-center gap-3 text-xs text-ink-2" aria-label="راهنمای نمودار">
          <li className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-full bg-danger" />
            جاری
          </li>
          <li className="inline-flex items-center gap-1">
            <span aria-hidden className="size-2.5 rounded-full border-2 border-warning bg-panel" />
            هدف
          </li>
          <li className="inline-flex items-center gap-1">
            <Icon name="x" size={12} />
            بازنشستگی
          </li>
        </ul>
      }
      bodyClassName="flex flex-col gap-3"
    >
      <div className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 max-md:grid-cols-[minmax(0,1fr)_auto]">
        <span className="max-md:hidden" />
        <div className="relative mx-2 h-5 text-xs font-medium" aria-hidden>
          {BANDS.map((band) => (
            <span
              key={band.key}
              className={cn("absolute top-0 -translate-x-1/2 rtl:translate-x-1/2", RISK_CLASSES[band.key].fg)}
              style={{ insetInlineStart: `${(at(band.from) + at(band.to)) / 2}%` }}
            >
              {band.name}
            </span>
          ))}
        </div>
        <span />
        {rows.map((row) => {
          const current = row.current.score;
          const target = row.retire ? 1 : (row.target?.score ?? null);
          const start = Math.min(at(current), target === null ? at(current) : at(target));
          const end = Math.max(at(current), target === null ? at(current) : at(target));
          const label = row.retire
            ? `${row.risk.code}: جاری ${fa(current)}، هدف حذف مسیر`
            : target === null
              ? `${row.risk.code}: جاری ${fa(current)}، بی‌هدف`
              : `${row.risk.code}: جاری ${fa(current)}، هدف ${fa(target)}`;
          return (
            <div key={row.id} className="contents" role="group" aria-label={label}>
              <span className="flex min-w-0 flex-col max-md:col-span-2">
                <bdi className="code text-xs text-ink-3">{row.risk.code}</bdi>
                <span className="truncate text-sm font-medium text-ink" title={row.risk.title}>
                  {row.risk.title}
                </span>
              </span>
              <div className="relative mx-2 h-7" aria-hidden>
                <div className="absolute inset-y-0 -inset-x-2 overflow-hidden rounded-sm">
                  {BANDS.map((band) => (
                    <span
                      key={band.key}
                      className={cn("absolute inset-y-0", RISK_CLASSES[band.key].bg)}
                      style={{ insetInlineStart: `${at(band.from)}%`, width: `${at(band.to) - at(band.from)}%` }}
                    />
                  ))}
                </div>
                {target !== null && (
                  <span
                    className={cn(
                      "absolute top-1/2 h-0.5 -translate-y-1/2",
                      row.retire ? "border-t-2 border-dashed border-ink-3" : "bg-gradient-to-l from-danger to-warning",
                    )}
                    style={{ insetInlineStart: `${start}%`, width: `${end - start}%` }}
                  />
                )}
                <span
                  className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-panel bg-danger shadow-sm ltr:-translate-x-1/2 rtl:translate-x-1/2"
                  style={{ insetInlineStart: `${at(current)}%` }}
                />
                {target !== null &&
                  (row.retire ? (
                    <span
                      className="absolute top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full border border-ink-3 bg-panel text-ink-3 ltr:-translate-x-1/2 rtl:translate-x-1/2"
                      style={{ insetInlineStart: `${at(1)}%` }}
                    >
                      <Icon name="x" size={10} />
                    </span>
                  ) : (
                    <span
                      className="absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full border-2 border-warning bg-panel ltr:-translate-x-1/2 rtl:translate-x-1/2"
                      style={{ insetInlineStart: `${at(target)}%` }}
                    />
                  ))}
              </div>
              <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
                <ScoreBox score={current} />
                <Icon name="arrow-left" size={12} className="text-ink-3" />
                {row.retire ? (
                  <Chip>حذف</Chip>
                ) : row.target ? (
                  <ScoreBox score={row.target.score} />
                ) : (
                  <span className="text-ink-3">—</span>
                )}
              </span>
            </div>
          );
        })}
        <span className="max-md:hidden" />
        <div className="relative mx-2 h-4 text-xs text-ink-3 tabular" aria-hidden>
          {TICKS.map((tick) => (
            <span
              key={tick}
              className={cn(
                "absolute top-0 ltr:-translate-x-1/2 rtl:translate-x-1/2",
                MINOR_TICKS.has(tick) && "max-md:hidden",
              )}
              style={{ insetInlineStart: `${at(tick)}%` }}
            >
              {fa(tick)}
            </span>
          ))}
        </div>
        <span />
      </div>
    </SectionPanel>
  );
}

// ─────────────────────────────── جدول ───────────────────────────────

const STATUS_TONE: Record<TargetRow["status"]["tone"], "info" | "warning" | "success" | "danger" | "neutral"> = {
  info: "info",
  warning: "warning",
  success: "success",
  danger: "danger",
  neutral: "neutral",
};

function Point({ point }: { point: TargetRow["current"] }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <ScoreBox score={point.score} />
      {point.profile && <span className="code text-[0.6875rem] whitespace-nowrap text-ink-3">{point.profile}</span>}
    </span>
  );
}

function TargetsTable({ rows }: { rows: TargetRow[] }) {
  const [aboveOnly, setAboveOnly] = useState(false);
  const shown = rows.filter((row) => !aboveOnly || row.status.value === "above");
  return (
    <SectionPanel
      title="ریسک‌های هدف و معیار پذیرش"
      description="هدف بدون معیار آزمون و موعد معتبر نیست · بهبود امتیاز ناشی از تغییر روش، بهبود واقعی کنترل گزارش نمی‌شود"
      aside={
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm">
              <Icon name="funnel" />
              فیلتر
              {aboveOnly && <Chip tone="brand">{fa(1)}</Chip>}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-60 p-3">
            <Checkbox
              checked={aboveOnly}
              onChange={(event) => setAboveOnly(event.target.checked)}
              label="فقط هدف بالاتر از اشتها"
            />
          </PopoverContent>
        </Popover>
      }
      bodyClassName="p-0"
    >
      {shown.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">ریسک‌های هدف به ترتیب امتیاز جاری</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">سناریو</th>
                <th scope="col">جاری</th>
                <th scope="col">هدف</th>
                <th scope="col">سازوکار</th>
                <th scope="col">معیار پذیرش</th>
                <th scope="col">طرح و موعد</th>
                <th scope="col">وضعیت هدف</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-xs whitespace-nowrap text-ink-2">{row.risk.code}</bdi>
                  </td>
                  <td data-primary className="min-w-44">
                    <AppLink href={row.risk.href} className="font-medium text-ink hover:text-brand">
                      {row.risk.title}
                    </AppLink>
                    <span className="block text-xs text-ink-3">
                      <bdi className="code">{row.risk.category}</bdi> · {faText(row.risk.scope)}
                    </span>
                  </td>
                  <td data-label="جاری" data-wide>
                    <Point point={row.current} />
                  </td>
                  <td data-label="هدف" data-wide>
                    {row.retire ? (
                      <span className="flex flex-col items-start gap-1">
                        <Chip>
                          <Icon name="x" size={12} />
                          بازنشستگی نمونه
                        </Chip>
                        <span className="text-xs text-ink-3">بدون امتیاز صفر ساختگی</span>
                      </span>
                    ) : row.target ? (
                      <Point point={row.target} />
                    ) : (
                      <span className="text-xs text-danger">هدف ثبت نشده</span>
                    )}
                  </td>
                  <td data-label="سازوکار" data-wide>
                    <span className="flex flex-wrap gap-1">
                      {row.mechanisms.length ? (
                        row.mechanisms.map((item) => (
                          <span
                            key={item}
                            dir="ltr"
                            className="code rounded-md bg-subtle px-1.5 py-0.5 text-xs whitespace-nowrap text-ink-2"
                          >
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </span>
                  </td>
                  <td data-label="معیار پذیرش" data-wide className="min-w-40 text-xs leading-5 text-ink-2">
                    {row.criteria ? faText(row.criteria) : <span className="text-danger">معیار ثبت نشده</span>}
                  </td>
                  <td data-label="طرح و موعد" data-wide className="text-xs whitespace-nowrap">
                    <span className="inline-flex flex-col">
                      <AppLink href={row.plan.href} className="code text-ink-2 hover:text-brand">
                        <bdi>{row.plan.action ?? "طرح"}</bdi>
                      </AppLink>
                      {row.plan.due && <span className="block text-ink-3 tabular">{faText(row.plan.due.jalali)}</span>}
                    </span>
                  </td>
                  <td data-label="وضعیت" data-wide>
                    <Chip tone={STATUS_TONE[row.status.tone]}>{row.status.label}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">
          {rows.length ? "ریسکی با این فیلتر نیست." : "هنوز طرح مواجهه‌ای برای ریسک بالا یا بحرانی ثبت نشده است."}
        </p>
      )}
    </SectionPanel>
  );
}

function exportCsv(rows: TargetRow[]) {
  const cell = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = ["کد", "سناریو", "جاری", "هدف", "سازوکار", "معیار پذیرش", "اقدام", "موعد", "وضعیت"];
  const lines = rows.map((row) =>
    [
      row.risk.code,
      row.risk.title,
      row.current.score,
      row.retire ? "حذف مسیر" : (row.target?.score ?? ""),
      row.mechanisms.join(" "),
      row.criteria,
      row.plan.action ?? "",
      row.plan.due?.jalali ?? "",
      row.status.label,
    ]
      .map(cell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "target-risks.csv";
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────── صفحه ───────────────────────────────

export function TargetRisksPage() {
  useTitle("لیست ریسک‌های هدف");
  const query = useQuery({
    queryKey: ["treatment", "targets"],
    queryFn: ({ signal }) => get<PageData>("treatment/targets/", signal),
  });
  const data = query.data;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="لیست ریسک‌های هدف"
        breadcrumb={[{ label: "برطرف‌سازی ریسک" }, { label: "لیست ریسک‌های هدف" }]}
        description="ریسک هدف (At، Bt، It) با فرض اجرای اقدام مشخص پیش‌بینی می‌شود؛ معیار آزمون و موعد تحقق اجباری است · تا تأیید شاهد واقعی، هدف «محقق‌نشده» است"
        actions={
          data && (
            <>
              <Button variant="outline" onClick={() => exportCsv(data.rows)} disabled={!data.rows.length}>
                <Icon name="download" />
                خروجی
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    disabled={!data.reassess.length}
                    title={data.reassess.length ? undefined : "طرحی با اقدام‌های تأییدشده منتظر ارزیابی نیست"}
                  >
                    <Icon name="check-square" />
                    ثبت ارزیابی پس از اقدام
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {data.reassess.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <AppLink href={item.href} className="text-ink no-underline hover:no-underline">
                        <span className="flex flex-col">
                          <span>
                            <bdi className="code text-xs text-ink-3">{item.code}</bdi> {item.title}
                          </span>
                          <span className="text-xs text-ink-3">{item.step}</span>
                        </span>
                      </AppLink>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !data ? (
        <PageSkeleton rows={6} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <StatTile
              label="دارای هدف مصوب"
              icon="target"
              value={fa(data.counts.with_target)}
              note="همه‌ی ریسک‌های بالا و بحرانی جاری"
            />
            <StatTile
              label="هدف در حد اشتها"
              icon="check-circle"
              tone="success"
              valueTone="success"
              value={fa(data.counts.within)}
              note="سطح هدف متوسط یا پایین‌تر"
            />
            <StatTile
              label="هدف بالاتر از اشتها"
              icon="warning"
              tone="warning"
              valueTone="warning"
              value={fa(data.counts.above)}
              note="اقدام بیشتر یا استثنای زمان‌دار"
            />
            <StatTile
              label="بازنشستگی پس از اثبات"
              icon="x-circle"
              tone="neutral"
              value={fa(data.counts.retire)}
              note="حذف مسیر · بدون امتیاز صفر"
            />
          </div>
          {data.rows.length > 0 && <PathChart rows={data.rows} />}
          <TargetsTable rows={data.rows} />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {RULES.map((rule) => (
              <li key={rule.title} className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-4">
                <span className="flex items-center gap-2">
                  <IconChip icon={rule.icon} tone={rule.tone} size="sm" />
                  <span className="text-sm font-semibold text-ink">{rule.title}</span>
                </span>
                <span className="text-xs leading-5 text-ink-2">{rule.text}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
