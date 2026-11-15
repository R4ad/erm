import { Send } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type Tone } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, CodeLinks, Fact, MenuLink, Reasons } from "@/features/records/dossier";
import { useSession } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { band, dateTime, fa, faText, longDate, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
import type {
  AssessmentChain,
  AssessmentCheck,
  AssessmentDetail,
  AssessmentFlags,
  AssessmentImpacts,
  AssessmentLikelihood,
  AssessmentPath,
  AssessmentReviewItem,
  AssessmentStep,
  Moment,
} from "@/lib/types";

// پرونده‌ی ارزیابی به چیدمان فیگما ۰۵ (Assessment · QC): سرپرونده با تصمیم کنترل کیفیت، شش گام، زنجیره‌ی محاسبه،
// مسیرهای تحقق، و در ستون کناری بررسی‌های پیش از تأیید، نشان‌های تقدم و یادداشت‌های کنترل کیفیت.
// هر عدد همان است که موتور جنگو برای همین ارزیابی حساب کرده و هر دکمه فقط وقتی هست که جنگو اجازه‌اش را داده است.

const STATUS_TONES: Record<string, Tone> = {
  draft: "neutral",
  in_qc: "info",
  referred: "warning",
  approved: "success",
};

/** کارهای کنترل کیفیت که بی‌یادداشت پذیرفته نمی‌شوند (راهنمای فرم بازبینی جنگو). */
const NEEDS_NOTE = new Set(["return", "refer"]);

const E_CLASSES: Record<number, string> = {
  1: "border-danger text-danger",
  2: "border-warning text-warning",
  3: "border-brand text-brand",
  4: "border-success text-success",
  5: "border-success text-success",
};

function compactTime(moment: Moment) {
  const time = moment.jalali.split(" ")[1];
  return time ? `${shortDate(moment)} · ${fa(time)}` : shortDate(moment);
}

/** کارتی که خودش یک ناحیه‌ی نام‌دار است تا با فهرست ناحیه‌ها پیدا شود. */
function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <Card role="region" aria-labelledby={id} className={className}>
      <CardHeader as="h2" titleId={id} title={title} description={description} actions={actions} />
      {children}
    </Card>
  );
}

// ─────────────────────────────── کار کنترل کیفیت ───────────────────────────────

/** یادداشت، تاریخ جلسه و ارسال کار کنترل کیفیت در سطح صفحه‌اند، چون دکمه‌ها در سرپرونده و کادر یادداشت در ستون
 * کناری است. */
function useDecision(data: AssessmentDetail) {
  const { review } = data;
  const [notes, setNotes] = useState("");
  const [meeting, setMeeting] = useState("");
  const [noteError, setNoteError] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const action = useBridgeAction();

  const mode =
    review.can_review && review.review_url
      ? ("review" as const)
      : review.can_decide_referral && review.referral_url
        ? ("referral" as const)
        : review.can_submit && review.submit_url
          ? ("submit" as const)
          : null;

  function send(kind: string) {
    if (NEEDS_NOTE.has(kind) && !notes.trim()) {
      setNoteError("برای بازگرداندن یا ارجاع، یادداشتی برای ارزیاب بنویسید.");
      noteRef.current?.focus();
      return;
    }
    setNoteError("");
    if (mode === "review" && review.review_url) {
      action.mutate({ url: review.review_url, values: { action: kind, notes } });
    } else if (mode === "referral" && review.referral_url) {
      action.mutate({ url: review.referral_url, values: { action: kind, notes, meeting_date: meeting } });
    } else if (mode === "submit" && review.submit_url) {
      action.mutate({ url: review.submit_url, values: { notes } });
    }
  }

  const busy = (kind: string) =>
    action.isPending && (kind === "submit" ? mode === "submit" : action.variables?.values.action === kind);

  return { mode, notes, setNotes, meeting, setMeeting, noteError, setNoteError, noteRef, action, send, busy };
}

type Decision = ReturnType<typeof useDecision>;

// ─────────────────────────────── سرپرونده ───────────────────────────────

function MetaItem({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1">
      <Icon name={icon} size={14} className="text-ink-3" />
      <dt className="text-xs text-ink-3">{label}:</dt>
      <dd className="text-xs font-medium text-ink">{children}</dd>
    </div>
  );
}

