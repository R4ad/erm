import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Select } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip, type ChipTone as IconTone } from "@/components/ui/icon-chip";
import { LevelBadge } from "@/components/ui/level-badge";
import { RISK_CLASSES, riskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ProcessSteps, type StepState } from "@/components/ui/process-step";
import { Chip, SectionPanel, type ChipTone } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { EvaluationLevel, EvaluationPage as PageData, EvaluationRow } from "@/lib/types";

// «سنجش ریسک» به چیدمان فیگما ۱۳: گام ارزیابی، کاشی هر سطح تصمیم و ارتقا با قواعد تقدم، صف سنجش با سطح پایه و سطح
// تصمیم، ماتریس تصمیم L × I با شمار ریسک‌های هر خانه، قواعد تقدم، و اشتهای ریسک و اختیار پذیرش از سطح‌های نسخه‌ی روش.

const PROCESS: { label: string; state: StepState }[] = [
  { label: "تعیین بافتار", state: "done" },
  { label: "شناسایی", state: "done" },
  { label: "گردآوری شواهد", state: "done" },
  { label: "تحلیل", state: "done" },
  { label: "ارزیابی", state: "current" },
  { label: "تصمیم و اجرا", state: "upcoming" },
  { label: "آزمون و بازسنجی", state: "upcoming" },
  { label: "پایش و گزارش", state: "upcoming" },
];

const LEVEL_TILE: Record<
  string,
  { icon: IconName; tone: IconTone; value: "danger" | "warning" | "brand" | "success" }
> = {
  critical: { icon: "warning", tone: "danger", value: "danger" },
  high: { icon: "lightning", tone: "warning", value: "warning" },
  medium: { icon: "gauge", tone: "brand", value: "brand" },
  low: { icon: "check-circle", tone: "success", value: "success" },
};

