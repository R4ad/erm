import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Columns3,
  FilePlus2,
  FileSearch,
  FileText,
  GitBranch,
  GitMerge,
  History,
  Link2,
  Lock,
  MessageCircleQuestionMark,
  PencilLine,
  ShieldCheck,
  Split,
  SquareArrowOutUpLeft,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Deadline } from "@/components/ui/deadline";
import { Checkbox } from "@/components/ui/field";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, EmptyState, ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { useGoTo, useRouteOf } from "@/features/session/links";
import { get } from "@/lib/api";
import { band, dateTime, formatNumber, longDate, safeExternalUrl, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { t } from "@/lib/i18n";
import type { RelatedRisk, RiskDetail } from "@/lib/types";

const TABS = ["overview", "workflow", "assessments", "treatment", "evidence", "comments"] as const;
type Tab = (typeof TABS)[number];

const score = band;

function Hero({ risk }: { risk: RiskDetail }) {
  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 end-[-6rem] size-72 rounded-full blur-3xl"
        style={{ background: risk.level ? risk.level.color : "var(--accent)", opacity: 0.12 }}
      />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral" className="code">
              {risk.code}
            </Badge>
            <Badge tone={risk.is_active ? "accent" : "neutral"} dot>
              {risk.status.label}
            </Badge>
            {risk.needs_completion && (
              <Badge tone="warning">
                <TriangleAlert aria-hidden />
                نیازمند تکمیل
              </Badge>
            )}
          </div>
          <h1 className="text-display font-bold text-fg">{risk.title}</h1>
          <p className="text-sm text-muted">
            دسته‌ی {risk.category.name}، واحد {risk.org_unit}،{" "}
            {risk.owner ? `مالک ${risk.owner.name}` : <span className="text-warning">هنوز بی‌مالک</span>}
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 pt-1 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">تاریخ ثبت</dt>
              <CalendarDays aria-hidden className="size-3.5" />
              <dd>
                ثبت <time dateTime={risk.created_at.iso}>{longDate(risk.created_at)}</time>
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">آخرین تغییر</dt>
              <History aria-hidden className="size-3.5" />
              <dd>تغییر {dateTime(risk.updated_at)}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">کانال ورود</dt>
              <ArrowLeftRight aria-hidden className="size-3.5" />
              <dd>ورود از {risk.channel.label}</dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-line bg-surface/60 p-4 lg:min-w-56">
          <p className="text-xs text-muted">سطح فعلی</p>
          <LevelBadge level={risk.level} size="lg" />
          <p className="text-xs text-muted">
            {risk.score
              ? `امتیاز ${score(risk.score)}، از آخرین ارزیابی جاری تأییدشده`
              : "هنوز ارزیابی جاری تأییدشده‌ای ندارد."}
          </p>
        </div>
      </div>
    </Card>
  );
}

