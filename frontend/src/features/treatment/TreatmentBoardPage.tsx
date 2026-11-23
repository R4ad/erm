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
import { Checkbox, Radio, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { LevelBadge } from "@/components/ui/level-badge";
import { RISK_CLASSES, riskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Chip, SectionPanel, type ChipTone } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { BoardCard, TreatmentBoardPage as PageData } from "@/lib/types";

// «ریسک‌های در حال درمان» به چیدمان فیگما ۱۵: پنج کاشی، تابلوی اقدام‌ها به تفکیک وضعیت (یا ریسک)، نمای جدول،
// بازسنجی‌های پیش رو و چرخه‌ی وضعیت اقدام.

const STATUS_STYLE: Record<string, { dot: string; head: string; bar: string }> = {
  planned: { dot: "bg-ink-3", head: "bg-subtle text-ink", bar: "bg-ink-3" },
  approved: { dot: "bg-info", head: "bg-info-subtle text-info", bar: "bg-info" },
  in_progress: { dot: "bg-brand", head: "bg-brand-subtle text-brand", bar: "bg-brand" },
  blocked: { dot: "bg-danger", head: "bg-danger-subtle text-danger", bar: "bg-danger" },
  ready: { dot: "bg-warning", head: "bg-warning-subtle text-warning", bar: "bg-warning" },
  verified: { dot: "bg-success", head: "bg-success-subtle text-success", bar: "bg-success" },
  failed: { dot: "bg-danger", head: "bg-danger-subtle text-danger", bar: "bg-danger" },
};

const TABS = [
  { value: "all", label: "همه‌ی طرح‌ها" },
  { value: "mine", label: "طرح‌های من" },
  { value: "severe", label: "بالا و بحرانی" },
  { value: "overdue", label: "معوق" },
] as const;

type Tab = (typeof TABS)[number]["value"];

function inTab(card: BoardCard, tab: Tab, me: number) {
  if (tab === "mine") return [card.owner_id, card.verifier_id, card.assignee?.id].includes(me);
  if (tab === "severe") return ["high", "critical"].includes(riskKey(card.level));
  if (tab === "overdue") return card.overdue;
  return true;
}

const FOOTER_TONE: Record<string, string> = {
  neutral: "text-ink-3",
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
};

function ActionCard({ card }: { card: BoardCard }) {
  const style = STATUS_STYLE[card.status.value] ?? STATUS_STYLE.planned;
  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border bg-panel p-3 shadow-xs",
        card.alert ? "border-danger" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <AppLink href={card.href} className="code text-xs break-all text-ink-2 no-underline hover:text-brand">
          <bdi>{card.code}</bdi>
        </AppLink>
        <LevelBadge level={card.level} />
      </div>
      <AppLink href={card.href} className="text-sm leading-6 font-semibold text-ink no-underline hover:text-brand">
        {card.title}
      </AppLink>
      <p className="text-xs text-ink-3">
        <AppLink href={card.risk.href} className="text-ink-3 no-underline hover:text-brand">
          <bdi className="code">{card.risk.code}</bdi>
        </AppLink>{" "}
        · <bdi dir="rtl">{faText(card.note)}</bdi>
      </p>
      <div
        className="h-1 overflow-hidden rounded-full bg-subtle"
        role="meter"
        aria-label={`زمان سپری‌شده از برنامه‌ی ${card.code}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={card.progress}
        aria-valuetext={`${fa(card.progress)}٪`}
      >
        <div className={cn("h-full rounded-full", style?.bar)} style={{ width: `${card.progress}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="min-w-0 truncate text-ink-2">{card.assignee?.name ?? "—"}</span>
        <span className={cn("inline-flex shrink-0 items-center gap-1 font-medium", FOOTER_TONE[card.footer.tone])}>
          <Icon name={card.footer.icon} size={12} />
          {card.footer.text}
        </span>
      </div>
    </li>
  );
}

function Column({ title, dot, head, cards }: { title: string; dot: string; head: string; cards: BoardCard[] }) {
  return (
    <section
      aria-label={`${title}، ${fa(cards.length)} اقدام`}
      className="flex w-[13rem] shrink-0 flex-col gap-2 lg:w-auto lg:min-w-0 lg:flex-1 lg:basis-0"
    >
      <h2 className={cn("flex h-9 items-center justify-between rounded-md px-3 text-sm font-semibold", head)}>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className={cn("size-2 rounded-full", dot)} />
          {title}
        </span>
        <span className="grid size-5 place-items-center rounded-full bg-panel text-xs text-ink tabular">
          {fa(cards.length)}
        </span>
      </h2>
      <ul className="flex flex-col gap-2">
        {cards.map((card) => (
          <ActionCard key={card.id} card={card} />
        ))}
      </ul>
    </section>
  );
}

function Board({ cards, columns, group }: { cards: BoardCard[]; columns: PageData["columns"]; group: string }) {
  const lanes =
    group === "risk"
      ? [...new Map(cards.map((card) => [card.risk.code, card.risk])).values()].map((risk) => ({
          key: risk.code,
          title: risk.code,
          dot: "bg-brand",
          head: "bg-subtle text-ink",
          cards: cards.filter((card) => card.risk.code === risk.code),
        }))
      : columns.map((column) => ({
          key: column.value,
          title: column.label,
          dot: STATUS_STYLE[column.value]?.dot ?? "bg-ink-3",
          head: STATUS_STYLE[column.value]?.head ?? "bg-subtle text-ink",
          cards: cards.filter((card) => card.status.value === column.value),
        }));
  return (
    <div
      className="relative overflow-x-auto pb-1 [contain:inline-size]"
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد
      tabIndex={0}
      aria-label="تابلوی اقدام‌ها، پیمایش افقی"
    >
      <div className="flex items-start gap-3">
        {lanes.map((lane) => (
          <Column key={lane.key} title={lane.title} dot={lane.dot} head={lane.head} cards={lane.cards} />
        ))}
      </div>
    </div>
  );
}

function BoardTable({ cards }: { cards: BoardCard[] }) {
  return (
    <div className="table-shell overflow-hidden rounded-lg border border-line bg-panel">
      <table className="data-table">
        <caption className="sr-only">اقدام‌های طرح‌های مواجهه</caption>
        <thead>
          <tr>
            <th scope="col">کد</th>
            <th scope="col">اقدام</th>
            <th scope="col">ریسک</th>
            <th scope="col">وضعیت</th>
            <th scope="col">مجری</th>
            <th scope="col">موعد</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <tr key={card.id}>
              <td data-label="کد" className="w-0">
                <bdi className="code text-xs whitespace-nowrap text-ink-2">{card.code}</bdi>
              </td>
              <td data-primary>
                <AppLink href={card.href} className="font-medium text-ink hover:text-brand">
                  {card.title}
                </AppLink>
                <span className="block text-xs text-ink-3">{faText(card.note)}</span>
              </td>
              <td data-label="ریسک">
                <span className="inline-flex items-center gap-2">
                  <bdi className="code text-xs text-ink-2">{card.risk.code}</bdi>
                  <LevelBadge level={card.level} />
                </span>
              </td>
              <td data-label="وضعیت">
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span aria-hidden className={cn("size-2 rounded-full", STATUS_STYLE[card.status.value]?.dot)} />
                  {card.status.label}
                </span>
              </td>
              <td data-label="مجری" className="text-sm text-ink-2">
                {card.assignee?.name ?? "—"}
              </td>
              <td data-label="موعد">
                <span
                  className={cn("inline-flex items-center gap-1 text-xs font-medium", FOOTER_TONE[card.footer.tone])}
                >
                  <Icon name={card.footer.icon} size={12} />
                  {card.footer.text}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reviews({ data }: { data: PageData }) {
  return (
    <SectionPanel
      title="بازسنجی‌های پیش رو"
      description="پس از اقدام، ارزیابی جاری جدید با شواهد واقعی ثبت می‌شود · اعلان ۷ روز پیش از موعد"
      aside={
        <Button variant="ghost" size="sm" asChild>
          <AppLink href="/actions/notices/" className="no-underline hover:no-underline">
            <Icon name="calendar" />
            تقویم بازبینی
          </AppLink>
        </Button>
      }
      bodyClassName="p-0"
    >
      {data.reviews.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">بازسنجی‌های پیش رو به ترتیب موعد</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">سناریو و طرح</th>
                <th scope="col">جاری ← هدف</th>
                <th scope="col">موعد</th>
                <th scope="col">مسئول</th>
                <th scope="col">اعلان</th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((row) => (
                <tr key={row.key}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-xs whitespace-nowrap text-ink-2">{row.risk.code}</bdi>
                  </td>
                  <td data-primary className="min-w-52">
                    <AppLink href={row.href} className="font-medium text-ink hover:text-brand">
                      {row.risk.title}
                    </AppLink>
                    <span className="block text-xs text-ink-3">{faText(row.note)}</span>
                  </td>
                  <td data-label="جاری ← هدف">
                    <span className="inline-flex items-center gap-1.5 tabular" dir="rtl">
                      <ScoreBox value={row.current} />
                      <Icon name="arrow-left" size={12} className="text-ink-3" />
                      <ScoreBox value={row.target} target />
                    </span>
                  </td>
                  <td data-label="موعد" className="text-sm whitespace-nowrap text-ink-2 tabular">
                    {faText(row.due.jalali)}
                  </td>
                  <td data-label="مسئول" className="text-sm text-ink-2">
                    {row.responsible?.name ?? "—"}
                  </td>
                  <td data-label="اعلان">
                    <Chip
                      tone={
                        (row.notice.tone === "danger"
                          ? "danger"
                          : row.notice.tone === "success"
                            ? "success"
                            : "neutral") as ChipTone
                      }
                    >
                      <Icon name={row.notice.tone === "danger" ? "warning" : "bell"} size={12} />
                      {row.notice.text}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">بازسنجی‌ای در ۳۰ روز آینده نیست.</p>
      )}
    </SectionPanel>
  );
}

function ScoreBox({ value, target = false }: { value: number | null; target?: boolean }) {
  if (value === null) return <span className="text-ink-3">—</span>;
  const key = value >= 16 ? "critical" : value >= 10 ? "high" : value >= 5 ? "medium" : "low";
  const tone = RISK_CLASSES[key];
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-7 items-center justify-center rounded-md border px-1 text-xs font-bold",
        tone.bg,
        tone.fg,
        tone.border,
      )}
    >
      <span className="sr-only">{target ? "هدف " : "جاری "}</span>
      {fa(value)}
    </span>
  );
}

function Lifecycle() {
  const pill = "flex h-8 items-center justify-center rounded-full px-3 text-sm font-medium";
  const arrow = <Icon name="arrow-down" size={14} className="mx-auto text-ink-3" />;
  return (
    <SectionPanel
      title="چرخه‌ی وضعیت طرح"
      description="گذار مجاز بین وضعیت‌ها در گردش کار"
      bodyClassName="flex flex-col gap-2"
    >
      <ol className="flex flex-col gap-2" aria-label="ترتیب وضعیت‌های اقدام">
        <li className={cn(pill, "bg-subtle text-ink")}>برنامه‌ریزی</li>
        {arrow}
        <li className={cn(pill, "bg-info-subtle text-info")}>مصوب</li>
        {arrow}
        <li className="flex items-center gap-2">
          <span className={cn(pill, "flex-1 bg-brand-subtle text-brand")}>در اجرا</span>
          <Icon name="arrow-left" size={14} className="text-ink-3" aria-label="برگشت‌پذیر با" />
          <span className={cn(pill, "bg-danger-subtle text-danger")}>مسدود</span>
        </li>
        {arrow}
        <li className={cn(pill, "bg-warning-subtle text-warning")}>آماده‌ی آزمون</li>
        {arrow}
        <li className="grid grid-cols-2 gap-2">
          <span className={cn(pill, "bg-success-subtle text-success")}>تأییدشده</span>
          <span className={cn(pill, "bg-danger-subtle text-danger")}>ناموفق</span>
        </li>
      </ol>
      <p className="text-xs leading-5 text-ink-3">
        ناموفق به «در اجرا» بازمی‌گردد · کنترل تازه تا شاهد E3 ممکن است فقط E2 بگیرد و ریسک هدف هنوز محقق نشده باشد.
      </p>
    </SectionPanel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

export function TreatmentBoardPage() {
  useTitle("ریسک‌های در حال درمان");
  const [tab, setTab] = useState<Tab>("all");
  const [view, setView] = useState<"board" | "table">("board");
  const [group, setGroup] = useState("status");
  const [assignee, setAssignee] = useState<number | null>(null);
  const [alertsOnly, setAlertsOnly] = useState(false);
  const query = useQuery({
    queryKey: ["treatment", "board"],
    queryFn: ({ signal }) => get<PageData>("treatment/board/", signal),
  });
  const data = query.data;
  const assignees = [
    ...new Map(
      (data?.cards ?? []).flatMap((card) => (card.assignee ? [[card.assignee.id, card.assignee] as const] : [])),
    ).values(),
  ];
  const cards = data
    ? data.cards.filter(
        (card) =>
          inTab(card, tab, data.me) &&
          (assignee === null || card.assignee?.id === assignee) &&
          (!alertsOnly || card.alert || card.overdue),
      )
    : [];

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="ریسک‌های در حال درمان"
        breadcrumb={[{ label: "برطرف‌سازی ریسک" }, { label: "ریسک‌های در حال درمان" }]}
        description="پیگیری طرح‌های مواجهه از برنامه‌ریزی تا تأیید نتیجه · اقدام پس از تأیید خروجی بسته می‌شود و ریسک با ارزیابی جاری جدید به پایش فعال می‌رود"
        actions={
          data && (
            <>
              <Button
                variant="outline"
                onClick={() => setView(view === "board" ? "table" : "board")}
                aria-pressed={view === "table"}
              >
                <Icon name={view === "board" ? "list" : "grid"} />
                {view === "board" ? "نمای جدول" : "نمای تابلو"}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={!data.creatable.length}>
                    <Icon name="plus" />
                    طرح مواجهه‌ی جدید
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {data.creatable.map((item) => (
                    <DropdownMenuItem key={item.code} asChild>
                      <AppLink href={item.href ?? "#"} className="text-ink no-underline hover:no-underline">
                        <bdi className="code text-xs text-ink-3">{item.code}</bdi> {item.title}
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              label="طرح‌های فعال"
              icon="clipboard"
              value={fa(data.counts.active)}
              note="برنامه‌ریزی تا آماده‌ی آزمون"
            />
            <StatTile
              label="مسدود"
              icon="lock"
              tone="danger"
              valueTone="danger"
              value={fa(data.counts.blocked)}
              note={data.blocked_note ? faText(data.blocked_note) : "اقدامی مسدود نیست"}
            />
            <StatTile
              label="آماده‌ی آزمون"
              icon="check-square"
              tone="warning"
              valueTone="warning"
              value={fa(data.counts.ready)}
              note="نیازمند تأییدکننده‌ی مستقل"
            />
            <StatTile
              label="تأییدشده این فصل"
              icon="check-circle"
              tone="success"
              value={fa(data.counts.verified)}
              note="خروجی با شاهد آزمون تأیید شد"
            />
            <StatTile
              label="بازسنجی ۷ روز آینده"
              icon="calendar"
              tone="neutral"
              value={fa(data.counts.reviews)}
              note="اعلان برای مالکان ۷ روز پیش از موعد"
              className="col-span-2 md:col-span-1"
            />
          </div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel ps-1 pe-4">
              <TabsList className="border-b-0" aria-label="دسته‌ی اقدام‌ها">
                {TABS.map((item) => (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    count={fa(data.cards.filter((card) => inTab(card, item.value, data.me)).length)}
                  >
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="flex flex-wrap items-center gap-2 py-2">
                {view === "board" && (
                  <Select
                    aria-label="گروه‌بندی"
                    value={group}
                    onChange={(event) => setGroup(event.target.value)}
                    className="h-8 w-44 text-sm"
                  >
                    <option value="status">گروه‌بندی: وضعیت</option>
                    <option value="risk">گروه‌بندی: ریسک</option>
                  </Select>
                )}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <Icon name="user" />
                      {assignees.find((item) => item.id === assignee)?.name ?? "مالک"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="flex w-60 flex-col gap-2 p-3">
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1 text-xs font-medium text-ink-3">مجری اقدام</legend>
                      <Radio
                        name="assignee"
                        checked={assignee === null}
                        onChange={() => setAssignee(null)}
                        label="همه"
                      />
                      {assignees.map((item) => (
                        <Radio
                          key={item.id}
                          name="assignee"
                          checked={assignee === item.id}
                          onChange={() => setAssignee(item.id)}
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
                      {alertsOnly && <Chip tone="brand">{fa(1)}</Chip>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-60 p-3">
                    <Checkbox
                      checked={alertsOnly}
                      onChange={(event) => setAlertsOnly(event.target.checked)}
                      label="فقط معوق، مسدود یا ناموفق"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <TabsContent value={tab} className="pt-4">
              {cards.length === 0 ? (
                <p className="rounded-lg border border-line bg-panel px-5 py-6 text-sm text-ink-3">
                  {data.cards.length ? "اقدامی با این فیلتر نیست." : "هنوز طرح مواجهه‌ای در اجرا نیست."}
                </p>
              ) : view === "board" ? (
                <Board cards={cards} columns={data.columns} group={group} />
              ) : (
                <BoardTable cards={cards} />
              )}
            </TabsContent>
          </Tabs>
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Reviews data={data} />
            <Lifecycle />
          </div>
        </>
      )}
    </div>
  );
}
