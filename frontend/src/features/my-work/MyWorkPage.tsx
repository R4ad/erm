import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCheck,
  ClipboardCheck,
  ClipboardList,
  ClipboardPen,
  GitMerge,
  Inbox,
  ListChecks,
  ListTodo,
  MessageCircleQuestionMark,
  Send,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ClassicLink } from "@/components/ui/classic-link";
import { Deadline } from "@/components/ui/deadline";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Section } from "@/features/records/dossier";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { faText, formatNumber, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { MyWork, WorkItem, WorkSection } from "@/lib/types";

const SECTION_ICONS: Record<string, LucideIcon> = {
  my_actions: ListTodo,
  to_verify: CheckCheck,
  plans_to_approve: ClipboardCheck,
  acceptances_to_sign: Stamp,
  questions: MessageCircleQuestionMark,
  change_requests: GitMerge,
  waiting_risks: ShieldAlert,
  ready_for_review: ClipboardList,
  expiring_acceptances: CalendarClock,
  qc: ShieldCheck,
  referrals: Send,
};

/** شمارهای بالای صفحه، همه از همان فهرست کارها: هیچ عددی جدا از سرور ساخته یا حدس زده نمی‌شود. */
function tally(sections: WorkSection[]) {
  const items = sections.flatMap((section) => section.items);
  const overdue = items.filter((item) => item.due?.overdue).length;
  const soon = items.filter((item) => item.due && !item.due.overdue && item.due.days_left <= 7).length;
  return { total: items.length, overdue, soon };
}

function ItemLabel({ item }: { item: WorkItem }) {
  const label = faText(item.label);
  if (item.route) {
    return (
      <Link to={item.route} viewTransition className="font-medium text-fg transition-colors hover:text-accent-text">
        {label}
      </Link>
    );
  }
  return (
    <ClassicLink href={item.href} className="font-medium text-fg no-underline hover:text-accent-text">
      {label}
    </ClassicLink>
  );
}

function Row({ item }: { item: WorkItem }) {
  return (
    <li className="grid gap-x-6 gap-y-2.5 px-5 py-4 transition-colors hover:bg-surface/50 sm:grid-cols-[minmax(0,1fr)_auto_10rem] sm:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <ItemLabel item={item} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {item.risk && (
            <span className="flex min-w-0 items-center gap-1.5">
              <Link to={`/risks/${item.risk.id}`} viewTransition className="code text-accent-text hover:underline">
                {item.risk.code}
              </Link>
              <span className="truncate">{item.risk.title}</span>
            </span>
          )}
          {item.status && <span>{item.status}</span>}
          {item.meta && <span>{faText(item.meta)}</span>}
        </div>
      </div>
      <div className={cn(!item.level && "max-sm:hidden")}>{item.level && <LevelBadge level={item.level} />}</div>
      <div className="sm:justify-self-end">
        <Deadline value={item.due} />
      </div>
    </li>
  );
}

function WorkSectionCard({ section }: { section: WorkSection }) {
  const Icon = SECTION_ICONS[section.key] ?? ListChecks;
  return (
    <Section
      id={`section-${section.key}`}
      title={section.title}
      icon={<Icon />}
      count={section.items.length}
      description={section.hint || undefined}
    >
      <ul className="divide-y divide-line">
        {section.items.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </ul>
    </Section>
  );
}

export function MyWorkPage() {
  useTitle("کارهای من");
  const work = useQuery({ queryKey: ["my-work"], queryFn: ({ signal }) => get<MyWork>("my-work/", signal) });

  if (work.isPending) return <PageSkeleton />;
  if (work.isError) return <ErrorState error={work.error} retry={() => work.refetch()} />;

  const { sections, today } = work.data;
  const numbers = tally(sections);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="کارهای من"
        description={
          sections.length
            ? "کارهایی که منتظر شماست، به ترتیب همان صفحه‌ی فعلی؛ مهلت گذشته قرمز است."
            : "اقدام، تأیید، امضا یا پرسشی که به شما مربوط باشد این‌جا می‌آید."
        }
        meta={
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
            <CalendarClock aria-hidden className="size-3.5" />
            <time dateTime={today.iso}>
              {today.weekday} {longDate(today)}
            </time>
          </span>
        }
      />

      {sections.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title="امروز کاری منتظر شما نیست"
          description="تا آن موقع می‌توانید رجیستر را ببینید یا به پرسشنامه‌ها جواب دهید."
          action={
            <>
              <Button asChild variant="primary">
                <Link to="/risks" viewTransition>
                  <ShieldAlert aria-hidden />
                  رجیستر ریسک
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/questionnaires" viewTransition>
                  <ClipboardPen aria-hidden />
                  پاسخ به سؤال‌ها
                </Link>
              </Button>
            </>
          }
        />
      ) : (
        <>
          <section aria-label="خلاصه" className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="کارهای باز"
              value={formatNumber(numbers.total)}
              hint={`در ${formatNumber(sections.length)} بخش`}
              icon={ListChecks}
            />
            <StatTile
              label="مهلت گذشته"
              value={formatNumber(numbers.overdue)}
              hint={numbers.overdue ? "اول سراغ این‌ها بروید." : "هیچ کاری از مهلتش عقب نیست."}
              icon={TriangleAlert}
              tone={numbers.overdue ? "danger" : "neutral"}
            />
            <StatTile
              label="مهلت تا ۷ روز دیگر"
              value={formatNumber(numbers.soon)}
              hint="کارهایی که مهلتشان این هفته تمام می‌شود."
              icon={CalendarClock}
              tone={numbers.soon ? "warning" : "neutral"}
            />
          </section>
          <div className="flex flex-col gap-5">
            {sections.map((section) => (
              <WorkSectionCard key={section.key} section={section} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
