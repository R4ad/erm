import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Toggle } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ImpactLevels } from "@/lib/types";

import { duration, durationLevel } from "./duration";

// «ویرایش بُعد پیامد» به چیدمان فیگما ۲۷: زبانه‌های پنج بُعد، سطوح با معیار و برچسب، و ماشین‌حساب نمونه‌ی S در ستون
// اصلی؛ ذی‌نفعان پیامد، قواعد تکمیلی و تاریخچه‌ی بُعد در ستون کناری.

type Draft = { value: number; criteria: string; tags: string };

const SEPARATOR = "؛";

const LEVEL_TONE = [
  "bg-subtle text-ink-2",
  "bg-success-subtle text-success",
  "bg-success-subtle text-success",
  "bg-risk-medium-bg text-risk-medium-fg",
  "bg-risk-high-bg text-risk-high-fg",
  "bg-risk-critical-bg text-risk-critical-fg",
];

function splitTags(text: string) {
  return text
    .split(SEPARATOR)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function draftOf(levels: ImpactLevels["levels"]): Draft[] {
  return levels.map((level) => ({
    value: level.value,
    criteria: level.criteria,
    tags: level.tags.join(` ${SEPARATOR} `),
  }));
}

function LevelCard({
  level,
  editable,
  onChange,
}: {
  level: Draft;
  editable: boolean;
  onChange: (value: number, field: "criteria" | "tags", text: string) => void;
}) {
  const [editingTags, setEditingTags] = useState(false);
  const tags = splitTags(level.tags);
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-md text-sm font-semibold",
          LEVEL_TONE[level.value] ?? LEVEL_TONE[0],
        )}
        aria-hidden
      >
        {fa(level.value)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-line px-4 py-3">
        {editable ? (
          <Textarea
            aria-label={`معیار سطح ${fa(level.value)}`}
            rows={2}
            value={level.criteria}
            onChange={(event) => onChange(level.value, "criteria", event.target.value)}
            className="min-h-0 resize-none border-0 p-0 text-sm leading-7 shadow-none focus-visible:shadow-none"
          />
        ) : (
          <p className="text-sm leading-7 text-ink">{level.criteria}</p>
        )}
        {editable && editingTags && (
          <Input
            aria-label={`برچسب‌های سطح ${fa(level.value)}`}
            placeholder="برچسب‌ها، جدا با ؛"
            value={level.tags}
            onChange={(event) => onChange(level.value, "tags", event.target.value)}
            className="h-8 text-xs"
          />
        )}
        {tags.length > 0 && (
          <span className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Chip key={tag}>{tag}</Chip>
            ))}
          </span>
        )}
      </div>
      {editable && (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`ویرایش برچسب‌های سطح ${fa(level.value)}`}
          aria-expanded={editingTags}
          onClick={() => setEditingTags((open) => !open)}
          className="mt-1 px-1.5 text-ink-3"
        >
          <Icon name="dots" size={16} />
        </Button>
      )}
    </li>
  );
}

function Levels({
  data,
  draft,
  editable,
  onChange,
  onRestore,
}: {
  data: ImpactLevels;
  draft: Draft[];
  editable: boolean;
  onChange: (value: number, field: "criteria" | "tags", text: string) => void;
  onRestore: () => void;
}) {
  return (
    <SectionPanel
      title={`سطوح بُعد ${data.scale.code}`}
      description="سطح ۰ فقط با دلیل «اثر ندارد» · عدد نامعلوم با صفر جایگزین نمی‌شود"
      aside={
        editable &&
        data.base && (
          <Button variant="link" onClick={onRestore}>
            بازگردانی به {data.base.name}
          </Button>
        )
      }
    >
      <ol className="flex flex-col divide-y divide-line">
        {draft.map((level) => (
          <LevelCard key={level.value} level={level} editable={editable} onChange={onChange} />
        ))}
      </ol>
    </SectionPanel>
  );
}

