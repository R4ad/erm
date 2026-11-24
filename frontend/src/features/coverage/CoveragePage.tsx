import { Grid3x3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge, Count, type Tone } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatTile } from "@/components/ui/stat-tile";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { TableSkeleton } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError } from "@/features/records/dossier";
import { cn } from "@/lib/cn";
import { count, fa, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { CoverageCell, CoveragePage as CoverageData, CoverageRow } from "@/lib/types";

// جهان ریسک به چیدمان فیگما ۰۹: چهار کاشی شمارش، زبانه‌های «همه / حیاتی / دارای خانه در انتظار»، جدول «خدمت × دسته»
// با تراشه‌ی وضعیت هر خانه و ستون پوشش، و کارت شناور هر خانه برای ثبت ریسک یا تعیین وضعیت. همه‌ی قاعده‌ها
// (چه کسی ویرایش می‌کند، خانه‌ی دارای ریسک نامرتبط نمی‌شود) با view جنگوست.

const TONES: Record<string, Tone> = { reviewed: "success", not_relevant: "neutral", pending: "warning" };

/** یک خانه‌ی جهان ریسک (risks/includes/coverage_cell.html)؛ صفحه‌ی خدمت هم همین را نشان می‌دهد. */
export function CoverageCellBadge({ cell, service }: { cell: CoverageCell; service: string }) {
  const badge = (
    <Badge tone={TONES[cell.status.value] ?? "neutral"} dot>
      {cell.status.label}
    </Badge>
  );
  return (
    <div className="flex flex-col items-start gap-1">
      {cell.edit_url ? (
        <AppLink href={cell.edit_url} title={cell.summary} className="hover:no-underline">
          {badge}
          <span className="sr-only">
            ، ثبت وضعیت {cell.category} برای {service}. {cell.summary}
          </span>
        </AppLink>
      ) : (
        <span title={cell.summary}>
          {badge}
          <span className="sr-only">. {cell.summary}</span>
        </span>
      )}
      {cell.risks_url && (
        <AppLink href={cell.risks_url} className="text-xs whitespace-nowrap" title="ریسک‌های فعال این خدمت در این دسته">
          {count(cell.risk_count, "ریسک")}
        </AppLink>
      )}
    </div>
  );
}

// ─────────────────────────────── تراشه‌ی خانه ───────────────────────────────

type CellStatus = "reviewed" | "not_relevant" | "pending";

const CHIP: Record<CellStatus, { className: string; icon: IconName }> = {
  reviewed: { className: "border-success/20 bg-success-subtle text-success", icon: "check" },
  not_relevant: { className: "border-transparent bg-subtle text-ink-3", icon: "x" },
  pending: { className: "border-dashed border-warning bg-panel text-warning", icon: "clock" },
};

function chipLabel(cell: CoverageCell) {
  if (cell.status.value === "reviewed") return cell.risk_count ? count(cell.risk_count, "ریسک") : "بدون ریسک";
  if (cell.status.value === "pending") return "در انتظار";
  return cell.status.label;
}

function CellChip({ cell }: { cell: CoverageCell }) {
  const chip = CHIP[cell.status.value as CellStatus] ?? CHIP.pending;
  return (
    <span
      className={cn(
        "inline-flex h-[1.875rem] w-full min-w-[5.5rem] items-center justify-center gap-1.5 rounded-md border text-xs font-medium whitespace-nowrap",
        chip.className,
      )}
    >
      {chipLabel(cell)}
      <Icon name={chip.icon} size={14} />
    </span>
  );
}

// ─────────────────────────────── کارت شناور خانه ───────────────────────────────

function CellDetails({ cell }: { cell: CoverageCell }) {
  if (cell.status.value === "pending") {
    return (
      <p className="text-xs leading-5 text-ink-2">
        این خانه هنوز بررسی نشده است. ثبت یک ریسک برای این خدمت و دسته، خانه را خودکار «بررسی‌شده» می‌کند.
      </p>
    );
  }
  const reviewer = [cell.reviewed_by?.name, cell.reviewed_on && shortDate(cell.reviewed_on)].filter(Boolean).join("، ");
  return (
    <div className="flex flex-col gap-1.5 text-xs leading-5 text-ink-2">
      {cell.status.value === "not_relevant" ? (
        <p>
          <span className="text-ink-3">دلیل: </span>
          {cell.reason || "-"}
        </p>
      ) : (
        <p>
          {cell.risk_count
            ? `${count(cell.risk_count, "ریسک فعال")} در این خانه ثبت شده است.`
            : "بررسی شده و ریسکی ندارد."}
        </p>
      )}
      {reviewer && <p className="text-ink-3">بررسی‌کننده: {reviewer}</p>}
    </div>
  );
}

function CellPopover({ cell, row, category }: { cell: CoverageCell; row: CoverageRow; category: string }) {
  const [open, setOpen] = useState(false);
  const [reasoning, setReasoning] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const action = useBridgeAction();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const title = `${row.service.name} × ${cell.category} ${category}`;

  // با «نامرتبط با دلیل» فوکوس به کادر دلیل می‌رود تا کاربر کیبورد مستقیم بنویسد.
  useEffect(() => {
    if (reasoning) reasonRef.current?.focus();
  }, [reasoning]);
  const editable = Boolean(cell.edit_url);

  function save(status: "reviewed" | "not_relevant") {
    if (!cell.edit_url) return;
    if (status === "not_relevant" && !reason.trim()) {
      setError("بنویسید چرا این دسته به این خدمت مربوط نیست.");
      return;
    }
    action.mutate(
      { url: cell.edit_url, values: { status, reason: status === "not_relevant" ? reason : "" } },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setReasoning(false);
          setReason("");
          setError("");
          action.reset();
        }
      }}
    >
      <PopoverTrigger
        className="block w-full rounded-md data-[state=open]:outline-2 data-[state=open]:outline-offset-[0.4rem] data-[state=open]:outline-brand"
        aria-label={`${title}: ${chipLabel(cell)}`}
      >
        <CellChip cell={cell} />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="center" aria-label={title} className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-1.5">
            <Badge tone={TONES[cell.status.value] ?? "neutral"}>{cell.status.label}</Badge>
            <p className="text-sm font-semibold text-ink">{title}</p>
          </div>
          <PopoverClose className={buttonClasses({ variant: "ghost", size: "icon-sm" })} aria-label="بستن">
            <Icon name="x" size={16} />
          </PopoverClose>
        </div>
        <CellDetails cell={cell} />
        {cell.risks_url && (
          <AppLink href={cell.risks_url} className="text-xs">
            مشاهده‌ی ریسک‌های این خانه
          </AppLink>
        )}
        <ActionError error={action.error} />
        {reasoning ? (
          <div className="flex flex-col gap-2">
            <Field label="دلیل نامرتبط بودن" required error={error}>
              <Textarea
                rows={3}
                ref={reasonRef}
                value={reason}
                placeholder="چرا این دسته به این خدمت مربوط نیست؟"
                onChange={(event) => {
                  setReason(event.target.value);
                  if (error) setError("");
                }}
                disabled={action.isPending}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button size="sm" loading={action.isPending} onClick={() => save("not_relevant")}>
                ثبت «نامرتبط»
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReasoning(false)} disabled={action.isPending}>
                انصراف
              </Button>
            </div>
          </div>
        ) : (
          (cell.create_risk_url || editable) && (
            <div className="flex flex-col gap-2">
              {cell.create_risk_url && (
                <AppLink href={cell.create_risk_url} button={{ variant: "primary" }} className="w-full justify-start">
                  <Icon name="plus" size={18} />
                  ثبت ریسک برای این خانه
                </AppLink>
              )}
              {editable && cell.status.value !== "reviewed" && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  loading={action.isPending}
                  onClick={() => save("reviewed")}
                >
                  {!action.isPending && <Icon name="check" size={18} />}
                  بررسی‌شده، بدون ریسک
                </Button>
              )}
              {editable && cell.status.value !== "not_relevant" && cell.risk_count === 0 && (
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => setReasoning(true)}
                  disabled={action.isPending}
                >
                  <Icon name="x" size={18} />
                  نامرتبط با دلیل
                </Button>
              )}
            </div>
          )
        )}
        {editable && (
          <p className="text-xs leading-5 text-ink-3">
            بررسی‌کننده و تاریخ ثبت می‌شود؛ خانه حذف نمی‌شود و تاریخچه می‌ماند.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────── کاشی‌ها ───────────────────────────────

function Stats({ data }: { data: CoverageData }) {
  const { counts, critical, tabs } = data;
  const percent = critical.percent;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <StatTile
        label="در انتظار بررسی"
        value={fa(counts.pending)}
        icon="clock"
        tone="warning"
        note={tabs.incomplete ? `${fa(tabs.incomplete)} خدمت دست‌کم یک خانه‌ی باز دارند` : "هیچ خدمتی خانه‌ی باز ندارد"}
      />
      <StatTile
        label="نامرتبط"
        value={fa(counts.not_relevant)}
        icon="x-circle"
        tone="neutral"
        note="همه با دلیل ثبت‌شده"
      />
      <StatTile
        label="بررسی‌شده"
        value={fa(counts.reviewed)}
        icon="check-circle"
        tone="success"
        note="خانه با بررسی‌کننده و تاریخ"
      />
      <StatTile
        label="پوشش خدمات حیاتی"
        value={percent === null ? "—" : `${fa(percent)}٪`}
        icon="shield-check"
        tone="success"
        note={
          percent === null
            ? "خدمت حیاتی فعالی نیست."
            : `${fa(critical.complete)} از ${fa(critical.total)} خدمت حیاتی بدون خانه‌ی «در انتظار»`
        }
      >
        {percent !== null && (
          <div
            role="progressbar"
            aria-label="پوشش خدمات حیاتی"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 overflow-hidden rounded-full bg-subtle"
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
          </div>
        )}
      </StatTile>
    </div>
  );
}

// ─────────────────────────────── جدول ───────────────────────────────

type TabKey = "all" | "critical" | "incomplete";

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "همه‌ی خدمات" },
  { key: "critical", label: "حیاتی" },
  { key: "incomplete", label: "دارای خانه در انتظار" },
];