/** یک کار در منوی «کارهای دیگر»: در همین رابط اگر صفحه‌اش هست، وگرنه صفحه‌ی جنگو با نشانه‌اش. */
function MenuLink({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const route = useRouteOf()(href);
  return (
    <DropdownMenuItem asChild>
      {route ? (
        <Link to={route} viewTransition>
          <Icon aria-hidden />
          {label}
        </Link>
      ) : (
        <a href={href}>
          <Icon aria-hidden />
          {label}
          <span className="sr-only">({t("shell.classic")})</span>
        </a>
      )}
    </DropdownMenuItem>
  );
}

function Related({ risk }: { risk: RelatedRisk }) {
  return risk.href ? (
    <AppLink href={risk.href}>
      <bdi className="code">{risk.code}</bdi>
    </AppLink>
  ) : (
    <bdi className="code">{risk.code}</bdi>
  );
}

function RelatedList({ risks }: { risks: RelatedRisk[] }) {
  return risks.map((item, index) => (
    <span key={item.code}>
      {index > 0 && "، "}
      <Related risk={item} />
    </span>
  ));
}

function Actions({ risk }: { risk: RiskDetail }) {
  const { transitions, pending_change: pending, merged_into, split_from, merged_risks, split_parts } = risk.workflow;
  const extra: { href: string | null; label: string; icon: LucideIcon }[] = [
    { href: risk.actions.edit, label: "ویرایش ریسک", icon: PencilLine },
    { href: risk.actions.add_link, label: "افزودن پیوند بیرونی", icon: Link2 },
    { href: risk.actions.add_evidence, label: "شاهد تازه", icon: FilePlus2 },
    { href: risk.actions.propose_merge, label: "پیشنهاد ادغام", icon: GitMerge },
    { href: risk.actions.propose_split, label: "پیشنهاد تفکیک", icon: Split },
    { href: risk.actions.add_assessment, label: "ارزیابی تازه", icon: ClipboardCheck },
    { href: risk.actions.add_plan, label: "طرح مواجهه‌ی تازه", icon: GitBranch },
    { href: risk.actions.add_review ?? null, label: "ثبت محرک بازبینی", icon: CalendarDays },
  ];
  const available = extra.filter((action): action is { href: string; label: string; icon: LucideIcon } =>
    Boolean(action.href),
  );
  const relations = merged_into || split_from || merged_risks.length > 0 || split_parts.length > 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {transitions.map((transition, index) => (
          <AppLink
            key={transition.name}
            href={transition.href}
            title={transition.description || undefined}
            button={{ variant: index === 0 ? "primary" : "secondary" }}
          >
            {transition.label}
          </AppLink>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              کارهای دیگر
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {available.map((action) => (
              <MenuLink key={action.label} {...action} />
            ))}
            {available.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild>
              <a href={risk.actions.classic}>
                <SquareArrowOutUpLeft aria-hidden className="ltr:-scale-x-100" />
                پرونده در صفحه‌های فعلی
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {transitions.length === 0 && (
        <p className="text-xs text-muted">
          {risk.is_active ? "از وضعیت فعلی کاری در گردش کار با نقش شما نیست." : "این ریسک فقط سابقه است."}
        </p>
      )}
      {pending && (
        <Alert tone="warning">
          پیشنهاد {pending.label}
          {pending.merge_into && (
            <>
              {" "}
              در <bdi className="code">{pending.merge_into}</bdi>
            </>
          )}{" "}
          منتظر تأیید مالک ریسک است.{" "}
          <AppLink href={pending.href}>{pending.can_decide ? "بررسی و تأیید یا رد" : "جزئیات"}</AppLink>
        </Alert>
      )}
      {relations && (
        <ul className="flex flex-col gap-1 text-xs text-muted">
          {merged_into && (
            <li>
              این ریسک در <Related risk={merged_into} /> ادغام شده است.
            </li>
          )}
          {split_from && (
            <li>
              از ریسک <Related risk={split_from} /> تفکیک شده است.
            </li>
          )}
          {merged_risks.length > 0 && (
            <li>
              ریسک‌های ادغام‌شده در این ریسک: <RelatedList risks={merged_risks} />
            </li>
          )}
          {split_parts.length > 0 && (
            <li>
              ریسک‌های تفکیک‌شده از این ریسک: <RelatedList risks={split_parts} />
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-8 whitespace-pre-line text-fg/90">{children}</p>;
}

function Questions({ risk }: { risk: RiskDetail }) {
  const questions = risk.workflow.questions;
  if (!questions.length) return null;
  return (
    <Card>
      <CardHeader icon={<MessageCircleQuestionMark />} title="پرسش‌های ارزیابی" as="h3" />
      <CardContent className="flex flex-col gap-3">
        {questions.map((question, index) => (
          <article key={index} className="rounded-xl border border-line bg-surface/50 p-4">
            <blockquote className="border-s-2 border-accent-line ps-3 text-sm whitespace-pre-line text-fg">
              {question.text}
            </blockquote>
            {question.is_open ? (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
                <span className="flex items-center gap-2">
                  <Badge tone="warning" dot>
                    منتظر جواب
                  </Badge>
                  پرسش {question.asked_by?.name}
                </span>
                <Deadline value={question.due} label="مهلت جواب" />
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-1">
                <Prose>{question.answer}</Prose>
                <p className="text-xs text-muted">جواب {question.answered_by?.name}</p>
              </div>
            )}
          </article>
        ))}
        {questions.some((question) => question.is_open) && (
          <p className="text-xs text-muted">
            مدیر واحد این پرسش‌ها را در{" "}
            <Link to="/questionnaires/risk-questions" viewTransition className="text-accent-text hover:underline">
              پرسش‌های ریسک
            </Link>{" "}
            جواب می‌دهد.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Timeline({ risk }: { risk: RiskDetail }) {
  const entries = risk.workflow.timeline;
  if (!entries.length) return null;
  return (
    <Card>
      <CardHeader icon={<History />} title="گردش کار" description="تازه‌ترین بالا" as="h3" />
      <CardContent>
        {/* reversed شماره‌ها را از قدیمی‌ترین (۱) نگه می‌دارد، هرچند تازه‌ترین بالاست. */}
        <ol
          reversed
          className="relative flex flex-col gap-5 ps-6 before:absolute before:inset-y-1 before:start-[0.4375rem] before:w-px before:bg-line"
        >
          {entries.map((entry, index) => (
            <li key={index} className="relative">
              <span
                aria-hidden
                className={
                  "absolute -start-6 top-1.5 size-3.5 rounded-full border-2 border-panel " +
                  (index === 0 ? "bg-accent shadow-[0_0_0_4px_var(--accent-soft)]" : "bg-line-strong")
                }
              />
              <p className="text-sm text-fg">
                از «{entry.from}» به <span className="font-semibold">«{entry.to}»</span>
              </p>
              {entry.reason && <Prose>{entry.reason}</Prose>}
              <p className="mt-0.5 text-xs text-muted">
                {entry.by?.name}، {dateTime(entry.at)}
                {entry.meeting_date && `، جلسه‌ی ${longDate(entry.meeting_date)}`}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function Assessments({ risk }: { risk: RiskDetail }) {
  const [picked, setPicked] = useState<number[]>([]);
  const goTo = useGoTo();
  if (!risk.assessments.length) {
    return <EmptyState as="h3" icon={<ClipboardCheck />} title="هنوز ارزیابی‌ای ثبت نشده" />;
  }
  // مقایسه مثل فرم صفحه‌ی ریسک جنگو: ?id=…&id=…، که جنگو به ترتیب ثبت می‌چیند تا قدیمی‌ترین ستون اول باشد.
  const comparable = risk.assessments.length > 1;
  const canCompare = picked.length >= 2 && picked.length <= 4;
  return (
    <div className="flex flex-col gap-3">
      <Card className="table-shell overflow-clip">
        <table className="data-table">
          <caption className="sr-only">ارزیابی‌های این ریسک</caption>
          <thead>
            <tr>
              {comparable && (
                <th scope="col" className="w-0">
                  <span className="sr-only">انتخاب برای مقایسه</span>
                </th>
              )}
              <th scope="col">کد</th>
              <th scope="col">نوع</th>
              <th scope="col">وضعیت</th>
              <th scope="col">سطح</th>
              <th scope="col">امتیاز</th>
              <th scope="col">تأیید</th>
            </tr>
          </thead>
          <tbody>
            {risk.assessments.map((assessment) => (
              <tr key={assessment.id}>
                {comparable && (
                  <td data-label="مقایسه" className="w-0">
                    <Checkbox
                      label={<span className="sr-only">مقایسه‌ی {assessment.code}</span>}
                      checked={picked.includes(assessment.id)}
                      onChange={(event) =>
                        setPicked((current) =>
                          event.target.checked
                            ? [...current, assessment.id]
                            : current.filter((id) => id !== assessment.id),
                        )
                      }
                    />
                  </td>
                )}
                <td data-primary>
                  <AppLink href={assessment.href} className="code">
                    {assessment.code}
                  </AppLink>
                </td>
                <td data-label="نوع">{assessment.kind.label}</td>
                <td data-label="وضعیت">
                  <Badge tone={assessment.status.value === "approved" ? "success" : "neutral"}>
                    {assessment.status.label}
                  </Badge>
                </td>
                <td data-label="سطح">
                  <LevelBadge level={assessment.level} />
                </td>
                <td data-label="امتیاز" data-empty={assessment.score ? undefined : ""} className="tabular">
                  {score(assessment.score)}
                </td>
                <td
                  data-label="تأیید"
                  data-empty={assessment.approved_at ? undefined : ""}
                  className="whitespace-nowrap text-muted"
                >
                  {assessment.approved_at && shortDate(assessment.approved_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {comparable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canCompare}
            onClick={() => goTo(`/assessments/compare/?${picked.map((id) => `id=${id}`).join("&")}`)}
          >
            <Columns3 aria-hidden />
            مقایسه‌ی انتخاب‌شده‌ها
          </Button>
          <span className="text-xs text-muted" aria-live="polite">
            {picked.length > 4 ? "حداکثر چهار ارزیابی را انتخاب کنید." : "دو تا چهار ارزیابی؛ قدیمی‌ترین ستون اول است."}
          </span>
        </div>
      )}
    </div>
  );
}

function Treatment({ risk }: { risk: RiskDetail }) {
  const { current_plan: plan, plan_due: due, acceptances } = risk.treatment;
  if (!plan && !due && !acceptances.length) {
    return <EmptyState as="h3" icon={<GitBranch />} title="هنوز طرح مواجهه یا پذیرشی ندارد" />;
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
            icon={<GitBranch />}
            as="h3"
            title={
              <AppLink href={plan.href} className="text-fg">
                {plan.label}
              </AppLink>
            }
            description={`گزینه‌ی ${plan.option}`}
            actions={
              <Badge tone={plan.owner_approved ? "success" : "warning"} dot>
                {plan.owner_approved ? "تأییدشده‌ی مالک ریسک" : "منتظر تأیید مالک ریسک"}
              </Badge>
            }
          />
          {plan.actions.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {plan.actions.map((action) => (
                <li key={action.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <AppLink href={action.href} className="text-fg">
                      <bdi className="code text-accent-text">{action.code}</bdi> {action.title}
                    </AppLink>
                    <span className="text-xs text-muted">{action.status}</span>
                  </div>
                  <Deadline value={action.due} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {acceptances.length > 0 && (
        <Card>
          <CardHeader icon={<ShieldCheck />} title="پذیرش‌ها" as="h3" />
          <ul className="divide-y divide-line border-t border-line">
            {acceptances.map((acceptance) => (
              <li key={acceptance.code} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex flex-col gap-0.5">
                  <AppLink href={acceptance.href} className="text-fg">
                    پذیرش <bdi className="code">{acceptance.code}</bdi>
                  </AppLink>
                  <span className="text-xs text-muted">
                    {acceptance.status}
                    {acceptance.start &&
                      acceptance.end &&
                      `، از ${longDate(acceptance.start)} تا ${longDate(acceptance.end)}`}
                  </span>
                </div>
                <LevelBadge level={acceptance.level} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Evidence({ risk }: { risk: RiskDetail }) {
  const add = risk.actions.add_evidence && (
    <AppLink href={risk.actions.add_evidence} button={{ variant: "secondary", size: "sm" }}>
      <FilePlus2 aria-hidden />
      شاهد تازه
    </AppLink>
  );
  return (
    <div className="flex flex-col gap-4">
      {risk.evidence.length ? (
        <Card className="overflow-clip">
          <CardHeader icon={<FileSearch />} title="شواهد" as="h3" actions={add} />
          <ul className="divide-y divide-line border-t border-line">
            {risk.evidence.map((item) => (
              <li key={item.code} className="flex items-start gap-3 px-5 py-4">
                <FileSearch aria-hidden className="mt-0.5 size-[1.125rem] shrink-0 text-accent-text" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <AppLink href={item.href} className="font-medium text-fg">
                    {item.title}
                  </AppLink>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <bdi className="code">{item.code}</bdi>
                    <span>{item.kind}</span>
                    <span>اعتبار {item.reliability}</span>
                    {item.observed_on && <span>مشاهده {longDate(item.observed_on)}</span>}
                    {item.expired && <Badge tone="danger">منقضی</Badge>}
                    {item.confidential && (
                      <Badge tone="info">
                        <Lock aria-hidden />
                        محرمانه
                      </Badge>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <EmptyState as="h3" icon={<FileSearch />} title="هنوز شاهدی ندارد" action={add} />
      )}
      <Attachments record={risk} as="h3" />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "" || children === false) return null;
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

function Facts({ risk }: { risk: RiskDetail }) {
  return (
    <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
      <CardHeader icon={<FileText />} title="مشخصات" as="h2" />
      <CardContent>
        <dl className="flex flex-col divide-y divide-line">
          <Fact label="خدمت">
            {risk.service &&
              (risk.service.href ? <AppLink href={risk.service.href}>{risk.service.name}</AppLink> : risk.service.name)}
          </Fact>
          <Fact label="سناریو">
            {risk.scenario && (
              <span className="flex flex-wrap items-center gap-2">
                <AppLink href={risk.scenario.href}>{risk.scenario.title}</AppLink>
                {risk.scenario.changed && <Badge tone="warning">نسخه‌ی تازه‌تری دارد</Badge>}
              </span>
            )}
          </Fact>
          <Fact label="عامل آغازگر">{risk.initiator && <Prose>{risk.initiator}</Prose>}</Fact>
          {risk.scenario_snapshot && Object.keys(risk.scenario_snapshot).length > 0 && (
            <Fact label="مسیر مشخص تحقق">{risk.realization_path && <Prose>{risk.realization_path}</Prose>}</Fact>
          )}
          {(!risk.scenario_snapshot || Object.keys(risk.scenario_snapshot).length === 0) && (
            <>
              <Fact label="دامنه">{risk.scope && <Prose>{risk.scope}</Prose>}</Fact>
              <Fact label="واحد شمارش">{risk.count_unit}</Fact>
              <Fact label="طبقه‌ی اطلاعات">{risk.data_class?.label}</Fact>
              <Fact label="برچسب CIA">{risk.cia && <bdi className="code">{risk.cia}</bdi>}</Fact>
            </>
          )}
          <Fact label="بانک‌ها">{risk.customers.length > 0 && risk.customers.join("، ")}</Fact>
          <Fact label="برچسب‌ها">
            {risk.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {risk.tags.map((tag) => (
                  <li key={tag}>
                    <Badge>{tag}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Fact>
          <Fact label="کنترل‌ها">
            {risk.controls.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {risk.controls.map((control) => (
                  <li key={control.code} className="flex items-baseline gap-2">
                    <bdi className="code text-xs text-muted">{control.code}</bdi>
                    {control.href ? <AppLink href={control.href}>{control.title}</AppLink> : control.title}
                  </li>
                ))}
              </ul>
            )}
          </Fact>
          <Fact label="پیوندها">
            {risk.links.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {risk.links.map((link) => {
                  const url = safeExternalUrl(link.url);
                  return (
                    <li key={`${link.kind}-${link.ref}`} className="flex flex-wrap items-baseline gap-x-2">
                      <span>
                        {link.kind}:{" "}
                        {url ? (
                          <a
                            href={url}
                            rel="noopener noreferrer"
                            target="_blank"
                            className="text-accent-text hover:underline"
                          >
                            <bdi>{link.ref}</bdi>
                            <span className="sr-only"> (در برگه‌ی تازه)</span>
                          </a>
                        ) : (
                          <bdi>{link.ref}</bdi>
                        )}
                      </span>
                      {link.edit_url && (
                        <AppLink href={link.edit_url} className="text-xs">
                          ویرایش<span className="sr-only"> پیوند {link.ref}</span>
                        </AppLink>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

export function RiskDetailPage() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const risk = useQuery({ queryKey: ["risk", id], queryFn: ({ signal }) => get<RiskDetail>(`risks/${id}/`, signal) });
  useTitle(risk.data ? `${risk.data.code} ${risk.data.title}` : "پرونده‌ی ریسک");

  const asked = params.get("tab");
  // بعد از ذخیره‌ی پیوست یا نظر، جنگو به #attachments یا #comments همان پرونده برمی‌گرداند.
  const { hash } = useLocation();
  const fromHash: Partial<Record<string, Tab>> = {
    "#attachments": "evidence",
    "#comments": "comments",
    "#treatment": "treatment",
    "#evidence": "evidence",
  };
  const tab: Tab = TABS.includes(asked as Tab) ? (asked as Tab) : (fromHash[hash] ?? "overview");

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
  const counts: Record<Tab, number> = {
    overview: 0,
    workflow: data.workflow.timeline.length + data.workflow.questions.length,
    assessments: data.assessments.length,
    treatment: data.treatment.acceptances.length + (data.treatment.current_plan ? 1 : 0),
    evidence: data.evidence.length + data.attachments.length,
    comments: data.comments.length,
  };
  const labels: Record<Tab, string> = {
    overview: "شرح",
    workflow: "گردش کار",
    assessments: "ارزیابی‌ها",
    treatment: "مواجهه",
    evidence: "شواهد و پیوست‌ها",
    comments: "نظرها",
  };
  const openQuestions = data.workflow.questions.filter((question) => question.is_open).length;

  function selectTab(value: string) {
    const next = new URLSearchParams(params);
    if (value === "overview") next.delete("tab");
    else next.set("tab", value);
    setParams(next, { replace: true, preventScrollReset: true });
  }

  return (
    <article className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: "رجیستر ریسک", to: "/risks" },
          { label: data.code, code: true },
        ]}
      />
      <Hero risk={data} />
      <Actions risk={data} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Tabs value={tab} onValueChange={selectTab} className="min-w-0">
          <TabsList aria-label="بخش‌های پرونده">
            {TABS.map((name) => (
              <TabsTrigger key={name} value={name} count={counts[name] ? formatNumber(counts[name]) : undefined}>
                {labels[name]}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="overview" className="flex flex-col gap-4">
            {openQuestions > 0 && (
              <Alert tone="warning" title={`${formatNumber(openQuestions)} پرسش ارزیابی منتظر جواب است.`}>
                <button
                  type="button"
                  className="text-accent-text hover:underline"
                  onClick={() => selectTab("workflow")}
                >
                  دیدن پرسش‌ها در گردش کار
                </button>
              </Alert>
            )}
            <Card>
              <CardHeader
                icon={<FileText />}
                title={
                  data.scenario_snapshot && Object.keys(data.scenario_snapshot).length ? "سناریوی ثبت‌شده" : "شرح ریسک"
                }
                as="h2"
              />
              <CardContent className="flex flex-col gap-3">
                <Prose>{data.description}</Prose>
                {data.additional_notes && (
                  <>
                    <h3 className="text-sm font-semibold">توضیحات اضافه</h3>
                    <Prose>{data.additional_notes}</Prose>
                  </>
                )}
                {data.count_exclusions && (
                  <p className="rounded-lg bg-surface px-3 py-2 text-xs text-muted">
                    موارد خارج از شمارش: {data.count_exclusions}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="workflow" className="flex flex-col gap-4">
            <h2 className="sr-only">{labels.workflow}</h2>
            <Questions risk={data} />
            <Timeline risk={data} />
            {counts.workflow === 0 && (
              <EmptyState as="h3" icon={<History />} title="هنوز جابه‌جایی‌ای در گردش کار ندارد" />
            )}
          </TabsContent>
          <TabsContent value="assessments">
            <h2 className="sr-only">{labels.assessments}</h2>
            <Assessments risk={data} />
          </TabsContent>
          <TabsContent value="treatment">
            <h2 className="sr-only">{labels.treatment}</h2>
            <Treatment risk={data} />
          </TabsContent>
          <TabsContent value="evidence">
            <h2 className="sr-only">{labels.evidence}</h2>
            <Evidence risk={data} />
          </TabsContent>
          <TabsContent value="comments">
            <h2 className="sr-only">{labels.comments}</h2>
            <Comments record={data} as="h3" />
          </TabsContent>
        </Tabs>
        <aside aria-label="مشخصات ریسک">
          <Facts risk={data} />
        </aside>
      </div>
    </article>
  );
}
