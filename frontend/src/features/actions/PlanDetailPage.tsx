import { ArrowLeftRight, Stamp } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icon";
import { LevelBadge, ScoreChip } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { ComparisonTable } from "@/features/assessments/ComparisonTable";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, Fact, MetaItem, Panel, Prose, Section } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { cn } from "@/lib/cn";
import { dateTime, fa, faText, longDate, shortDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import type { PlanActionRow, PlanCheck, PlanDetail, PlanPoint, PlanTimeline } from "@/lib/types";

import { AcceptanceTable, ActionStatusBadge, ActionTable } from "./tables";

// طرح مواجهه به چیدمان فیگما ۰۷ (Treatment Plan): سرپرونده با مهلت طرح به روز کاری، گزینه‌ی مواجهه، دلیل، جاری ←
// هدف، کادر تأیید مالک ریسک با فهرست و برآورد، و جدول اقدام‌ها با زمان‌بندی ماه‌های شمسی. بازسنجی، پذیرش، پیوست و
// گفت‌وگو زیر آن می‌مانند. هر دکمه فقط وقتی هست که جنگو نشانی‌اش را برای همین کاربر فرستاده است.

const STATE_TONES = { pending: "warning", approved: "success", closed: "neutral" } as const;

const OPTION_ICONS: Record<string, IconName> = {
  reduce: "target",
  avoid: "x-circle",
  transfer: "users",
  accept: "lock",
};

const LOCK_NOTES = {
  pending: "متن طرح و اقدام‌ها پس از تأیید مالک ریسک قفل می‌شود.",
  approved: "طرح تأییدشده قفل است؛ اقدام تازه هم تأیید مالک ریسک می‌خواهد.",
  closed: "طرح بازسنجی و بسته شده است؛ دور تازه طرح تازه می‌خواهد.",
};

// ─────────────────────────────── سرپرونده ───────────────────────────────

function DeadlineChip({ deadline }: { deadline: PlanDetail["plan"]["deadline"] }) {
  if (!deadline) return null;
  if (deadline.overdue) return <Badge tone="danger">مهلت طرح گذشته است</Badge>;
  const days = deadline.working_days;
  return (
    <Badge tone={days <= 3 ? "danger" : "neutral"}>مهلت طرح: {days === 0 ? "امروز" : `${fa(days)} روز کاری`}</Badge>
  );
}

function HeaderActions({ data }: { data: PlanDetail }) {
  const remind = useBridgeAction();
  const url = data.remind_url;
  const any = data.add_action_url || data.edit_url || url;
  return (
    <div className="flex flex-col gap-2 lg:shrink-0 lg:items-end">
      {any && (
        <div className="flex flex-wrap items-center gap-2 lg:flex-row-reverse lg:justify-start">
          {data.add_action_url && (
            <AppLink href={data.add_action_url} button={{ variant: "primary" }}>
              <Icon name="plus" size={18} />
              افزودن اقدام
            </AppLink>
          )}
          {data.edit_url && (
            <AppLink href={data.edit_url} button={{ variant: "outline" }}>
              <Icon name="pencil" size={18} />
              ویرایش طرح
            </AppLink>
          )}
          {url && (
            <Button variant="ghost" loading={remind.isPending} onClick={() => remind.mutate({ url, values: {} })}>
              {!remind.isPending && <Icon name="bell" size={18} />}
              یادآوری به مالک
            </Button>
          )}
        </div>
      )}
      <p className="flex items-start gap-1 text-xs text-ink-3">
        <Icon name="info" size={14} className="mt-0.5 shrink-0" />
        <span>{LOCK_NOTES[data.plan.state.value]}</span>
      </p>
      <ActionError error={remind.error} />
    </div>
  );
}

function RecordHeader({ data }: { data: PlanDetail }) {
  const { plan } = data;
  const code = <bdi className="code text-sm font-medium text-ink-2">{plan.risk.code}</bdi>;
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {plan.risk.href ? (
            <AppLink href={plan.risk.href} className="rounded-sm">
              {code}
            </AppLink>
          ) : (
            code
          )}
          <LevelBadge level={plan.level} />
          <ScoreChip score={plan.assessment.score} level={plan.level} label="امتیاز تصمیم" />
          <Badge tone={STATE_TONES[plan.state.value]}>{plan.state.label}</Badge>
          <DeadlineChip deadline={plan.deadline} />
        </div>
        <h1 className="text-h1 font-bold text-ink">{faText(data.title)}</h1>
        <dl className="flex max-w-[44rem] flex-wrap gap-x-4 gap-y-1.5">
          <MetaItem icon="gauge" label="مبنا">
            ارزیابی {plan.assessment.kind}{" "}
            <AppLink href={plan.assessment.href} className="text-ink">
              <bdi className="code">{plan.assessment.code}</bdi>
            </AppLink>
          </MetaItem>
          {plan.author && (
            <MetaItem icon="user" label="نویسنده">
              {plan.author.name}
              {plan.author.role && ` (${plan.author.role})`}
            </MetaItem>
          )}
          <MetaItem icon="calendar" label="ثبت">
            <time dateTime={plan.created.iso}>{shortDate(plan.created)}</time>
          </MetaItem>
          {plan.decision_due && (
            <MetaItem icon="clock" label="مهلت">
              <time dateTime={plan.decision_due.iso}>{shortDate(plan.decision_due)}</time>
            </MetaItem>
          )}
          {plan.containment_due && (
            <MetaItem icon="warning" label="مهلت مهار">
              {dateTime(plan.containment_due)}
            </MetaItem>
          )}
        </dl>
      </div>
      <HeaderActions data={data} />
    </header>
  );
}