function Calculator({ calc, draft }: { calc: NonNullable<ImpactLevels["calculator"]>; draft: Draft[] }) {
  const first = calc.services.find((service) => service.rto && service.mtpd) ?? calc.services[0];
  const [serviceId, setServiceId] = useState(first?.id ?? 0);
  const service = calc.services.find((item) => item.id === serviceId);
  const [rto, setRto] = useState(String(first?.rto ?? 120));
  const [mtpd, setMtpd] = useState(String(first?.mtpd ?? 480));
  const [d, setD] = useState("90");
  const critical = service?.critical ?? true;
  const r = Number(rto);
  const m = Number(mtpd);
  const minutes = Number(d);
  const valid = r > 0 && m > r && minutes >= 0 && Number.isFinite(minutes);
  const quarter = Math.round(r * calc.fraction);
  const level = valid ? durationLevel(minutes, r, m, critical, calc.fraction) : null;
  const segments = critical
    ? [
        { level: 2, text: `۰ تا ${duration(quarter)}` },
        { level: 3, text: `${duration(quarter)} تا ${duration(r)}` },
        { level: 4, text: `${duration(r)} تا ${duration(m)}` },
        { level: 5, text: `${duration(m)} و بیشتر` },
      ]
    : [
        { level: 1, text: `۰ تا ${duration(quarter)}` },
        { level: 2, text: `${duration(quarter)} تا ${duration(r)}` },
        { level: 3, text: `بیش از ${duration(r)}` },
      ];
  // یک نمونه در هر بازه: دوسوم کسر RTO، سه‌چهارم RTO، دو برابر RTO (یا میانه‌ی RTO و MTPD) و خود MTPD.
  const third = r * 2 < m ? r * 2 : Math.round((r + m) / 2);
  const samples = critical
    ? [Math.max(1, Math.round((quarter * 2) / 3)), Math.round(r * 0.75), third, m]
    : [Math.max(1, Math.round((quarter * 2) / 3)), Math.round(r * 0.75), r * 2];

  const pick = (id: number) => {
    setServiceId(id);
    const next = calc.services.find((item) => item.id === id);
    if (next?.rto) setRto(String(next.rto));
    if (next?.mtpd) setMtpd(String(next.mtpd));
  };
  const criteria = draft.find((item) => item.value === level)?.criteria;
  return (
    <SectionPanel title="ماشین‌حساب نمونه" description="نمونه‌ی بخش ۹ · اعداد صرفاً نمونه‌اند">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="خدمت">
          <Select value={serviceId} onChange={(event) => pick(Number(event.target.value))}>
            {calc.services.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="زمان هدف بازیابی (RTO) به دقیقه">
          <Input inputMode="numeric" value={rto} onChange={(event) => setRto(event.target.value)} />
        </Field>
        <Field label="حداکثر اختلال قابل تحمل (MTPD) به دقیقه">
          <Input inputMode="numeric" value={mtpd} onChange={(event) => setMtpd(event.target.value)} />
        </Field>
        <Field label="زمان اختلال d به دقیقه">
          <Input inputMode="numeric" value={d} onChange={(event) => setD(event.target.value)} />
        </Field>
      </div>
      {!valid ? (
        <p className="mt-4 text-sm text-danger">RTO باید مثبت و کمتر از MTPD باشد و d عددی نامنفی.</p>
      ) : (
        <>
          <ol
            aria-label="بازه‌های سطح بر اساس d"
            className={cn("mt-4 grid gap-2", critical ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3")}
          >
            {segments.map((segment) => (
              <li
                key={segment.level}
                aria-current={segment.level === level ? "true" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md px-2 py-2.5 text-center",
                  LEVEL_TONE[segment.level],
                  segment.level === level && "ring-2 ring-brand",
                )}
              >
                <span className="text-sm font-semibold">سطح {fa(segment.level)}</span>
                <span className="text-xs">{segment.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
            نمونه‌ها:
            {samples.map((sample) => {
              const sampleLevel = durationLevel(sample, r, m, critical, calc.fraction);
              const active = sample === minutes;
              return (
                <button
                  key={sample}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setD(String(sample))}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold",
                    active ? "bg-brand text-white" : LEVEL_TONE[sampleLevel],
                  )}
                >
                  {active && <Icon name="check" size={12} />}
                  {duration(sample)}: سطح {fa(sampleLevel)}
                  {critical && sample === m && " (تساوی با MTPD)"}
                </button>
              );
            })}
          </p>
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-subtle px-4 py-3">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-md text-lg font-semibold",
                LEVEL_TONE[level ?? 0],
              )}
            >
              {fa(level ?? 0)}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink" role="status">
                نتیجه برای d برابر {duration(minutes)}: سطح {fa(level ?? 0)}
              </span>
              {criteria && <span className="text-xs leading-6 text-ink-2">{criteria}</span>}
            </span>
          </div>
        </>
      )}
    </SectionPanel>
  );
}

function Stakeholders({ data }: { data: ImpactLevels }) {
  return (
    <SectionPanel title="ذی‌نفعان پیامد" description="ابتدا برای داتین و هر بانک مهم جدا، سپس بیشترین سطح">
      <ul className="flex flex-col divide-y divide-line">
        {data.stakeholders.map((item) => (
          <li key={item.key} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex flex-col">
              <span id={`stakeholder-${item.key}`} className="text-sm font-semibold text-ink">
                {item.label}
              </span>
              <span className="text-xs text-ink-3">{item.note}</span>
            </span>
            <Toggle
              checked={item.on}
              onCheckedChange={() => undefined}
              disabled
              aria-labelledby={`stakeholder-${item.key}`}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-info-subtle px-3 py-2.5 text-sm leading-6 text-ink">
        <Icon name="info" size={16} className="mt-1 shrink-0 text-info" />
        {data.stakeholder_note}
      </p>
    </SectionPanel>
  );
}

function Rules({ data }: { data: ImpactLevels }) {
  if (data.rules.length === 0) return null;
  return (
    <SectionPanel title="قواعد تکمیلی" description="بخش ۹ روش">
      <ul className="flex flex-col divide-y divide-line">
        {data.rules.map((rule) => (
          <li key={rule} className="flex items-start gap-2.5 py-2.5 text-sm leading-6 text-ink">
            <Icon name="check" size={14} className="mt-1.5 shrink-0 text-brand" />
            {rule}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function History({ data }: { data: ImpactLevels }) {
  return (
    <SectionPanel title={`تاریخچه‌ی بُعد ${data.scale.code}`}>
      <ul className="flex flex-col divide-y divide-line">
        {data.history.map((row) => (
          <li key={row.version} className="flex items-start gap-3 py-2.5">
            <span
              className={cn(
                "grid h-6 min-w-8 place-items-center rounded-md px-1.5 text-xs font-semibold",
                row.current ? "bg-brand-subtle text-brand" : "bg-subtle text-ink-2",
              )}
            >
              {row.version}
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-ink">{row.title}</span>
              <span className="text-xs text-ink-3">{row.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function Editor({ data, onSaved }: { data: ImpactLevels; onSaved: (page: ImpactLevels) => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => draftOf(data.levels));
  const original = draftOf(data.levels);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  const editable = data.version.editable;
  const save = useMutation({
    mutationFn: () =>
      post<ImpactLevels & { saved: number }>(`method/definition/${data.version.number}/impact/${data.scale.code}/`, {
        levels: draft.map((level) => ({ value: level.value, criteria: level.criteria, tags: splitTags(level.tags) })),
      }),
    onSuccess: (page) => {
      onSaved(page);
      toast({ title: `${fa(page.saved)} سطح در پیش‌نویس ${data.version.name} ذخیره شد` });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const change = (value: number, field: "criteria" | "tags", text: string) =>
    setDraft((rows) => rows.map((row) => (row.value === value ? { ...row, [field]: text } : row)));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.scale.title}
        breadcrumb={[
          { label: "تعریف متدولوژی", to: data.definition },
          { label: `بُعد ${data.scale.code} · ${data.scale.name}` },
        ]}
        meta={<Chip tone={data.version.chip.tone}>{data.version.chip.label}</Chip>}
        description={data.scale.subtitle}
        actions={
          <>
            <Button asChild variant="link">
              <Link to={data.definition}>{editable ? "انصراف" : "بازگشت"}</Link>
            </Button>
            {editable && (
              <Button variant="primary" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
                <Icon name="check" />
                ذخیره در پیش‌نویس {data.version.name}
              </Button>
            )}
          </>
        }
      />
      <nav aria-label="ابعاد پیامد" className="overflow-x-auto border-b border-line">
        <ul className="flex min-w-max gap-5">
          {data.tabs.map((tab) => (
            <li key={tab.code}>
              <Link
                to={`/method/${data.version.number}/impact/${tab.code}`}
                aria-current={tab.code === data.scale.code ? "page" : undefined}
                className={cn(
                  "inline-flex border-b-2 px-1 pb-2.5 text-sm",
                  tab.code === data.scale.code
                    ? "border-brand font-semibold text-brand"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {tab.name} · {tab.code}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Levels
            data={data}
            draft={draft}
            editable={editable}
            onChange={change}
            onRestore={() => data.base && setDraft(draftOf(data.base.levels))}
          />
          {data.calculator && <Calculator calc={data.calculator} draft={draft} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Stakeholders data={data} />
          <Rules data={data} />
          <History data={data} />
        </div>
      </div>
    </div>
  );
}

export function ImpactLevelsPage() {
  const { number, code } = useParams();
  const queryKey = ["impact-levels", number, code];
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<ImpactLevels>(`method/definition/${number}/impact/${code}/`, signal),
  });
  const data = query.data;
  useTitle(data ? data.scale.title : "ویرایش بُعد پیامد");

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;
  return (
    <Editor
      key={`${data.version.number}-${data.scale.code}-${JSON.stringify(data.levels)}`}
      data={data}
      onSaved={(page) => queryClient.setQueryData(queryKey, page)}
    />
  );
}
