import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input, Radio, Select, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { RISK_CLASSES, riskKey } from "@/components/ui/risk-level";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ScenarioLibrary, ScenarioProposalRow, LibraryScenario } from "@/lib/types";

// «کتابخانه‌ی سناریو» به چیدمان فیگما ۲۱: سناریوهای مرجع (SC) با دسته، شمار نمونه‌ی ریسک و بالاترین سطح جاری؛ کنار
// آن سناریوی انتخاب‌شده با الگوی ثبت، سه جزء سناریو، نمونه‌ها و پیشنهاد ادغام یا تفکیک، و قواعد بخش ۶ روش.

const PAGE_SIZE = 12;

function LevelChip({ level }: { level: { rank: number; name: string } }) {
  const tone = RISK_CLASSES[riskKey(level)];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
        tone.bg,
        tone.fg,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
      {level.name}
    </span>
  );
}

function shortName(name: string) {
  return name.split(/\s+و\s+|\s/)[0] ?? name;
}

function ScenarioTable({
  data,
  selectedId,
  onSelect,
}: {
  data: ScenarioLibrary;
  selectedId: number | undefined;
  onSelect: (id: number) => void;
}) {
  const [category, setCategory] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () =>
      data.rows.filter(
        (row) =>
          (!category || row.category.code === category) &&
          (!term || row.title.includes(term) || row.code.toLowerCase().includes(term.toLowerCase())),
      ),
    [data.rows, category, term],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filters = [{ code: "", label: "همه", count: data.summary.scenarios }].concat(
    data.categories.map((item) => ({
      code: item.code,
      label: `${item.code} ${shortName(item.name)}`,
      count: item.count,
    })),
  );
  return (
    <section aria-label="سناریوهای مرجع" className="overflow-hidden rounded-lg border border-line bg-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="دسته">
          {filters.map((item) => (
            <button
              key={item.code || "all"}
              type="button"
              aria-pressed={category === item.code}
              onClick={() => {
                setCategory(item.code);
                setPage(1);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:shadow-focus focus-visible:outline-none",
                category === item.code
                  ? "border-brand bg-brand text-on-brand"
                  : "border-line bg-panel text-ink-2 hover:bg-subtle",
              )}
            >
              {item.label}
              <span className="tabular opacity-80">{fa(item.count)}</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            type="search"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value.trim());
              setPage(1);
            }}
            placeholder="جستجو در عنوان یا کد…"
            aria-label="جستجو در عنوان یا کد"
            className="ps-9"
          />
        </div>
      </div>
      {visible.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">سناریوهای مرجع؛ برای دیدن جزئیات، عنوان سناریو را بزنید</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">عنوان سناریوی مرجع</th>
                <th scope="col">دسته‌ی اصلی</th>
                <th scope="col">نمونه</th>
                <th scope="col">بالاترین سطح</th>
                <th scope="col">آخرین بازبینی</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <ScenarioTableRow key={row.id} row={row} selected={row.id === selectedId} onSelect={onSelect} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-ink-3">سناریویی با این جستجو پیدا نشد.</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <span className="text-xs text-ink-3">
          نمایش {fa(visible.length)} از {fa(rows.length)} سناریو · مرتب‌سازی بر اساس کد
        </span>
        <Pagination page={current} pages={pages} onChange={setPage} status={false} />
      </div>
    </section>
  );
}

function ScenarioTableRow({
  row,
  selected,
  onSelect,
}: {
  row: LibraryScenario;
  selected: boolean;
  onSelect: (id: number) => void;
}) {
  return (
    <tr className={cn(selected && "bg-brand-subtle/60", !row.active && "text-ink-3")}>
      <td data-label="کد">
        <bdi className="code text-xs">{row.code}</bdi>
      </td>
      <td data-primary>
        <button
          type="button"
          onClick={() => onSelect(row.id)}
          aria-current={selected || undefined}
          className={cn(
            "rounded-sm text-start font-medium hover:text-brand focus-visible:shadow-focus focus-visible:outline-none",
            selected ? "text-brand" : row.active ? "text-ink" : "text-ink-3",
          )}
        >
          {row.title}
        </button>
        {row.note && (
          <span className={cn("block text-xs", row.note.tone === "warning" ? "text-warning" : "text-ink-3")}>
            {row.note.text}
          </span>
        )}
      </td>
      <td data-label="دسته‌ی اصلی">
        <Chip>
          {row.category.code} · {shortName(row.category.name)}
        </Chip>
      </td>
      <td data-label="نمونه" className="text-sm tabular">
        {fa(row.instances)}
      </td>
      <td data-label="بالاترین سطح">
        {row.level ? (
          <LevelChip level={row.level} />
        ) : row.instances ? (
          <span className="text-xs text-ink-3">ارزیابی‌نشده</span>
        ) : (
          <Chip tone="warning">بدون نمونه</Chip>
        )}
      </td>
      <td data-label="آخرین بازبینی" className="text-sm whitespace-nowrap text-ink-2 tabular">
        {row.reviewed ?? "—"}
      </td>
    </tr>
  );
}

const PARTS: { key: "conditions" | "event" | "consequence"; label: string; icon: IconName }[] = [
  { key: "conditions", label: "عامل آغازگر", icon: "lightning" },
  { key: "event", label: "رویداد اصلی", icon: "target" },
  { key: "consequence", label: "پیامد قابل مشاهده", icon: "warning" },
];

function ProposalCard({ proposal, onDecide }: { proposal: ScenarioProposalRow; onDecide: (accept: boolean) => void }) {
  const merge = proposal.kind.value === "merge";
  return (
    <section
      aria-label="پیشنهاد باز"
      className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-subtle p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Icon name="merge" size={16} className="text-warning" />
          {merge && proposal.target ? `پیشنهاد ادغام با ${proposal.target.code}` : "پیشنهاد تفکیک"}
        </h3>
        {proposal.similarity !== null && (
          <span className="text-xs font-semibold text-warning">شباهت {fa(proposal.similarity)}٪</span>
        )}
      </div>
      <p className="text-xs leading-5 text-ink-2">
        {proposal.target && <>«{proposal.target.title}» · </>}
        {proposal.reason}
      </p>
      <p className="text-xs text-ink-3">پیشنهاددهنده: {proposal.created_by}</p>
      {proposal.can_decide && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button variant="link" size="sm" onClick={() => onDecide(false)}>
            رد با دلیل
          </Button>
          <Button variant="outline" size="sm" onClick={() => onDecide(true)}>
            <Icon name="eye" />
            {merge ? "بررسی ادغام" : "بررسی تفکیک"}
          </Button>
        </div>
      )}
    </section>
  );
}

