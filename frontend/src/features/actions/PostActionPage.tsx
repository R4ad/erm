import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { PostAction, PostActionCard, PostActionDecision } from "@/lib/types";

// «ارزیابی پس از اقدام» به چیدمان فیگما ۲۵: چهار کارت ذاتی ← جاری قبلی ← هدف طرح ← جاری جدید؛ مسیرهای احتمال و
// پروفایل پیامد پنج‌بعدی در ستون اصلی؛ نتیجه، تصمیم مالک، شواهد و قواعد بخش ۲۰ در ستون کناری.

function LevelDot({ card }: { card: PostActionCard }) {
  if (!card.level) return null;
  const tone = RISK_CLASSES[riskKey(card.level)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone.bg,
        tone.fg,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {card.level.name}
    </span>
  );
}

function ScoreBox({ card }: { card: PostActionCard }) {
  const tone = card.level ? RISK_CLASSES[riskKey(card.level)] : null;
  return (
    <span
      className={cn(
        "grid h-8 min-w-10 place-items-center rounded-md border-2 px-2 text-sm font-semibold tabular",
        tone ? cn(tone.border, tone.bg, tone.fg) : "border-line",
      )}
    >
      {card.score}
    </span>
  );
}

function AssessmentCard({ card }: { card: PostActionCard }) {
  const factors: [string, string][] = [
    ["A", card.a],
    ["B", card.b],
    ["L", card.l],
    ["I", card.i],
  ];
  return (
    <section
      aria-label={card.title}
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-3 rounded-lg p-4",
        card.current ? "border-2 border-brand bg-panel" : "border border-line bg-subtle",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <h2 className={cn("text-sm font-semibold", card.current ? "text-brand" : "text-ink")}>{card.title}</h2>
          <span className="text-xs text-ink-3">{card.hint}</span>
        </span>
        {card.chip && (
          <Chip tone={card.chip.tone}>
            {card.chip.tone === "success" && <Icon name="check" size={12} />}
            {card.chip.label}
          </Chip>
        )}
      </div>
      <dl className="grid grid-cols-4 gap-1.5" dir="ltr">
        {factors.map(([label, value]) => (
          <div key={label} className="flex flex-col items-center gap-0.5 rounded-md border border-line bg-panel py-1.5">
            <dt className="text-[0.6875rem] text-ink-3">{label}</dt>
            <dd className="text-base font-semibold text-ink tabular">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-2">
        <span className="me-auto text-xs text-ink-3">امتیاز و سطح</span>
        <ScoreBox card={card} />
        <LevelDot card={card} />
      </div>
    </section>
  );
}

function Cards({ data }: { data: PostAction }) {
  return (
    <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
      {data.cards.map((card, index) => (
        <Fragment key={card.key}>
          {index > 0 && (
            <Icon name="arrow-left" size={18} className="shrink-0 self-center text-ink-3 max-lg:rotate-[-90deg]" />
          )}
          <AssessmentCard card={card} />
        </Fragment>
      ))}
    </div>
  );
}

function Paths({ data }: { data: NonNullable<PostAction["paths"]> }) {
  return (
    <SectionPanel title="مسیرهای احتمال" description={data.subtitle} bodyClassName="p-0">
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">مسیرهای احتمال ارزیابی جاری جدید</caption>
          <thead>
            <tr>
              <th scope="col">مسیر</th>
              <th scope="col">B0</th>
              <th scope="col">کنترل‌های مؤثر</th>
              <th scope="col">Bc</th>
              <th scope="col">B مسیر</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id}>
                <td data-primary className="text-sm text-ink">
                  {row.name}
                </td>
                <td data-label="B0" className="text-sm font-semibold tabular">
                  {row.b0}
                </td>
                <td data-label="کنترل‌های مؤثر" data-wide>
                  <span className="flex flex-wrap gap-1.5" dir="ltr">
                    {row.controls.length === 0 ? (
                      <span className="text-xs text-ink-3">—</span>
                    ) : (
                      row.controls.map((control) => (
                        <Chip key={control.code} tone={control.tone}>
                          <bdi>{control.label}</bdi>
                        </Chip>
                      ))
                    )}
                  </span>
                </td>
                <td data-label="Bc" className="text-sm font-semibold tabular">
                  {row.bc}
                </td>
                <td data-label="B مسیر" className="text-sm font-semibold tabular">
                  {row.b}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="flex items-center justify-between gap-3 text-sm">
          <span className="text-ink-3">مقدار B نهایی</span>
          <span className="font-semibold text-ink">{data.total}</span>
        </p>
        {data.note && (
          <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-4 py-3 text-sm leading-6 text-ink">
            <Icon name="warning" size={16} className="mt-1 shrink-0 text-warning" />
            {data.note}
          </p>
        )}
      </div>
    </SectionPanel>
  );
}

function Bar({ value, max, tone, label }: { value: number | null; max: number; tone: string; label: string }) {
  return (
    <span className="flex items-center gap-2 text-xs text-ink-3">
      <span className="w-6 shrink-0">{label}</span>
      <span aria-hidden className="flex gap-1" dir="ltr">
        {Array.from({ length: max }, (_, index) => (
          <span
            key={index}
            className={cn("h-1.5 w-5 rounded-full", value !== null && index < value ? tone : "bg-line")}
          />
        ))}
      </span>
      <span className="w-4 text-sm font-semibold text-ink tabular">{value === null ? "؟" : fa(value)}</span>
    </span>
  );
}

function Profile({ data }: { data: NonNullable<PostAction["profile"]> }) {
  return (
    <SectionPanel title="پروفایل پیامد پنج‌بعدی" description={data.subtitle} bodyClassName="p-0">
      <ul className="flex flex-col divide-y divide-line">
        {data.rows.map((row) => {
          const lower = row.before !== null && row.after !== null && row.after < row.before;
          return (
            <li key={row.code} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center">
              <span className="flex min-w-0 flex-1 items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-brand-subtle text-xs font-semibold text-brand">
                  {row.code}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-ink">{row.name}</span>
                  <span className="text-xs leading-5 text-ink-3">{row.note}</span>
                </span>
              </span>
              <span
                role="img"
                aria-label={`${row.name}: قبل ${row.before === null ? "نامعلوم" : fa(row.before)}، بعد ${row.after === null ? "نامعلوم" : fa(row.after)}`}
                className="flex flex-col gap-1.5 ps-10 sm:ps-0"
              >
                <Bar label="قبل" value={row.before} max={row.max} tone="bg-ink-3/40" />
                <Bar label="بعد" value={row.after} max={row.max} tone={lower ? "bg-success" : "bg-brand"} />
              </span>
            </li>
          );
        })}
      </ul>
    </SectionPanel>
  );
}

function Summary({ data }: { data: NonNullable<PostAction["summary"]> }) {
  return (
    <section aria-labelledby="summary-title" className="rounded-lg border border-line bg-panel">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            data.reached ? "bg-success-subtle text-success" : "bg-warning-subtle text-warning",
          )}
        >
          <Icon name="target" size={20} />
        </span>
        <span className="flex flex-col gap-1">
          <h2 id="summary-title" className="text-h3 font-semibold text-ink">
            {data.title}
          </h2>
          <span className="text-sm text-ink-3">{data.text}</span>
        </span>
      </div>
      <dl className="flex flex-col divide-y divide-line px-5">
        {data.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-3">
            <dt className="text-sm text-ink-3">{row.label}</dt>
            <dd className="text-sm font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function NextStep({
  planId,
  decision,
  onDone,
}: {
  planId: number;
  decision: PostActionDecision;
  onDone: (page: PostAction) => void;
}) {
  const toast = useToast();
  const first = decision.options.find((option) => option.problems.length === 0);
  const [choice, setChoice] = useState(first?.value);
  const [corrective, setCorrective] = useState(Boolean(decision.corrective));
  const send = useMutation({
    mutationFn: () =>
      post<PostAction>(`actions/plans/${planId}/post-action/`, {
        decision: choice,
        corrective: Boolean(decision.corrective) && corrective,
      }),
    onSuccess: (page) => {
      onDone(page);
      const created = page.result?.corrective ?? 0;
      toast({
        title: "تصمیم گام بعدی ثبت شد و طرح بسته شد",
        description: created ? `${fa(created)} کار اقدام اصلاحی برای مسئول کنترل ساخته شد` : undefined,
      });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });

  return (
    <SectionPanel title="گام بعدی" description={decision.subtitle}>
      <div className="flex flex-col gap-4">
        {decision.last && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-4 py-3">
            <span className="w-fit">
              <Chip tone="success">{decision.last.label}</Chip>
            </span>
            {decision.last.note && <p className="text-sm text-ink">{decision.last.note}</p>}
            <span className="text-xs text-ink-3">
              {decision.last.by}
              {decision.last.on && <> · {decision.last.on}</>}
            </span>
            {decision.last.next && (
              <AppLink href={decision.last.next} className="w-fit text-sm">
                نوشتن طرح دور تازه
              </AppLink>
            )}
          </div>
        )}
        {decision.problems.map((problem) => (
          <p key={problem} className="text-sm text-ink-2">
            {problem}
          </p>
        ))}
        {decision.waiting && <p className="text-sm text-ink-2">{decision.waiting}</p>}
        {decision.can_decide && (
          <>
            <fieldset className="flex flex-col divide-y divide-line">
              <legend className="sr-only">تصمیم گام بعدی</legend>
              {decision.options.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-2.5 py-3 text-sm first:pt-0",
                    option.problems.length ? "cursor-not-allowed text-ink-3" : "cursor-pointer text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="next-step"
                    value={option.value}
                    checked={choice === option.value}
                    disabled={option.problems.length > 0}
                    onChange={() => setChoice(option.value)}
                    className="mt-1 size-4 accent-[var(--color-brand)]"
                  />
                  <span className="flex flex-col gap-1">
                    {option.label}
                    {option.problems.map((problem) => (
                      <span key={problem} className="text-xs text-danger">
                        {problem}
                      </span>
                    ))}
                  </span>
                </label>
              ))}
            </fieldset>
            {decision.corrective && (
              <div className="border-t border-line pt-4">
                <Checkbox
                  label={decision.corrective.label}
                  checked={corrective}
                  onChange={(event) => setCorrective(event.target.checked)}
                />
              </div>
            )}
            <Button
              variant="primary"
              className="w-fit"
              loading={send.isPending}
              disabled={!choice}
              onClick={() => send.mutate()}
            >
              <Icon name="check" />
              ثبت تصمیم
            </Button>
          </>
        )}
      </div>
    </SectionPanel>
  );
}

