import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardFooter, CardHeader } from "@/components/ui/card";
import { ClassicLink } from "@/components/ui/classic-link";
import { DueLabel } from "@/components/ui/deadline";
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
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { get } from "@/lib/api";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { MyWork, WorkAcceptanceRow, WorkCategory, WorkPlanRow, WorkTask } from "@/lib/types";

/** فیگما هشت کار نخست صف را نشان می‌دهد و «همه‌ی کارها» بقیه را باز می‌کند. */
const FIRST_PAGE = 8;

type Filter = "all" | "high" | "due";

const FILTERS: Record<Filter, { label: string; test: (task: WorkTask) => boolean }> = {
  all: { label: "همه‌ی کارها", test: () => true },
  high: { label: "سطح بالا و بحرانی", test: (task) => (task.level?.rank ?? 0) >= 3 },
  due: { label: "عقب‌افتاده و سررسید امروز", test: (task) => !!task.due && task.due.days_left <= 0 },
};

/** گروه‌های «نمای تقویم»: همان صف، به ترتیب روز سررسید. */
const AGENDA = [
  { key: "overdue", label: "عقب‌افتاده", test: (days: number | null) => days !== null && days < 0 },
  { key: "today", label: "امروز", test: (days: number | null) => days === 0 },
  { key: "week", label: "تا هفت روز دیگر", test: (days: number | null) => days !== null && days > 0 && days <= 7 },
  { key: "later", label: "بعدتر", test: (days: number | null) => days !== null && days > 7 },
  { key: "none", label: "بدون مهلت", test: (days: number | null) => days === null },
];

/** پیوند به صفحه‌ی همان کار: اگر صفحه در رابط React هست با مسیریاب، وگرنه صفحه‌ی جنگو. */
function GoTo({
  route,
  href,
  className,
  button,
  children,
}: {
  route: string | null;
  href?: string;
  className?: string;
  button?: { variant: "primary" | "secondary" | "ghost"; size: "sm" | "md" };
  children: ReactNode;
}) {
  if (route) {
    return (
      <Link to={route} viewTransition className={button ? buttonClasses({ ...button, className }) : className}>
        {children}
      </Link>
    );
  }
  if (href) {
    return (
      <ClassicLink href={href} button={button} className={className}>
        {children}
      </ClassicLink>
    );
  }
  return <span className={className}>{children}</span>;
}

function TaskRow({ task }: { task: WorkTask }) {
  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-3 transition-colors last:border-b-0 hover:bg-subtle/60">
      <IconChip icon={task.icon as IconName} tone={task.tone} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <GoTo
          route={task.route}
          href={task.href}
          className="truncate text-base font-medium text-ink no-underline hover:text-brand"
        >
          {faText(task.title)}
        </GoTo>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
          <span className="code shrink-0 text-ink-2">{task.code}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{task.kind}</span>
          {task.context && (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{faText(task.context)}</span>
            </>
          )}
        </p>
      </div>
      <div className="hidden w-24 shrink-0 md:flex">{task.rated !== false && <LevelBadge level={task.level} />}</div>
      <div className="hidden w-[6.875rem] shrink-0 sm:flex">
        <DueLabel value={task.due} text={task.due_text} emptyText={task.no_due} />
      </div>
      <div className="flex w-28 shrink-0 justify-end">
        <GoTo route={task.route} href={task.href} button={{ variant: task.cta_style, size: "sm" }}>
          {task.cta}
        </GoTo>
      </div>
    </li>
  );
}

function TaskList({ tasks }: { tasks: WorkTask[] }) {
  return (
    <ul>
      {tasks.map((task) => (
        <TaskRow key={task.key} task={task} />
      ))}
    </ul>
  );
}

function Agenda({ tasks }: { tasks: WorkTask[] }) {
  return (
    <div>
      {AGENDA.map((group) => {
        const rows = tasks.filter((task) => group.test(task.due ? task.due.days_left : null));
        if (!rows.length) return null;
        return (
          <section key={group.key} aria-label={group.label}>
            <h3 className="flex items-center justify-between border-b border-line bg-subtle px-4 py-2 text-xs font-semibold text-ink-2">
              {group.label}
              <span className="font-medium text-ink-3">{fa(rows.length)} کار</span>
            </h3>
            <TaskList tasks={rows} />
          </section>
        );
      })}
    </div>
  );
}

