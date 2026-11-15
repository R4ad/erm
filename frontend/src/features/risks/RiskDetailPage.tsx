import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardRow } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { IconChip } from "@/components/ui/icon-chip";
import { LevelBadge, RISK_CLASSES, riskKey, ScoreChip } from "@/components/ui/level-badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MenuLink, MetaItem } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { useGoTo } from "@/features/session/links";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { dateTime, fa, faText, longDate, safeExternalUrl, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type {
  LatestResult,
  RelatedRisk,
  RiskBanner,
  RiskControl,
  RiskDetail,
  RiskStep,
  TimelineEntry,
  Transition,
} from "@/lib/types";

import { STATUS_TONES } from "./status";

// زبانه‌های پرونده به ترتیب فیگما ۰۴.
const TABS = [
  "overview",
  "assessments",
  "treatment",
  "controls",
  "evidence",
  "questions",
  "timeline",
  "files",
] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  overview: "خلاصه",
  assessments: "ارزیابی‌ها",
  treatment: "طرح مواجهه",
  controls: "کنترل‌ها",
  evidence: "شواهد",
  questions: "پرسش‌ها",
  timeline: "خط زمانی",
  files: "پیوست و نظر",
};

/** شمار ردیف‌های خلاصه پیش از «همه»؛ فیگما چهار شاهد نشان می‌دهد. */
const SUMMARY_EVIDENCE = 4;

// ─────────────────────────────── سرپرونده ───────────────────────────────

function Related({ risk }: { risk: RelatedRisk }) {
  return risk.href ? (
    <AppLink href={risk.href}>
      <bdi className="code">{risk.code}</bdi>
    </AppLink>
  ) : (
    <bdi className="code">{risk.code}</bdi>
  );
}

/** یک کار در منوها: در همین رابط اگر صفحه‌اش هست، وگرنه صفحه‌ی جنگو با نشانه‌اش. */
const TRANSITION_ICONS: Record<string, IconName> = {
  send_to_assessment: "flow",
  back_to_register: "list",
  ask_questions: "question",
  reject: "x-circle",
  approve: "check-circle",
  start_treatment: "check-square",
  start_review: "eye",
  reassess: "gauge",
  close: "lock",
};

/** دکمه‌های سرپرونده‌ی فیگما: کار اصلی پررنگ، انتقال‌های دیگر با حاشیه، پیشنهاد ادغام یا تفکیک کم‌رنگ، و زیرشان
 * دلیل انتقالی که هنوز فعال نیست. */