const DEADLINE_TONE: Record<string, ChipTone> = { critical: "danger", high: "warning", medium: "info", low: "success" };

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** خروجی CSV صف سنجش، با BOM تا اکسل متن فارسی را درست باز کند. */
function exportCsv(rows: EvaluationRow[]) {
  const header = [
    "کد",
    "سناریو",
    "دسته",
    "دامنه",
    "L",
    "I",
    "امتیاز",
    "سطح پایه",
    "سطح تصمیم",
    "علت ارتقا",
    "مرجع مجاز",
    "مهلت طرح",
  ];
  const lines = rows.map((row) =>
    [
      row.code,
      row.title,
      row.category,
      row.scope,
      row.l,
      row.i,
      row.score,
      row.base_level.name,
      row.decision_level.name,
      row.reasons.join("؛ "),
      row.authority,
      row.deadline.text,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "risk-evaluation.csv";
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────── کاشی‌ها ───────────────────────────────

function Tiles({ data }: { data: PageData }) {
  const levels = [...data.levels].sort((a, b) => b.rank - a.rank);
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {levels.map((level) => {
        const tile = LEVEL_TILE[riskKey(level)] ?? LEVEL_TILE.low;
        return (
          <StatTile
            key={level.rank}
            label={level.name}
            icon={tile?.icon}
            tone={tile?.tone}
            valueTone={tile?.value}
            value={fa(level.count)}
            note={level.note}
          />
        );
      })}
      <StatTile
        label="ارتقا با قواعد تقدم"
        icon="arrow-up"
        tone="neutral"
        value={fa(data.raised.count)}
        note={data.raised.reasons.length ? data.raised.reasons.join(" · ") : "هیچ سطحی ارتقا نیافته است"}
        className="col-span-2 md:col-span-1"
      />
    </div>
  );
}

// ─────────────────────────────── صف سنجش ───────────────────────────────

function ScoreBox({ row }: { row: EvaluationRow }) {
  const tone = RISK_CLASSES[riskKey(row.base_level)];
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-8 items-center justify-center rounded-md border px-1.5 text-sm font-bold tabular",
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      {fa(row.score)}
    </span>
  );
}

function Deadline({ row }: { row: EvaluationRow }) {
  const { deadline } = row;
  if (deadline.kind === "done") return <span className="text-xs text-ink-3">{deadline.text}</span>;
  const tone: ChipTone =
    deadline.overdue || deadline.kind === "containment"
      ? "danger"
      : deadline.kind === "awaiting"
        ? "brand"
        : (DEADLINE_TONE[riskKey(row.decision_level)] ?? "neutral");
  return (
    <span
      title={
        deadline.kind === "awaiting"
          ? "از «ارسال به تصمیم» شمرده می‌شود"
          : deadline.due
            ? faText(deadline.due.jalali)
            : undefined
      }
    >
      <Chip tone={tone}>
        <Icon name="clock" size={12} />
        {deadline.kind === "awaiting" && <span className="sr-only">پس از ارسال به تصمیم: </span>}
        {deadline.text}
      </Chip>
    </span>
  );
}

function Queue({ data }: { data: PageData }) {
  const [level, setLevel] = useState("");
  const [awaiting, setAwaiting] = useState(false);
  const [raisedOnly, setRaisedOnly] = useState(false);
  const rows = data.rows.filter(
    (row) =>
      (!level || String(row.decision_level.rank) === level) &&
      (!awaiting || row.deadline.kind === "awaiting") &&
      (!raisedOnly || row.raised),
  );
  const filters = Number(awaiting) + Number(raisedOnly);
  return (
    <SectionPanel
      title="صف سنجش و سطح تصمیم"
      description="مرتب‌سازی: سطح تصمیم، امتیاز؛ در امتیاز یکسان پیامد شدیدتر، گسترش بین مشتریان، نزدیکی به موعد و عدم قطعیت بیشتر"
      aside={
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm">
                <Icon name="funnel" />
                فیلتر
                {filters > 0 && <Chip tone="brand">{fa(filters)}</Chip>}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="flex w-60 flex-col gap-2 p-3">
              <Checkbox
                checked={awaiting}
                onChange={(event) => setAwaiting(event.target.checked)}
                label="فقط منتظر تصمیم"
              />
              <Checkbox
                checked={raisedOnly}
                onChange={(event) => setRaisedOnly(event.target.checked)}
                label="فقط ارتقا با قواعد تقدم"
              />
            </PopoverContent>
          </Popover>
          <Select
            aria-label="سطح تصمیم"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            className="h-8 w-36 text-sm"
          >
            <option value="">همه‌ی سطوح</option>
            {[...data.levels]
              .sort((a, b) => b.rank - a.rank)
              .map((item) => (
                <option key={item.rank} value={item.rank}>
                  {item.name}
                </option>
              ))}
          </Select>
        </>
      }
      bodyClassName="p-0"
    >
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">صف سنجش ریسک‌ها به ترتیب سطح تصمیم و امتیاز</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">سناریو</th>
                <th scope="col">L</th>
                <th scope="col">I</th>
                <th scope="col">امتیاز</th>
                <th scope="col">سطح پایه</th>
                <th scope="col">سطح تصمیم</th>
                <th scope="col">علت ارتقا</th>
                <th scope="col">مرجع مجاز</th>
                <th scope="col">مهلت طرح</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.raised ? "bg-brand-subtle/50" : undefined}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-xs whitespace-nowrap text-ink-2">{row.code}</bdi>
                  </td>
                  <td data-primary className="min-w-56">
                    <AppLink href={row.href} className="text-base font-medium text-ink hover:text-brand">
                      {row.title}
                    </AppLink>
                    <span className="block text-xs text-ink-3">
                      {row.category} · {row.scope}
                    </span>
                  </td>
                  <td data-label="L" className="tabular">
                    {row.l ? fa(row.l) : "—"}
                  </td>
                  <td data-label="I" className="tabular">
                    {row.i ? fa(row.i) : "—"}
                  </td>
                  <td data-label="امتیاز">
                    <ScoreBox row={row} />
                  </td>
                  <td data-label="سطح پایه">
                    <LevelBadge level={row.base_level} />
                  </td>
                  <td data-label="سطح تصمیم">
                    <LevelBadge level={row.decision_level} />
                  </td>
                  <td
                    data-label="علت ارتقا"
                    data-wide={row.reasons.length ? true : undefined}
                    className="min-w-40 text-xs"
                  >
                    {row.reasons.length ? (
                      <span className="inline-flex items-start gap-1 text-danger">
                        <Icon name="arrow-up" size={12} className="mt-0.5 shrink-0" />
                        {row.reasons.map(faText).join(" · ")}
                      </span>
                    ) : (
                      <span className="text-ink-3">—</span>
                    )}
                  </td>
                  <td data-label="مرجع مجاز" className="text-xs whitespace-nowrap text-ink-2">
                    {row.authority}
                  </td>
                  <td data-label="مهلت طرح" data-wide>
                    <Deadline row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">
          {data.rows.length ? "ریسکی با این فیلتر در صف نیست." : "هنوز ریسک ارزیابی‌شده‌ای در صف سنجش نیست."}
        </p>
      )}
    </SectionPanel>
  );
}

