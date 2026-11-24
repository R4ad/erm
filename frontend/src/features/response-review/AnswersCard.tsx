import { Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import type { AnswerChain, ResponseReview, ReviewRisk } from "@/lib/types";

import { BASIC_LABELS } from "./review";

// ستون پاسخ‌ها (12a و 12c): پاسخ چهار پرسش پایه و برای هر مسیر خط زمانی مسیر ← رویداد ← پیامد. مسیرهای منبع ریسک
// انتخاب‌شده برجسته می‌شوند و مسیرهای ریسک تأییدشده چیپ کد ریسک می‌گیرند.

function Tag({ tone, children }: { tone: "brand" | "tangerine" | "neutral"; children: string }) {
  const tones = {
    brand: "bg-brand-subtle text-brand",
    tangerine: "bg-tangerine-subtle text-tangerine",
    neutral: "bg-subtle text-ink-2",
  };
  return (
    <span className={cn("inline-flex h-[1.375rem] items-center rounded-full px-2 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

function Step({ dot, last = false, children }: { dot: string; last?: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-3 last:pb-1">
      {!last && <span aria-hidden className="absolute start-1 top-[1.125rem] -bottom-px w-0.5 bg-line-strong" />}
      <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", dot)} />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">{children}</div>
    </li>
  );
}

function PathCard({ chain, selected, approved }: { chain: AnswerChain; selected: boolean; approved: string | null }) {
  const { path, event, impact } = chain;
  // روی زمینه‌ی brand/subtle مسیر انتخاب‌شده، text/tertiary به تضاد ۴٫۵ نمی‌رسد؛ پس توضیح‌ها text/secondary می‌شوند.
  const caption = cn("text-xs", selected ? "text-ink-2" : "text-ink-3");
  return (
    <li
      aria-current={selected || undefined}
      className={cn(
        "rounded-item border px-4 pt-3.5 pb-1.5 transition-colors duration-200",
        selected ? "border-[1.5px] border-brand bg-brand-subtle" : "border-line bg-panel",
      )}
    >
      <ol className="flex flex-col">
        <Step dot="bg-brand">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="brand">{`مسیر تحقق ${fa(path.number)}`}</Tag>
            {selected && (
              <span className="inline-flex h-[1.375rem] items-center gap-1 rounded-full bg-brand px-2 text-xs font-medium text-on-brand">
                <Sparkles aria-hidden className="size-3.5" />
                منبع پیشنهاد انتخاب‌شده
              </span>
            )}
            {approved && (
              <span className="inline-flex h-[1.375rem] items-center rounded-full bg-success-subtle px-2 text-xs font-medium text-success">
                آنالیز ریسک ·&nbsp;<bdi className="code">{approved}</bdi>
              </span>
            )}
          </div>
          <p className="text-sm text-ink">{path.text}</p>
        </Step>
        <Step dot="bg-tangerine" last={!impact && event.shared_with == null}>
          <Tag tone="tangerine">
            {event.shared_with != null
              ? `رویداد ${fa(event.number ?? 0)} · مشترک با مسیر ${fa(event.shared_with)}`
              : `رویداد ${fa(event.number ?? 0)}`}
          </Tag>
          <p className="text-sm text-ink">{event.text}</p>
          {event.shared_with != null && (
            <p className={caption}>{`پیامد این مسیر همان پیامد ${fa(event.number ?? 0)} است`}</p>
          )}
        </Step>
        {impact && (
          <Step dot="bg-ink-2" last>
            <Tag tone="neutral">{`پیامد ${fa(impact.number ?? 0)}`}</Tag>
            <p className="text-sm text-ink">{impact.text}</p>
            <p className={caption}>{`نوع: ${impact.type} · دامنه: ${impact.scope}`}</p>
          </Step>
        )}
      </ol>
    </li>
  );
}

export function AnswersCard({
  data,
  selected,
  risks,
}: {
  data: ResponseReview;
  selected: ReviewRisk | null;
  risks: ReviewRisk[];
}) {
  const { answers } = data;
  const highlighted = new Set(selected?.status.value === "pending" ? selected.source.paths : []);
  const approved = new Map<number, string>();
  for (const risk of risks) {
    if (risk.risk) for (const n of risk.source.paths) approved.set(n, risk.risk.code);
  }
  return (
    <Card
      role="region"
      aria-labelledby="answers-title"
      className="flex min-w-0 flex-col rounded-card px-5 pt-5 pb-2 shadow-card sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h2 id="answers-title" className="text-h3 font-semibold text-ink">
          پاسخ‌های پرسشنامه
        </h2>
        <p className="text-xs text-ink-3">
          {`${fa(answers.questions)} پرسش · ${fa(answers.paths)} مسیر تحقق · ${fa(answers.impacts)} پیامد`}
        </p>
      </div>
      <dl className="flex flex-col">
        {answers.basics.map((item) => (
          <div
            key={item.key}
            className="grid gap-x-4 gap-y-1 border-t border-line py-3.5 sm:grid-cols-[9.375rem_minmax(0,1fr)]"
          >
            <dt className="flex items-center gap-2 text-sm text-ink-2">
              <span
                aria-hidden
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-subtle text-xs"
              >
                {fa(item.number)}
              </span>
              {BASIC_LABELS[item.key]}
            </dt>
            <dd className="text-base text-ink">{item.text || "—"}</dd>
          </div>
        ))}
      </dl>
      <section aria-labelledby="chains-title" className="flex flex-col gap-3 border-t border-line pt-4 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="chains-title" className="text-sm font-semibold text-ink">
            مسیرهای تحقق
          </h3>
          <p className="text-xs text-ink-3">هر مسیر ← رویداد ← پیامد</p>
        </div>
        <ul className="flex flex-col gap-3">
          {answers.chains.map((chain) => (
            <PathCard
              key={chain.path.number}
              chain={chain}
              selected={highlighted.has(chain.path.number)}
              approved={approved.get(chain.path.number) ?? null}
            />
          ))}
        </ul>
      </section>
    </Card>
  );
}