function HeaderActions({ data, decision }: { data: AssessmentDetail; decision: Decision }) {
  const { review, assessment, actions } = data;
  const { mode, action, send, busy } = decision;
  const [confirming, setConfirming] = useState(false);
  const status = assessment.status.value;

  const more = [
    { href: actions.edit, label: "ویرایش ارزیابی", icon: "pencil" as IconName },
    { href: actions.initiator, label: "عامل آغازگر (A)", icon: "target" as IconName },
    { href: actions.impact_profile, label: "ثبت پروفایل پیامد", icon: "layers" as IconName },
    { href: actions.add_evidence ?? null, label: "ثبت شاهد", icon: "paperclip" as IconName },
    { href: assessment.risk.href, label: "پرونده‌ی ریسک", icon: "list" as IconName },
  ].filter((item): item is { href: string; label: string; icon: IconName } => Boolean(item.href));

  let note: ReactNode = null;
  if (mode === "review") note = "شما ارزیاب این پرونده نیستید؛ تأیید یا بازگرداندن مجاز است.";
  else if (mode === "submit" && review.submission_problems.length)
    note = "ارسال برای کنترل کیفیت هنوز ممکن نیست؛ موارد باز در «بررسی‌های پیش از تأیید» آمده است.";
  else if (!mode && status === "in_qc") note = "کنترل کیفیت با عضو GRC دیگری است که ارزیاب همین پرونده نیست.";
  else if (!mode && status === "referred")
    note =
      "اختلاف به کارگروه امنیت ارجاع شده است. تصمیم کارگروه را عضو کارگروه امنیت یا عضو GRC دیگری ثبت می‌کند که طرف این اختلاف نیست.";
  else if (assessment.is_approved && assessment.approved_at)
    note = `تأییدشده در ${dateTime(assessment.approved_at)}؛ ارزیابی قفل است و ارزیابی بعدی ردیف تازه است.`;

  return (
    <div className="flex flex-col gap-2 lg:max-w-[34rem] lg:shrink-0 lg:items-end">
      <div className="flex flex-wrap items-center gap-2 lg:flex-row-reverse lg:justify-start">
        {mode === "review" && (
          <>
            <Button
              variant="primary"
              loading={busy("approve")}
              disabled={action.isPending}
              onClick={() => setConfirming(true)}
            >
              {!busy("approve") && <Icon name="check" size={18} />}
              تأیید ارزیابی
            </Button>
            <Button
              variant="outline"
              loading={busy("return")}
              disabled={action.isPending}
              onClick={() => send("return")}
            >
              {!busy("return") && <Icon name="arrow-right" size={18} />}
              بازگرداندن با یادداشت
            </Button>
            <Button variant="ghost" loading={busy("refer")} disabled={action.isPending} onClick={() => send("refer")}>
              {!busy("refer") && <Icon name="flow" size={18} />}
              ارجاع به کارگروه
            </Button>
          </>
        )}
        {mode === "referral" && (
          <>
            <Button
              variant="primary"
              loading={busy("workgroup_approve")}
              disabled={action.isPending}
              onClick={() => send("workgroup_approve")}
            >
              {!busy("workgroup_approve") && <Icon name="check" size={18} />}
              تأیید با تصمیم کارگروه
            </Button>
            <Button
              variant="outline"
              loading={busy("workgroup_return")}
              disabled={action.isPending}
              onClick={() => send("workgroup_return")}
            >
              {!busy("workgroup_return") && <Icon name="arrow-right" size={18} />}
              بازگرداندن به ارزیاب
            </Button>
          </>
        )}
        {mode === "submit" && !review.submission_problems.length && (
          <Button variant="primary" loading={busy("submit")} onClick={() => send("submit")}>
            {!busy("submit") && <Send aria-hidden className="rtl:-scale-x-100" />}
            ارسال برای کنترل کیفیت
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="icon" aria-label="کارهای دیگر ارزیابی">
              <Icon name="dots" size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map((item) => (
              <MenuLink key={item.label} {...item} />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={assessment.href}>
                <Icon name="arrow-left" size={16} />
                پرونده در صفحه‌های فعلی
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {note && (
        <p className="flex items-start gap-1 text-xs text-ink-3">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span>{note}</span>
        </p>
      )}
      <ActionError error={action.error} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`ارزیابی ${assessment.code} تأیید شود؟`}
        description="با تأیید، نتیجه همین حالا ثابت و ارزیابی قفل می‌شود؛ ارزیابی بعدی ردیف تازه است."
        confirmLabel="تأیید ارزیابی"
        loading={busy("approve")}
        onConfirm={() => {
          setConfirming(false);
          send("approve");
        }}
      />
    </div>
  );
}

function RecordHeader({ data, decision }: { data: AssessmentDetail; decision: Decision }) {
  const { assessment } = data;
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <bdi className="code text-sm font-medium text-ink-2">{assessment.code}</bdi>
          <Badge tone="brand">{assessment.kind.label}</Badge>
          <Badge tone={STATUS_TONES[assessment.status.value] ?? "neutral"}>{assessment.status.label}</Badge>
          <AppLink
            href={assessment.method_version.href}
            className="rounded-sm"
            title={faText(assessment.method_version.label)}
          >
            <Badge tone="gold">نسخه‌ی روش {fa(assessment.method_version.number)}</Badge>
          </AppLink>
        </div>
        <h1 className="text-h1 font-bold text-ink">
          ارزیابی {assessment.kind.label} — {faText(assessment.risk.title)}
        </h1>
        <dl className="flex max-w-[44rem] flex-wrap gap-x-4 gap-y-1.5">
          <MetaItem icon="calendar" label="افق">
            {fa(assessment.horizon_months)} ماه{" "}
            {assessment.horizon_rationale ? (
              <span title={assessment.horizon_rationale}>(متفاوت از پیش‌فرض روش)</span>
            ) : (
              "(پیش‌فرض روش)"
            )}
          </MetaItem>
          <MetaItem icon="user" label="ارزیاب">
            {assessment.created_by?.name ?? "-"}
          </MetaItem>
          {assessment.reviewer && (
            <MetaItem icon="eye" label="کنترل‌کننده">
              {assessment.reviewer.name}
            </MetaItem>
          )}
          {assessment.submitted_at && (
            <MetaItem icon="clock" label="ارسال">
              <time dateTime={assessment.submitted_at.iso}>{shortDate(assessment.submitted_at)}</time>
            </MetaItem>
          )}
          <MetaItem icon="list" label="ریسک">
            <AppLink href={assessment.risk.href} className="text-ink">
              <bdi className="code">{assessment.risk.code}</bdi>
            </AppLink>
          </MetaItem>
        </dl>
      </div>
      <HeaderActions data={data} decision={decision} />
    </header>
  );
}

// ─────────────────────────────── شش گام ───────────────────────────────

/** روی صفحه‌ی باریک نوار گام‌ها اسکرول می‌خورد؛ گام فعلی را بدون جابه‌جا کردن صفحه در دید می‌آورد. */
function showCurrent(card: HTMLDivElement | null) {
  const current = card?.querySelector<HTMLElement>('[aria-current="step"]');
  if (!card || !current || card.scrollWidth <= card.clientWidth) return;
  const cardBox = card.getBoundingClientRect();
  const box = current.getBoundingClientRect();
  card.scrollLeft += box.left + box.width / 2 - (cardBox.left + cardBox.width / 2);
}

function StepBar({ steps }: { steps: AssessmentStep[] }) {
  return (
    <Card ref={showCurrent} className="overflow-x-auto p-2">
      <ol aria-label="گام‌های ارزیابی" className="flex min-w-[54rem] gap-1">
        {steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-2.5 py-2",
              step.state === "current" && "bg-brand-subtle",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                step.state === "done" && "bg-success-subtle text-success",
                step.state === "current" && "bg-brand text-on-brand",
                step.state === "todo" && "bg-subtle text-ink-3",
              )}
            >
              {step.state === "done" ? <Icon name="check" size={14} /> : fa(index + 1)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn("text-sm font-semibold", step.state === "current" ? "text-brand" : "text-ink")}>
                {step.label}
                <span className="sr-only">
                  {{ done: " (انجام‌شده)", current: " (گام فعلی)", todo: " (پیش رو)" }[step.state]}
                </span>
              </span>
              <span className={cn("truncate text-xs", step.warning ? "text-warning" : "text-ink-3")}>
                {faText(step.sub)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ─────────────────────────────── زنجیره‌ی محاسبه ───────────────────────────────

function Tile({
  label,
  value,
  sub,
  className,
  valueClassName,
}: {
  label: string;
  value: string;
  sub: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-[6.25rem] flex-1 flex-col gap-0.5 rounded-lg bg-subtle px-3 py-2.5", className)}>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={cn("text-xl leading-7 font-bold text-ink", valueClassName)}>
        <bdi>{value}</bdi>
      </dd>
      {sub && <dd className="text-xs text-ink-3">{sub}</dd>}
    </div>
  );
}

function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden className="self-center text-lg font-semibold text-ink-3">
      {children}
    </span>
  );
}

function symbol(letter: string, value: string) {
  return value ? `${letter} = ${value}` : `${letter} = ؟`;
}

function LikelihoodGrid({ grid }: { grid: AssessmentChain["grid"] }) {
  const width = grid.rows[0]?.cells.length ?? 0;
  const columns = Array.from({ length: width }, (_, index) => index + 1);
  return (
    <table className="shrink-0 border-separate border-spacing-1 text-center text-xs">
      <caption className="sr-only">جدول احتمال A × B نسخه‌ی روش</caption>
      <thead>
        <tr>
          <th scope="col" className="px-1 font-medium text-ink-3">
            <bdi>A \ B</bdi>
          </th>
          {columns.map((b) => (
            <th
              key={b}
              scope="col"
              className={cn("w-9 font-medium", b === grid.b ? "font-bold text-ink" : "text-ink-3")}
            >
              B{fa(b)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {grid.rows.map((row) => (
          <tr key={row.a}>
            <th scope="row" className={cn("px-1 font-medium", row.a === grid.a ? "font-bold text-ink" : "text-ink-3")}>
              A{fa(row.a)}
            </th>
            {row.cells.map((value, index) => {
              const b = index + 1;
              const hit = row.a === grid.a && b === grid.b;
              const line = row.a === grid.a || b === grid.b;
              return (
                <td
                  key={b}
                  aria-current={hit ? "true" : undefined}
                  className={cn(
                    "h-6 rounded-sm tabular",
                    hit
                      ? "bg-brand font-bold text-on-brand"
                      : line
                        ? "bg-brand-subtle text-brand"
                        : "bg-subtle text-ink-2",
                  )}
                >
                  {value === null ? "-" : fa(value)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ChainCard({ data }: { data: AssessmentDetail }) {
  const { chain, outcome, assessment } = data;
  const decision = RISK_CLASSES[riskKey(chain.decision_level)];
  const ranged = outcome.score && outcome.score[0] !== outcome.score[1] && outcome.decision_score !== null;
  return (
    <Panel
      title="زنجیره‌ی محاسبه"
      description={
        outcome.provisional
          ? `همه‌ی عددها از نسخه‌ی روش ${fa(assessment.method_version.number)} خوانده می‌شوند؛ نتیجه تا تأیید موقت است`
          : `همه‌ی عددها از نسخه‌ی روش ${fa(assessment.method_version.number)}؛ نتیجه هنگام تأیید ثابت شد`
      }
      actions={outcome.provisional && <Badge tone="neutral">موقت</Badge>}
    >
      <CardContent className="flex flex-col gap-4">
        <Reasons tone="info" title="نتیجه هنوز حساب نمی‌شود:" items={outcome.problems} />
        <dl className="flex flex-wrap items-stretch gap-1.5">
          <Tile label="آغازگر" value={symbol("A", faText(chain.a))} sub={chain.a_basis || "ثبت نشده"} />
          <Operator>و</Operator>
          <Tile label="قابلیت تحقق" value={symbol("B", band(chain.b))} sub="بیشینه‌ی مسیرها" />
          <Operator>←</Operator>
          <Tile
            label="احتمال"
            value={symbol("L", band(chain.likelihood))}
            sub="از جدول A×B"
            className="bg-brand-subtle"
            valueClassName="text-brand"
          />
          <Operator>×</Operator>
          <Tile label="پیامد" value={symbol("I", band(chain.impact))} sub={faText(chain.impact_source)} />
          <Operator>=</Operator>
          <Tile
            label="امتیاز"
            value={band(chain.score) || "؟"}
            sub={chain.base_level ? `سطح پایه: ${chain.base_level.name}` : ""}
          />
          <Operator>←</Operator>
          <div
            className={cn(
              "flex min-w-[6.25rem] flex-1 flex-col gap-0.5 rounded-lg border-[1.5px] px-3 py-2.5",
              decision.bg,
              decision.border,
              decision.fg,
            )}
          >
            <dt className="text-xs">سطح تصمیم</dt>
            <dd className="text-xl leading-7 font-bold">{chain.decision_level?.name ?? "-"}</dd>
            {chain.floor && <dd className="text-xs">{faText(chain.floor)}</dd>}
          </div>
        </dl>
        <div className="flex flex-col-reverse gap-6 md:flex-row-reverse md:items-start">
          <LikelihoodGrid grid={chain.grid} />
          <ul className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm text-ink-2">
            {chain.notes.map((item) => (
              <li key={item.text} className="flex items-start gap-2">
                <Icon
                  name={item.icon === "check" ? "check-circle" : "info"}
                  size={16}
                  className={cn("mt-0.5 shrink-0", item.icon === "check" ? "text-success" : "text-ink-3")}
                />
                <span>{faText(item.text)}</span>
              </li>
            ))}
            {ranged && (
              <li className="flex items-start gap-2">
                <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
                <span>امتیاز بازه است و تصمیم بر کران بالای آن ({fa(outcome.decision_score)}) گرفته می‌شود.</span>
              </li>
            )}
          </ul>
        </div>
        <Reasons tone="danger" title="علت تصعید" items={outcome.escalation_reasons} />
        {outcome.out_of_acceptance_authority ? (
          <Alert tone="danger">خارج از اختیار پذیرش.</Alert>
        ) : (
          outcome.acceptance_restricted && <Alert tone="warning">اختیار پذیرش عمومی محدود است.</Alert>
        )}
      </CardContent>
    </Panel>
  );
}

// ─────────────────────────────── مسیرها ───────────────────────────────

function PathRow({ path, onDelete }: { path: AssessmentPath; onDelete: (path: AssessmentPath) => void }) {
  return (
    <tr id={`path-${path.id}`} className={cn("scroll-mt-24", path.determining && "bg-gold-subtle")}>
      <th scope="row" data-primary className="min-w-60 text-start font-normal">
        <span className="block text-sm font-medium text-ink">{path.name}</span>
        {path.determining ? (
          <span className="mt-0.5 block text-xs text-gold">
            {path.controls.length ? "B سناریو از این مسیر است" : "از همه‌ی موانع عبور می‌کند"} · تعیین‌کننده
          </span>
        ) : (
          path.evidence.length > 0 && (
            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
              <span>
                شاهد <bdi>B0:</bdi>
              </span>
              <CodeLinks items={path.evidence} />
            </span>
          )
        )}
        {path.notes.map((note) => (
          <span key={note} className="mt-0.5 block text-xs text-danger">
            {faText(note)}
          </span>
        ))}
      </th>
      <td data-label="B0" className="font-semibold tabular" title={path.b0_rationale || undefined}>
        {faText(path.b0) || "-"}
      </td>
      <td data-label="کنترل‌های پیشگیرانه (E)">
        {path.controls.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {path.controls.map((control) => (
              <li key={control.code}>
                <AppLink
                  href={control.href}
                  title={control.note ? `ثبت‌شده E${control.recorded_e}، ${control.note}` : undefined}
                  className={cn(
                    "inline-flex h-[1.375rem] items-center gap-1 rounded-sm border px-1.5 text-xs font-medium no-underline [direction:ltr]",
                    E_CLASSES[control.e] ?? "border-line-strong text-ink-2",
                  )}
                >
                  <bdi>E{control.e}</bdi>
                  <bdi className="code text-ink-2">{control.code}</bdi>
                </AppLink>
                {control.note && (
                  <span className="sr-only">
                    {" "}
                    (ثبت‌شده E{control.recorded_e}، {control.note})
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-xs text-danger">بدون کنترل مؤثر</span>
        )}
      </td>
      <td data-label="Bc" className="font-semibold tabular">
        {band(path.bc) || "-"}
      </td>
      <td data-label="B" className={cn("text-xl font-bold tabular", path.determining ? "text-gold" : "text-ink")}>
        {band(path.b) || "؟"}
      </td>
      {(path.edit_url || path.delete_url) && (
        <td data-label="کارها" className="whitespace-nowrap">
          <span className="flex gap-1">
            {path.edit_url && (
              <AppLink
                href={path.edit_url}
                aria-label={`ویرایش مسیر ${path.name}`}
                button={{ variant: "quiet", size: "icon-sm" }}
              >
                <Icon name="pencil" size={16} />
              </AppLink>
            )}
            {path.delete_url && (
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={`حذف مسیر ${path.name}`}
                className="hover:text-danger"
                onClick={() => onDelete(path)}
              >
                <Icon name="x" size={16} />
              </Button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

function PathsCard({ data }: { data: AssessmentDetail }) {
  const { likelihood, actions } = data;
  const [deleting, setDeleting] = useState<AssessmentPath | null>(null);
  const remove = useBridgeAction();
  const editable = likelihood.paths.some((path) => path.edit_url || path.delete_url);
  return (
    <Panel
      title="مسیرهای تحقق و کنترل‌ها"
      description="کنترل‌های پیشگیرانه‌ی همان مسیر؛ راه دورزدن، مسیر جدا ثبت می‌شود؛ Bc از E"
      className="table-shell overflow-clip"
      actions={
        actions.add_path && (
          <AppLink href={actions.add_path} button={{ variant: "ghost", size: "sm" }}>
            <Icon name="plus" size={16} />
            افزودن مسیر
          </AppLink>
        )
      }
    >
      {(likelihood.problems.length > 0 || likelihood.incomplete.length > 0 || likelihood.blockers.length > 0) && (
        <CardContent className="flex flex-col gap-2">
          <Reasons tone="danger" items={likelihood.problems} />
          <Reasons tone="warning" items={likelihood.incomplete} />
          <Reasons tone="info" title="برای تأیید نهایی لازم است:" items={likelihood.blockers} />
        </CardContent>
      )}
      {likelihood.paths.length ? (
        <div className="table-scroll border-t border-line">
          <table className="data-table">
            <caption className="sr-only">مسیرهای تحقق و کنترل‌ها</caption>
            <thead>
              <tr>
                <th scope="col">مسیر</th>
                <th scope="col">B0</th>
                <th scope="col">کنترل‌های پیشگیرانه (E)</th>
                <th scope="col">Bc</th>
                <th scope="col">B</th>
                {editable && (
                  <th scope="col">
                    <span className="sr-only">کارها</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {likelihood.paths.map((path) => (
                <PathRow key={path.id} path={path} onDelete={setDeleting} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-t border-line px-5 py-6 text-center text-sm text-ink-3">هنوز مسیری ثبت نشده است.</p>
      )}
      {remove.error !== null && (
        <CardContent className="pt-4">
          <ActionError error={remove.error} />
        </CardContent>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`مسیر «${deleting?.name ?? ""}» حذف شود؟`}
        description="مسیر پیش‌نویس حذف می‌شود و حذفش در تاریخچه می‌ماند."
        confirmLabel="حذف مسیر"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting?.delete_url) return;
          remove.mutate({ url: deleting.delete_url, values: {} }, { onSettled: () => setDeleting(null) });
        }}
      />
    </Panel>
  );
}

// ─────────────────────────────── ورودی‌ها (زیر مسیرها) ───────────────────────────────

function ImpactTable({ impacts }: { impacts: AssessmentImpacts }) {
  return (
    <div className="table-scroll border-t border-line">
      <table className="data-table">
        <caption className="sr-only">سطح هر بُعد پیامد برای داتین و هر بانک</caption>
        <thead>
          <tr>
            <th scope="col">بُعد</th>
            {impacts.stakeholders.map((name) => (
              <th key={name} scope="col" className="text-center">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impacts.rows.map((row) => (
            <tr key={row.code}>
              <th scope="row" data-primary className="text-start font-normal">
                <bdi className="code text-brand">{row.code}</bdi> {row.name}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={impacts.stakeholders[index]}
                  data-label={impacts.stakeholders[index]}
                  className="text-center"
                  title={cell?.rationale || undefined}
                >
                  {cell ? (
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className={cn("tabular", cell.unknown ? "text-warning" : "font-semibold text-ink")}>
                        {faText(cell.level)}
                      </span>
                      {cell.value !== null && (
                        <span className="text-xs text-ink-3">
                          {fa(cell.value)} {cell.unit}
                        </span>
                      )}
                      {cell.confidence && <span className="text-xs text-ink-3">اطمینان {cell.confidence}</span>}
                    </span>
                  ) : (
                    <span className="text-ink-3">
                      -<span className="sr-only">ثبت‌نشده</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImpactsCard({ data }: { data: AssessmentDetail }) {
  const { impacts, actions } = data;
  return (
    <Panel
      title="پروفایل پیامد"
      description={
        impacts.impact ? `I = ${band(impacts.impact)}؛ بیشترین سطح معتبر بین ابعاد و ذی‌نفعان` : "پیامد هنوز معلوم نیست"
      }
      className="table-shell overflow-clip"
      actions={
        actions.impact_profile && (
          <AppLink href={actions.impact_profile} button={{ variant: "ghost", size: "sm" }}>
            <Icon name="pencil" size={16} />
            ثبت پروفایل پیامد
          </AppLink>
        )
      }
    >
      {(impacts.problems.length > 0 || impacts.incomplete.length > 0 || impacts.missing.length > 0) && (
        <CardContent className="flex flex-col gap-2">
          <Reasons tone="danger" items={impacts.problems} />
          {impacts.incomplete.length > 0 ? (
            <Alert tone="warning" title="پیامد هنوز کران بالای قابل دفاعی ندارد.">
              خانه‌های نامعلوم یا ثبت‌نشده می‌توانند آن را بالاتر ببرند.
              {impacts.unknown.length > 0 && (
                <p className="mt-1 text-xs">نامعلوم: {faText(impacts.unknown.join("، "))}</p>
              )}
              {impacts.missing.length > 0 && (
                <p className="mt-1 text-xs">ثبت‌نشده: {faText(impacts.missing.join("، "))}</p>
              )}
            </Alert>
          ) : (
            impacts.missing.length > 0 && <Alert tone="info">ثبت‌نشده: {faText(impacts.missing.join("، "))}</Alert>
          )}
        </CardContent>
      )}
      <ImpactTable impacts={impacts} />
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
        صفر یعنی «اثر ندارد» و نامعلوم با صفر پر نمی‌شود. وقتی سطح بازه است، تصمیم بر کران بالای آن گرفته می‌شود.
      </p>
    </Panel>
  );
}

function InitiatorCard({ likelihood, edit }: { likelihood: AssessmentLikelihood; edit: string | null }) {
  const initiator = likelihood.initiator;
  const rate = initiator?.rate;
  return (
    <Panel
      title="عامل آغازگر (A)"
      actions={
        edit && (
          <AppLink href={edit} button={{ variant: "ghost", size: "sm" }}>
            <Icon name="pencil" size={16} />
            ثبت A
          </AppLink>
        )
      }
    >
      <CardContent>
        {!initiator ? (
          <p className="text-sm text-ink-3">A هنوز ثبت نشده است.</p>
        ) : (
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
            <Fact label="مسیر">{initiator.basis.label}</Fact>
            {rate && (
              <Fact label="داده">
                <span className="flex flex-col gap-1">
                  <span>
                    {fa(rate.count ?? 0)} آغازگر یکتا در {fa(rate.months ?? 0)} ماه
                    {rate.denominator && ` از ${rate.denominator}`}
                    {rate.coverage !== null && `، پوشش ثبت ${fa(rate.coverage)} درصد`}
                  </span>
                  {rate.suggestion && (
                    <span className="text-ink-3">
                      {faText(rate.suggestion.note)}
                      {rate.suggestion.level !== null && ` پیشنهاد سامانه: A${fa(rate.suggestion.level)}.`}
                    </span>
                  )}
                  {rate.insufficient.map((reason) => (
                    <span key={reason} className="text-warning">
                      {faText(reason)}
                    </span>
                  ))}
                </span>
              </Fact>
            )}
            <Fact label="A">
              {faText(likelihood.a)}
              {initiator.confidence && <span className="text-ink-3">، اطمینان {initiator.confidence}</span>}
            </Fact>
            <Fact label="دلیل">
              <span className="whitespace-pre-line">{initiator.rationale || "-"}</span>
            </Fact>
            <Fact label="شواهد">
              <CodeLinks items={initiator.evidence} />
            </Fact>
          </dl>
        )}
      </CardContent>
    </Panel>
  );
}

function ScopeCard({ data }: { data: AssessmentDetail }) {
  const { assessment } = data;
  const escalation = assessment.escalation;
  return (
    <Panel title="دامنه و فرض‌ها">
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <Fact label="ریسک">
            <AppLink href={assessment.risk.href}>
              <bdi className="code">{assessment.risk.code}</bdi> {faText(assessment.risk.title)}
            </AppLink>
          </Fact>
          <Fact label="نسخه‌ی روش">
            <AppLink href={assessment.method_version.href}>{faText(assessment.method_version.label)}</AppLink>
          </Fact>
          {assessment.horizon_rationale && <Fact label="دلیل افق">{assessment.horizon_rationale}</Fact>}
          {assessment.target_due && <Fact label="موعد تحقق هدف">{longDate(assessment.target_due)}</Fact>}
          {assessment.scope_snapshot?.service && (
            <Fact label="دامنه هنگام تأیید">
              {assessment.scope_snapshot.service}؛ {assessment.scope_snapshot.customers.map((c) => c.name).join("، ")}
            </Fact>
          )}
          <Fact label="جلسه‌ی کارگروه">
            {assessment.meeting_date ? longDate(assessment.meeting_date) : "بدون جلسه (ارزیابی عادی)"}
          </Fact>
          <Fact label="فرض‌ها">
            <span className="whitespace-pre-line">{assessment.assumptions || "-"}</span>
          </Fact>
          <Fact label="ثبت‌کننده">
            {assessment.created_by?.name}، {longDate(assessment.created_at)}
          </Fact>
          {escalation && (
            <Fact label="قاعده‌ی تقدم">
              <span className="flex flex-col gap-2">
                <span className="flex flex-wrap gap-1.5">
                  {escalation.flags.map((flag) => (
                    <Badge key={flag.label} tone={flag.tone}>
                      {flag.label}
                    </Badge>
                  ))}
                </span>
                {escalation.rationale && <span className="whitespace-pre-line">{escalation.rationale}</span>}
                <CodeLinks items={escalation.evidence} />
              </span>
            </Fact>
          )}
        </dl>
        {data.risk_details && data.risk_details.length > 0 && (
          <details className="group mt-4 border-t border-line pt-3">
            <summary className="flex cursor-pointer list-none items-center gap-1 rounded-sm text-sm font-medium text-brand [&::-webkit-details-marker]:hidden">
              <Icon name="chevron-left" size={16} className="transition-transform group-open:-rotate-90" />
              اطلاعات ریسک ({fa(data.risk_details.length)} مورد)
            </summary>
            <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
              {data.risk_details.map((row) => (
                <Fact key={row.label} label={row.label}>
                  <span className="whitespace-pre-line">{row.value || "—"}</span>
                </Fact>
              ))}
            </dl>
          </details>
        )}
      </CardContent>
    </Panel>
  );
}

// ─────────────────────────────── ستون کناری ───────────────────────────────

function ChecksCard({ checks, approved }: { checks: AssessmentCheck[] | null; approved: boolean }) {
  return (
    <Panel title="بررسی‌های پیش از تأیید" description="سامانه هنگام ارسال و دوباره هنگام تأیید چک می‌کند">
      <CardContent>
        {checks === null ? (
          <p className="text-sm text-ink-3">
            {approved ? "ارزیابی تأیید شده و همه‌ی بررسی‌ها هنگام تأیید برقرار بوده است." : "-"}
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {checks.map((check) =>
              check.ok ? (
                <li key={check.key} className="flex items-start gap-2 text-sm text-ink">
                  <Icon name="check-circle" size={16} className="mt-0.5 shrink-0 text-success" />
                  <span>
                    {faText(check.label)}
                    <span className="sr-only"> (برقرار)</span>
                  </span>
                </li>
              ) : (
                <li key={check.key} className="flex items-start gap-2 rounded-md bg-warning-subtle px-2.5 py-2">
                  <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-warning" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm text-warning">
                      {faText(check.label)}
                      <span className="sr-only"> (برقرار نیست)</span>
                    </span>
                    {check.problems.map((problem) => (
                      <span key={problem} className="text-xs text-ink-2">
                        {faText(problem)}
                      </span>
                    ))}
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </CardContent>
    </Panel>
  );
}

const CONFIDENCE: Record<AssessmentFlags["confidence_key"], { filled: number; text: string; bar: string }> = {
  "": { filled: 0, text: "text-ink-3", bar: "bg-line-strong" },
  low: { filled: 1, text: "text-danger", bar: "bg-danger" },
  medium: { filled: 2, text: "text-warning", bar: "bg-warning" },
  high: { filled: 3, text: "text-success", bar: "bg-success" },
};

function FlagsCard({ flags }: { flags: AssessmentFlags }) {
  const confidence = CONFIDENCE[flags.confidence_key];
  return (
    <Panel title="نشان‌های تقدم و اطمینان" description="هر نشان با دلیل و شاهد ثبت می‌شود">
      <CardContent className="flex flex-col gap-3">
        <dl className="flex flex-col gap-2.5">
          {flags.items.map((flag) => (
            <div key={flag.label} className="flex items-center justify-between gap-3">
              <dt className="text-sm text-ink">{flag.label}</dt>
              <dd>
                <Badge tone={flag.on ? "danger" : "neutral"}>{flag.on ? "بله" : "خیر"}</Badge>
              </dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
          <p className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink">اطمینان کلی ارزیابی</span>
            <span className={cn("font-semibold", confidence.text)}>{flags.confidence || "-"}</span>
          </p>
          <span aria-hidden className="flex gap-1">
            {[1, 2, 3].map((segment) => (
              <span
                key={segment}
                className={cn("h-1.5 flex-1 rounded-full", segment <= confidence.filled ? confidence.bar : "bg-subtle")}
              />
            ))}
          </span>
        </div>
      </CardContent>
    </Panel>
  );
}

function HistoryItem({ item }: { item: AssessmentReviewItem }) {
  const name = item.by?.name ?? "سامانه";
  return (
    <li className="flex items-start gap-2.5">
      <Avatar name={name} size={28} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <span className="text-sm font-semibold text-ink">
            {name} <span className="text-xs font-normal text-ink-3">· {item.action.label}</span>
          </span>
          <time dateTime={item.at.iso} title={dateTime(item.at)} className="text-xs text-ink-3">
            {compactTime(item.at)}
          </time>
        </p>
        {item.meeting_date && <p className="text-xs text-ink-3">جلسه‌ی کارگروه {longDate(item.meeting_date)}</p>}
        {item.notes && (
          <p className="rounded-md bg-subtle px-3 py-2 text-sm whitespace-pre-line text-ink-2">{item.notes}</p>
        )}
      </div>
    </li>
  );
}

function NotesCard({ data, decision }: { data: AssessmentDetail; decision: Decision }) {
  const { review } = data;
  const { today } = useSession();
  const { mode, notes, setNotes, meeting, setMeeting, noteError, setNoteError, noteRef, action } = decision;
  const referral = Object.fromEntries(review.referral_form.fields.map((field) => [field.name, field]));
  const textarea = (label: string, placeholder: string, hint?: string, visible = false) => (
    <Field
      label={visible ? label : <span className="sr-only">{label}</span>}
      hint={hint}
      error={noteError || undefined}
    >
      <Textarea
        ref={noteRef}
        rows={3}
        value={notes}
        placeholder={placeholder}
        disabled={action.isPending}
        onChange={(event) => {
          setNotes(event.target.value);
          if (noteError) setNoteError("");
        }}
      />
    </Field>
  );
  return (
    <Panel
      title="یادداشت‌های کنترل کیفیت"
      description={mode === "submit" ? "توضیح ارسال را کنترل‌کننده می‌بیند" : "بازگرداندن بدون یادداشت ممکن نیست"}
    >
      <CardContent className="flex flex-col gap-4">
        {review.history.length > 0 ? (
          <ol aria-label="سابقه‌ی کنترل کیفیت" className="flex flex-col gap-4">
            {review.history.map((item) => (
              <HistoryItem key={item.id} item={item} />
            ))}
          </ol>
        ) : (
          !mode && <p className="text-sm text-ink-3">هنوز یادداشتی ثبت نشده است.</p>
        )}
        {mode === "review" &&
          textarea("یادداشت برای ارزیاب", "یادداشت برای ارزیاب بنویسید…", review.review_notes.help || undefined)}
        {mode === "submit" &&
          !review.submission_problems.length &&
          textarea("توضیح برای کنترل‌کننده (اختیاری)", "یادداشت برای کنترل‌کننده بنویسید…")}
        {mode === "referral" && (
          <>
            <Field
              label={referral.meeting_date?.label ?? "تاریخ جلسه‌ی کارگروه"}
              hint={referral.meeting_date?.help || "برای تأیید با تصمیم کارگروه لازم است."}
            >
              <DatePicker
                value={meeting}
                onChange={setMeeting}
                disabled={action.isPending}
                today={parseJalali(today.jalali) ?? undefined}
              />
            </Field>
            {textarea(referral.notes?.label ?? "تصمیم کارگروه", "تصمیم کارگروه را بنویسید…", undefined, true)}
          </>
        )}
      </CardContent>
    </Panel>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

function Dossier({ data }: { data: AssessmentDetail }) {
  const decision = useDecision(data);
  const { assessment, likelihood, actions } = data;
  return (
    <article className="flex flex-col gap-4">
      <Breadcrumb items={[{ label: "ارزیابی ریسک" }, { label: assessment.code, code: true }]} />
      <RecordHeader data={data} decision={decision} />
      <StepBar steps={data.steps} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21.25rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <ChainCard data={data} />
          <PathsCard data={data} />
          <ImpactsCard data={data} />
          <InitiatorCard likelihood={likelihood} edit={actions.initiator} />
          <ScopeCard data={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <ChecksCard checks={data.checks} approved={assessment.is_approved} />
          <FlagsCard flags={data.flags} />
          <NotesCard data={data} decision={decision} />
        </div>
      </div>
    </article>
  );
}

export function AssessmentDetailPage() {
  const page = usePageData<AssessmentDetail>();
  useTitle(page.data?.title ?? "ارزیابی");
  if (!page.data) {
    return (
      <DetailState query={page} header={<PageHeader title="ارزیابی" breadcrumb={[{ label: "ارزیابی ریسک" }]} />} />
    );
  }
  return <Dossier data={page.data} />;
}