function activeTab(params: URLSearchParams): TabKey | null {
  const critical = params.get("is_critical") ?? "";
  const state = params.get("state") ?? "";
  if (!critical && !state) return "all";
  if (critical === "yes" && !state) return "critical";
  if (state === "incomplete" && !critical) return "incomplete";
  return null;
}

const LEGEND: { label: string; status: CellStatus }[] = [
  { label: "بررسی‌شده (با تعداد ریسک فعال)", status: "reviewed" },
  { label: "نامرتبط (دلیل الزامی)", status: "not_relevant" },
  { label: "در انتظار بررسی", status: "pending" },
];

function Legend() {
  return (
    <ul
      className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 text-xs text-ink-2"
      aria-label="راهنمای خانه‌ها"
    >
      {LEGEND.map((item) => {
        const chip = CHIP[item.status];
        return (
          <li key={item.status} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("grid size-[1.125rem] place-items-center rounded-full border", chip.className)}
            >
              <Icon name={chip.icon} size={11} />
            </span>
            {item.label}
          </li>
        );
      })}
    </ul>
  );
}

function CoverageCount({ row }: { row: CoverageRow }) {
  const complete = row.done === row.total;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-semibold whitespace-nowrap tabular",
        complete ? "text-success" : row.done === 0 ? "text-warning" : "text-ink",
      )}
    >
      {complete && <Icon name="check-circle" size={16} />}
      {fa(row.done)} از {fa(row.total)}
      <span className="sr-only">{complete ? "، کامل" : "، دارای خانه‌ی در انتظار"}</span>
    </span>
  );
}

