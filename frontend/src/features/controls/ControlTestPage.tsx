import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { IconChip } from "@/components/ui/icon-chip";
import { RISK_CLASSES, riskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ControlTest, ControlTestRisk, ControlTestState } from "@/lib/types";

// «آزمون اثربخشی کنترل» به چیدمان فیگما ۲۲: چهار وضعیت جدای بخش ۱۶، طرح آزمون و نتیجه‌ی نمونه‌ها، نردبان E با
// شروط سطح هدف؛ و در ستون کناری اثر E این آزمون بر Bc مسیرهای ریسک‌های وابسته، شواهد آزمون و قواعد شاهد کنترل.

const PREVIEW = 8;

const STATE: Record<
  ControlTestState,
  { icon: "check-circle" | "warning" | "x-circle"; tone: "success" | "warning" | "danger" }
> = {
  met: { icon: "check-circle", tone: "success" },
  partial: { icon: "warning", tone: "warning" },
  unmet: { icon: "x-circle", tone: "danger" },
};

function StatusCards({ data }: { data: ControlTest }) {
  return (
    <ul aria-label="چهار وضعیت کنترل" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {data.cards.map((item) => {
        const state = STATE[item.state];
        return (
          <li key={item.key} className="flex flex-col gap-2.5 rounded-lg border border-line bg-panel p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <IconChip icon={state.icon} tone={state.tone} size="sm" />
                <h2 className="text-sm font-semibold text-ink">{item.label}</h2>
              </span>
              <Chip tone={state.tone}>{item.state_label}</Chip>
            </div>
            <p className="text-sm leading-6 text-ink-2">{item.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

function TestPlan({ data }: { data: ControlTest }) {
  return (
    <SectionPanel
      title="طرح آزمون"
      description="تعداد و تنوع نمونه با اهمیت کنترل و تنوع شرایط اجرا تعیین شده است"
      aside={data.plan.kind ? <Chip tone="info">{data.plan.kind}</Chip> : undefined}
    >
      <dl className="flex flex-col divide-y divide-line">
        {data.plan.rows.map((row) => (
          <div key={row.label} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-ink-3">{row.label}</dt>
            <dd className="text-sm font-medium text-ink">{row.value}</dd>
          </div>
        ))}
        {data.plan.paths.length > 0 && (
          <div className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <dt className="text-sm text-ink-3">مسیرهای آزموده</dt>
            <dd className="flex flex-wrap gap-1.5">
              {data.plan.paths.map((path) => (
                <Chip key={path.name} tone={path.passed ? "success" : "danger"}>
                  <Icon name={path.passed ? "check" : "x-circle"} size={12} />
                  {path.name}
                  <span className="sr-only">{path.passed ? " (موفق)" : " (با استثنا)"}</span>
                </Chip>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </SectionPanel>
  );
}

function SampleResults({ data }: { data: ControlTest }) {
  const [all, setAll] = useState(false);
  const rows = data.results.rows;
  // پیش‌نمایش: همه‌ی استثناها و نخستین نمونه‌های موفق تا ۸ ردیف، به ترتیب تاریخ
  const failed = new Set(rows.filter((row) => !row.passed).map((row) => row.id));
  const room = Math.max(0, PREVIEW - failed.size);
  const passed = new Set(
    rows
      .filter((row) => row.passed)
      .slice(0, room)
      .map((row) => row.id),
  );
  const visible = all ? rows : rows.filter((row) => failed.has(row.id) || passed.has(row.id));
  return (
    <section aria-labelledby="samples-title" className="overflow-hidden rounded-lg border border-line bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex flex-col gap-1">
          <h2 id="samples-title" className="text-h3 font-semibold text-ink">
            نتایج نمونه‌ها
          </h2>
          {data.results.summary && <span className="text-sm text-ink-3">{data.results.summary}</span>}
        </span>
        {rows.length > visible.length || all ? (
          <Button variant="link" size="sm" onClick={() => setAll(!all)} aria-expanded={all}>
            <Icon name="list" />
            {all ? "فقط استثناها و نمونه‌ی نخست" : `همه‌ی ${fa(rows.length)} نمونه`}
          </Button>
        ) : null}
      </header>
      {rows.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">نتیجه‌ی نمونه‌های آزموده</caption>
            <thead>
              <tr>
                <th scope="col">شناسه‌ی نمونه</th>
                <th scope="col">تاریخ</th>
                <th scope="col">مسیر</th>
                <th scope="col">انجام‌دهنده</th>
                <th scope="col">نتیجه</th>
                <th scope="col">شرح استثنا</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className={cn(!row.passed && "bg-danger-subtle")}>
                  <td data-primary>
                    <bdi className="code text-xs">{row.reference}</bdi>
                  </td>
                  <td data-label="تاریخ" className="text-sm whitespace-nowrap text-ink-2 tabular">
                    {fa(row.date.jalali)}
                  </td>
                  <td data-label="مسیر" className="text-sm whitespace-nowrap text-ink-2">
                    {row.path}
                  </td>
                  <td data-label="انجام‌دهنده" className="text-sm whitespace-nowrap text-ink-2">
                    {row.performer ?? "—"}
                  </td>
                  <td data-label="نتیجه">
                    <Chip tone={row.passed ? "success" : "danger"}>{row.passed ? "موفق" : "استثنا"}</Chip>
                  </td>
                  <td
                    data-label="شرح استثنا"
                    data-wide
                    className={cn("text-sm", row.note ? "text-danger" : "text-ink-3")}
                  >
                    {row.note ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-ink-3">نمونه‌ای برای این آزمون ثبت نشده است.</p>
      )}
    </section>
  );
}

function Ladder({ data }: { data: ControlTest }) {
  const { ladder } = data;
  return (
    <SectionPanel
      title="نردبان اثربخشی E"
      description="سطح E با احراز همه‌ی شروط تعیین می‌شود؛ میانگین خوب، شکست یک شرط کلیدی را نمی‌پوشاند"
    >
      <div className="flex flex-col gap-4">
        <ol aria-label="سطح‌های E" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {ladder.levels.map((level) => {
            const current = level.value === ladder.current;
            const target = level.value === ladder.target;
            const previous = level.value === ladder.previous;
            const tags = [target && "هدف", previous && "قبلی"].filter(Boolean).join(" · ");
            return (
              <li
                key={level.value}
                aria-current={current ? "step" : undefined}
                title={[level.name, level.criteria].filter(Boolean).join(": ")}
                className={cn(
                  "flex min-h-20 flex-col gap-1.5 rounded-lg border p-3",
                  current
                    ? "border-warning bg-warning-subtle"
                    : target || previous
                      ? "border-brand bg-panel"
                      : "border-line bg-panel",
                )}
              >
                <span className="flex items-center justify-between gap-1">
                  <span
                    className={cn("text-sm font-bold", current ? "text-warning" : target ? "text-brand" : "text-ink")}
                  >
                    E{level.value}
                  </span>
                  {current ? (
                    <span className="text-xs font-semibold text-warning">فعلی</span>
                  ) : tags ? (
                    <span className="rounded-full bg-brand-subtle px-1.5 text-xs font-semibold text-brand">{tags}</span>
                  ) : null}
                </span>
                <span className="text-xs leading-5 text-ink-2">{level.text}</span>
              </li>
            );
          })}
        </ol>
        {ladder.target && ladder.conditions.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink">
              شروط E{ladder.target} برای <bdi className="code">{data.control.code}</bdi>
            </h3>
            <ul className="flex flex-col gap-2">
              {ladder.conditions.map((condition) => (
                <li key={condition.key} className="flex items-start gap-2 text-sm text-ink">
                  <Icon
                    name={condition.met ? "check-circle" : "x-circle"}
                    size={18}
                    className={cn("mt-0.5 shrink-0", condition.met ? "text-success" : "text-danger")}
                  />
                  <span>
                    <span className="sr-only">{condition.met ? "برقرار: " : "برقرار نیست: "}</span>
                    {condition.label}
                    {condition.note && <span className="text-ink-2"> — {condition.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-4 py-3 text-sm leading-6 text-ink">
          <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-warning" />
          <span>
            {data.results.rate && <>نرخ موفقیت {data.results.rate}٪ است؛ </>}
            {ladder.rationale}
          </span>
        </p>
      </div>
    </SectionPanel>
  );
}

function ScoreBox({ risk }: { risk: ControlTestRisk }) {
  const tone = risk.level ? RISK_CLASSES[riskKey(risk.level)] : null;
  return (
    <span
      className={cn(
        "grid h-8 min-w-10 shrink-0 place-items-center rounded-md border-2 px-2 text-sm font-semibold tabular",
        tone ? cn(tone.border, tone.bg, tone.fg) : "border-line text-ink-3",
      )}
      title={risk.level ? `امتیاز ${risk.approved ? "تأییدشده" : "محاسبه‌شده"}، سطح ${risk.level.name}` : undefined}
    >
      {risk.score ?? "—"}
    </span>
  );
}

function Dependents({ data }: { data: ControlTest }) {
  if (!data.risks.length && !data.others.length) return null;
  return (
    <SectionPanel
      title="اثر بر ریسک‌های وابسته"
      description="در هر مسیر، B کمینه‌ی B0 و Bc است و B نهایی بیشینه‌ی مسیرهاست"
      bodyClassName="flex flex-col gap-4"
    >
      {data.risks.map((risk) => (
        <article key={risk.id} aria-label={`${risk.code} ${risk.title}`} className="flex flex-col gap-3">
          <header className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <AppLink href={risk.href} className="code text-xs text-ink-2 hover:text-brand">
                {risk.code}
              </AppLink>
              <span className="text-sm font-semibold text-ink">{risk.title}</span>
            </span>
            <ScoreBox risk={risk} />
          </header>
          {risk.paths.map((path) => (
            <div key={path.id} className="flex flex-col gap-1 border-t border-line pt-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{path.name}</span>
                <span className="flex gap-1.5">
                  {path.b0 && <Chip>B0 {path.b0}</Chip>}
                  {path.bc && (
                    <Chip tone={path.bc_before ? "warning" : "neutral"}>
                      Bc {path.bc_before ? `از ${path.bc_before} به ${path.bc}` : path.bc}
                    </Chip>
                  )}
                </span>
              </div>
              <p className="text-xs leading-5 text-ink-3">{path.note}</p>
            </div>
          ))}
          {(risk.b || risk.score) && (
            <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-subtle px-3 py-2 text-sm">
              <div className="flex gap-1.5">
                <dt className="text-ink-2">مقدار B جاری</dt>
                <dd className="font-semibold text-ink">
                  {risk.b ?? "—"}
                  {risk.b_change && ` · ${risk.b_change}`}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-2">L</dt>
                <dd className="font-semibold text-ink">{risk.l ?? "—"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-ink-2">امتیاز</dt>
                <dd className="font-semibold text-ink">
                  {risk.score ?? "—"} {risk.level?.name}
                </dd>
              </div>
            </dl>
          )}
          {risk.alert && (
            <p
              role="note"
              className="flex items-start gap-2 rounded-lg bg-danger-subtle px-3 py-2.5 text-sm leading-6 text-ink"
            >
              <Icon name="lightning" size={16} className="mt-1 shrink-0 text-danger" />
              {risk.alert}
            </p>
          )}
        </article>
      ))}
      {data.others.length > 0 && (
        <ul
          aria-label="ریسک‌های دیگر با همین کنترل"
          className="flex flex-col divide-y divide-line border-t border-line"
        >
          {data.others.map((risk) => (
            <li key={risk.id} className="flex items-center gap-3 py-2.5">
              <AppLink href={risk.href} className="code shrink-0 text-xs text-ink-2 hover:text-brand">
                {risk.code}
              </AppLink>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{risk.scope}</span>
              <Chip tone={risk.tone}>{risk.state}</Chip>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

const EVIDENCE_TONE = { current: "success", stale: "warning", superseded: "neutral" } as const;

function Evidence({ data }: { data: ControlTest }) {
  return (
    <SectionPanel
      title="شواهد آزمون"
      description={`قدمت مجاز شاهد ${data.evidence_age} روز${
        data.valid_until ? ` · معتبر تا ${fa(data.valid_until.jalali)}` : ""
      }`}
      aside={
        data.edit_url ? (
          <Button asChild variant="link" size="sm">
            <AppLink href={data.edit_url}>
              <Icon name="plus" />
              افزودن
            </AppLink>
          </Button>
        ) : undefined
      }
    >
      {data.evidence.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {data.evidence.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <IconChip icon="paperclip" tone="neutral" size="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <AppLink href={item.href} className="truncate text-sm font-medium text-ink hover:text-brand">
                  {item.title}
                </AppLink>
                <span className="text-xs text-ink-3">
                  ثبت {fa(item.observed_on.jalali)} · {item.kind} · <bdi className="code">{item.code}</bdi>
                </span>
              </span>
              <Chip tone={EVIDENCE_TONE[item.state]}>{item.state_label}</Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-3">شاهدی پیوست نشده است؛ کنترل بدون شاهد E1 است.</p>
      )}
    </SectionPanel>
  );
}

function Rules({ data }: { data: ControlTest }) {
  return (
    <SectionPanel title="قواعد شاهد کنترل" description="بخش ۱۴ روش">
      <ul className="flex flex-col divide-y divide-line">
        {data.rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2 py-2.5 text-sm text-ink">
            <Icon name="check" size={16} className="mt-0.5 shrink-0 text-brand" />
            {rule}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

export function ControlTestPage() {
  const { pk } = useParams();
  const query = useQuery({
    queryKey: ["control-test", pk],
    queryFn: ({ signal }) => get<ControlTest>(`controls/effectiveness/${pk}/test/`, signal),
  });
  const data = query.data;
  useTitle(data ? `آزمون اثربخشی کنترل ${data.control.code}` : "آزمون اثربخشی کنترل");

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;

  const low = data.e.value <= 2;
  const parts = [
    data.control.title,
    data.control.owner && `مسئول کنترل: ${data.control.owner.name}`,
    data.tester && `آزمون‌گر مستقل: ${data.tester.name}`,
    data.period.from && data.period.to && `دوره‌ی آزمون ${fa(data.period.from.jalali)} تا ${fa(data.period.to.jalali)}`,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`آزمون اثربخشی کنترل ${data.control.code}`}
        breadcrumb={[{ label: "آنالیز ریسک" }, { label: `آزمون کنترل ${data.control.code}` }]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Chip tone={low ? "warning" : "success"}>
              {data.e.name} · E{data.e.value}
            </Chip>
            {data.previous && (
              <AppLink href={data.previous.href} className="no-underline">
                <Chip>قبلی: E{data.previous.e}</Chip>
              </AppLink>
            )}
            {data.suspended && <Chip tone="danger">معلق</Chip>}
          </span>
        }
        description={parts.join(" · ")}
        actions={
          <>
            {data.edit_url && (
              <Button asChild variant="link">
                <AppLink href={data.edit_url}>
                  <Icon name="paperclip" />
                  افزودن شاهد
                </AppLink>
              </Button>
            )}
            {data.new_test_url && (
              <Button asChild variant="primary">
                <AppLink href={data.new_test_url}>
                  <Icon name="check" />
                  ثبت نتیجه‌ی آزمون
                </AppLink>
              </Button>
            )}
          </>
        }
      />
      <StatusCards data={data} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <TestPlan data={data} />
          <SampleResults data={data} />
          <Ladder data={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Dependents data={data} />
          <Evidence data={data} />
          <Rules data={data} />
        </div>
      </div>
    </div>
  );
}