// ─────────────────────────────── ماتریس و قواعد ───────────────────────────────

function DecisionMatrix({ data }: { data: PageData }) {
  const total = data.rows.length;
  const legend = [...data.levels].sort((a, b) => a.rank - b.rank);
  return (
    <SectionPanel
      title="ماتریس تصمیم L × I"
      description="رنگ هر خانه سطح تصمیم است؛ عدد داخل دایره، تعداد ریسک‌های جاری در صف"
      aside={<Chip>{fa(total)} ریسک</Chip>}
      bodyClassName="flex flex-col gap-3"
    >
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد */}
      <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="جدول ماتریس، پیمایش افقی">
        <table className="w-full min-w-[26rem] table-fixed border-separate border-spacing-1.5">
          <caption className="sr-only">ماتریس تصمیم: سطر L و ستون I، با سطح تصمیم و شمار ریسک‌های هر خانه</caption>
          <thead>
            <tr>
              <td className="w-8" />
              {[1, 2, 3, 4, 5].map((impact) => (
                <th key={impact} scope="col" className="pb-1 text-xs font-medium text-ink-3">
                  I{fa(impact)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row) => (
              <tr key={row.l}>
                <th scope="row" className="text-xs font-medium text-ink-3">
                  L{fa(row.l)}
                </th>
                {row.cells.map((cell) => {
                  const tone = RISK_CLASSES[riskKey(cell.level)];
                  return (
                    <td
                      key={cell.i}
                      className={cn(
                        "relative h-14 rounded-md text-center align-middle",
                        tone.bg,
                        tone.fg,
                        cell.raised && "border border-dashed border-current",
                      )}
                    >
                      {cell.raised && (
                        <span className="absolute top-1 start-1 rounded-sm bg-panel px-1 text-[0.625rem] font-semibold text-ink-2">
                          کف
                        </span>
                      )}
                      <span className="flex flex-col items-center gap-1">
                        <span className="text-xs font-medium">{cell.level?.name ?? "—"}</span>
                        {cell.count > 0 ? (
                          <span className="grid size-5 place-items-center rounded-full bg-panel text-xs font-bold text-ink shadow-sm">
                            {fa(cell.count)}
                            <span className="sr-only"> ریسک، امتیاز {fa(cell.score)}</span>
                          </span>
                        ) : (
                          <span className="text-xs opacity-80 tabular">
                            <span className="sr-only">امتیاز </span>
                            {fa(cell.score)}
                          </span>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap items-center gap-2 text-xs text-ink-2" aria-label="بازه‌ی امتیاز هر سطح">
        {legend.map((level) => (
          <li key={level.rank} className="inline-flex items-center gap-1.5">
            <LevelBadge level={level} />
            <span className="tabular">
              {fa(level.min_score)}–{fa(level.max_score)}
            </span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function PrecedenceRules({ data }: { data: PageData }) {
  const floors = data.floors.map((floor, index) =>
    index === 0
      ? `I${fa(floor.impact)} حتی با L۱ حداقل «${floor.level}»`
      : `I${fa(floor.impact)} حداقل «${floor.level}»`,
  );
  const rules: { icon: IconName; tone: IconTone; title: string; text: ReactNode }[] = [
    {
      icon: "arrow-up",
      tone: "warning",
      title: "کف پیامد",
      text: (
        <>
          {floors.length ? `${floors.join("؛ ")}.` : "نسخه‌ی روش کف پیامدی ندارد."}
          {data.example && (
            <>
              {" "}
              نمونه: <bdi className="code">{data.example.code}</bdi> با امتیاز {fa(data.example.score)} به «
              {data.example.level}» ارتقا یافت.
            </>
          )}
        </>
      ),
    },
    {
      icon: "lightning",
      tone: "danger",
      title: "رویداد در حال وقوع",
      text: "اولویت اقدام بحرانی و ارجاع هم‌زمان به مدیریت رخداد؛ امتیاز ریسک آینده جدا حفظ می‌شود.",
    },
    {
      icon: "lock",
      tone: "danger",
      title: "منع الزام‌آور یا نقض احرازشده",
      text: "وضعیت «خارج از اختیار پذیرش» و اولویت بحرانی؛ حقوقی دامنه و اقدام مجاز را تعیین می‌کند.",
    },
    {
      icon: "buildings",
      tone: "info",
      title: "حد تحمل مشتری",
      text: "عبور از حد تحمل خاص مشتری یا دستور سخت‌گیرانه‌تر، اختیار پذیرش عمومی را محدود می‌کند.",
    },
  ];
  const order = ["پیامد شدیدتر", "گسترش بین مشتریان", "نزدیکی به موعد تعهد", "عدم قطعیت بیشتر"];
  return (
    <SectionPanel
      title="قواعد تقدم بر امتیاز"
      description="عدد خام تغییر نمی‌کند؛ علت ارتقای سطح ثبت می‌شود"
      bodyClassName="flex flex-col gap-3"
    >
      <ul className="flex flex-col gap-3">
        {rules.map((rule) => (
          <li key={rule.title} className="flex items-start gap-2.5">
            <IconChip icon={rule.icon} tone={rule.tone} size="sm" />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-ink">{rule.title}</span>
              <span className="text-xs leading-5 text-ink-2">{rule.text}</span>
            </span>
          </li>
        ))}
      </ul>
      <div className="rounded-lg bg-subtle px-3 py-2.5">
        <p className="text-xs font-medium text-ink-2">ترتیب اولویت در امتیاز یکسان</p>
        <ol className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-semibold text-ink">
          {order.map((item, index) => (
            <li key={item}>
              {fa(index + 1)} {item}
            </li>
          ))}
        </ol>
      </div>
    </SectionPanel>
  );
}

function Appetite({ data }: { data: PageData }) {
  const approved = data.method && ["active", "approved"].includes(data.method.status.value);
  return (
    <SectionPanel
      title="اشتهای ریسک و اختیار پذیرش"
      description="جهت‌گیری داتین: پذیرش پایین در حدود تعهدات، مدیریت فعال متوسط، کاهش یا اجتناب از بالا و بحرانی · حدود تحمل خدمت، قرارداد و مقررات مقدم است"
      aside={approved ? <Chip tone="success">مصوب مرجع مجاز</Chip> : <Chip tone="warning">مصوب نشده</Chip>}
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">اشتهای ریسک و اختیار پذیرش هر سطح</caption>
          <thead>
            <tr>
              <th scope="col">سطح</th>
              <th scope="col">تصمیم و مرجع مجاز</th>
              <th scope="col">مهلت طرح</th>
              <th scope="col">حداکثر اعتبار پذیرش</th>
              <th scope="col">بازبینی دوره‌ای</th>
              <th scope="col">در صف</th>
            </tr>
          </thead>
          <tbody>
            {[...data.levels]
              .sort((a, b) => a.rank - b.rank)
              .map((level: EvaluationLevel) => (
                <tr key={level.rank}>
                  <td data-label="سطح">
                    <LevelBadge level={level} />
                  </td>
                  <td data-primary className="min-w-64 text-sm text-ink">
                    {faText(level.decision_rule)}
                  </td>
                  <td data-label="مهلت طرح" className="text-xs text-ink-2">
                    {level.plan}
                  </td>
                  <td data-label="اعتبار پذیرش" className="text-xs text-ink-2">
                    {level.acceptance}
                  </td>
                  <td data-label="بازبینی" className="text-xs text-ink-2">
                    {level.review}
                  </td>
                  <td
                    data-label="در صف"
                    className={cn(
                      "font-semibold tabular",
                      riskKey(level) === "critical" && level.count ? "text-danger" : "text-ink",
                    )}
                  >
                    {fa(level.count)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="flex items-start gap-2 border-t border-line bg-subtle px-5 py-3 text-xs text-ink-2">
        <Icon name="bell" size={14} className="mt-0.5 shrink-0 text-brand" />
        یادآوری انقضای پذیرش ۳۰ و ۷ روز پیش از موعد · تمدید خودکار ممنوع است · پذیرش ریسک با «بستن» رکورد یکسان نیست.
      </p>
    </SectionPanel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

interface BulkResult {
  done: string[];
  failed: { code: string; problems: string[] }[];
}

export function EvaluationPage() {
  useTitle("سنجش ریسک");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const query = useQuery({ queryKey: ["evaluation"], queryFn: ({ signal }) => get<PageData>("evaluation/", signal) });
  const sendable = useMemo(() => (query.data ? query.data.rows.filter((row) => row.sendable) : []), [query.data]);
  const send = useMutation({
    mutationFn: () =>
      post<BulkResult>("risks/bulk-transition/", { transition: "approve", ids: sendable.map((row) => row.id) }),
    onSuccess: (result) => {
      setConfirming(false);
      if (result.done.length) {
        toast({ title: `${fa(result.done.length)} ریسک برای تصمیم و طراحی برنامه‌ی درمان فرستاده شد.` });
      }
      for (const item of result.failed) {
        toast({ title: `${item.code}: ${item.problems.map(faText).join(" ")}`, tone: "danger" });
      }
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      setConfirming(false);
      toast({ title: faText(error.message), tone: "danger" });
    },
  });

  const header = (
    <PageHeader
      title="سنجش ریسک"
      breadcrumb={[{ label: "ارزیابی ریسک", to: "/assessments" }, { label: "سنجش ریسک" }]}
      meta={
        query.data?.method && (
          <AppLink href={query.data.method.href} className="no-underline hover:no-underline">
            <Chip tone="success">
              <Icon name="lock" size={12} />
              ParameterSet v{query.data.method.number} · {query.data.method.status.label}
            </Chip>
          </AppLink>
        )
      }
      description="امتیاز = L × I، عدد صحیح ۱ تا ۲۵ بدون گرد کردن یا میانگین · سطح تصمیم از امتیاز، قواعد تقدم و محدودیت مصوب مشتری به دست می‌آید"
      actions={
        query.data && (
          <>
            <Button variant="outline" onClick={() => exportCsv(query.data.rows)} disabled={!query.data.rows.length}>
              <Icon name="download" />
              خروجی گزارش
            </Button>
            <Button
              disabled={!sendable.length}
              onClick={() => setConfirming(true)}
              title={sendable.length ? undefined : "ریسکی منتظر تصمیم کارگروه نیست"}
            >
              ارسال به تصمیم
              {sendable.length > 0 && <span className="tabular">({fa(sendable.length)})</span>}
              <Icon name="arrow-left" className="ltr:rotate-180" />
            </Button>
          </>
        )
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Card
        className="overflow-x-auto px-5 py-[0.9375rem]"
        role="region"
        tabIndex={0}
        aria-label="گام‌های فرایند مدیریت ریسک"
      >
        <ProcessSteps steps={PROCESS} className="min-w-[44rem]" />
      </Card>
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <Tiles data={query.data} />
          <Queue data={query.data} />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
            <DecisionMatrix data={query.data} />
            <PrecedenceRules data={query.data} />
          </div>
          <Appetite data={query.data} />
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title="ریسک‌های سنجش‌شده برای تصمیم فرستاده شوند؟"
            description={
              <span className="flex flex-col gap-1">
                <span>
                  این ریسک‌ها «تأیید و طراحی برنامه‌ی درمان» می‌شوند و مهلت طرح و مهار از همین حالا شمرده می‌شود:
                </span>
                {sendable.map((row) => (
                  <span key={row.id}>
                    • <bdi className="code">{row.code}</bdi> {row.title} ({row.decision_level.name})
                  </span>
                ))}
              </span>
            }
            confirmLabel="ارسال به تصمیم"
            loading={send.isPending}
            onConfirm={() => send.mutate()}
          />
        </>
      )}
    </div>
  );
}