function Grid({ data }: { data: CoverageData }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[60rem] border-collapse text-sm">
        <caption className="sr-only">پوشش خدمت‌ها در دسته‌های ریسک</caption>
        <thead className="bg-subtle">
          <tr className="border-b border-line">
            <th
              scope="col"
              className="sticky start-0 z-[1] w-40 bg-subtle px-4 py-3 text-start text-xs font-medium text-ink-2 sm:w-52"
            >
              خدمت یا فرایند
            </th>
            {data.categories.map((category) => (
              <th key={category.id} scope="col" className="px-1.5 py-3 text-center font-normal">
                <span className="block text-sm font-semibold text-ink">
                  <bdi className="code">{category.code}</bdi>
                </span>
                <span className="mx-auto block max-w-24 truncate text-xs text-ink-2" title={category.name}>
                  {category.name}
                </span>
              </th>
            ))}
            <th scope="col" className="w-20 px-4 py-3 text-end text-xs font-medium text-ink-2">
              پوشش
            </th>
          </tr>
        </thead>
        <tbody>
          {data.results.map((row) => (
            <tr key={row.service.id} className="border-b border-line last:border-b-0">
              <th scope="row" className="sticky start-0 z-[1] bg-panel px-4 py-3 text-start font-normal">
                <span className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <AppLink href={row.service.href} className="font-semibold text-ink">
                      {row.service.name}
                    </AppLink>
                    <span className="text-xs text-ink-3">{row.service.org_unit}</span>
                  </span>
                  {row.service.is_critical && <Badge tone="gold">حیاتی</Badge>}
                </span>
              </th>
              {row.cells.map((cell, index) => (
                <td key={cell.category} className="px-1.5 py-3">
                  <CellPopover cell={cell} row={row} category={data.categories[index]?.name ?? ""} />
                </td>
              ))}
              <td className="px-4 py-3 text-end">
                <CoverageCount row={row} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Universe({ data, fetching }: { data: CoverageData; fetching: boolean }) {
  const [params, setParams] = useSearchParams();
  const tab = activeTab(params);
  const search = params.get("q") ?? "";
  const shown = data.results.length;

  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    setParams(next);
  }

  return (
    <Card className={cn("overflow-clip transition-opacity", fetching && "opacity-60")} aria-busy={fetching}>
      <div className="flex flex-col gap-x-6 border-b border-line px-4 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="نماهای جهان ریسک" className="flex gap-4 overflow-x-auto">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  update({
                    is_critical: item.key === "critical" ? "yes" : "",
                    state: item.key === "incomplete" ? "incomplete" : "",
                    size: "",
                  })
                }
                className={cn(
                  "-mb-px inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
                  active
                    ? "border-brand font-semibold text-brand"
                    : "border-transparent font-medium text-ink-2 hover:text-ink",
                )}
              >
                {item.label}
                <Count value={fa(data.tabs[item.key])} active={active} />
              </button>
            );
          })}
        </div>
        <Legend />
      </div>
      {search && (
        <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-2">
          جست‌وجو: <bdi className="font-medium text-ink">{search}</bdi>
          <Button variant="ghost" size="sm" onClick={() => update({ q: "", size: "" })}>
            <Icon name="x" size={14} />
            پاک کردن
          </Button>
        </div>
      )}
      {shown ? (
        <Grid data={data} />
      ) : (
        <EmptyState
          icon={<Grid3x3 />}
          title={tab === "all" && !search ? "خدمت فعالی نیست" : "خدمتی در این نما نیست"}
          description={tab === "incomplete" ? "همه‌ی خانه‌های خدمت‌ها بررسی شده‌اند." : undefined}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
        <p className="text-xs text-ink-3" aria-live="polite">
          نمایش {fa(shown)} از {fa(data.count)} خدمت · خدمت غیرفعال در جدول نمی‌آید
        </p>
        {shown < data.count && (
          <Button variant="ghost" size="sm" onClick={() => update({ size: String(data.size + 25) })}>
            نمایش بیشتر
            <Icon name="chevron-down" size={16} />
          </Button>
        )}
      </div>
    </Card>
  );
}