function TaskQueue({ work, agenda }: { work: MyWork; agenda: boolean }) {
  const [tab, setTab] = useState<"all" | WorkCategory>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [showAll, setShowAll] = useState(false);

  const filtered = work.tasks.filter(FILTERS[filter].test);
  const inTab = tab === "all" ? filtered : filtered.filter((task) => task.category === tab);
  const visible = showAll || agenda ? inTab : inTab.slice(0, FIRST_PAGE);
  const tabs = [
    { key: "all" as const, label: "همه", count: filtered.length },
    ...work.categories.map((category) => ({
      ...category,
      count: filtered.filter((task) => task.category === category.key).length,
    })),
  ];

  return (
    <Card role="region" aria-labelledby="task-queue" className="overflow-clip">
      <CardHeader
        titleId="task-queue"
        title="صف کارها"
        description="مرتب‌شده بر اساس فوریت و سطح ریسک"
        actions={
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`فیلتر: ${FILTERS[filter].label}`}>
                <Icon name="funnel" />
                فیلتر
                {filter !== "all" && <span aria-hidden className="size-1.5 rounded-full bg-brand" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>نمایش</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as Filter)}>
                {(Object.keys(FILTERS) as Filter[]).map((key) => (
                  <DropdownMenuRadioItem key={key} value={key}>
                    {FILTERS[key].label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <Tabs dir="rtl" value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
        <TabsList aria-label="دسته‌ی کارها">
          {tabs.map((item) => (
            <TabsTrigger key={item.key} value={item.key} count={fa(item.count)}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {/* یک فهرست برای همه‌ی زبانه‌ها؛ Radix فقط محتوای زبانه‌ی باز را می‌سازد. */}
        {tabs.map((item) => (
          <TabsContent key={item.key} value={item.key} className="pt-0">
            {visible.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <IconChip icon="check-circle" tone="success" size="lg" />
                <p className="text-sm font-medium text-ink">کاری در این بخش منتظر شما نیست</p>
                <p className="text-xs text-ink-3">
                  {filter === "all"
                    ? "کار تازه که برسد همین‌جا می‌آید."
                    : "فیلتر را بردارید تا بقیه‌ی کارها را ببینید."}
                </p>
              </div>
            ) : agenda ? (
              <Agenda tasks={visible} />
            ) : (
              <TaskList tasks={visible} />
            )}
          </TabsContent>
        ))}
      </Tabs>
      <CardFooter className="py-3">
        <span>
          نمایش {fa(visible.length)} از {fa(inTab.length)} کار
        </span>
        {!agenda && inTab.length > FIRST_PAGE && (
          <Button variant="ghost" size="sm" onClick={() => setShowAll((value) => !value)} aria-expanded={showAll}>
            {showAll ? "کارهای فوری" : "همه‌ی کارها"}
            <Icon name={showAll ? "arrow-up" : "arrow-left"} />
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

function PlanRow({ row }: { row: WorkPlanRow }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <GoTo
        route={row.route}
        className="flex flex-col gap-2 px-4 py-3 text-inherit no-underline transition-colors hover:bg-subtle/60"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="code text-xs text-ink-2">{row.code}</span>
          <LevelBadge level={row.level} />
        </span>
        <span className="text-base font-semibold text-ink">{faText(row.title)}</span>
        <span className="flex items-center justify-between gap-3">
          <Badge tone={row.tone}>{row.state}</Badge>
          {row.note && <span className="text-xs text-ink-3">{row.note}</span>}
        </span>
      </GoTo>
    </li>
  );
}

function AcceptanceRow({ row }: { row: WorkAcceptanceRow }) {
  return (
    <li className="border-b border-line last:border-b-0">
      <GoTo
        route={row.route}
        className="flex items-center justify-between gap-3 px-4 py-3 text-inherit no-underline transition-colors hover:bg-subtle/60"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="code self-start text-[0.8125rem] font-semibold text-ink">{row.code}</span>
          <span className="truncate text-xs text-ink-3">
            {row.owner && <>مالک: {row.owner} · </>}
            <span className="code">{row.risk_code}</span>
          </span>
        </span>
        <Badge tone={row.tone}>{row.label}</Badge>
      </GoTo>
    </li>
  );
}

function SideCard({
  id,
  title,
  description,
  empty,
  children,
}: {
  id: string;
  title: string;
  description: string;
  empty: string | null;
  children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id} className="overflow-clip">
      <CardHeader titleId={id} title={title} description={description} className="border-b border-line pb-3" />
      {empty ? <p className="px-4 py-8 text-center text-sm text-ink-3">{empty}</p> : <ul>{children}</ul>}
    </Card>
  );
}

export function MyWorkPage() {
  useTitle("کارهای من");
  const [agenda, setAgenda] = useState(false);
  const work = useQuery({ queryKey: ["my-work"], queryFn: ({ signal }) => get<MyWork>("my-work/", signal) });

  if (work.isPending) return <PageSkeleton />;
  if (work.isError) return <ErrorState error={work.error} retry={() => work.refetch()} />;

  const data = work.data;
  const { kpis } = data;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="کارهای من"
        description={
          data.tasks.length
            ? `سلام ${data.first_name}؛ ${fa(kpis.waiting.count)} کار منتظر اقدام شماست و ${fa(kpis.due_today.count)} مورد امروز سررسید دارد.`
            : `سلام ${data.first_name}؛ امروز کاری منتظر شما نیست.`
        }
        actions={
          <>
            <Button variant="secondary" aria-pressed={agenda} onClick={() => setAgenda((value) => !value)}>
              <Icon name={agenda ? "list" : "calendar"} />
              {agenda ? "نمای فهرست" : "نمای تقویم"}
            </Button>
            <Button asChild variant="primary">
              <Link to="/risks/new" viewTransition>
                <Icon name="plus" />
                ثبت ریسک
              </Link>
            </Button>
          </>
        }
      />

      {/* ترتیب کاشی‌ها همان ترتیب دیداری فیگماست، از راست به چپ. */}
      <section aria-label="خلاصه‌ی کارها" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="منتظر تأیید نتیجه‌ی من"
          value={fa(kpis.to_verify.count)}
          note={kpis.to_verify.note}
          icon="check-circle"
          tone="success"
        />
        <StatTile
          label="عقب‌افتاده"
          value={fa(kpis.overdue.count)}
          note={kpis.overdue.note}
          icon="warning"
          tone="danger"
          valueTone={kpis.overdue.count ? "danger" : "ink"}
        />
        <StatTile
          label="سررسید امروز"
          value={fa(kpis.due_today.count)}
          note={kpis.due_today.note}
          icon="clock"
          tone="warning"
          valueTone={kpis.due_today.count ? "warning" : "ink"}
        />
        <StatTile
          label="منتظر اقدام من"
          value={fa(kpis.waiting.count)}
          note={kpis.waiting.note}
          icon="tray"
          tone="brand"
        />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <TaskQueue work={data} agenda={agenda} />
        <div className="flex flex-col gap-5">
          <SideCard
            id="plans-card"
            title="برنامه‌ی درمان — حال طرح‌ها"
            description="ریسک‌های «برنامه‌ی درمان» به ترتیب سطح و مهلت"
            empty={data.plans.length ? null : "ریسکی منتظر طرح یا شروع اجرا نیست."}
          >
            {data.plans.map((row) => (
              <PlanRow key={row.key} row={row} />
            ))}
          </SideCard>
          <SideCard
            id="acceptances-card"
            title="پذیرش‌های رو به انقضا"
            description="تمدید خودکار نداریم؛ ادامه یعنی پذیرش تازه"
            empty={data.acceptances.length ? null : "پذیرشی تا ۳۰ روز دیگر منقضی نمی‌شود."}
          >
            {data.acceptances.map((row) => (
              <AcceptanceRow key={row.key} row={row} />
            ))}
          </SideCard>
        </div>
      </div>
    </div>
  );
}
