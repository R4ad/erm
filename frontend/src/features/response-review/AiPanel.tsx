import {
  ChartNoAxesColumnIncreasing,
  Circle,
  CircleCheck,
  Clock,
  Layers,
  Link as LinkIcon,
  LoaderCircle,
  Lock,
  Plus,
  Route,
  Search,
  Sparkles,
  TriangleAlert,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { ago, fa } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { AiRunState, ResponseReview, ReviewRisk, ReviewRisks } from "@/lib/types";

import { PROMPT_VERSION_LABEL, secondsLeft, sourceText, stageLabels } from "./review";

// ستون کناری صفحه‌ی بررسی: کارت «شناسایی هوشمند» پیش از اجرا (12a)، حالت‌های در حال شناسایی، ریسکی ساخته نشد و خطا
// (12b)، و پنل «ریسک‌های پیشنهادی» (12c). همه‌ی کارت‌ها ۴۵۲ پیکسل، گوشه‌ی ۱۴ و سایه‌ی کارت‌اند.

const panel = "flex flex-col overflow-hidden rounded-card shadow-card";

/** تصویر کارت هوشمند: فهرست پاسخ‌ها ← نشان sparkle ← سند ریسک (خطی، سبز برند با نقطه‌ی نارنجی). */
function AiIllustration() {
  return (
    <svg
      viewBox="0 0 450 148"
      aria-hidden
      focusable="false"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <path d="M0 120 L450 60 L450 148 L0 148 Z" className="fill-panel opacity-50" />
      <g className="fill-panel stroke-brand stroke-[2.5]">
        <rect x="84" y="36" width="52" height="16" rx="8" />
        <rect x="84" y="66" width="52" height="16" rx="8" />
        <rect x="84" y="96" width="52" height="16" rx="8" />
      </g>
      <path
        d="M94 44 H126 M94 74 H126 M94 104 H126"
        className="stroke-brand-subtle-strong stroke-[3]"
        strokeLinecap="round"
      />
      <path
        d="M136 44 H160 V104 H136 M160 74 H184"
        className="fill-none stroke-brand stroke-[2.5]"
        strokeLinejoin="round"
      />
      <circle cx="212" cy="74" r="28" className="fill-panel stroke-brand stroke-[2.5]" />
      <path
        d="M212 58 L216 70 L228 74 L216 78 L212 90 L208 78 L196 74 L208 70 Z"
        className="fill-none stroke-brand stroke-[2.5]"
        strokeLinejoin="round"
      />
      <path d="M224 60 V66 M221 63 H227" className="stroke-tangerine-bright stroke-2" strokeLinecap="round" />
      <circle cx="260" cy="74" r="4" className="fill-tangerine-bright" />
      <path d="M268 74 H306" className="fill-none stroke-tangerine-bright stroke-2 [stroke-dasharray:3_5]" />
      <rect x="314" y="34" width="56" height="80" rx="6" className="fill-panel stroke-brand stroke-[2.5]" />
      <path
        d="M326 52 H358 M326 64 H358 M326 76 H358 M326 88 H358 M326 100 H346"
        className="stroke-brand stroke-2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IntroCard({ data, onStart, starting }: { data: ResponseReview; onStart: () => void; starting: boolean }) {
  const points: { icon: ReactNode; text: string }[] = [
    { icon: <Route />, text: "به ازای هر پیامد متمایز، یک ریسک ساخته می‌شود" },
    { icon: <Layers />, text: "عامل آغازگر، مسیر تحقق، رویداد هدف و پیامد هر ریسک از پاسخ‌ها جدا می‌شود" },
    { icon: <LinkIcon />, text: "روش شناسایی و پیوند به پاسخ منبع خودکار ثبت می‌شود" },
  ];
  return (
    <Card role="region" aria-labelledby="ai-intro-title" className={cn(panel, "border-brand-subtle-strong")}>
      <div className="h-[9.25rem] bg-brand-subtle">
        <AiIllustration />
      </div>
      <div className="flex flex-col gap-3 p-5">
        <p className="flex items-center gap-1.5 text-sm font-medium text-tangerine">
          <Sparkles aria-hidden className="size-4" />
          شناسایی هوشمند
        </p>
        <h2 id="ai-intro-title" className="text-h3 font-semibold text-ink">
          ریسک‌های این پاسخنامه را هوشمند استخراج کنید
        </h2>
        <p className="text-sm leading-6 text-ink-2">
          پاسخ‌ها با پرامپت استاندارد شناسایی ریسک تحلیل می‌شوند و هر سناریو با وضعیت «پیش‌نویس AI» ثبت می‌شود. هیچ
          ریسکی بدون تأیید شما وارد رجیستر نمی‌شود.
        </p>
        <ul className="flex flex-col gap-2">
          {points.map((point) => (
            <li key={point.text} className="flex items-start gap-2.5 text-sm text-ink">
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-[1.375rem] shrink-0 items-center justify-center rounded-md bg-brand-subtle text-brand [&_svg]:size-3.5"
              >
                {point.icon}
              </span>
              {point.text}
            </li>
          ))}
        </ul>
        <Button variant="primary" className="mt-1 w-full" onClick={onStart} loading={starting}>
          <Sparkles aria-hidden />
          شناسایی هوشمند ریسک‌ها
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-ink-3">
          <Clock aria-hidden className="size-3.5" />
          {`حدود ${fa(30)} ثانیه · پرامپت شناسایی نسخه‌ی ${PROMPT_VERSION_LABEL(data.run?.prompt_version || "v3")}`}
        </p>
      </div>
    </Card>
  );
}

function RunningCard({ run, onCancel, cancelling }: { run: AiRunState; onCancel: () => void; cancelling: boolean }) {
  const now = useNow();
  const labels = stageLabels(run.facts);
  const current = Math.max(1, run.stage);
  return (
    <Card role="region" aria-labelledby="ai-running-title" className={cn(panel, "gap-4 p-5")}>
      <div className="flex items-center gap-3">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-tangerine-subtle text-tangerine">
          <Sparkles aria-hidden className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 id="ai-running-title" className="text-h3 font-semibold text-ink">
            در حال شناسایی ریسک‌ها…
          </h2>
          <p className="text-xs text-ink-3">{`حدود ${fa(secondsLeft(run.created_at.iso, now))} ثانیه‌ی دیگر`}</p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-labelledby="ai-running-title"
        aria-valuemin={0}
        aria-valuemax={run.stages}
        aria-valuenow={current - 1}
        className="h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200 ease-out motion-reduce:transition-none"
          style={{ width: `${((current - 0.5) / run.stages) * 100}%` }}
        />
      </div>
      <ol className="flex flex-col gap-3">
        {labels.map((label, index) => {
          const step = index + 1;
          const state = step < current ? "done" : step === current ? "current" : "next";
          return (
            <li
              key={label}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                state === "done" && "text-ink",
                state === "current" && "font-semibold text-ink",
                state === "next" && "text-ink-3",
              )}
            >
              {state === "done" && <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />}
              {state === "current" && (
                <LoaderCircle
                  aria-hidden
                  className="size-4 shrink-0 animate-spin text-brand motion-reduce:animate-none"
                />
              )}
              {state === "next" && <Circle aria-hidden className="size-4 shrink-0 text-line-strong" />}
              {label}
            </li>
          );
        })}
      </ol>
      <p role="status" className="sr-only">
        {labels[current - 1]}
      </p>
      <div aria-hidden className="flex flex-col gap-2 rounded-item bg-subtle p-3">
        <Skeleton className="h-2.5 w-1/4 self-start" />
        <Skeleton className="h-3 w-3/4 self-start" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-5/6" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-ink-3">می‌توانید صفحه را ترک کنید؛ نتیجه با اعلان خبر داده می‌شود.</p>
        <Button variant="ghost" size="sm" onClick={onCancel} loading={cancelling}>
          لغو
        </Button>
      </div>
    </Card>
  );
}

