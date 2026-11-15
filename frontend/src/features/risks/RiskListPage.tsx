import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Count } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon, type IconName } from "@/components/ui/icon";
import { LevelBadge, ScoreChip } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { useSession } from "@/features/session/session";
import { get, post } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useDebouncedValue, useTitle } from "@/lib/hooks";
import type { BulkTransitionResult, RegisterTab, RiskFilters, RiskOrdering, RiskPage, RiskRow } from "@/lib/types";

import { STATUS_TONES } from "./status";

/** فیلترهای دکمه‌ای ردیف جست‌وجوی فیگما، به همان ترتیب از راست. */
const MENU_FILTERS = ["status", "level", "category", "service", "owner"] as const;
/** فیلترهایی که فقط از نشانی می‌آیند (پیوند از صفحه‌های دیگر) ولی تراشه‌ی فیلتر فعال دارند. */
const URL_FILTERS = ["unit", "tag", "channel", "needs_completion"] as const;
const CHIP_FILTERS = [...MENU_FILTERS, ...URL_FILTERS];
const FILTER_NAMES = ["q", ...CHIP_FILTERS];

/** زبانه‌های فیگما؛ هر کدام فقط میان‌بُر چند فیلتر است و از روی همان فیلترها روشن می‌شود. */
const TABS: { key: RegisterTab; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "mine", label: "من مالکم" },
  { key: "assessment", label: "در ارزیابی" },
  { key: "treatment_plan", label: "برنامه‌ی درمان" },
  { key: "incomplete", label: "نیازمند تکمیل" },
  { key: "unowned", label: "بدون مالک" },
];

const COLUMNS = [
  { key: "category", label: "دسته" },
  { key: "owner", label: "مالک" },
  { key: "status", label: "وضعیت" },
  { key: "level", label: "سطح تصمیم" },
  { key: "score", label: "امتیاز" },
  { key: "next", label: "اقدام بعدی" },
] as const;
type Column = (typeof COLUMNS)[number]["key"];
const COLUMNS_KEY = "register-columns";

const ACTION_TONES: Record<string, string> = {
  brand: "text-brand",
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-ink-2",
};

function readColumns(): Column[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY) ?? "null") as Column[] | null;
    if (Array.isArray(saved)) return saved.filter((key) => COLUMNS.some((column) => column.key === key));
  } catch {
    // ذخیره‌ی مرورگر در دسترس نیست؛ همه‌ی ستون‌ها نشان داده می‌شوند.
  }
  return COLUMNS.map((column) => column.key);
}

function activeTab(params: URLSearchParams, me: number): RegisterTab | null {
  const status = params.get("status");
  const owner = params.get("owner");
  const incomplete = params.get("needs_completion");
  const set = [status, owner, incomplete].filter(Boolean).length;
  if (set === 0) return "all";
  if (set > 1) return null;
  if (status === "assessment") return "assessment";
  if (status === "treatment_plan") return "treatment_plan";
  if (incomplete === "yes") return "incomplete";
  if (owner === "none") return "unowned";
  if (owner === String(me)) return "mine";
  return null;
}

function tabParams(tab: RegisterTab, me: number): Record<string, string> {
  return {
    all: {},
    mine: { owner: String(me) },
    assessment: { status: "assessment" },
    treatment_plan: { status: "treatment_plan" },
    incomplete: { needs_completion: "yes" },
    unowned: { owner: "none" },
  }[tab];
}