function Detail({ data, onDecide }: { data: ScenarioLibrary; onDecide: (accept: boolean) => void }) {
  const scenario = data.selected;
  if (!scenario) return null;
  return (
    <section
      id="scenario-detail"
      aria-labelledby="scenario-title"
      className="flex scroll-mt-20 flex-col overflow-hidden rounded-lg border border-line bg-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex min-w-0 flex-col gap-1">
          <h2 id="scenario-title" className="text-h3 font-semibold text-ink">
            {scenario.title}
          </h2>
          <span className="text-xs text-ink-3">
            سناریوی مرجع <bdi className="code">{scenario.code}</bdi>
            {scenario.author && <> · ثبت‌کننده: {scenario.author}</>} · نسخه‌ی {fa(scenario.version)}
          </span>
          {scenario.merged_into && (
            <AppLink href={scenario.merged_into.href} className="text-xs text-brand">
              ادغام‌شده در {scenario.merged_into.code}
            </AppLink>
          )}
        </span>
        {scenario.edit_url ? (
          <AppLink href={scenario.edit_url} className="shrink-0 text-sm font-medium text-brand">
            ویرایش
          </AppLink>
        ) : (
          <AppLink href={scenario.href} className="shrink-0 text-sm font-medium text-brand">
            پرونده
          </AppLink>
        )}
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        <figure className="flex flex-col gap-1.5 rounded-lg bg-subtle p-3">
          <figcaption className="text-xs text-ink-3">الگوی ثبت سناریو</figcaption>
          <blockquote className="text-sm leading-6 text-ink">«{faText(scenario.narrative)}»</blockquote>
        </figure>
        <dl className="flex flex-col gap-3">
          {PARTS.map((part) => (
            <div key={part.key} className="relative flex min-h-7 flex-col gap-0.5 ps-9.5">
              <dt className="text-xs text-ink-3">
                <span
                  aria-hidden
                  className="absolute start-0 top-0 grid size-7 place-items-center rounded-md bg-brand-subtle text-brand"
                >
                  <Icon name={part.icon} size={14} />
                </span>
                {part.label}
              </dt>
              <dd className="text-sm font-medium text-ink">{scenario[part.key]}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="info">
            دسته‌ی اصلی: {scenario.category.code} {shortName(scenario.category.name)}
          </Chip>
          {scenario.service && <Chip>{scenario.service}</Chip>}
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-line px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">نمونه‌های ریسک</h3>
          <span className="text-xs text-ink-3">{fa(scenario.instances.length)} نمونه · هر نمونه ارزیابی مستقل</span>
        </div>
        {scenario.instances.length ? (
          <ul className="flex flex-col divide-y divide-line">
            {scenario.instances.map((risk) => {
              const tone = risk.level ? RISK_CLASSES[riskKey(risk.level)] : null;
              return (
                <li key={risk.id} className="flex items-center gap-3 py-2">
                  <AppLink href={risk.href} className="code shrink-0 text-xs text-ink-2 hover:text-brand">
                    {risk.code}
                  </AppLink>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={risk.title}>
                    {risk.scope}
                  </span>
                  <span
                    className={cn(
                      "grid h-7 min-w-9 place-items-center rounded-md border-2 px-1.5 text-xs font-semibold tabular",
                      tone ? cn(tone.border, tone.bg, tone.fg) : "border-line text-ink-3",
                    )}
                    title={risk.level ? `امتیاز جاری، سطح ${risk.level.name}` : "هنوز ارزیابی جاری تأییدشده ندارد"}
                  >
                    {risk.score !== null ? fa(risk.score) : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-ink-3">هنوز نمونه‌ای ندارد؛ کاربرد این سناریو در دامنه‌ها بررسی شود.</p>
        )}
        {scenario.proposal && <ProposalCard proposal={scenario.proposal} onDecide={onDecide} />}
      </div>
    </section>
  );
}

function Rules({ data }: { data: ScenarioLibrary }) {
  return (
    <SectionPanel title="قواعد سناریوی مرجع" description="بخش ۶ روش">
      <ul className="flex flex-col divide-y divide-line">
        {data.rules.map((rule) => (
          <li key={rule.title} className="flex flex-col gap-0.5 py-2.5">
            <span className="text-sm font-semibold text-ink">{rule.title}</span>
            <span className="text-xs text-ink-3">{rule.text}</span>
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}

function ProposeDialog({
  data,
  open,
  onOpenChange,
  onDone,
}: {
  data: ScenarioLibrary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (page: ScenarioLibrary) => void;
}) {
  const [scenario, setScenario] = useState(String(data.selected?.id ?? ""));
  const [kind, setKind] = useState<"merge" | "split">("merge");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () =>
      post<ScenarioLibrary>("scenarios/proposals/", {
        scenario: Number(scenario),
        kind,
        target: kind === "merge" ? Number(target) : null,
        reason,
      }),
    onSuccess: (page) => {
      onDone(page);
      setReason("");
      setTarget("");
      setError("");
    },
    onError: (failure: Error) => setError(faText(failure.message)),
  });
  const ready = scenario && reason.trim() && (kind === "split" || (target && target !== scenario));
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="پیشنهاد ادغام یا تفکیک"
      description="ادغام و تفکیک با دلیل ثبت می‌شوند و متولی روش درباره‌شان تصمیم می‌گیرد؛ حذف فیزیکی ممنوع است."
      confirmLabel="ثبت پیشنهاد"
      loading={save.isPending}
      confirmDisabled={!ready}
      onConfirm={() => save.mutate()}
    >
      <div className="flex flex-col gap-3">
        <Field label="سناریو" required>
          <Select value={scenario} onChange={(event) => setScenario(event.target.value)}>
            {data.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code} · {option.title}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">نوع پیشنهاد</legend>
          <Radio label="ادغام" name="kind" checked={kind === "merge"} onChange={() => setKind("merge")} />
          <Radio label="تفکیک" name="kind" checked={kind === "split"} onChange={() => setKind("split")} />
        </fieldset>
        {kind === "merge" && (
          <Field label="ادغام در" required>
            <Select value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">انتخاب سناریوی مقصد…</option>
              {data.options
                .filter((option) => String(option.id) !== scenario)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.code} · {option.title}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <Field label="دلیل" required error={error || undefined}>
          <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </div>
    </ConfirmDialog>
  );
}

export function ScenarioLibraryPage() {
  useTitle("کتابخانه‌ی سناریو");
  const [params, setParams] = useSearchParams();
  const selected = params.get("scenario");
  const queryKey = ["scenario-library", selected ?? "default"];
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      get<ScenarioLibrary>(`scenarios/library/${selected ? `?scenario=${selected}` : ""}`, signal),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const [proposing, setProposing] = useState(false);
  const [decision, setDecision] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const select = (id: number) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("scenario", String(id));
        return next;
      },
      { replace: true, preventScrollReset: true },
    );
  const pick = (id: number) => {
    select(id);
    // در صفحه‌ی باریک جزئیات زیر جدول است؛ پس از انتخاب به آن می‌رویم
    if (!window.matchMedia?.("(min-width: 80rem)").matches) {
      document.getElementById("scenario-detail")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  };
  const applied = (page: ScenarioLibrary) => {
    queryClient.setQueryData(queryKey, page);
    // بقیه‌ی سناریوها کهنه می‌شوند؛ پاسخ همین درخواست تازه‌ترین داده‌ی صفحه‌ی جاری است
    void queryClient.invalidateQueries({ queryKey: ["scenario-library"], refetchType: "none" });
  };
  const decide = useMutation({
    mutationFn: () =>
      post<ScenarioLibrary>(`scenarios/proposals/${data?.selected?.proposal?.id}/decide/`, {
        accept: decision,
        reason,
      }),
    onSuccess: (page) => {
      applied(page);
      toast({ title: decision ? "پیشنهاد پذیرفته شد" : "پیشنهاد با دلیل رد شد" });
      setDecision(null);
      setReason("");
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const proposal = data?.selected?.proposal;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="کتابخانه‌ی سناریو"
        breadcrumb={[{ label: "شناسایی ریسک" }, { label: "کتابخانه‌ی سناریو" }]}
        description="سناریوی مرجع (SC) الگوی سازمانی رویداد، شرایط تحقق و پیامد است؛ هر کاربرد آن در دامنه‌ی مشخص یک نمونه ریسک (RK) با مالک و ارزیابی مستقل می‌گیرد · کتابخانه نقطه‌ی کور را آشکار می‌کند و گزینه‌ی «مورد جدید» همیشه مجاز است"
        actions={
          data && (
            <>
              {data.can_propose && (
                <Button variant="link" onClick={() => setProposing(true)}>
                  <Icon name="layers" />
                  پیشنهاد ادغام یا تفکیک
                </Button>
              )}
              {data.create_url && (
                <Button asChild variant="primary">
                  <AppLink href={data.create_url}>
                    <Icon name="plus" />
                    سناریوی مرجع جدید
                  </AppLink>
                </Button>
              )}
            </>
          )
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !data ? (
        <PageSkeleton rows={8} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatTile
              label="سناریوی مرجع"
              value={fa(data.summary.scenarios)}
              note={`${fa(data.summary.categories)} دسته‌ی T1 تا T8`}
              icon="books"
            />
            <StatTile
              label="نمونه ریسک"
              value={fa(data.summary.instances)}
              note={`میانگین ${data.summary.average} نمونه برای هر سناریو`}
              icon="list"
              tone="neutral"
            />
            <StatTile
              label="بدون نمونه"
              value={fa(data.summary.empty)}
              note="کاربرد در دامنه بررسی شود"
              icon="search"
              tone="warning"
              valueTone={data.summary.empty ? "warning" : "ink"}
            />
            <StatTile
              label="پیشنهاد ادغام"
              value={fa(data.summary.proposals)}
              note="در انتظار تصمیم متولی روش"
              icon="merge"
              tone="danger"
              valueTone={data.summary.proposals ? "danger" : "ink"}
            />
          </div>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <ScenarioTable data={data} selectedId={data.selected?.id} onSelect={pick} />
            <div className="flex flex-col gap-4">
              <Detail data={data} onDecide={setDecision} />
              <Rules data={data} />
            </div>
          </div>
          {data.can_propose && (
            <ProposeDialog
              key={data.selected?.id}
              data={data}
              open={proposing}
              onOpenChange={setProposing}
              onDone={(page) => {
                applied(page);
                setProposing(false);
                toast({ title: "پیشنهاد ثبت شد و منتظر تصمیم متولی روش است" });
              }}
            />
          )}
          {proposal && (
            <ConfirmDialog
              open={decision !== null}
              onOpenChange={(open) => !open && setDecision(null)}
              title={decision ? `پذیرش ${proposal.kind.label} ${proposal.scenario.code}` : "رد پیشنهاد"}
              description={
                decision && proposal.target
                  ? `${proposal.scenario.code} غیرفعال و به ${proposal.target.code} پیوند می‌شود؛ نمونه‌های قبلی سناریو و نسخه‌ی خود را نگه می‌دارند و چیزی حذف نمی‌شود.`
                  : "دلیل تصمیم در سوابق پیشنهاد می‌ماند."
              }
              confirmLabel={decision ? "پذیرش" : "رد پیشنهاد"}
              tone={decision ? "primary" : "danger"}
              loading={decide.isPending}
              confirmDisabled={!reason.trim()}
              onConfirm={() => decide.mutate()}
            >
              <Field label="دلیل تصمیم" required>
                <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            </ConfirmDialog>
          )}
        </>
      )}
    </div>
  );
}
