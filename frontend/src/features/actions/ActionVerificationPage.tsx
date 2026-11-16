import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
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
import type { ActionVerification, VerificationCard } from "@/lib/types";

// «آزمون و تأیید نتیجه» به چیدمان فیگما ۲۴: گام‌های وضعیت اقدام، معیارهای پذیرش، اجراهای آزمون و اثر بر ریسک در
// ستون اصلی؛ تأییدکننده‌ی مستقل، تصمیم و شواهد در ستون کناری.

function Steps({ data }: { data: ActionVerification }) {
  const current = data.steps.findIndex((step) => step.state === "current");
  return (
    <div className="flex flex-col gap-3">
      <ol
        aria-label="گام‌های اقدام"
        className="grid grid-cols-5 gap-2 rounded-lg border border-line bg-panel px-5 py-4"
      >
        {data.steps.map((step, index) => (
          <li
            key={step.value}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex min-w-0 flex-col gap-2.5"
          >
            <span
              aria-hidden
              className={cn(
                "h-1 rounded-full",
                step.state === "done" ? "bg-brand" : step.state === "current" ? "bg-brand/50" : "bg-line",
              )}
            />
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
                  step.state === "done" && "bg-brand text-white",
                  step.state === "current" && "border-2 border-brand text-brand",
                  step.state === "upcoming" && "border border-line-strong text-ink-3",
                )}
              >
                {step.state === "done" ? <Icon name="check" size={12} /> : fa(index + 1)}
              </span>
              <span
                className={cn(
                  "truncate text-sm",
                  step.state === "upcoming" ? "text-ink-3" : "font-semibold text-ink",
                  // روی گوشی نام گام‌ها جا نمی‌شود؛ نام گام فعلی زیر نوار می‌آید.
                  "max-sm:sr-only",
                )}
              >
                {step.label}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {current >= 0 && (
        <p aria-hidden className="-mt-1 text-sm font-semibold text-ink sm:hidden">
          گام {fa(current + 1)} از {fa(data.steps.length)} · {data.steps[current]?.label}
        </p>
      )}
      <p className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
        وضعیت‌های جانبی:
        {data.side.items.map((item) => (
          <Chip key={item.value} tone={item.active ? "danger" : "neutral"}>
            <Icon name={item.value === "blocked" ? "lock" : "x-circle"} size={12} />
            {item.label}
          </Chip>
        ))}
        {data.side.note && <span>· {data.side.note}</span>}
      </p>
    </div>
  );
}

function Criteria({ data }: { data: ActionVerification }) {
  const criteria = data.criteria;
  return (
    <SectionPanel
      title="معیارهای پذیرش"
      description="هر معیار با شاهد مستقل سنجیده می‌شود"
      aside={
        <Chip tone={criteria.met ? "success" : "warning"}>
          {criteria.met && <Icon name="check" size={12} />}
          {criteria.summary}
        </Chip>
      }
      bodyClassName="p-0"
    >
      {criteria.rows.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink-2">{criteria.text}</p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">معیارهای پذیرش و نتیجه‌ی اندازه‌گیری</caption>
            <thead>
              <tr>
                <th scope="col">معیار قبولی</th>
                <th scope="col">هدف</th>
                <th scope="col">نتیجه‌ی اندازه‌گیری</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {criteria.rows.map((row) => (
                <tr key={row.id} className={cn(row.status.value === "out_of_scope" && "bg-subtle")}>
                  <td data-primary className="text-sm text-ink">
                    {row.title}
                  </td>
                  <td data-label="هدف" data-wide className="text-sm text-ink-2">
                    {row.target}
                  </td>
                  <td data-label="نتیجه" className="text-sm font-semibold text-ink">
                    {row.result}
                  </td>
                  <td data-label="وضعیت">
                    <Chip tone={row.status.tone}>{row.status.label}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {criteria.notes.map((note) => (
        <p
          key={note}
          className="mx-5 my-4 flex items-start gap-2 rounded-lg bg-brand-subtle px-4 py-3 text-sm leading-6 text-ink"
        >
          <Icon name="info" size={16} className="mt-1 shrink-0 text-brand" />
          {note}
        </p>
      ))}
    </SectionPanel>
  );
}

function Runs({ data }: { data: ActionVerification }) {
  return (
    <SectionPanel title="اجراهای آزمون" description={data.runs.setting || undefined}>
      {data.runs.rows.length === 0 ? (
        <p className="text-sm text-ink-3">هنوز اجرای آزمونی ثبت نشده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.runs.rows.map((run) => (
            <li key={run.id} className="flex items-start gap-3 py-3">
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full",
                  run.passed ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger",
                )}
              >
                <Icon name={run.passed ? "check-circle" : "x-circle"} size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{run.title}</span>
                  <Chip tone={run.passed ? "success" : "danger"}>{run.outcome}</Chip>
                </span>
                <span className="text-sm leading-6 text-ink-2">{run.description}</span>
                {run.evidence && (
                  <AppLink href={run.evidence.href} className="code w-fit text-xs">
                    {run.evidence.code}
                  </AppLink>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

function ScoreBox({ card }: { card: VerificationCard }) {
  const tone = card.level ? RISK_CLASSES[riskKey(card.level)] : null;
  return (
    <span
      className={cn(
        "grid h-8 min-w-10 place-items-center rounded-md border-2 px-2 text-sm font-semibold tabular",
        tone ? cn(tone.border, tone.bg, tone.fg) : "border-line",
      )}
      title={card.level?.name}
    >
      {card.score ?? "—"}
    </span>
  );
}

function EffectCard({
  card,
  rows,
  side,
}: {
  card: VerificationCard;
  rows: { label: string; value: string }[];
  side: "before" | "after";
}) {
  return (
    <section
      aria-label={card.title}
      className={cn(
        "flex flex-1 flex-col gap-2 rounded-lg p-4",
        side === "after" ? "border-2 border-brand bg-brand-subtle/30" : "bg-subtle",
      )}
    >
      <h3 className={cn("text-sm font-semibold", side === "after" ? "text-brand" : "text-ink-2")}>{card.title}</h3>
      <span className="-mt-1.5 text-xs text-ink-3">{card.hint}</span>
      <dl className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="text-sm text-ink-3">{row.label}</dt>
            <dd className="text-sm font-semibold text-ink">{row.value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <dt className="text-sm text-ink-3">امتیاز</dt>
          <dd>
            <ScoreBox card={card} />
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Effect({ data }: { data: ActionVerification }) {
  const effect = data.effect;
  if (!effect) return null;
  return (
    <SectionPanel title={effect.title} description={effect.subtitle}>
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center">
        <EffectCard
          side="before"
          card={effect.before}
          rows={effect.rows.map((row) => ({ label: row.label, value: row.before }))}
        />
        {effect.after && (
          <>
            <Icon name="arrow-left" size={18} className="shrink-0 self-center text-ink-3 max-md:rotate-[-90deg]" />
            <EffectCard
              side="after"
              card={effect.after}
              rows={effect.rows.map((row) => ({ label: row.label, value: row.after }))}
            />
          </>
        )}
      </div>
      {(effect.profile.length > 0 || effect.changed) && (
        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
          <span className="me-auto">پروفایل پیامد</span>
          {effect.changed && <Chip tone="success">{effect.changed}</Chip>}
          {effect.profile.map((item) => (
            <Chip key={item}>{item}</Chip>
          ))}
        </p>
      )}
      {effect.note && (
        <p
          className={cn(
            "mt-4 flex items-start gap-2 rounded-lg px-4 py-3 text-sm leading-6 text-ink",
            effect.reached ? "bg-success-subtle" : "bg-brand-subtle",
          )}
        >
          <Icon
            name="target"
            size={16}
            className={cn("mt-1 shrink-0", effect.reached ? "text-success" : "text-brand")}
          />
          {effect.note}
        </p>
      )}
    </SectionPanel>
  );
}

function Verifier({ data }: { data: ActionVerification }) {
  return (
    <SectionPanel
      title="تأییدکننده‌ی مستقل"
      description="تفکیک وظایف بررسی شد"
      aside={
        <Chip tone={data.people.sod ? "success" : "danger"}>
          <Icon name="shield-check" size={12} />
          {data.people.sod ? "SoD برقرار" : "SoD برقرار نیست"}
        </Chip>
      }
    >
      <dl className="flex flex-col divide-y divide-line">
        {data.people.rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-sm text-ink-3">{row.label}</dt>
            <dd className="text-sm font-semibold text-ink">{row.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-subtle px-3 py-2.5 text-sm leading-6 text-ink">
        <Icon name="info" size={16} className="mt-1 shrink-0 text-brand" />
        تأییدکننده نباید مجری یا پاسخ‌گوی همان اقدام باشد.
      </p>
    </SectionPanel>
  );
}

function Decision({ data, onDone }: { data: ActionVerification; onDone: (page: ActionVerification) => void }) {
  const toast = useToast();
  const decision = data.decision;
  const verify = decision.options.find((option) => option.value === "verify");
  const [choice, setChoice] = useState<"verify" | "fail">(verify && verify.problems.length === 0 ? "verify" : "fail");
  const [followUp, setFollowUp] = useState(Boolean(decision.follow_up));
  const [note, setNote] = useState("");
  const send = useMutation({
    mutationFn: () =>
      post<ActionVerification>(`actions/${data.id}/verification/`, {
        decision: choice,
        note,
        follow_up: choice === "verify" && followUp,
      }),
    onSuccess: (page) => {
      onDone(page);
      const created = page.result?.follow_ups.length ?? 0;
      toast({
        title: choice === "verify" ? "نتیجه‌ی اقدام تأیید شد" : "نتیجه‌ی ناموفق ثبت شد",
        description:
          [
            created ? `${fa(created)} اقدام پیگیری ساخته شد` : "",
            page.result?.notified ? "برای ارزیابی پس از اقدام اعلان رفت" : "",
          ]
            .filter(Boolean)
            .join(" · ") || undefined,
      });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });

  return (
    <section
      id="decision"
      aria-labelledby="decision-title"
      className="scroll-mt-20 rounded-lg border border-line bg-panel"
    >
      <h2 id="decision-title" className="border-b border-line px-5 py-4 text-h3 font-semibold text-ink">
        تصمیم تأییدکننده
      </h2>
      <div className="flex flex-col gap-4 px-5 py-4">
        {decision.last && !decision.can_decide && (
          <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-4 py-3">
            <span className="w-fit">
              <Chip tone={decision.last.tone}>{decision.last.label}</Chip>
            </span>
            {decision.last.note && <p className="text-sm text-ink">{decision.last.note}</p>}
            <span className="text-xs text-ink-3">
              {decision.last.by}
              {decision.last.at && <> · {fa(decision.last.at.jalali)}</>}
            </span>
          </div>
        )}
        {decision.waiting && <p className="text-sm text-ink-2">{decision.waiting}</p>}
        {decision.can_decide && (
          <>
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">نتیجه</legend>
              {decision.options.map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex items-start gap-2.5 text-sm",
                    option.problems.length ? "cursor-not-allowed text-ink-3" : "cursor-pointer text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="decision"
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
            {decision.follow_up && choice === "verify" && (
              <Checkbox
                label={decision.follow_up}
                checked={followUp}
                onChange={(event) => setFollowUp(event.target.checked)}
              />
            )}
            <Field label="توضیح تأییدکننده" required>
              <Textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
            </Field>
            {choice === "verify" && (
              <p className="flex items-start gap-2 rounded-lg bg-warning-subtle px-3 py-2.5 text-sm leading-6 text-ink">
                <Icon name="warning" size={16} className="mt-1 shrink-0 text-warning" />
                {decision.closing}
              </p>
            )}
            <Button
              variant={choice === "verify" ? "primary" : "danger"}
              loading={send.isPending}
              disabled={!note.trim()}
              onClick={() => send.mutate()}
            >
              <Icon name={choice === "verify" ? "flow" : "x-circle"} />
              {choice === "verify" ? decision.submit : "ثبت نتیجه‌ی ناموفق"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function Evidence({ data }: { data: ActionVerification }) {
  return (
    <SectionPanel title="شواهد" description="پیوست به ارزیابی پس از اقدام">
      {data.evidence.length === 0 ? (
        <p className="text-sm text-ink-3">شاهدی به این اقدام پیوست نشده است.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {data.evidence.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-subtle text-ink-2">
                <Icon name="paperclip" size={16} />
              </span>
              <span className="flex min-w-0 flex-col">
                <AppLink href={item.href} className="text-sm font-semibold text-ink hover:text-brand">
                  {item.title}
                </AppLink>
                <span className="text-xs text-ink-3">
                  ثبت {item.observed_on} · <bdi className="code">{item.code}</bdi>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}

export function ActionVerificationPage() {
  const { pk } = useParams();
  const queryKey = ["action-verification", pk];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<ActionVerification>(`actions/${pk}/verification/`, signal),
  });
  const data = query.data;
  useTitle(data ? `تأیید نتیجه‌ی ${data.code}` : "آزمون و تأیید نتیجه");

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;

  const done = (page: ActionVerification) => {
    queryClient.setQueryData(queryKey, page);
    void queryClient.invalidateQueries({ queryKey: ["mywork"] });
  };
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.title}
        breadcrumb={[
          { label: "ریسک‌های در حال درمان", to: "/treatment/board" },
          { label: `تأیید نتیجه‌ی ${data.code}` },
        ]}
        meta={<Chip tone={data.status.value === "verified" ? "success" : "warning"}>{data.status.label}</Chip>}
        description={data.subtitle}
        actions={
          <>
            {data.report && (
              <AppLink href={data.report.href} button={{ variant: "link" }}>
                <Icon name="file-text" />
                گزارش اجرا
              </AppLink>
            )}
            <AppLink href={data.action_href} button={{ variant: "outline" }}>
              پرونده‌ی اقدام
            </AppLink>
            {data.decision.can_decide && (
              <Button asChild variant="primary">
                <a href="#decision">
                  <Icon name="check" />
                  ثبت تأیید نتیجه
                </a>
              </Button>
            )}
          </>
        }
      />
      <Steps data={data} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Criteria data={data} />
          <Runs data={data} />
          <Effect data={data} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Verifier data={data} />
          <Decision key={data.status.value} data={data} onDone={done} />
          <Evidence data={data} />
        </div>
      </div>
    </div>
  );
}