function Pipeline({
  page,
  status,
  onSelect,
}: {
  page: RiskPage;
  status: string | null;
  onSelect: (status: string) => void;
}) {
  return (
    <nav aria-label="وضعیت‌های گردش کار">
      <ul className="grid grid-cols-2 overflow-clip rounded-lg border border-line bg-panel sm:grid-cols-4 xl:grid-cols-8">
        {page.pipeline.map((item) => {
          const active = item.status === status;
          return (
            <li key={item.status} className="border-line not-last:border-e max-xl:border-b">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(item.status)}
                className={cn(
                  "flex w-full flex-col gap-1.5 border-b-2 px-3 py-3 text-start transition-colors hover:bg-subtle/60",
                  active ? "border-brand bg-brand-subtle/50 text-brand" : "border-transparent text-ink-2",
                )}
              >
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap">
                  <Icon name={item.icon as IconName} size={14} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className={cn("text-stat font-bold tabular", active ? "text-brand" : "text-ink")}>
                  {fa(item.count)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function FilterMenu({
  name,
  filters,
  value,
  onChange,
  icon,
}: {
  name: (typeof MENU_FILTERS)[number];
  filters: RiskFilters;
  value: string[];
  onChange: (value: string[]) => void;
  icon?: IconName;
}) {
  const filter = filters[name];
  if (!filter) return null;
  const multiple = name === "category";
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" className={cn(value.length > 0 && "border-brand text-brand")}>
          {icon && <Icon name={icon} />}
          {filter.label}
          {!icon && <Icon name="chevron-down" size={16} className="text-ink-3" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        <DropdownMenuLabel>{filter.label}</DropdownMenuLabel>
        {multiple ? (
          filter.choices.map((choice) => (
            <DropdownMenuCheckboxItem
              key={choice.value}
              checked={value.includes(choice.value)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                onChange(checked ? [...value, choice.value] : value.filter((item) => item !== choice.value))
              }
            >
              {choice.label}
            </DropdownMenuCheckboxItem>
          ))
        ) : (
          <DropdownMenuRadioGroup value={value[0] ?? ""} onValueChange={(next) => onChange(next ? [next] : [])}>
            <DropdownMenuRadioItem value="">همه</DropdownMenuRadioItem>
            {filter.choices.map((choice) => (
              <DropdownMenuRadioItem key={choice.value} value={choice.value}>
                {choice.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortButton({
  label,
  column,
  ordering,
  onSort,
}: {
  label: string;
  column: "code" | "level";
  ordering: RiskOrdering;
  onSort: (ordering: RiskOrdering) => void;
}) {
  // هر کلیک: جهت اول، جهت دوم، برگشت به ترتیب پیش‌فرض (تازه‌ترین).
  const cycle: RiskOrdering[] = column === "code" ? ["code", "-code", "newest"] : ["level", "-level", "newest"];
  const position = cycle.indexOf(ordering);
  const active = position >= 0 && position < 2;
  const descending = ordering === "level" || ordering === "-code";
  return (
    <th scope="col" aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(cycle[(position + 1) % cycle.length] ?? "newest")}
        className={cn("inline-flex items-center gap-1 rounded-sm hover:text-ink", active && "text-ink")}
      >
        {label}
        {active && <Icon name={descending ? "arrow-down" : "arrow-up"} size={12} />}
      </button>
    </th>
  );
}

function ScenarioLine({ risk }: { risk: RiskRow }) {
  const parts: ReactNode[] = [];
  if (risk.service) parts.push(risk.service.name);
  if (risk.scenario) {
    parts.push(
      <span key="scenario" className="code">
        {risk.scenario.code}
      </span>,
    );
    if (risk.scenario.version > 1) parts.push(`نسخه‌ی ${fa(risk.scenario.version)}`);
  } else {
    parts.push("مورد جدید");
  }
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-ink-3">
      {parts.map((part, index) => (
        <span key={index} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          {part}
        </span>
      ))}
      {risk.needs_completion && (
        <Badge tone="warning" className="ms-1 h-5">
          نیازمند تکمیل
        </Badge>
      )}
    </span>
  );
}

function ActionLink({ action }: { action: NonNullable<RiskRow["next_action"]> }) {
  const content = (
    <>
      <Icon name={action.icon as IconName} size={14} />
      {action.label}
    </>
  );
  const className = cn(
    "inline-flex items-center gap-1.5 text-xs font-medium hover:underline",
    ACTION_TONES[action.tone] ?? "text-ink-2",
  );
  return action.route ? (
    <Link to={action.route} viewTransition className={className}>
      {content}
    </Link>
  ) : (
    <AppLink href={action.href} className={className}>
      {content}
    </AppLink>
  );
}

function RiskTableRow({
  risk,
  columns,
  selected,
  onSelect,
}: {
  risk: RiskRow;
  columns: Set<Column>;
  selected: boolean;
  onSelect: (checked: boolean) => void;
}) {
  const action = risk.next_action;
  return (
    <tr
      className={cn("border-t border-line transition-colors", selected ? "bg-brand-subtle/50" : "hover:bg-subtle/60")}
    >
      <td className="w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`انتخاب ${risk.code}`}
          className="size-4 cursor-pointer rounded-sm accent-brand"
        />
      </td>
      <td className="code whitespace-nowrap text-ink">{risk.code}</td>
      <td className="max-w-0 min-w-56">
        <span className="flex flex-col gap-1">
          <Link to={`/risks/${risk.id}`} viewTransition className="truncate font-medium text-ink hover:text-brand">
            {faText(risk.title)}
          </Link>
          <ScenarioLine risk={risk} />
        </span>
      </td>
      {columns.has("category") && (
        <td>
          <span title={risk.category.name} className="code rounded-sm bg-subtle px-1.5 py-0.5 text-xs text-ink-2">
            {risk.category.code}
          </span>
        </td>
      )}
      {columns.has("owner") && (
        <td className="whitespace-nowrap">
          {risk.owner ? (
            <span className="flex items-center gap-2 text-ink">
              <Avatar name={risk.owner.name} size={28} />
              {risk.owner.name}
            </span>
          ) : (
            <span className="text-danger">بدون مالک</span>
          )}
        </td>
      )}
      {columns.has("status") && (
        <td>
          <Badge tone={STATUS_TONES[risk.status.value] ?? "neutral"}>{risk.status.label}</Badge>
        </td>
      )}
      {columns.has("level") && (
        <td>
          <LevelBadge level={risk.level} />
        </td>
      )}
      {columns.has("score") && (
        <td>
          {risk.score === null ? (
            <span className="text-ink-3">—</span>
          ) : (
            <ScoreChip score={risk.score} level={risk.level} />
          )}
        </td>
      )}
      {columns.has("next") && (
        <td className="whitespace-nowrap">
          {action ? <ActionLink action={action} /> : <span className="text-ink-3">—</span>}
        </td>
      )}
      <td className="w-10">
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <Button variant="quiet" size="icon-sm" aria-label={`کارهای ${risk.code}`}>
              <Icon name="dots" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to={`/risks/${risk.id}`}>
                <Icon name="eye" />
                پرونده‌ی ریسک
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/risks/${risk.id}?tab=assessments`}>
                <Icon name="gauge" />
                ارزیابی‌ها
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to={`/risks/${risk.id}/edit`}>
                <Icon name="pencil" />
                ویرایش
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function TableSkeleton() {
  return (
    <div role="status" className="flex flex-col divide-y divide-line">
      <span className="sr-only">در حال خواندن رجیستر…</span>
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-6 px-4 py-4">
          <Skeleton className="h-4 w-24" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full max-sm:hidden" />
          <Skeleton className="h-6 w-24 rounded-full max-md:hidden" />
        </div>
      ))}
    </div>
  );
}

export function RiskListPage() {
  useTitle("رجیستر ریسک");
  const session = useSession();
  const me = session.user.id;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  // انتخاب ردیف‌ها به همان نشانی بسته است؛ با عوض شدن فیلتر یا صفحه خودبه‌خود خالی می‌شود.
  const [selection, setSelection] = useState<{ search: string; ids: Set<number> }>({ search: "", ids: new Set() });
  const [columns, setColumns] = useState<Set<Column>>(() => new Set(readColumns()));

  // اگر نشانی از بیرون عوض شد (جست‌وجوی نوار بالا، دکمه‌ی برگشت)، کادر جست‌وجو هم همان را نشان دهد.
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  const search = params.toString();
  const selected = selection.search === search ? selection.ids : new Set<number>();
  const setSelected = (ids: Set<number>) => setSelection({ search, ids });
  const filters = useQuery({
    queryKey: ["risk-filters"],
    queryFn: ({ signal }) => get<RiskFilters>("risks/filters/", signal),
    staleTime: 10 * 60_000,
  });
  const risks = useQuery({
    queryKey: ["risks", search],
    queryFn: ({ signal }) => get<RiskPage>(`risks/${search ? `?${search}` : ""}`, signal),
    placeholderData: keepPreviousData,
  });
  const send = useMutation({
    mutationFn: (ids: number[]) =>
      post<BulkTransitionResult>("risks/bulk-transition/", { ids, transition: "send_to_assessment" }),
    onSuccess: (result) => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["risks"] });
      if (result.done.length) {
        toast({ title: `${fa(result.done.length)} ریسک برای ارزیابی فرستاده شد`, description: result.done.join("، ") });
      }
      for (const failure of result.failed) {
        toast({ tone: "warning", title: `${failure.code} فرستاده نشد`, description: failure.problems.join("؛ ") });
      }
    },
    onError: () => toast({ tone: "danger", title: "ارسال جهت ارزیابی انجام نشد" }),
  });

  function update(changes: Record<string, string | string[]>, options: { replace?: boolean } = {}) {
    const next = new URLSearchParams(params);
    for (const [name, value] of Object.entries(changes)) {
      next.delete(name);
      for (const item of Array.isArray(value) ? value : [value]) if (item) next.append(name, item);
    }
    if (!("page" in changes)) next.delete("page");
    setParams(next, { replace: options.replace });
  }

  // جست‌وجو هنگام تایپ، بعد از مکث کوتاه؛ نشانی با replace عوض می‌شود تا هر حرف یک قدم تاریخچه نسازد.
  const typed = query.trim();
  const debounced = useDebouncedValue(typed, 350);
  useEffect(() => {
    if (debounced === typed && debounced !== urlQuery) update({ q: debounced }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- فقط وقتی تایپ متوقف شد
  }, [debounced]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ q: typed });
  }

  function clear() {
    setQuery("");
    setParams(new URLSearchParams());
  }

  function sortBy(value: RiskOrdering) {
    update({ ordering: value === "newest" ? "" : value });
  }

  function toggleColumn(key: Column, visible: boolean) {
    const next = new Set(columns);
    if (visible) next.add(key);
    else next.delete(key);
    setColumns(next);
    try {
      localStorage.setItem(COLUMNS_KEY, JSON.stringify([...next]));
    } catch {
      // ذخیره نشد؛ انتخاب فقط تا بستن صفحه می‌ماند.
    }
  }

  const filtered = FILTER_NAMES.some((name) => params.get(name));
  const page = risks.data;
  const ordering = page?.ordering ?? (params.get("ordering") as RiskOrdering | null) ?? "newest";
  const tab = activeTab(params, me);
  const chips = CHIP_FILTERS.flatMap((name) => {
    const filter = filters.data?.[name];
    const values = params.getAll(name);
    if (!values.length || !filter) return [];
    const labels = values.map((value) => {
      const choice = filter.choices.find((option) => option.value === value);
      // دسته‌ها در تراشه با کدشان می‌آیند («دسته: T1، T3»).
      return name === "category" ? (choice?.label.split(" ")[0] ?? value) : (choice?.label.trim() ?? value);
    });
    return [{ name, label: `${filter.label}: ${labels.join("، ")}` }];
  });
  const statusParam = params.get("status");
  const scope = statusParam
    ? page?.pipeline.find((item) => item.status === statusParam)?.label
    : tab && tab !== "all"
      ? TABS.find((item) => item.key === tab)?.label
      : null;
  const first = page ? (page.page - 1) * page.page_size + 1 : 0;
  const last = page ? first + page.results.length - 1 : 0;
  const exportQuery = new URLSearchParams(params);
  exportQuery.delete("page");
  const pageIds = page?.results.map((risk) => risk.id) ?? [];
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedQuery = new URLSearchParams(exportQuery);
  for (const id of selected) selectedQuery.append("ids", String(id));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="رجیستر ریسک"
        description={
          page
            ? `${fa(page.active)} ریسک فعال · ${fa(page.closed)} بسته‌شده یا ردشده · ریسک حذف نمی‌شود، فقط وضعیتش با گردش کار عوض می‌شود.`
            : "ریسک حذف نمی‌شود، فقط وضعیتش با گردش کار عوض می‌شود."
        }
        actions={
          <>
            <a
              href={`/api/risks/export/${exportQuery.size ? `?${exportQuery}` : ""}`}
              download
              className={buttonClasses({ variant: "secondary" })}
            >
              <Icon name="download" />
              خروجی Excel
            </a>
            {page?.can_create && (
              <AppLink href={page.create_url} button={{ variant: "primary" }}>
                <Icon name="plus" />
                ثبت ریسک
              </AppLink>
            )}
          </>
        }
      />

      {page && (
        <Pipeline
          page={page}
          status={statusParam}
          onSelect={(status) => update({ status: statusParam === status ? "" : status })}
        />
      )}

      <Card className="overflow-clip">
        <div role="tablist" aria-label="نماهای رجیستر" className="flex gap-4 overflow-x-auto border-b border-line px-4">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ status: "", owner: "", needs_completion: "", ...tabParams(item.key, me) })}
                className={cn(
                  "group -mb-px inline-flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-1 text-sm transition-colors",
                  active
                    ? "border-brand font-semibold text-brand"
                    : "border-transparent font-medium text-ink-2 hover:text-ink",
                )}
              >
                {item.label}
                {page && <Count value={fa(page.tabs[item.key])} active={active} />}
              </button>
            );
          })}
        </div>

        <form
          role="search"
          aria-label="فیلتر رجیستر"
          onSubmit={submitSearch}
          className="flex flex-col gap-3 border-b border-line p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-60 flex-1">
              <span className="sr-only">جست‌وجو</span>
              <Icon
                name="search"
                size={16}
                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
              />
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                placeholder="جستجو در کد، عنوان، خدمت یا سناریو..."
                onChange={(event) => setQuery(event.target.value)}
                className="h-9 w-full rounded-md border border-line-strong bg-panel ps-9 pe-3 text-sm text-ink placeholder:text-ink-3 focus:border-focus focus:shadow-focus focus:outline-none"
              />
            </label>
            {filters.data &&
              MENU_FILTERS.map((name) => (
                <FilterMenu
                  key={name}
                  name={name}
                  filters={filters.data}
                  icon={name === "status" ? "funnel" : undefined}
                  value={params.getAll(name)}
                  onChange={(value) => update({ [name]: value })}
                />
              ))}
            <DropdownMenu dir="rtl">
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">
                  <Icon name="table" />
                  ستون‌ها
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>ستون‌های جدول</DropdownMenuLabel>
                {COLUMNS.map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.key}
                    checked={columns.has(column.key)}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(checked) => toggleColumn(column.key, checked)}
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <button type="submit" className="sr-only">
              جست‌وجو
            </button>
          </div>
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-ink-3">فیلترهای فعال:</span>
              <ul className="flex flex-wrap items-center gap-2" aria-label="فیلترهای فعال">
                {chips.map((chip) => (
                  <li key={chip.name}>
                    <button
                      type="button"
                      onClick={() => update({ [chip.name]: "" })}
                      className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand-subtle ps-3 pe-2 text-xs font-medium text-brand transition-colors hover:bg-brand-subtle-strong"
                      aria-label={`برداشتن فیلتر ${chip.label}`}
                    >
                      {chip.label}
                      <Icon name="x" size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="link" size="sm" className="ms-auto text-xs font-medium" onClick={clear}>
                پاک کردن همه
              </Button>
            </div>
          )}
        </form>

        {risks.isError && !page && <ErrorState error={risks.error} retry={() => risks.refetch()} className="m-4" />}
        {risks.isPending && <TableSkeleton />}

        {page && page.results.length === 0 && (
          <EmptyState
            className="m-4 border-0"
            icon={<Icon name={filtered ? "search" : "shield-check"} />}
            title={filtered ? "ریسکی با این فیلترها پیدا نشد" : "هنوز ریسکی در رجیستر نیست"}
            description={
              filtered
                ? "فیلترها را کم کنید یا عبارت جست‌وجو را کوتاه‌تر بنویسید."
                : "ریسک‌ها از مصاحبه، پرسشنامه، رخداد و ممیزی وارد رجیستر می‌شوند."
            }
            action={
              filtered && (
                <Button variant="secondary" onClick={clear}>
                  پاک کردن فیلترها
                </Button>
              )
            }
          />
        )}

        {page && page.results.length > 0 && (
          <>
            <div
              className={cn(
                "overflow-x-auto transition-opacity",
                risks.isFetching && risks.isPlaceholderData && "opacity-60",
              )}
              aria-busy={risks.isFetching}
            >
              <table className="w-full min-w-[60rem] text-start text-sm">
                <caption className="sr-only">ریسک‌های رجیستر{scope ? ` «${scope}»` : ""}</caption>
                <thead className="bg-subtle text-xs text-ink-3">
                  <tr className="[&>th]:h-10 [&>th]:px-3 [&>th]:text-start [&>th]:font-medium [&>th]:whitespace-nowrap">
                    <th scope="col" className="w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) =>
                          setSelected(event.target.checked ? new Set([...selected, ...pageIds]) : new Set())
                        }
                        aria-label="انتخاب همه‌ی ریسک‌های این صفحه"
                        className="size-4 cursor-pointer rounded-sm accent-brand"
                      />
                    </th>
                    <SortButton label="کد" column="code" ordering={ordering} onSort={sortBy} />
                    <th scope="col">عنوان ریسک</th>
                    {columns.has("category") && <th scope="col">دسته</th>}
                    {columns.has("owner") && <th scope="col">مالک</th>}
                    {columns.has("status") && <th scope="col">وضعیت</th>}
                    {columns.has("level") && (
                      <SortButton label="سطح تصمیم" column="level" ordering={ordering} onSort={sortBy} />
                    )}
                    {columns.has("score") && <th scope="col">امتیاز</th>}
                    {columns.has("next") && <th scope="col">اقدام بعدی</th>}
                    <th scope="col" className="w-10">
                      <span className="sr-only">کارها</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_td]:h-[3.75rem] [&_td]:px-3">
                  {page.results.map((risk) => (
                    <RiskTableRow
                      key={risk.id}
                      risk={risk}
                      columns={columns}
                      selected={selected.has(risk.id)}
                      onSelect={(checked) => {
                        const next = new Set(selected);
                        if (checked) next.add(risk.id);
                        else next.delete(risk.id);
                        setSelected(next);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="text-xs text-ink-3" aria-live="polite">
                نمایش {fa(first)} تا {fa(last)} از {fa(page.count)} ریسک{scope ? ` «${scope}»` : ""}
              </p>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-medium text-brand">{fa(selected.size)} ریسک انتخاب شده</span>
                  {page.can_send_to_assessment && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={send.isPending}
                      onClick={() => send.mutate([...selected])}
                    >
                      ارسال جهت ارزیابی
                    </Button>
                  )}
                  <a
                    href={`/api/risks/export/?${selectedQuery}`}
                    download
                    className={buttonClasses({ variant: "ghost", size: "sm" })}
                  >
                    <Icon name="download" />
                    خروجی انتخاب‌شده‌ها
                  </a>
                </div>
              )}
              <Pagination
                page={page.page}
                pages={page.pages}
                status={false}
                label="صفحه‌های رجیستر"
                onChange={(next) => {
                  update({ page: String(next) });
                  window.scrollTo({ top: 0 });
                }}
              />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