function HeaderActions({ risk }: { risk: RiskDetail }) {
  const { transitions, pending_change: pending } = risk.workflow;
  const open = transitions.filter((transition) => !transition.problems?.length);
  const blocked = transitions.filter((transition) => transition.problems?.length);
  const plan = risk.treatment.current_plan;

  let primary: { href: string; label: string; icon: IconName } | null = null;
  const [first, ...others] = open;
  let rest: Transition[] = open;
  if (first) {
    primary = { href: first.href, label: first.label, icon: TRANSITION_ICONS[first.name] ?? "flow" };
    rest = others;
  } else if (plan) {
    primary = { href: plan.href, label: "مشاهده‌ی طرح مواجهه", icon: "clipboard" };
  } else if (risk.actions.add_plan) {
    primary = { href: risk.actions.add_plan, label: "نوشتن طرح مواجهه", icon: "clipboard" };
  } else if (risk.actions.add_assessment) {
    primary = { href: risk.actions.add_assessment, label: "ارزیابی تازه", icon: "gauge" };
  }

  const change = [
    { href: risk.actions.propose_merge, label: "پیشنهاد ادغام", icon: "merge" as const },
    { href: risk.actions.propose_split, label: "پیشنهاد تفکیک", icon: "flow" as const },
  ].filter((item): item is { href: string; label: string; icon: "merge" | "flow" } => Boolean(item.href));
  const more = [
    { href: risk.actions.edit, label: "ویرایش ریسک", icon: "pencil" as IconName },
    { href: risk.actions.add_link, label: "افزودن پیوند بیرونی", icon: "link" as IconName },
    { href: risk.actions.add_assessment, label: "ارزیابی تازه", icon: "gauge" as IconName },
    { href: plan ? null : risk.actions.add_plan, label: "طرح مواجهه‌ی تازه", icon: "clipboard" as IconName },
    { href: risk.actions.add_review ?? null, label: "ثبت محرک بازبینی", icon: "calendar" as IconName },
  ].filter((item): item is { href: string; label: string; icon: IconName } => Boolean(item.href));

  return (
    <div className="flex flex-col gap-1.5 lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:flex-row-reverse lg:justify-start">
        {primary && (
          <AppLink href={primary.href} button={{ variant: "primary" }}>
            <Icon name={primary.icon} size={18} />
            {primary.label}
          </AppLink>
        )}
        {rest.map((transition) => (
          <AppLink
            key={transition.name}
            href={transition.href}
            title={transition.description || undefined}
            button={{ variant: "outline" }}
          >
            <Icon name={TRANSITION_ICONS[transition.name] ?? "flow"} size={18} />
            {transition.label}
          </AppLink>
        ))}
        {change.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost">
                <Icon name="merge" size={18} />
                پیشنهاد ادغام یا تفکیک
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {change.map((item) => (
                <MenuLink key={item.label} {...item} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="کارهای دیگر پرونده">
              <Icon name="dots" size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map((item) => (
              <MenuLink key={item.label} {...item} />
            ))}
            {more.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild>
              <a href={risk.actions.classic}>
                <Icon name="arrow-left" size={16} />
                پرونده در صفحه‌های فعلی
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {blocked.map((transition) => (
        <p key={transition.name} className="flex items-start gap-1 text-xs text-ink-3">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span>
            «{transition.label}» هنوز فعال نیست: {transition.problems?.join(" ")}
          </span>
        </p>
      ))}
      {!risk.is_active && <p className="text-xs text-ink-3">این ریسک فقط سابقه است و ویرایش نمی‌شود.</p>}
      {pending && (
        <p className="text-xs text-warning">
          پیشنهاد {pending.label}
          {pending.merge_into && (
            <>
              {" "}
              در <bdi className="code">{pending.merge_into}</bdi>
            </>
          )}{" "}
          منتظر تأیید مالک ریسک است.{" "}
          <AppLink href={pending.href}>{pending.can_decide ? "بررسی و تأیید یا رد" : "جزئیات"}</AppLink>
        </p>
      )}
    </div>
  );
}

function RecordHeader({ risk }: { risk: RiskDetail }) {
  const { merged_into, split_from } = risk.workflow;
  const score = risk.score ? risk.score[1] : null;
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <bdi className="code text-sm font-medium text-ink-2">{risk.code}</bdi>
          <Badge tone={STATUS_TONES[risk.status.value] ?? "neutral"}>{risk.status.label}</Badge>
          <LevelBadge level={risk.level} />
          {score !== null && <ScoreChip score={score} level={risk.level} label="امتیاز تصمیم" />}
          {risk.needs_completion && <Badge tone="warning">نیازمند تکمیل</Badge>}
        </div>
        <h1 className="text-h1 font-bold text-ink">{faText(risk.title)}</h1>
        <dl className="flex max-w-[36rem] flex-wrap gap-x-4 gap-y-1.5">
          <MetaItem icon="flow" label="واحد">
            {risk.org_unit}
          </MetaItem>
          <MetaItem icon="tag" label="دسته">
            <bdi>{risk.category.code}</bdi> {risk.category.name}
          </MetaItem>
          {risk.scenario && (
            <MetaItem icon="books" label="سناریو">
              <AppLink href={risk.scenario.href} className="text-ink">
                <bdi className="code">{risk.scenario.code}</bdi> · نسخه‌ی {fa(risk.scenario.version)}
              </AppLink>
              {risk.scenario.changed && <span className="ms-1 text-warning">(نسخه‌ی تازه‌تری دارد)</span>}
            </MetaItem>
          )}
          {risk.service && (
            <MetaItem icon="layers" label="خدمت">
              {risk.service.href ? (
                <AppLink href={risk.service.href} className="text-ink">
                  {risk.service.name}
                </AppLink>
              ) : (
                risk.service.name
              )}
            </MetaItem>
          )}
          {risk.customers.length > 0 && (
            <MetaItem icon="buildings" label="بانک‌ها">
              {risk.customers.map((name) => name.replace(/^بانک\s+/, "")).join("، ")}
            </MetaItem>
          )}
          <MetaItem icon="user" label="مالک">
            {risk.owner ? risk.owner.name : <span className="text-warning">بدون مالک</span>}
          </MetaItem>
        </dl>
        {(merged_into || split_from) && (
          <p className="text-xs text-ink-3">
            {merged_into && (
              <>
                در <Related risk={merged_into} /> ادغام شده است.
              </>
            )}
            {split_from && (
              <>
                {" "}
                از <Related risk={split_from} /> تفکیک شده است.
              </>
            )}
          </p>
        )}
      </div>
      <HeaderActions risk={risk} />
    </header>
  );
}

// ─────────────────────────────── مراحل و مهلت ───────────────────────────────

/** روی صفحه‌ی باریک نوار مراحل اسکرول می‌خورد؛ مرحله‌ی فعلی را بدون جابه‌جا کردن صفحه در دید می‌آورد. */
function showCurrent(card: HTMLDivElement | null) {
  const current = card?.querySelector<HTMLElement>('[aria-current="step"]');
  if (!card || !current || card.scrollWidth <= card.clientWidth) return;
  const cardBox = card.getBoundingClientRect();
  const box = current.getBoundingClientRect();
  card.scrollLeft += box.left + box.width / 2 - (cardBox.left + cardBox.width / 2);
}

function Stepper({ steps }: { steps: RiskStep[] }) {
  const reached = (step: RiskStep | undefined) => step !== undefined && step.state !== "todo";
  return (
    <Card ref={showCurrent} className="relative overflow-x-auto px-3 py-4">
      <ol aria-label="مراحل گردش کار" className="flex min-w-[42rem]">
        {steps.map((step, index) => {
          const prev = steps[index - 1];
          const next = steps[index + 1];
          return (
            <li
              key={step.status}
              className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
              aria-current={step.state === "current" ? "step" : undefined}
            >
              <span aria-hidden className="flex w-full items-center">
                <span
                  className={cn("h-0.5 flex-1", !prev ? "invisible" : reached(step) ? "bg-brand" : "bg-line-strong")}
                />
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full",
                    step.state === "done" && "bg-brand text-white",
                    step.state === "current" && "border-2 border-gold bg-gold-subtle",
                    step.state === "todo" && "border-[1.5px] border-line-strong bg-panel",
                    step.state === "skipped" && "border-[1.5px] border-dashed border-line-strong bg-subtle",
                  )}
                >
                  {step.state === "done" && <Icon name="check" size={14} />}
                  {step.state === "current" && <span className="size-2 rounded-full bg-gold" />}
                </span>
                <span
                  className={cn("h-0.5 flex-1", !next ? "invisible" : reached(next) ? "bg-brand" : "bg-line-strong")}
                />
              </span>
              <span
                className={cn(
                  "px-1",
                  step.state === "current" ? "text-sm font-semibold text-ink" : "text-xs font-medium",
                  step.state === "done" && "text-ink",
                  (step.state === "todo" || step.state === "skipped") && "text-ink-3",
                )}
              >
                {step.label}
                <span className="sr-only">
                  {
                    {
                      done: " (انجام‌شده)",
                      current: " (مرحله‌ی فعلی)",
                      todo: " (پیش رو)",
                      skipped: " (این ریسک از این مرحله نگذشت)",
                    }[step.state]
                  }
                </span>
              </span>
              {step.date && (
                <span className="text-xs text-ink-3">
                  {step.state === "current" && "از "}
                  <time dateTime={step.date.iso}>{shortDate(step.date)}</time>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function DeadlineBanner({ banner, active, onTab }: { banner: RiskBanner; active: boolean; onTab: (tab: Tab) => void }) {
  const danger = banner.tone === "danger";
  return (
    <section
      aria-label="مهلت"
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3",
        danger ? "border-danger bg-danger-subtle" : "border-warning bg-warning-subtle",
      )}
    >
      <Icon name="clock" size={20} className={cn("shrink-0", danger ? "text-danger" : "text-warning")} />
      <div className="flex min-w-[min(100%,16rem)] flex-1 flex-col gap-0.5">
        <p className={cn("text-sm font-semibold", danger ? "text-danger" : "text-warning")}>{banner.title}</p>
        <p className="text-xs text-ink-2">{banner.text}</p>
      </div>
      {active && (
        <p className="flex items-center gap-1 text-xs text-ink-3">
          <Icon name="x-circle" size={12} />
          مسیر پایانی دیگر: ردشده (با دلیل و تاریخ جلسه)
        </p>
      )}
      {banner.link && (
        <AppLink href={banner.link.href} button={{ variant: "ghost", size: "sm" }}>
          {banner.link.label}
          <Icon name="arrow-left" size={16} />
        </AppLink>
      )}
      {banner.tab && TABS.includes(banner.tab as Tab) && (
        <Button variant="ghost" size="sm" onClick={() => onTab(banner.tab as Tab)}>
          دیدن {TAB_LABELS[banner.tab as Tab]}
          <Icon name="arrow-left" size={16} />
        </Button>
      )}
    </section>
  );
}

// ─────────────────────────────── کارت‌های خلاصه ───────────────────────────────

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-subtle px-3 py-2.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-stat font-bold text-ink tabular">{value === null ? "نامعلوم" : fa(value)}</dd>
    </div>
  );
}

function LatestResultCard({ latest }: { latest: LatestResult | null }) {
  if (!latest) {
    return (
      <Card>
        <CardHeader as="h3" title="نتیجه‌ی آخرین ارزیابی جاری" />
        <CardContent>
          <p className="text-sm text-ink-3">هنوز ارزیابی جاری تأییدشده‌ای ندارد؛ سطح ریسک از آن می‌آید.</p>
        </CardContent>
      </Card>
    );
  }
  const tone = RISK_CLASSES[riskKey(latest.level)];
  const subtitle = [
    latest.code,
    latest.approved_at && `تأییدشده ${shortDate(latest.approved_at)}`,
    `نسخه‌ی روش ${fa(latest.method_version)}`,
    `افق ${fa(latest.horizon_months)} ماه`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card>
      <CardHeader
        as="h3"
        title="نتیجه‌ی آخرین ارزیابی جاری"
        description={<bdi>{subtitle}</bdi>}
        actions={
          <AppLink href={latest.href} button={{ variant: "ghost", size: "sm" }}>
            پرونده‌ی ارزیابی
            <Icon name="arrow-left" size={16} />
          </AppLink>
        }
      />
      <CardContent className="flex flex-col gap-3.5">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric label="آغازگر (A)" value={latest.a} />
          <Metric label="قابلیت تحقق (B)" value={latest.b} />
          <Metric label="احتمال (L)" value={latest.likelihood} />
          <Metric label="پیامد (I)" value={latest.impact} />
          <Metric label="امتیاز (L×I)" value={latest.score} />
          <div className={cn("flex flex-col gap-1 rounded-md border px-3 py-2.5", tone.bg, tone.border)}>
            <dt className={cn("text-xs", tone.fg)}>سطح تصمیم</dt>
            <dd className={cn("text-stat font-bold", tone.fg)}>{latest.level?.name ?? "ناقص"}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-1">
          {latest.explanation && <p className="text-sm leading-6 text-ink-2">{latest.explanation}</p>}
          <p className="text-xs text-ink-3">{latest.note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AssessmentsCard({
  risk,
  selectable = false,
  onCompare,
}: {
  risk: RiskDetail;
  selectable?: boolean;
  onCompare?: () => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const goTo = useGoTo();
  const comparable = risk.assessments.length > 1;
  const canCompare = picked.length >= 2 && picked.length <= 4;
  const header = (
    <CardHeader
      as={selectable ? "h2" : "h3"}
      title="ارزیابی‌ها"
      description="ارزیابی حذف نمی‌شود و روی ارزیابی قبلی نمی‌نویسد"
      className="pb-4"
      actions={
        comparable && !selectable && onCompare ? (
          <Button variant="outline" size="sm" onClick={onCompare}>
            <Icon name="layers" size={16} />
            مقایسه‌ی ارزیابی‌ها
          </Button>
        ) : risk.actions.add_assessment && selectable ? (
          <AppLink href={risk.actions.add_assessment} button={{ variant: "ghost", size: "sm" }}>
            <Icon name="plus" size={16} />
            ارزیابی تازه
          </AppLink>
        ) : undefined
      }
    />
  );
  if (!risk.assessments.length) {
    return (
      <Card>
        {header}
        <CardContent>
          <EmptyState as="h3" icon={<Icon name="gauge" size={20} />} title="هنوز ارزیابی‌ای ثبت نشده" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="overflow-clip">
      {header}
      <ul className="border-t border-line">
        {risk.assessments.map((assessment) => {
          const current = assessment.kind.value === "current";
          return (
            <li key={assessment.id}>
              <CardRow className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {selectable && comparable && (
                  <Checkbox
                    label={<span className="sr-only">مقایسه‌ی {assessment.code}</span>}
                    checked={picked.includes(assessment.id)}
                    onChange={(event) =>
                      setPicked((items) =>
                        event.target.checked ? [...items, assessment.id] : items.filter((id) => id !== assessment.id),
                      )
                    }
                  />
                )}
                <AppLink href={assessment.href} className="code text-sm font-medium text-ink">
                  {assessment.code}
                </AppLink>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-14 items-center justify-center rounded-sm px-2 text-xs font-medium",
                    current ? "bg-brand-subtle text-brand" : "bg-subtle text-ink-2",
                  )}
                >
                  {assessment.kind.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-3">
                  <bdi>{assessment.detail}</bdi>
                </span>
                <ScoreChip score={assessment.score ? assessment.score[1] : null} level={assessment.level} />
                <LevelBadge level={assessment.level} />
                <Badge tone={assessment.status.value === "approved" ? "success" : "neutral"}>
                  {assessment.status.label}
                </Badge>
              </CardRow>
            </li>
          );
        })}
      </ul>
      {selectable && comparable && (
        <CardFooter>
          <span aria-live="polite">
            {picked.length > 4 ? "حداکثر چهار ارزیابی را انتخاب کنید." : "دو تا چهار ارزیابی؛ قدیمی‌ترین ستون اول است."}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!canCompare}
            onClick={() => goTo(`/assessments/compare/?${picked.map((id) => `id=${id}`).join("&")}`)}
          >
            <Icon name="layers" size={16} />
            مقایسه‌ی انتخاب‌شده‌ها
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

const E_CLASSES: Record<number, string> = {
  1: "border-danger text-danger",
  2: "border-warning text-warning",
  3: "border-brand text-brand",
  4: "border-success text-success",
  5: "border-success text-success",
};

function ControlsCard({ risk, as = "h3" }: { risk: RiskDetail; as?: "h2" | "h3" }) {
  const add = risk.actions.edit && (
    <AppLink href={risk.actions.edit} button={{ variant: "ghost", size: "sm" }}>
      <Icon name="plus" size={16} />
      افزودن کنترل
    </AppLink>
  );
  return (
    <Card className="overflow-clip">
      <CardHeader
        as={as}
        title="کنترل‌های فعلی"
        description="کنترل بدون شاهد اثربخشی E1 حساب می‌شود، نه «نامعلوم»"
        className="pb-4"
        actions={add}
      />
      {risk.controls.length ? (
        <ul className="border-t border-line">
          {risk.controls.map((control: RiskControl) => (
            <li key={control.code}>
              <CardRow className="flex items-center gap-3">
                <IconChip icon="shield-check" tone="neutral" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  {control.href ? (
                    <AppLink href={control.href} className="text-base font-medium text-ink">
                      {faText(control.title)}
                    </AppLink>
                  ) : (
                    <span className="text-base font-medium text-ink">{faText(control.title)}</span>
                  )}
                  <span className="text-xs text-ink-3">
                    <bdi className="code font-medium">{control.code}</bdi> · {control.kind}
                    {control.iso.length > 0 && (
                      <>
                        {" "}
                        · نگاشت <bdi>{control.iso.join("، ")}</bdi>
                      </>
                    )}
                  </span>
                </div>
                {control.no_valid_evidence ? (
                  <Badge tone="danger" title={control.problem ?? undefined}>
                    بدون شاهد معتبر
                  </Badge>
                ) : (
                  control.is_key && <Badge tone="gold">کلیدی</Badge>
                )}
                <span
                  className={cn(
                    "inline-grid h-[1.5625rem] min-w-[2.1875rem] place-items-center rounded-sm border-[1.5px] px-2 text-sm font-medium",
                    E_CLASSES[control.e] ?? E_CLASSES[1],
                  )}
                >
                  <span className="sr-only">اثربخشی </span>
                  <bdi>E{control.e}</bdi>
                </span>
              </CardRow>
            </li>
          ))}
        </ul>
      ) : (
        <CardContent>
          <p className="text-sm text-ink-3">کنترلی به این ریسک وصل نیست.</p>
        </CardContent>
      )}
    </Card>
  );
}

function TimelineCard({ entries, full = false }: { entries: TimelineEntry[]; full?: boolean }) {
  return (
    <Card>
      <CardHeader
        as={full ? "h2" : "h3"}
        title="خط زمانی"
        description="هر انتقال با انجام‌دهنده، زمان و دلیل؛ ویرایش و حذف نمی‌شود"
      />
      <CardContent>
        <ol className="flex flex-col">
          {entries.map((entry, index) => {
            const last = index === entries.length - 1;
            return (
              <li key={`${entry.at.iso}-${index}`} className="flex gap-3">
                <span aria-hidden className="flex w-2.5 shrink-0 flex-col items-center pt-1.5">
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      entry.by === null ? "bg-ink-3" : index === 0 ? "bg-warning" : "bg-brand",
                    )}
                  />
                  {!last && <span className="mt-1 w-0.5 flex-1 bg-line" />}
                </span>
                <div className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !last && "pb-4")}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-sm font-semibold text-ink">{entry.label}</p>
                    <time dateTime={entry.at.iso} className="text-xs text-ink-3">
                      {full ? dateTime(entry.at) : shortDate(entry.at)}
                    </time>
                  </div>
                  {entry.reason && <p className="text-xs text-ink-2">{faText(entry.reason)}</p>}
                  {full && entry.meeting_date && (
                    <p className="text-xs text-ink-3">جلسه‌ی {longDate(entry.meeting_date)}</p>
                  )}
                  <p className="text-xs text-ink-3">
                    {entry.by ? [entry.by.name, entry.role].filter(Boolean).join(" · ") : "سامانه"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

function EvidenceCard({
  risk,
  limit,
  onAll,
  as = "h3",
}: {
  risk: RiskDetail;
  limit?: number;
  onAll?: () => void;
  as?: "h2" | "h3";
}) {
  const items = limit ? risk.evidence.slice(0, limit) : risk.evidence;
  const description = [
    `${fa(risk.evidence.length)} شاهد`,
    risk.key_evidence_age && `قدمت مجاز شاهد کنترل کلیدی ${fa(risk.key_evidence_age)} روز`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card className="overflow-clip">
      <CardHeader
        as={as}
        title="شواهد"
        description={description}
        className="pb-4"
        actions={
          risk.actions.add_evidence && (
            <AppLink href={risk.actions.add_evidence} button={{ variant: "ghost", size: "sm" }}>
              <Icon name="plus" size={16} />
              افزودن<span className="sr-only"> شاهد</span>
            </AppLink>
          )
        }
      />
      {items.length ? (
        <ul className="border-t border-line">
          {items.map((item) => (
            <li key={item.code}>
              <CardRow className="flex items-start gap-2.5 py-2.5">
                <Icon
                  name={item.confidential ? "lock" : "file-text"}
                  size={18}
                  className="mt-0.5 shrink-0 text-ink-3"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <AppLink href={item.href} className="truncate text-sm text-ink">
                    {faText(item.title)}
                  </AppLink>
                  <span className="text-xs text-ink-3">
                    <bdi className="code font-medium">{item.code}</bdi> · {item.kind} ·{" "}
                    {item.confidential
                      ? "محرمانه"
                      : item.valid_until
                        ? `اعتبار تا ${shortDate(item.valid_until)}`
                        : `اعتبار ${item.reliability}`}
                  </span>
                </div>
                {item.expired ? (
                  <Badge tone="danger">منقضی</Badge>
                ) : (
                  item.confidential && <Badge tone="neutral">محرمانه</Badge>
                )}
              </CardRow>
            </li>
          ))}
        </ul>
      ) : (
        <CardContent>
          <p className="text-sm text-ink-3">هنوز شاهدی به این ریسک وصل نیست.</p>
        </CardContent>
      )}
      {onAll && limit && risk.evidence.length > limit && (
        <CardFooter className="justify-center">
          <Button variant="link" onClick={onAll}>
            دیدن همه‌ی {fa(risk.evidence.length)} شاهد
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function LinksCard({ risk }: { risk: RiskDetail }) {
  if (!risk.links.length && !risk.actions.add_link) return null;
  return (
    <Card>
      <CardHeader
        as="h3"
        title="پیوندهای بیرونی"
        actions={
          risk.actions.add_link && (
            <AppLink href={risk.actions.add_link} button={{ variant: "ghost", size: "sm" }}>
              <Icon name="plus" size={16} />
              افزودن<span className="sr-only"> پیوند بیرونی</span>
            </AppLink>
          )
        }
      />
      <CardContent>
        {risk.links.length ? (
          <ul className="flex flex-col gap-2">
            {risk.links.map((link) => {
              const url = safeExternalUrl(link.url);
              const ref = <bdi className="code text-sm font-medium">{link.ref}</bdi>;
              return (
                <li key={`${link.kind}-${link.ref}`} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-ink-3">{link.kind}</span>
                  <span className="flex items-center gap-2">
                    {link.edit_url && (
                      <a
                        href={link.edit_url}
                        aria-label={`ویرایش پیوند ${link.ref} (${t("shell.classic")})`}
                        className="grid size-6 place-items-center text-ink-3 hover:text-ink"
                      >
                        <Icon name="pencil" size={14} />
                      </a>
                    )}
                    {url ? (
                      <a href={url} rel="noopener noreferrer" target="_blank" className="text-brand hover:underline">
                        {ref}
                        <span className="sr-only"> (در برگه‌ی تازه)</span>
                      </a>
                    ) : (
                      <span className="text-brand">{ref}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">پیوندی به سامانه‌های دیگر ثبت نشده است.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm whitespace-pre-line text-ink">{children}</dd>
    </div>
  );
}

/** شرح و مشخصات ثبت ریسک؛ فیگما خلاصه را از نتیجه شروع می‌کند و این کارت پایین ستون اصلی است. */
function DescriptionCard({ risk }: { risk: RiskDetail }) {
  const snapshot = Boolean(risk.scenario_snapshot && Object.keys(risk.scenario_snapshot).length);
  return (
    <Card>
      <CardHeader as="h3" title={snapshot ? "سناریوی ثبت‌شده" : "شرح ریسک"} />
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-7 whitespace-pre-line text-ink-2">{faText(risk.description)}</p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="عامل آغازگر">{risk.initiator}</Fact>
          {snapshot ? (
            <Fact label="مسیر مشخص تحقق">{risk.realization_path}</Fact>
          ) : (
            <>
              <Fact label="دامنه">{risk.scope}</Fact>
              <Fact label="واحد شمارش">{risk.count_unit}</Fact>
              <Fact label="طبقه‌ی اطلاعات">{risk.data_class?.label}</Fact>
              <Fact label="برچسب CIA">{risk.cia && <bdi className="code">{risk.cia}</bdi>}</Fact>
            </>
          )}
          <Fact label="کانال ورود">{risk.channel.label}</Fact>
          <Fact label="ثبت">{longDate(risk.created_at)}</Fact>
          <Fact label="برچسب‌ها">{risk.tags.length > 0 && risk.tags.join("، ")}</Fact>
          <Fact label="توضیحات اضافه">{risk.additional_notes}</Fact>
          <Fact label="موارد خارج از شمارش">{risk.count_exclusions}</Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────── زبانه‌های دیگر ───────────────────────────────

function Questions({ risk }: { risk: RiskDetail }) {
  const questions = risk.workflow.questions;
  if (!questions.length) {
    return <EmptyState as="h3" icon={<Icon name="question" size={20} />} title="پرسشی برای این ریسک طرح نشده" />;
  }
  return (
    <Card className="overflow-clip">
      <CardHeader as="h2" title="پرسش‌های ارزیابی" description="پرسش‌هایی که برای ارزیابی از واحد ریسک پرسیده شد" />
      <ul className="border-t border-line">
        {questions.map((question, index) => (
          <li key={index}>
            <CardRow className="flex flex-col gap-2">
              <p className="text-sm font-medium whitespace-pre-line text-ink">{faText(question.text)}</p>
              {question.is_open ? (
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
                  <span className="flex items-center gap-2">
                    <Badge tone="warning" dot>
                      منتظر جواب
                    </Badge>
                    پرسش {question.asked_by?.name}
                  </span>
                  <Deadline value={question.due} label="مهلت جواب" />
                </div>
              ) : (
                <div className="flex flex-col gap-1 border-s-2 border-line ps-3">
                  <p className="text-sm whitespace-pre-line text-ink-2">{faText(question.answer)}</p>
                  <p className="text-xs text-ink-3">
                    پرسش {question.asked_by?.name} · جواب {question.answered_by?.name}
                  </p>
                </div>
              )}
            </CardRow>
          </li>
        ))}
      </ul>
      {questions.some((question) => question.is_open) && (
        <CardFooter>
          <span>
            مدیر واحد این پرسش‌ها را در{" "}
            <Link to="/questionnaires/risk-questions" viewTransition className="text-brand hover:underline">
              پرسش‌های ریسک
            </Link>{" "}
            جواب می‌دهد.
          </span>
        </CardFooter>
      )}
    </Card>
  );
}

function Treatment({ risk }: { risk: RiskDetail }) {
  const { current_plan: plan, plan_due: due, acceptances } = risk.treatment;
  if (!plan && !due && !acceptances.length) {
    return (
      <EmptyState
        as="h3"
        icon={<Icon name="clipboard" size={20} />}
        title="هنوز طرح مواجهه یا پذیرشی ندارد"
        action={
          risk.actions.add_plan && (
            <AppLink href={risk.actions.add_plan} button={{ variant: "primary", size: "sm" }}>
              نوشتن طرح مواجهه
            </AppLink>
          )
        }
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {due && !plan && (
        <Alert tone={due.overdue ? "danger" : "warning"} title="طرح مواجهه هنوز ثبت نشده است.">
          <Deadline value={due} label="مهلت ثبت طرح" />
        </Alert>
      )}
      {plan && (
        <Card className="overflow-clip">
          <CardHeader
            as="h2"
            title={
              <AppLink href={plan.href} className="text-ink">
                {plan.label}
              </AppLink>
            }
            description={`گزینه‌ی ${plan.option}`}
            className="pb-4"
            actions={
              <Badge tone={plan.owner_approved ? "success" : "warning"} dot>
                {plan.owner_approved ? "تأییدشده‌ی مالک ریسک" : "منتظر تأیید مالک ریسک"}
              </Badge>
            }
          />
          {plan.actions.length > 0 && (
            <ul className="border-t border-line">
              {plan.actions.map((action) => (
                <li key={action.code}>
                  <CardRow className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <AppLink href={action.href} className="text-sm text-ink">
                        <bdi className="code text-ink-3">{action.code}</bdi> {faText(action.title)}
                      </AppLink>
                      <span className="text-xs text-ink-3">{action.status}</span>
                    </div>
                    <Deadline value={action.due} />
                  </CardRow>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {acceptances.length > 0 && (
        <Card className="overflow-clip">
          <CardHeader as="h2" title="پذیرش‌ها" className="pb-4" />
          <ul className="border-t border-line">
            {acceptances.map((acceptance) => (
              <li key={acceptance.code}>
                <CardRow className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5">
                    <AppLink href={acceptance.href} className="text-sm text-ink">
                      پذیرش <bdi className="code">{acceptance.code}</bdi>
                    </AppLink>
                    <span className="text-xs text-ink-3">
                      {acceptance.status}
                      {acceptance.start &&
                        acceptance.end &&
                        `، از ${longDate(acceptance.start)} تا ${longDate(acceptance.end)}`}
                    </span>
                  </div>
                  <LevelBadge level={acceptance.level} />
                </CardRow>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

/** نشانی‌هایی که جنگو و ستون «اقدام بعدی» با # به پرونده می‌دهند. */
const HASH_TABS: Partial<Record<string, Tab>> = {
  "#attachments": "files",
  "#comments": "files",
  "#treatment": "treatment",
  "#evidence": "evidence",
  "#assessments": "assessments",
  "#questions": "questions",
  "#timeline": "timeline",
};

export function RiskDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { hash } = useLocation();
  const risk = useQuery({ queryKey: ["risk", id], queryFn: ({ signal }) => get<RiskDetail>(`risks/${id}/`, signal) });
  useTitle(risk.data ? `${risk.data.code} ${risk.data.title}` : "پرونده‌ی ریسک");

  if (risk.isPending) return <PageSkeleton rows={6} />;
  if (risk.isError) {
    return (
      <div className="flex flex-col gap-4">
        <Breadcrumb items={[{ label: "رجیستر ریسک", to: "/risks" }, { label: "پرونده" }]} />
        <ErrorState error={risk.error} retry={() => risk.refetch()} />
      </div>
    );
  }

  const data = risk.data;
  const asked = params.get("tab");
  const fromHash = hash === "#workflow" && data.status.value === "questions" ? "questions" : HASH_TABS[hash];
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : (fromHash ?? "overview");
  const counts: Partial<Record<Tab, number>> = {
    assessments: data.assessments.length,
    controls: data.controls.length,
    evidence: data.evidence.length,
    questions: data.workflow.questions.length,
    files: data.attachments.length + data.comments.length,
  };

  function selectTab(value: string) {
    const next = new URLSearchParams(params);
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <article className="flex flex-col gap-4">
      <Breadcrumb
        items={[
          { label: "رجیستر ریسک", to: "/risks" },
          { label: data.code, code: true },
        ]}
      />
      <RecordHeader risk={data} />
      <Stepper steps={data.stepper} />
      {data.banner && <DeadlineBanner banner={data.banner} active={data.is_active} onTab={selectTab} />}
      <Tabs value={tab} onValueChange={selectTab} className="min-w-0">
        <TabsList aria-label="بخش‌های پرونده" className="gap-5 px-0">
          {TABS.map((name) => (
            <TabsTrigger key={name} value={name} count={counts[name] ? fa(counts[name]) : undefined}>
              {TAB_LABELS[name]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview">
          <h2 className="sr-only">{TAB_LABELS.overview}</h2>
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
            <div className="flex min-w-0 flex-col gap-4">
              <LatestResultCard latest={data.latest} />
              <AssessmentsCard risk={data} onCompare={() => selectTab("assessments")} />
              <ControlsCard risk={data} />
              <DescriptionCard risk={data} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <TimelineCard entries={data.timeline} />
              <EvidenceCard risk={data} limit={SUMMARY_EVIDENCE} onAll={() => selectTab("evidence")} />
              <LinksCard risk={data} />
            </div>
          </div>
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentsCard risk={data} selectable />
        </TabsContent>
        <TabsContent value="treatment">
          <h2 className="sr-only">{TAB_LABELS.treatment}</h2>
          <Treatment risk={data} />
        </TabsContent>
        <TabsContent value="controls">
          <ControlsCard risk={data} as="h2" />
        </TabsContent>
        <TabsContent value="evidence">
          <EvidenceCard risk={data} as="h2" />
        </TabsContent>
        <TabsContent value="questions">
          <Questions risk={data} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineCard entries={data.timeline} full />
        </TabsContent>
        <TabsContent value="files" className="flex flex-col gap-4">
          <h2 className="sr-only">{TAB_LABELS.files}</h2>
          <Attachments record={data} as="h3" />
          <Comments record={data} as="h3" />
        </TabsContent>
      </Tabs>
    </article>
  );
}