export function CoveragePage() {
  useTitle("جهان ریسک");
  const page = usePageData<CoverageData>();
  const data = page.data;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="جهان ریسک"
        breadcrumb={[{ label: "شناسایی ریسک", to: "/identification" }, { label: "جهان ریسک" }]}
        description="پوشش شناسایی: هر خدمت فعال × هر دسته‌ی ریسک فعال. دسته امتیاز را عوض نمی‌کند؛ برای تخصیص مالک و گزارش است."
        actions={
          data && (
            <>
              <AppLink href={data.categories_url} button={{ variant: "outline" }}>
                <Icon name="tag" size={18} />
                مدیریت دسته‌ها
              </AppLink>
              <a href={data.export_url} download className={buttonClasses({ variant: "outline" })}>
                <Icon name="download" size={18} />
                خروجی Excel
              </a>
            </>
          )
        }
      />
      {page.isPending && <TableSkeleton label="در حال خواندن جهان ریسک…" />}
      {page.isError && !data && <ErrorState error={page.error} retry={() => page.refetch()} />}
      {data && (
        <>
          <Stats data={data} />
          {data.categories.length ? (
            <Universe data={data} fetching={page.isFetching && page.isPlaceholderData} />
          ) : (
            <Card className="p-6 text-sm text-ink-3">هیچ دسته‌ی ریسک فعالی نیست.</Card>
          )}
        </>
      )}
    </div>
  );
}