function StateCard({
  id,
  icon,
  iconClass,
  title,
  children,
}: {
  id: string;
  icon: ReactNode;
  iconClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card role="region" aria-labelledby={id} className={cn(panel, "items-center gap-3 px-6 pt-7 pb-6 text-center")}>
      <span className={cn("inline-flex size-12 items-center justify-center rounded-full [&_svg]:size-5", iconClass)}>
        {icon}
      </span>
      <h2 id={id} className="text-h3 font-semibold text-ink">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function EmptyCard({ data, returnAction }: { data: ResponseReview; returnAction?: ReactNode }) {
  return (
    <StateCard
      id="ai-empty-title"
      icon={<Search aria-hidden />}
      iconClass="bg-subtle text-ink-2"
      title="ریسکی ساخته نشد"
    >
      <p className="text-sm leading-6 text-ink-2">
        هیچ پیامدی در این پاسخنامه به‌اندازه‌ی کافی روشن نیست. پاسخنامه را با پرسش‌های تکمیلی بازگردانید یا ریسک را دستی
        ثبت کنید.
      </p>
      <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
        {returnAction}
        <Link to={data.manual_route} viewTransition className={buttonClasses({ variant: "ghost", size: "sm" })}>
          <Plus aria-hidden />
          ثبت دستی ریسک
        </Link>
      </div>
    </StateCard>
  );
}

function ErrorCard({ run, onRetry, retrying }: { run: AiRunState; onRetry?: () => void; retrying: boolean }) {
  return (
    <StateCard
      id="ai-error-title"
      icon={<TriangleAlert aria-hidden />}
      iconClass="bg-danger-subtle text-danger"
      title="شناسایی هوشمند انجام نشد"
    >
      <p className="text-sm leading-6 text-ink-2">
        سرویس تحلیل پاسخ نداد. پاسخنامه تغییری نکرده است؛ چند دقیقه‌ی دیگر دوباره تلاش کنید.
      </p>
      {onRetry && (
        <Button variant="primary" className="mt-1" onClick={onRetry} loading={retrying}>
          <Zap aria-hidden />
          تلاش دوباره
        </Button>
      )}
      {run.error_code && (
        <p className="text-xs text-ink-3">
          کد پیگیری: <bdi className="code text-ink-2">{run.error_code}</bdi>
        </p>
      )}
    </StateCard>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.625rem_minmax(0,1fr)] gap-x-3">
      <dt className="pt-0.5 text-xs text-ink-3">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export interface RiskActions {
  /** دکمه‌های تأیید، ویرایش و رد زیر ریسک انتخاب‌شده (برش و). */
  render?: (risk: ReviewRisk) => ReactNode;
  /** پیوند «مقایسه با ریسک موجود» (برش و). */
  compare?: (risk: ReviewRisk) => void;
}

function RiskCard({ data, risk, actions }: { data: ResponseReview; risk: ReviewRisk; actions?: RiskActions }) {
  const similar = risk.similar[0];
  return (
    <article
      aria-labelledby={`risk-${risk.id}-title`}
      aria-current="true"
      className="flex flex-col gap-3 rounded-item border-[1.5px] border-brand bg-panel px-4 py-3.5 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AiChip>{risk.status.label}</AiChip>
        {risk.confidence && (
          <span className="inline-flex items-center gap-1 text-xs text-ink-2">
            <ChartNoAxesColumnIncreasing aria-hidden strokeWidth={3} className="size-4 text-success" />
            {risk.confidence.label}
          </span>
        )}
      </div>
      <h3 id={`risk-${risk.id}-title`} className="text-h3 font-semibold text-ink">
        {risk.title}
      </h3>
      <dl className="flex flex-col gap-2.5">
        <Row label="عامل آغازگر">{risk.initiating_factor}</Row>
        <Row label="مسیر تحقق">
          <ol className="flex flex-col gap-1.5">
            {risk.paths.map((path) => (
              <li key={path.number} className="flex items-start gap-2">
                <span
                  aria-label={`مسیر ${fa(path.number)}`}
                  className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-medium text-brand"
                >
                  {fa(path.number)}
                </span>
                <span>{path.text}</span>
              </li>
            ))}
          </ol>
        </Row>
        <Row label="رویداد هدف">{risk.target_event}</Row>
        <Row label="پیامد">
          {risk.impact}
          <span className="mt-0.5 block text-xs text-ink-3">{`${risk.impact_type} · ${risk.impact_scope}`}</span>
        </Row>
        <Row label="دسته‌ی ریسک">
          <span className="flex flex-wrap items-center gap-2">
            {risk.category ? (
              <span className="inline-flex h-[1.375rem] items-center rounded-full bg-subtle px-2 text-xs font-medium text-ink">
                {risk.category.name}
              </span>
            ) : (
              "—"
            )}
            {risk.category_suggested && <span className="text-xs font-medium text-tangerine">پیشنهاد AI</span>}
          </span>
        </Row>
        <Row label="روش شناسایی">
          <span className="flex flex-wrap items-center gap-1.5">
            <Lock aria-hidden className="size-3.5 text-ink-3" />
            پاسخنامه <bdi className="code text-xs text-ink">{data.code}</bdi>
            <span className="text-xs text-ink-3">· خودکار</span>
          </span>
        </Row>
      </dl>
      <p className="flex items-center gap-1.5 text-xs font-medium text-brand">
        <LinkIcon aria-hidden className="size-3.5" />
        {`منبع: ${sourceText(risk)}`}
      </p>
      {similar && (
        <div className="flex items-start gap-2 rounded-[0.625rem] bg-warning-subtle p-3 text-sm text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <div className="flex flex-col items-start gap-1">
            <p>
              {`مشابه ریسک موجود «${similar.title}» (`}
              <bdi className="code">{similar.code}</bdi>
              {`) · ${fa(similar.percent)}٪ شباهت`}
            </p>
            {actions?.compare && (
              <Button
                variant="link"
                className="text-sm font-medium text-tangerine"
                onClick={() => actions.compare?.(risk)}
              >
                مقایسه با ریسک موجود
              </Button>
            )}
          </div>
        </div>
      )}
      {actions?.render?.(risk)}
    </article>
  );
}

function CompactRisk({ risk, onSelect }: { risk: ReviewRisk; onSelect?: () => void }) {
  const approved = risk.status.value === "converted";
  const chip = approved ? (
    <span className="inline-flex h-[1.375rem] items-center gap-1 rounded-full bg-success-subtle px-2 text-xs font-medium text-success">
      <CircleCheck aria-hidden className="size-3.5" />
      {risk.status.label}
    </span>
  ) : (
    <span
      className={cn(
        "inline-flex h-[1.375rem] items-center gap-1 rounded-full px-2 text-xs font-medium",
        risk.status.value === "pending" ? "bg-tangerine-subtle text-tangerine" : "bg-subtle text-ink-2",
      )}
    >
      {risk.status.value === "pending" && <Sparkles aria-hidden className="size-3.5" />}
      {risk.status.label}
    </span>
  );
  const now = useNow();
  const source = sourceText(risk, false);
  let meta: ReactNode = source;
  if (approved) {
    // کد در انتهای خط می‌آید، همان جایی که فریم 12c نشانش می‌دهد؛ در ۱۰ ثانیه‌ی بازگردانی ریسک هنوز کدی ندارد.
    meta = (
      <>
        {source}
        {risk.decided_by && risk.decided_at && ` · تأیید توسط ${risk.decided_by.name}، ${ago(risk.decided_at, now)}`}
        {risk.risk && (
          <>
            {" · "}
            <bdi className="code">{risk.risk.code}</bdi>
          </>
        )}
      </>
    );
  } else if (risk.status.value === "dismissed" && risk.decided_by && risk.decided_at) {
    meta = `${source} · رد توسط ${risk.decided_by.name}، ${ago(risk.decided_at, now)}`;
  }
  // درون دکمه فقط محتوای جمله‌ای مجاز است؛ پس کارت فشرده‌ی قابل انتخاب span دارد و کارت تصمیم‌گرفته عنوان h3.
  const Title = onSelect ? "span" : "h3";
  const body = (
    <>
      <span className="flex flex-wrap items-center justify-between gap-2">
        {chip}
        {approved && risk.risk && (
          <Link
            to={risk.risk.route}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            مشاهده‌ی ریسک
            <Icon name="arrow-left" size={14} className="ltr:rotate-180" />
          </Link>
        )}
      </span>
      <Title className="block text-sm font-semibold text-ink">{risk.title}</Title>
      <span className="block text-xs text-ink-3">{meta}</span>
    </>
  );
  const box =
    "flex w-full flex-col items-stretch gap-1.5 rounded-item border border-line bg-panel px-3.5 py-3 text-start";
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={cn(box, "transition-colors duration-150 hover:border-brand-subtle-strong hover:bg-brand-subtle/40")}
      >
        {body}
      </button>
    );
  }
  return <article className={box}>{body}</article>;
}

export function ResultsCard({
  data,
  risks,
  selectedId,
  onSelect,
  actions,
  reanalyse,
}: {
  data: ResponseReview;
  risks: ReviewRisks;
  selectedId: number | null;
  onSelect: (id: number) => void;
  actions?: RiskActions;
  reanalyse?: ReactNode;
}) {
  const now = useNow();
  const { counts } = risks;
  const summary = [`${fa(counts.approved)} تأییدشده`, `${fa(counts.pending)} منتظر تصمیم شما`];
  if (counts.dismissed) summary.splice(1, 0, `${fa(counts.dismissed)} ردشده`);
  if (risks.analysed_at) summary.push(`تحلیل ${ago(risks.analysed_at, now)}`);
  return (
    <Card role="region" aria-labelledby="ai-results-title" className={panel}>
      <div className="flex flex-col gap-2.5 px-5 pt-4 pb-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden className="size-[1.125rem] text-tangerine" />
            <h2 id="ai-results-title" className="text-h3 font-semibold text-ink">
              ریسک‌های پیشنهادی
            </h2>
            <span className="inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-full bg-subtle px-1.5 text-xs font-medium text-ink-2">
              {fa(counts.total)}
            </span>
          </div>
          {reanalyse}
        </div>
        <p className="text-xs text-ink-3">{summary.join(" · ")}</p>
        <p className="flex items-center gap-1.5 rounded-lg bg-brand-subtle px-2.5 py-1.5 text-sm font-medium text-brand">
          <Route aria-hidden className="size-4" />
          {`${fa(data.answers.paths)} مسیر تحقق ← ${fa(data.answers.impacts)} پیامد متمایز ← ${fa(counts.total)} ریسک`}
        </p>
        <div aria-hidden className="flex gap-1">
          {Array.from({ length: counts.total }, (_, index) => (
            <span
              key={index}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-200",
                index < counts.approved + counts.dismissed ? "bg-brand" : "bg-line",
              )}
            />
          ))}
        </div>
      </div>
      <ul className="flex flex-col gap-2.5 border-y border-line bg-subtle p-3">
        {risks.risks.map((risk) => (
          <li key={risk.id}>
            {risk.status.value === "pending" && risk.id === selectedId ? (
              <RiskCard data={data} risk={risk} actions={actions} />
            ) : (
              <CompactRisk
                risk={risk}
                onSelect={risk.status.value === "pending" ? () => onSelect(risk.id) : undefined}
              />
            )}
          </li>
        ))}
      </ul>
      <p className="flex items-start gap-2 px-5 pt-3 pb-3.5 text-xs leading-5 text-ink-3">
        <Icon name="info" size={16} className="shrink-0 text-ink-3" />
        با تصمیم درباره‌ی همه‌ی ریسک‌ها، پاسخنامه «شناسایی‌شده» می‌شود؛ اگر همه رد شوند، «بررسی‌شده».
      </p>
    </Card>
  );
}

/** چیپ نارنجی «پیشنهاد AI» با sparkle (12c، 12d و 12e). */
export function AiChip({ children = "پیشنهاد AI" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex h-[1.375rem] items-center gap-1 rounded-full bg-tangerine-subtle px-2 text-xs font-medium text-tangerine">
      <Sparkles aria-hidden className="size-3.5" />
      {children}
    </span>
  );
}

export { EmptyCard, ErrorCard, IntroCard, RunningCard };
