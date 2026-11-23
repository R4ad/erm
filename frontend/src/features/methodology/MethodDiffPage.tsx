import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { MethodDefinition, MethodDiff } from "@/lib/types";

// «مقایسه‌ی نسخه‌ها»ی روش به چیدمان فیگما ۲۶: نوار دو نسخه با فیلتر، تفاوت پارامترها و شبیه‌سازی اثر در ستون اصلی؛
// یادداشت تغییر، گردش تصویب و قاعده‌ی گزارش‌دهی در ستون کناری.

type Filter = "all" | "changed";

function Versions({ data, filter, onFilter }: { data: MethodDiff; filter: Filter; onFilter: (f: Filter) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel px-5 py-4 md:flex-row md:items-center">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 min-w-9 place-items-center rounded-md bg-subtle px-2 text-sm font-semibold text-ink-2">
            {data.base.name}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-ink">{data.base.note}</span>
            <span className="text-xs text-ink-3">{data.base.hint}</span>
          </span>
        </span>
        <Icon name="arrow-left" size={18} className="text-ink-3" />
        <span className="flex items-center gap-2.5">
          <span className="grid h-8 min-w-9 place-items-center rounded-md bg-brand-subtle px-2 text-sm font-semibold text-brand">
            {data.version.name}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-semibold text-ink">{data.version.note}</span>
            <span className="text-xs text-ink-3">{data.version.hint}</span>
          </span>
        </span>
      </div>
      <div role="group" aria-label="نمایش پارامترها" className="flex gap-1.5">
        {(
          [
            ["changed", "فقط تغییرات", "funnel"],
            ["all", "همه‌ی پارامترها", null],
          ] as [Filter, string, IconName | null][]
        ).map(([value, label, icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
              filter === value ? "bg-brand text-white" : "bg-subtle text-ink-2 hover:bg-line",
            )}
          >
            {icon && <Icon name={icon} size={12} />}
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Parameters({ data, filter }: { data: MethodDiff; filter: Filter }) {
  const rows = filter === "changed" ? data.rows.filter((row) => row.changed) : data.rows;
  return (
    <SectionPanel
      title="تفاوت پارامترها"
      description={`${fa(data.rows.length)} پارامتر کلیدی · ردیف‌های تغییرکرده برجسته شده‌اند`}
      bodyClassName="p-0"
    >
      <div className="table-shell">
        <table className="data-table">
          <caption className="sr-only">
            تفاوت پارامترهای {data.version.name} با {data.base.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">پارامتر</th>
              <th scope="col">نسخه‌ی {data.base.name}</th>
              <th scope="col">نسخه‌ی {data.version.name}</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={cn(row.changed && "bg-warning-subtle")}>
                <th scope="row" data-primary className="text-sm font-semibold text-ink">
                  {row.label}
                </th>
                <td data-label={data.base.name} data-wide className="text-sm text-ink-2">
                  {row.before}
                </td>
                <td
                  data-label={data.version.name}
                  data-wide
                  className={cn("text-sm", row.changed ? "font-semibold text-ink" : "text-ink-3")}
                >
                  {row.after}
                </td>
                <td data-label="وضعیت">
                  {row.changed ? (
                    <span className="text-sm font-semibold text-warning">{row.status.label}</span>
                  ) : (
                    <Chip>{row.status.label}</Chip>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

const TILE_TONE = { count: "ink", data: "warning", levels: "success", review: "brand" } as const;

function Simulation({ data, onRun, running }: { data: MethodDiff; onRun: () => void; running: boolean }) {
  const simulation = data.simulation;
  return (
    <SectionPanel
      title="شبیه‌سازی اثر روی ارزیابی‌های فعال"
      description={simulation.subtitle}
      aside={
        data.can_simulate && (
          <Button variant="link" loading={running} onClick={onRun}>
            <Icon name="flow" />
            اجرای دوباره
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 gap-3 p-5 lg:grid-cols-4">
        {simulation.tiles.map((tile) => (
          <StatTile
            key={tile.key}
            label={tile.label}
            value={fa(tile.value)}
            note={tile.note}
            valueTone={TILE_TONE[tile.key]}
            className="bg-subtle"
          />
        ))}
      </div>
      {data.last_run && (
        <p className="-mt-2 px-5 pb-3 text-xs text-ink-3">
          آخرین اجرای ثبت‌شده: {data.last_run.at} · {data.last_run.by}
        </p>
      )}
      {simulation.rows.length === 0 ? (
        <p className="border-t border-line px-5 py-4 text-sm text-ink-3">
          نسخه‌ی پیشنهادی هیچ ارزیابی جاری را جابه‌جا نمی‌کند.
        </p>
      ) : (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">ارزیابی‌هایی که نسخه‌ی {data.version.name} بر آن‌ها اثر دارد</caption>
            <thead>
              <tr>
                <th scope="col">ارزیابی</th>
                <th scope="col">ریسک</th>
                <th scope="col">اثر {data.version.name}</th>
                <th scope="col">اقدام لازم</th>
              </tr>
            </thead>
            <tbody>
              {simulation.rows.map((row) => (
                <tr key={`${row.assessment.code}-${row.effect}`}>
                  <td data-label="ارزیابی">
                    <AppLink href={row.assessment.href} className="code text-sm">
                      {row.assessment.code}
                    </AppLink>
                  </td>
                  <td data-primary className="text-sm font-semibold text-ink">
                    <AppLink href={row.risk.href} className="text-ink hover:text-brand">
                      {row.risk.title}
                    </AppLink>
                  </td>
                  <td data-label={`اثر ${data.version.name}`} data-wide className="text-sm text-ink-2">
                    {row.effect}
                  </td>
                  <td data-label="اقدام لازم" data-wide className="text-sm text-ink">
                    {row.action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}

function Notes({ data }: { data: MethodDiff }) {
  const notes = data.notes;
  return (
    <SectionPanel
      title="یادداشت تغییر"
      description={[notes.author, "متولی روش", notes.date].filter(Boolean).join(" · ")}
    >
      <p className="text-sm leading-7 text-ink">{notes.text || "شرح تغییرات هنوز نوشته نشده است."}</p>
      {notes.groups.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {notes.groups.map((group) => (
            <Chip key={group}>{group}</Chip>
          ))}
        </p>
      )}
    </SectionPanel>
  );
}

function Steps({ data }: { data: MethodDiff }) {
  return (
    <SectionPanel title="گردش تصویب" description="تغییر روش در اختیار کارگروه ریسک و کمیته‌ی امنیت است">
      <ol className="flex flex-col gap-4">
        {data.steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex items-start gap-3"
          >
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
                step.state === "done" && "bg-brand text-white",
                step.state === "current" && "border-2 border-brand text-brand",
                step.state === "locked" && "border border-line-strong text-ink-3",
                step.state === "skipped" && "bg-warning-subtle text-warning",
              )}
            >
              {step.state === "done" ? <Icon name="check" size={12} label="انجام شد" /> : fa(index + 1)}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className={cn("text-sm font-semibold", step.state === "locked" ? "text-ink-3" : "text-ink")}>
                {step.title}
              </span>
              <span className="text-xs text-ink-3">{faText(step.note)}</span>
            </span>
          </li>
        ))}
      </ol>
    </SectionPanel>
  );
}

function Rules({ data }: { data: MethodDiff }) {
  return (
    <SectionPanel title="قاعده‌ی گزارش‌دهی" description={`پس از انتشار ${data.version.name}`}>
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

export function MethodDiffPage() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const base = params.get("base");
  const path = `method/definition/${number}/diff/`;
  const queryKey = ["method-diff", number, base];
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirm, setConfirm] = useState(false);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => get<MethodDiff>(base ? `${path}?base=${base}` : path, signal),
  });
  const run = useMutation({
    mutationFn: () => post<MethodDiff>(base ? `${path}?base=${base}` : path, {}),
    onSuccess: (page) => {
      queryClient.setQueryData(queryKey, page);
      toast({ title: `شبیه‌سازی روی ${fa(page.simulation.count)} ارزیابی اجرا و در گردش تصویب ثبت شد` });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const submit = useMutation({
    mutationFn: () =>
      post<MethodDefinition>(`method/definition/${number}/submit/`, { change_notes: query.data?.notes.text ?? "" }),
    onSuccess: () => {
      setConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["method-diff", number] });
      void queryClient.invalidateQueries({ queryKey: ["method-definition"] });
      toast({ title: "نسخه برای تصویب فرستاده شد" });
    },
    onError: (failure: Error) => toast({ title: faText(failure.message), tone: "danger" }),
  });
  const data = query.data;
  useTitle(data ? data.title : "مقایسه‌ی نسخه‌ها");

  if (query.isError) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  if (!data) return <PageSkeleton rows={8} />;

  const csv = `/api/${path}?export=csv${base ? `&base=${base}` : ""}`;
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={data.title}
        breadcrumb={[{ label: "تعریف متدولوژی", to: data.definition }, { label: "مقایسه‌ی نسخه‌ها" }]}
        meta={<Chip tone={data.version.chip.tone}>{data.version.chip.label}</Chip>}
        description={data.subtitle}
        actions={
          <>
            <Button asChild variant="link">
              <a href={csv} download>
                <Icon name="download" />
                خروجی مقایسه
              </a>
            </Button>
            {data.can_submit && (
              <Button variant="primary" onClick={() => setConfirm(true)}>
                <Icon name="flow" />
                ارسال برای تصویب
              </Button>
            )}
          </>
        }
      />
      <Versions data={data} filter={filter} onFilter={setFilter} />
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Parameters data={data} filter={filter} />
          <Simulation data={data} onRun={() => run.mutate()} running={run.isPending} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Notes data={data} />
          <Steps data={data} />
          <Rules data={data} />
        </div>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`ارسال ${data.version.name} برای تصویب`}
        description="پس از ارسال، پیش‌نویس ویرایش نمی‌شود و برای بررسی کارگروه ریسک و تصویب کمیته‌ی امنیت می‌رود. ارزیابی‌ها تا فعال شدن نسخه با نسخه‌ی فعلی انجام می‌شوند."
        confirmLabel="ارسال برای تصویب"
        loading={submit.isPending}
        confirmDisabled={!data.notes.text.trim()}
        onConfirm={() => submit.mutate()}
      />
    </div>
  );
}