function Evidence({ items }: { items: PostAction["evidence"] }) {
  return (
    <SectionPanel title="شواهد ارزیابی" description="شواهد واقعی، نه برآورد طرح">
      {items.length === 0 ? (
        <p className="text-sm text-ink-3">شاهدی به ارزیابی تازه پیوست نشده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-subtle text-ink-2">
                <Icon name="paperclip" size={16} />
              </span>
              <span className="flex min-w-0 flex-col">
                <AppLink href={item.href} className="text-sm font-semibold text-ink hover:text-brand">
                  {item.title}
                </AppLink>
                <span className="text-xs text-ink-3">
                  {item.observed_on && <>ثبت {item.observed_on} · </>}
                  <bdi className="code">{item.code}</bdi>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function Rules({ rules }: { rules: string[] }) {
  return (
    <SectionPanel title="قواعد ارزیابی پس از اقدام" description="بخش ۲۰ روش">
      <ul className="flex flex-col divide-y divide-line">
        {rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2.5 py-2.5 text-sm leading-6 text-ink">
            <Icon name="check" size={14} className="mt-1.5 shrink-0 text-brand" />
            {rule}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

export function PostActionPage() {
  const { plan_pk: pk } = useParams();
  const queryKey = ["post-action", pk];
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<PostAction>(`actions/plans/${pk}/post-action/`, signal),
  });
  const ask = useMutation({
    mutationFn: () => post<PostAction>(`actions/plans/${pk}/post-action/`, { ask: true }),
    onSuccess: (page) => {
      queryClient.setQueryData(queryKey, page);
      const owner = page.decision?.owner?.name ?? "مالک ریسک";
      toast({
        title: page.result?.asked ? `درخواست تصمیم برای ${owner} فرستاده شد` : `امروز از ${owner} تصمیم خواسته شده بود`,
      });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const data = query.data;
  useTitle(data ? `ارزیابی پس از اقدام ${data.risk.code}` : "ارزیابی پس از اقدام");

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;

  const done = (page: PostAction) => {
    queryClient.setQueryData(queryKey, page);
    void queryClient.invalidateQueries({ queryKey: ["mywork"] });
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.title}
        breadcrumb={[{ label: "لیست ریسک‌های هدف", to: "/treatment/targets" }, { label: "ارزیابی پس از اقدام" }]}
        meta={data.status && <Chip tone={data.status.tone}>{data.status.label}</Chip>}
        description={data.subtitle}
        actions={
          <>
            {data.compare_href && (
              <AppLink href={data.compare_href} button={{ variant: "link" }}>
                <Icon name="layers" />
                مقایسه‌ی نسخه‌ها
              </AppLink>
            )}
            {data.decision?.can_ask && (
              <Button variant="primary" loading={ask.isPending} onClick={() => ask.mutate()}>
                <Icon name="flow" />
                ارسال برای تصمیم مالک
              </Button>
            )}
          </>
        }
      />
      <Cards data={data} />
      {data.waiting && (
        <p className="flex items-start gap-2 rounded-lg bg-brand-subtle px-4 py-3 text-sm leading-6 text-ink">
          <Icon name="info" size={16} className="mt-1 shrink-0 text-brand" />
          {data.waiting}
        </p>
      )}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {data.paths && <Paths data={data.paths} />}
          {data.profile && <Profile data={data.profile} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          {data.summary && <Summary data={data.summary} />}
          {data.decision && (
            <NextStep
              key={data.decision.last?.label ?? "open"}
              planId={data.plan.id}
              decision={data.decision}
              onDone={done}
            />
          )}
          {data.summary && <Evidence items={data.evidence} />}
          <Rules rules={data.rules} />
        </div>
      </div>
    </div>
  );
}
