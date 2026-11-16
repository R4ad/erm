import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox, Radio } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip, type ChipTone as IconTone } from "@/components/ui/icon-chip";
import { LevelBadge, RISK_CLASSES, riskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip, SectionPanel, type ChipTone } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ActionRequiredPage as PageData, ActionRequiredRow } from "@/lib/types";

// «ریسک‌های نیازمند اقدام» به چیدمان فیگما ۱۴: هشدار عبور از مهلت مهار با تصعید به کمیته، پنج کاشی، جدول با زبانه‌های
// سطح و نوع، و سه کارت قواعد کسب‌وکار، رکورد الزامی طرح و گزینه‌های مواجهه.

const OPTION_STYLE: Record<ActionRequiredRow["option"]["value"], { icon: IconName; tone: ChipTone }> = {
  reduce: { icon: "shield-check", tone: "info" },
  avoid: { icon: "x-circle", tone: "danger" },
  transfer: { icon: "link", tone: "info" },
  accept: { icon: "chart-bar", tone: "warning" },
};

const TABS = [
  { value: "all", label: "همه" },
  { value: "critical", label: "بحرانی" },
  { value: "high", label: "بالا" },
  { value: "failed", label: "بازسنجی ناموفق" },
  { value: "acceptance", label: "پذیرش رو به انقضا" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function inTab(row: ActionRequiredRow, tab: Tab) {
  if (tab === "all") return true;
  if (tab === "failed") return row.kind === "failed";
  if (tab === "acceptance") return row.kind === "acceptance";
  return riskKey(row.level) === tab;
}

const RULES: { icon: IconName; text: string }[] = [
  { icon: "lock", text: "طرح مواجهه (RTP) برای ریسک‌های بالا و بحرانی الزامی است." },
  { icon: "flow", text: "پس از اجرای طرح، ارزیابی جاری جدید با شواهد واقعی الزامی است." },
  { icon: "bell", text: "اعلان بازبینی ۷ روز پیش از موعد برای مالک ارسال می‌شود." },
  { icon: "calendar", text: "انقضای پذیرش: یادآوری ۳۰ و ۷ روز؛ در موعد «منقضی» و تصعید." },
  { icon: "x-circle", text: "شکست یا حذف کنترل کلیدی: تعلیق اعتبار کاهش و بازسنجی ≤ ۱ روز کاری." },
];

const RECORD = [
  { title: "اقدام و سازوکار", text: "خروجی قابل آزمون و مؤلفه‌ی تغییرکننده" },
  { title: "مالک و مجری", text: "یک پاسخ‌گو؛ مجریان و تأییدکننده‌ی نتیجه" },
  { title: "موعد و منابع", text: "آغاز و پایان، هزینه، نفرساعت، پنجره‌ی تغییر" },
  { title: "ریسک هدف", text: "A، B، پنج بُعد پیامد و سطح هدف" },
  { title: "شاهد و معیار پذیرش", text: "آزمون پوشش، مانور یا تست مسیر" },
  { title: "بازسنجی", text: "تاریخ، مسئول و تصمیم ادامه یا پذیرش" },
];

const OPTIONS: { value: ActionRequiredRow["option"]["value"]; title: string; text: string; note: string }[] = [
  {
    value: "reduce",
    title: "کاهش",
    text: "بهبود پیشگیری، کشف همراه پاسخ، مهار یا بازیابی؛ سازوکار اثر و شاهد آزمون مشخص شود.",
    note: "باید روشن باشد A، B یا کدام بُعد I تغییر می‌کند",
  },
  {
    value: "avoid",
    title: "اجتناب",
    text: "حذف فعالیت یا مسیر ایجاد ریسک؛ پیامد توقف خدمت و ریسک جایگزین نیز ارزیابی شود.",
    note: "حذف معتبر مسیر: بازنشستگی نمونه با شاهد، نه صفر کردن B",
  },
  {
    value: "transfer",
    title: "انتقال یا اشتراک",
    text: "بیمه، تضمین یا قرارداد؛ مسئولیت باقیمانده، استثناهای پوشش و قابلیت وصول ثبت شود.",
    note: "انتقال مالی احتمال یا مسئولیت محرمانگی را خودکار کم نمی‌کند",
  },
  {
    value: "accept",
    title: "پذیرش",
    text: "تصمیم زمان‌دار در حدود اختیار، همراه پایش و شروط بازگشایی.",
    note: "بالا فقط موقت تا ۹۰ روز · بحرانی تا ۳۰ روز با اختیار رسمی",
  },
];

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function exportCsv(rows: ActionRequiredRow[]) {
  const header = ["کد", "سناریو", "سطح", "امتیاز", "مالک", "گزینه", "علت نیاز به اقدام", "مهلت", "وضعیت"];
  const lines = rows.map((row) =>
    [
      row.risk.code,
      row.risk.title,
      row.level.name,
      row.score,
      row.owner?.name ?? "",
      row.option.label,
      row.reason,
      row.deadline.text,
      row.status.label,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "action-required.csv";
  link.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────── جدول ───────────────────────────────

function OptionChip({ option }: { option: ActionRequiredRow["option"] }) {
  const style = OPTION_STYLE[option.value];
  return (
    <span title={option.suggested ? "گزینه‌ی پیشنهادی؛ طرح هنوز ثبت نشده است" : undefined}>
      <Chip tone={style.tone}>
        <Icon name={style.icon} size={12} />
        {option.label}
        {option.suggested && <span className="sr-only"> (پیشنهادی)</span>}
      </Chip>
    </span>
  );
}

function RowAction({ row, onEscalate }: { row: ActionRequiredRow; onEscalate: (row: ActionRequiredRow) => void }) {
  if (row.action.kind === "escalate") {
    return (
      <Button size="sm" variant="danger" onClick={() => onEscalate(row)}>
        <Icon name="arrow-up" />
        {row.action.label}
        <span className="sr-only"> {row.risk.code}</span>
      </Button>
    );
  }
  const icon: IconName = row.action.kind === "create" ? "plus" : row.kind === "failed" ? "pencil" : "eye";
  return (
    <Button size="sm" variant="outline" asChild>
      <AppLink href={row.action.href ?? row.risk.href} className="no-underline hover:no-underline">
        <Icon name={icon} />
        {row.action.label}
        <span className="sr-only"> {row.risk.code}</span>
      </AppLink>
    </Button>
  );
}

function RequiredTable({ data, onEscalate }: { data: PageData; onEscalate: (row: ActionRequiredRow) => void }) {
  const [tab, setTab] = useState<Tab>("all");
  const [owner, setOwner] = useState<number | null>(null);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [soonOnly, setSoonOnly] = useState(false);
  const rows = data.rows.filter(
    (row) =>
      inTab(row, tab) &&
      (owner === null || row.owner?.id === owner) &&
      (!overdueOnly || row.overdue) &&
      (!soonOnly || row.within_48h),
  );
  const filters = Number(overdueOnly) + Number(soonOnly);
  const ownerName = data.owners.find((item) => item.id === owner)?.name;
  return (
    <section
      aria-label="فهرست ریسک‌های نیازمند اقدام"
      className="overflow-hidden rounded-lg border border-line bg-panel"
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line ps-1 pe-4">
          <TabsList className="border-b-0" aria-label="دسته‌ی ریسک‌ها">
            {TABS.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                count={fa(data.rows.filter((row) => inTab(row, item.value)).length)}
              >
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex items-center gap-2 py-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <Icon name="user" />
                  {ownerName ?? "مالک"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="flex w-60 flex-col gap-2 p-3">
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-1 text-xs font-medium text-ink-3">مالک ریسک</legend>
                  <Radio name="owner" checked={owner === null} onChange={() => setOwner(null)} label="همه‌ی مالکان" />
                  {data.owners.map((item) => (
                    <Radio
                      key={item.id}
                      name="owner"
                      checked={owner === item.id}
                      onChange={() => setOwner(item.id)}
                      label={item.name}
                    />
                  ))}
                </fieldset>
              </PopoverContent>
            </Popover>
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
                  checked={overdueOnly}
                  onChange={(event) => setOverdueOnly(event.target.checked)}
                  label="فقط عبور از مهلت"
                />
                <Checkbox
                  checked={soonOnly}
                  onChange={(event) => setSoonOnly(event.target.checked)}
                  label="فقط کمتر از ۴۸ ساعت"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <TabsContent value={tab} className="pt-0">
          {rows.length ? (
            <div className="table-shell">
              <table className="data-table">
                <caption className="sr-only">ریسک‌های نیازمند اقدام، عبور از مهلت در ابتدا</caption>
                <thead>
                  <tr>
                    <th scope="col">کد</th>
                    <th scope="col">سناریو</th>
                    <th scope="col">سطح و امتیاز</th>
                    <th scope="col">مالک</th>
                    <th scope="col">گزینه‌ی پیشنهادی</th>
                    <th scope="col">علت نیاز به اقدام</th>
                    <th scope="col">مهلت و وضعیت</th>
                    <th scope="col">
                      <span className="sr-only">اقدام</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const tone = RISK_CLASSES[riskKey(row.level)];
                    return (
                      <tr
                        key={row.key}
                        className={row.overdue && row.kind === "plan" ? "bg-danger-subtle/60" : undefined}
                      >
                        <td data-label="کد" className="w-0">
                          <bdi className="code text-xs whitespace-nowrap text-ink-2">{row.risk.code}</bdi>
                        </td>
                        <td data-primary className="min-w-44">
                          <AppLink href={row.risk.href} className="text-base font-medium text-ink hover:text-brand">
                            {row.risk.title}
                          </AppLink>
                          <span className="block text-xs text-ink-3">{row.risk.note}</span>
                        </td>
                        <td data-label="سطح و امتیاز" data-wide>
                          <span className="inline-flex items-center gap-2">
                            <LevelBadge level={row.level} />
                            {row.score !== null && (
                              <span
                                className={cn(
                                  "inline-flex h-6 min-w-7 items-center justify-center rounded-md border px-1 text-xs font-bold tabular",
                                  tone.bg,
                                  tone.fg,
                                  tone.border,
                                )}
                              >
                                <span className="sr-only">امتیاز </span>
                                {fa(row.score)}
                              </span>
                            )}
                          </span>
                        </td>
                        <td data-label="مالک" data-wide className="text-sm text-ink-2">
                          {row.owner ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Avatar name={row.owner.name} size={24} className="shrink-0" />
                              {row.owner.name}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label="گزینه">
                          <OptionChip option={row.option} />
                        </td>
                        <td data-label="علت" data-wide className="min-w-32 text-xs text-ink-2">
                          {faText(row.reason)}
                        </td>
                        <td data-label="مهلت" data-wide>
                          <span className="flex flex-col items-start gap-1">
                            <span title={row.deadline.due ? faText(row.deadline.due.jalali) : undefined}>
                              <Chip tone={row.deadline.tone}>
                                <Icon name={row.overdue ? "warning" : "clock"} size={12} />
                                {row.deadline.text}
                              </Chip>
                            </span>
                            <span
                              className={cn(
                                "text-xs font-medium",
                                row.status.tone === "danger" && "text-danger",
                                row.status.tone === "warning" && "text-warning",
                                row.status.tone === "info" && "text-info",
                                row.status.tone === "success" && "text-success",
                              )}
                            >
                              {row.status.label}
                            </span>
                          </span>
                        </td>
                        <td data-wide className="w-0">
                          <RowAction row={row} onEscalate={onEscalate} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-ink-3">
              {data.rows.length ? "ریسکی با این فیلتر نیست." : "ریسکی منتظر اقدام نیست."}
            </p>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}

// ─────────────────────────────── کارت‌های راهنما ───────────────────────────────

function RulesCard() {
  return (
    <SectionPanel title="قواعد کسب‌وکار" description="اعمال خودکار در گردش کار">
      <ul className="flex flex-col gap-3">
        {RULES.map((rule) => (
          <li key={rule.text} className="flex items-start gap-2.5 text-sm leading-6 text-ink">
            <Icon name={rule.icon} size={16} className="mt-1 shrink-0 text-danger" />
            {rule.text}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function RecordCard() {
  return (
    <SectionPanel title="رکورد الزامی طرح مواجهه">
      <ul className="flex flex-col gap-3">
        {RECORD.map((item) => (
          <li key={item.title} className="flex items-start gap-2.5">
            <Icon name="check-square" size={16} className="mt-0.5 shrink-0 text-brand" />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{item.title}</span>
              <span className="text-xs text-ink-3">{item.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function OptionsCard() {
  return (
    <SectionPanel
      title="گزینه‌های مواجهه"
      description="انتخاب گزینه با سازوکار اثر روشن؛ «تقویت امنیت» بدون دامنه و معیار قبولی اقدام کامل نیست"
    >
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPTIONS.map((item) => {
          const style = OPTION_STYLE[item.value];
          const tone: IconTone = style.tone === "danger" ? "danger" : style.tone === "warning" ? "warning" : "brand";
          return (
            <li key={item.value} className="flex flex-col gap-2 rounded-lg border border-line bg-subtle p-4">
              <span className="flex items-center gap-2">
                <IconChip icon={style.icon} tone={tone} size="sm" />
                <span className="text-base font-semibold text-ink">{item.title}</span>
              </span>
              <span className="text-sm leading-6 text-ink-2">{item.text}</span>
              <span className="flex items-start gap-1.5 text-xs text-ink-3">
                <Icon name="info" size={12} className="mt-0.5 shrink-0" />
                {item.note}
              </span>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

export function ActionRequiredPage() {
  useTitle("ریسک‌های نیازمند اقدام");
  const toast = useToast();
  const queryClient = useQueryClient();
  const [escalating, setEscalating] = useState<{ ids: number[]; codes: string[] } | null>(null);
  const query = useQuery({
    queryKey: ["treatment", "required"],
    queryFn: ({ signal }) => get<PageData>("treatment/required/", signal),
  });
  const escalate = useMutation({
    mutationFn: (ids: number[]) => post<{ message: string }>("treatment/required/escalate/", { ids }),
    onSuccess: (result) => {
      setEscalating(null);
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries();
    },
    onError: (error) => {
      setEscalating(null);
      toast({ title: faText(error.message), tone: "danger" });
    },
  });
  const data = query.data;
  const creatable = data ? data.rows.filter((row) => row.action.kind === "create") : [];
  const critical = data?.containment_overdue ?? [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ریسک‌های نیازمند اقدام"
        breadcrumb={[{ label: "برطرف‌سازی ریسک" }, { label: "ریسک‌های نیازمند اقدام" }]}
        description="ریسک‌های بالا و بحرانی بدون طرح مواجهه‌ی مصوب، بازسنجی‌های ناموفق و پذیرش‌های رو به انقضا · طرح مواجهه برای بالا و بحرانی الزامی است"
        actions={
          data && (
            <>
              <Button variant="outline" onClick={() => exportCsv(data.rows)} disabled={!data.rows.length}>
                <Icon name="download" />
                خروجی
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!creatable.length}>
                    <Icon name="plus" />
                    ایجاد طرح مواجهه
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {creatable.map((row) => (
                    <DropdownMenuItem key={row.key} asChild>
                      <AppLink href={row.action.href ?? "#"} className="text-ink no-underline hover:no-underline">
                        <bdi className="code text-xs text-ink-3">{row.risk.code}</bdi> {row.risk.title}
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
          {critical.length > 0 && (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-subtle px-5 py-4 sm:flex-row sm:items-center"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-danger text-white">
                <Icon name="warning" size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-base font-semibold text-danger">
                  {fa(critical.length)} ریسک بحرانی از مهلت مهار ۲۴ ساعته عبور کرده‌اند
                </span>
                <span className="text-sm text-ink-2">
                  {critical.map((item, index) => (
                    <span key={item.id}>
                      {index > 0 && " و "}
                      <bdi className="code">{item.code}</bdi> ({item.title})
                    </span>
                  ))}{" "}
                  · ادامه‌ی موقت فقط با ضرورت مستند و اختیار رسمی کمیته امنیت مجاز است.
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {data.can_escalate && (
                  <Button
                    variant="danger"
                    onClick={() =>
                      setEscalating({ ids: critical.map((item) => item.id), codes: critical.map((item) => item.code) })
                    }
                  >
                    <Icon name="arrow-up" />
                    تصعید به کمیته امنیت
                  </Button>
                )}
                <Button variant="ghost" asChild>
                  <AppLink href={critical[0]?.href ?? "#"} className="no-underline hover:no-underline">
                    <Icon name="eye" />
                    مشاهده
                  </AppLink>
                </Button>
              </span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="بدون طرح مواجهه"
              icon="clipboard"
              tone="brand"
              value={fa(data.counts.no_plan)}
              note="بالا و بحرانی · طرح الزامی"
            />
            <StatTile
              label="عبور از مهلت"
              icon="warning"
              tone="danger"
              valueTone="danger"
              value={fa(data.counts.overdue)}
              note="مهار ۲۴ ساعته · بحرانی"
            />
            <StatTile
              label="کمتر از ۴۸ ساعت"
              icon="clock"
              tone="warning"
              valueTone="warning"
              value={fa(data.counts.within_48h)}
              note="طرح بحرانی · ۳ روز کاری"
            />
            <StatTile
              label="بازسنجی ناموفق"
              icon="x-circle"
              tone="neutral"
              value={fa(data.counts.failed)}
              note="آزمون اقدام رد شد"
            />
            <StatTile
              label="پذیرش رو به انقضا"
              icon="calendar"
              tone="success"
              valueTone="success"
              value={fa(data.counts.acceptance)}
              note="یادآوری ۳۰ و ۷ روز · بدون تمدید خودکار"
              className="col-span-2 md:col-span-1"
            />
          </div>
          <RequiredTable
            data={data}
            onEscalate={(row) => setEscalating({ ids: [row.risk.id], codes: [row.risk.code] })}
          />
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_23.5rem]">
            <OptionsCard />
            <div className="flex flex-col gap-4">
              <RulesCard />
              <RecordCard />
            </div>
          </div>
          <ConfirmDialog
            open={escalating !== null}
            onOpenChange={(open) => !open && setEscalating(null)}
            title="به کمیته امنیت تصعید شود؟"
            description={
              <>
                برای <bdi className="code">{escalating?.codes.join("، ")}</bdi> اعلان تصعید به کمیته امنیت، متولی روش و
                مالک ریسک فرستاده می‌شود.
              </>
            }
            confirmLabel="تصعید"
            loading={escalate.isPending}
            onConfirm={() => escalating && escalate.mutate(escalating.ids)}
          />
        </>
      )}
    </div>
  );
}