// ─────────────────────────────── گزینه، دلیل و هدف ───────────────────────────────

function OptionsCard({ data }: { data: PlanDetail }) {
  return (
    <Panel title="گزینه‌ی مواجهه" description={faText(data.options.note)}>
      <CardContent className="@container">
        <ul className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-4">
          {data.options.items.map((option) => (
            <li
              key={option.value}
              aria-current={option.selected ? "true" : undefined}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3.5",
                option.selected && "border-brand bg-brand-subtle shadow-[inset_0_0_0_1px_var(--color-brand)]",
                option.disabled && "border-line bg-subtle",
                !option.selected && !option.disabled && "border-line bg-panel",
              )}
            >
              <span className="flex items-center justify-between">
                <Icon
                  name={OPTION_ICONS[option.value] ?? "flow"}
                  size={20}
                  className={option.selected ? "text-brand" : "text-ink-3"}
                />
                <span
                  aria-hidden
                  className={cn(
                    "grid size-4 place-items-center rounded-full border-[1.5px] bg-panel",
                    option.selected ? "border-brand" : "border-line-strong",
                  )}
                >
                  {option.selected && <span className="size-2 rounded-full bg-brand" />}
                </span>
              </span>
              <span className={cn("text-sm font-semibold", option.disabled ? "text-ink-2" : "text-ink")}>
                {option.label}
                {option.selected && <span className="sr-only"> (گزینه‌ی این طرح)</span>}
                {option.disabled && <span className="sr-only"> (برای این سطح ممکن نیست)</span>}
              </span>
              <span className="text-xs text-ink-2">{faText(option.hint)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Panel>
  );
}

function RationaleCard({ data }: { data: PlanDetail }) {
  const { plan } = data;
  return (
    <Panel title="دلیل و گزینه‌های بررسی‌شده">
      <CardContent className="flex flex-col gap-3 text-sm leading-6 text-ink-2">
        <Prose text={plan.rationale} />
        {plan.option_details && (
          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-ink">شرط‌های گزینه‌ی «{plan.option.label}»</h3>
            <Prose text={plan.option_details} />
          </div>
        )}
      </CardContent>
    </Panel>
  );
}

function Point({ label, point }: { label: string; point: PlanPoint }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-xs text-ink-3">{label}</span>
      <ScoreChip score={point.score} level={point.level} label={`امتیاز ${label}`} />
      <LevelBadge level={point.level} />
      <AppLink href={point.href} className="text-ink-2">
        <bdi className="code text-xs">{point.code}</bdi>
      </AppLink>
    </div>
  );
}

function CompareCard({ data }: { data: PlanDetail }) {
  const { current, target, needs_target } = data.compare;
  return (
    <Panel title="جاری ← هدف">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-center gap-5">
          <Point label="جاری" point={current} />
          <Icon name="arrow-left" size={18} className="text-ink-3" />
          {target ? (
            <Point label="هدف" point={target} />
          ) : (
            <p className="max-w-32 text-center text-xs text-ink-3">
              {needs_target ? "ارزیابی هدف هنوز ثبت نشده است" : `گزینه‌ی «${data.plan.option.label}» هدف عددی ندارد`}
            </p>
          )}
        </div>
        {target && !target.is_approved && (
          <Badge tone="warning" className="self-center">
            ارزیابی هدف: {target.status.label}
          </Badge>
        )}
        {target && (target.due || target.assumptions) && (
          <p className="text-xs leading-5 text-ink-2">
            {target.due && <>موعد تحقق هدف {shortDate(target.due)}</>}
            {target.due && target.assumptions && " · "}
            {faText(target.assumptions)}
          </p>
        )}
      </CardContent>
    </Panel>
  );
}

// ─────────────────────────────── تأیید مالک ریسک ───────────────────────────────

const CHECK_STYLES: Record<PlanCheck["state"], { icon: IconName; iconClass: string; text: string; sr: string }> = {
  ok: { icon: "check-circle", iconClass: "text-success", text: "text-ink", sr: "برقرار" },
  warn: { icon: "warning", iconClass: "text-warning", text: "text-warning", sr: "هشدار" },
  fail: { icon: "x-circle", iconClass: "text-danger", text: "text-danger", sr: "برقرار نیست" },
};

function ApprovalCard({ data }: { data: PlanDetail }) {
  const { approval, plan } = data;
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  const url = approval.approve_url;
  const owner = approval.owner;
  return (
    <Panel title="تأیید مالک ریسک" description="طرح و اقدام‌هایش را خود مالک ریسک تأیید می‌کند">
      <CardContent className="flex flex-col gap-3">
        {owner && (
          <div className="flex items-center gap-3 rounded-lg bg-subtle p-3">
            <Avatar name={owner.name} size={36} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-semibold text-ink">{owner.name}</span>
              <span className="text-xs text-ink-2">مالک ریسک{owner.job_title && ` · ${owner.job_title}`}</span>
            </div>
            <Badge tone={approval.owner_state.value === "approved" ? "success" : "warning"}>
              {faText(approval.owner_state.label)}
            </Badge>
          </div>
        )}
        {approval.checks.length > 0 && (
          <ul className="flex flex-col gap-2.5" aria-label="شرط‌های تأیید طرح">
            {approval.checks.map((check) => {
              const style = CHECK_STYLES[check.state];
              return (
                <li key={check.label} className={cn("flex items-start gap-2 text-sm", style.text)}>
                  <Icon name={style.icon} size={16} className={cn("mt-0.5 shrink-0", style.iconClass)} />
                  <span>
                    {faText(check.label)}
                    <span className="sr-only"> ({style.sr})</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {plan.approved_by && plan.approved_at && (
          <p className="text-xs text-ink-3">
            تأیید {plan.approved_by.name}، {dateTime(plan.approved_at)}
          </p>
        )}
        {url && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <p className="text-sm text-ink-2">{faText(approval.message)}</p>
            <Button variant="primary" loading={action.isPending} onClick={() => setConfirming(true)}>
              {!action.isPending && <Icon name="check" size={18} />}
              تأیید طرح
            </Button>
          </div>
        )}
        <ActionError error={action.error} />
      </CardContent>
      {approval.estimate && (
        <CardFooter>
          <span>برآورد کل</span>
          <span className="text-sm font-semibold text-ink">{faText(approval.estimate)}</span>
        </CardFooter>
      )}
      {url && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={`طرح «${plan.option.label}» ریسک ${plan.risk.code} تأیید شود؟`}
          description="با تأیید، طرح و همه‌ی اقدام‌های برنامه‌ریزی‌شده‌اش مصوب می‌شوند و تأیید شما در تاریخچه می‌ماند."
          confirmLabel="تأیید طرح"
          loading={action.isPending}
          onConfirm={() => {
            setConfirming(false);
            action.mutate({ url, values: {} });
          }}
        />
      )}
    </Panel>
  );
}

// ─────────────────────────────── اقدام‌ها ───────────────────────────────

function Bar({ action }: { action: PlanActionRow }) {
  return (
    <div className="relative h-5 overflow-hidden rounded-sm bg-subtle">
      {action.bar && (
        <span
          aria-hidden
          className={cn("absolute inset-y-0 rounded-sm", action.effect.kind === "impact" ? "bg-gold" : "bg-brand")}
          style={{ insetInlineStart: `${action.bar.start}%`, width: `${Math.max(action.bar.width, 1)}%` }}
        />
      )}
      <span className="sr-only">
        {longDate(action.start)} تا {longDate(action.due)}
      </span>
    </div>
  );
}

function People({ action }: { action: PlanActionRow }) {
  const rows = [
    ["مالک", action.owner],
    ["مجری", action.assignee],
    ["تأیید", action.verifier],
  ] as const;
  return (
    <dl className="flex flex-col gap-0.5 text-xs">
      {rows.map(([label, person]) => (
        <div key={label} className="flex gap-1">
          <dt className="text-ink-3">{label}:</dt>
          <dd className="truncate font-medium text-ink">{person?.name ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

function TimelineTable({ actions, timeline }: { actions: PlanActionRow[]; timeline: PlanTimeline }) {
  const head = "px-4 py-2.5 text-start text-xs font-medium text-ink-2";
  return (
    <table className="w-full min-w-[62rem] table-fixed border-collapse text-sm">
      <caption className="sr-only">اقدام‌های طرح با زمان‌بندی</caption>
      <colgroup>
        <col className="w-36" />
        <col />
        <col className="w-28" />
        <col className="w-44" />
        <col className="w-[19rem]" />
        <col className="w-32" />
      </colgroup>
      <thead className="bg-subtle">
        <tr>
          <th scope="col" className={head}>
            کد
          </th>
          <th scope="col" className={head}>
            عنوان و خروجی قابل آزمون
          </th>
          <th scope="col" className={head}>
            اثر روی
          </th>
          <th scope="col" className={head}>
            مالک · مجری · تأییدکننده
          </th>
          <th scope="col" className={cn(head, "py-2")}>
            <span className="block text-center">زمان‌بندی {fa(timeline.label)}</span>
            <span aria-hidden className="relative mt-1 block h-4 text-[0.6875rem] font-normal text-ink-2">
              {timeline.months.map((month) => (
                <span
                  key={`${month.label}-${month.start}`}
                  className="absolute top-0 truncate text-center"
                  style={{ insetInlineStart: `${month.start}%`, width: `${month.width}%` }}
                >
                  {month.label}
                </span>
              ))}
            </span>
          </th>
          <th scope="col" className={head}>
            وضعیت
          </th>
        </tr>
      </thead>
      <tbody>
        {actions.map((action) => (
          <tr key={action.id} className="border-t border-line align-middle">
            <td className="px-4 py-3">
              <bdi className="code text-sm font-medium text-ink">{action.code}</bdi>
            </td>
            <td className="px-4 py-3">
              <AppLink
                href={action.href}
                className="block truncate font-semibold text-ink hover:text-brand hover:no-underline"
                title={action.title}
              >
                {action.title}
              </AppLink>
              <span className="block truncate text-xs text-ink-3" title={action.acceptance}>
                قبولی: {faText(action.acceptance)}
              </span>
            </td>
            <td className="px-4 py-3">
              <span
                title={faText(action.effect.title)}
                className="inline-flex h-6 items-center rounded-sm border border-line px-1.5 text-xs whitespace-nowrap text-ink-2"
              >
                {faText(action.effect.label)}
              </span>
            </td>
            <td className="px-4 py-3">
              <People action={action} />
            </td>
            <td className="px-4 py-3">
              <Bar action={action} />
            </td>
            <td className="px-4 py-3">
              {action.missing_cost ? (
                <Badge tone="warning">
                  هزینه ثبت نشده
                  <span className="sr-only"> · {action.status.label}</span>
                </Badge>
              ) : (
                <ActionStatusBadge status={action.status} />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActionsCard({ data }: { data: PlanDetail }) {
  const [view, setView] = useState<"timeline" | "table">("timeline");
  const { actions, timeline } = data;
  return (
    <section id="actions" className="scroll-mt-24">
      <Panel
        title={`اقدام‌ها (${fa(actions.length)})`}
        description="کد TR · سازوکار اثر روی A، B یا یک بُعد پیامد · اقدام فقط پیش از تأیید ویرایش می‌شود"
        actions={
          actions.length > 0 &&
          timeline && (
            <Button variant="ghost" size="sm" onClick={() => setView(view === "timeline" ? "table" : "timeline")}>
              <Icon name={view === "timeline" ? "table" : "calendar"} size={16} />
              {view === "timeline" ? "نمای جدول" : "نمای زمان‌بندی"}
            </Button>
          )
        }
      >
        {actions.length === 0 ? (
          <CardContent>
            <p className="text-sm text-ink-3">هنوز اقدامی ثبت نشده است.</p>
          </CardContent>
        ) : view === "timeline" && timeline ? (
          <>
            <div className="relative overflow-x-auto border-t border-line">
              <TimelineTable actions={actions} timeline={timeline} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-3 text-xs text-ink-2">
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-4 rounded-sm bg-brand" />
                اثر روی احتمال (A یا B)
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden className="h-2 w-4 rounded-sm bg-gold" />
                اثر روی پیامد
              </span>
              <span className="text-ink-3">زمان از راست به چپ پیش می‌رود</span>
            </div>
          </>
        ) : (
          <div className="table-shell overflow-clip border-t border-line">
            <ActionTable actions={actions} caption="اقدام‌های این طرح" />
          </div>
        )}
      </Panel>
    </section>
  );
}

// ─────────────────────────────── بازسنجی و پذیرش ───────────────────────────────

function Reassessment({ data }: { data: PlanDetail }) {
  const { reassessment } = data;
  if (!reassessment && !data.reassess_url) return null;
  return (
    <Section
      id="reassessment"
      title="بازسنجی"
      icon={<ArrowLeftRight />}
      actions={
        data.reassess_url && (
          <AppLink href={data.reassess_url} button={{ variant: "primary", size: "sm" }}>
            ثبت بازسنجی
          </AppLink>
        )
      }
    >
      {reassessment ? (
        <Card>
          <CardContent className="pt-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
              <Fact label="تاریخ و مسئول">
                {longDate(reassessment.performed_on)}، {reassessment.responsible?.name}
              </Fact>
              <Fact label="ارزیابی تازه">
                <AppLink href={reassessment.assessment.href} className="code">
                  {reassessment.assessment.code}
                </AppLink>
              </Fact>
              <Fact label="مقایسه با هدف">
                <span className="flex flex-col gap-1.5">
                  {reassessment.target_met === null ? (
                    <span>طرح ارزیابی هدف تأییدشده نداشت.</span>
                  ) : reassessment.target_met ? (
                    <Badge tone="success" className="self-start">
                      هدف محقق شد
                    </Badge>
                  ) : (
                    <Badge tone="warning" className="self-start">
                      هدف هنوز محقق نشده است
                    </Badge>
                  )}
                  {reassessment.method_changed && (
                    <span className="text-xs text-warning">
                      روش ارزیابی عوض شده و بخشی از تغییر ممکن است از روش باشد.
                    </span>
                  )}
                </span>
              </Fact>
              <Fact label="تصمیم">
                <span className="flex flex-col gap-1">
                  <span className="font-semibold">{reassessment.decision.label}</span>
                  <Prose text={reassessment.note} />
                </span>
              </Fact>
            </dl>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-ink-3">
          ارزیابی جاری تازه‌ای بعد از این طرح تأیید شده است. پیش از طرح دور تازه، نتیجه را با هدف مقایسه و تصمیم پذیرش
          یا ادامه‌ی اصلاح را ثبت کنید.
        </p>
      )}
      {data.comparison && (
        <ComparisonTable
          data={data.comparison}
          caption={`مقایسه‌ی ارزیابی مبنا، تازه و هدف ریسک ${data.plan.risk.code}`}
        />
      )}
    </Section>
  );
}

function Acceptances({ data }: { data: PlanDetail }) {
  return (
    <Section
      id="acceptances"
      title="پذیرش"
      icon={<Stamp />}
      actions={
        data.add_acceptance_url && (
          <AppLink href={data.add_acceptance_url} button={{ variant: "secondary", size: "sm" }}>
            <Icon name="plus" size={16} />
            پذیرش زمان‌دار
          </AppLink>
        )
      }
    >
      <p className="text-sm text-ink-3">{faText(data.acceptance_note)}</p>
      {data.acceptances.length > 0 && (
        <Card className="table-shell overflow-clip">
          <AcceptanceTable acceptances={data.acceptances} caption="پذیرش‌های این طرح" />
        </Card>
      )}
    </Section>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

function Dossier({ data }: { data: PlanDetail }) {
  const { plan } = data;
  return (
    <article className="flex flex-col gap-5">
      <Breadcrumb
        items={[
          { label: "رجیستر ریسک", to: "/risks" },
          ...(plan.risk.href ? [{ label: plan.risk.code, to: `/risks/${plan.risk.id}`, code: true }] : []),
          { label: "طرح مواجهه" },
        ]}
      />
      <RecordHeader data={data} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <OptionsCard data={data} />
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
            <RationaleCard data={data} />
            <CompareCard data={data} />
          </div>
        </div>
        <ApprovalCard data={data} />
      </div>
      <ActionsCard data={data} />
      <Reassessment data={data} />
      <Acceptances data={data} />
      <Attachments record={data} />
      <Comments record={data} />
    </article>
  );
}

export function PlanDetailPage() {
  const page = usePageData<PlanDetail>();
  useTitle(page.data ? page.data.title : "طرح مواجهه");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) {
    return (
      <DetailState
        query={page}
        header={<PageHeader title="طرح مواجهه" breadcrumb={[{ label: "رجیستر ریسک", to: "/risks" }]} />}
      />
    );
  }
  return <Dossier data={page.data} />;
}
