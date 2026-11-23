import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
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
import type { OrgChartPage as PageData, OrgNode } from "@/lib/types";

// «چارت سازمانی» به چیدمان فیگما ۱۸: درخت واحدها (ریشه، معاونت‌ها در یک ردیف و زیرواحدها زیر هر معاونت)، با مدیر و
// شمار ریسک فعال و بحرانی هر زیردرخت؛ زیر آن اعضای واحد انتخاب‌شده و کارت جزئیات واحد.

const ZOOMS = [100, 90, 75, 60];

function matches(node: OrgNode, term: string) {
  return !term || node.name.includes(term) || Boolean(node.manager?.name.includes(term));
}

function flatten(nodes: OrgNode[], parent: string | null = null): { node: OrgNode; parent: string | null }[] {
  return nodes.flatMap((node) => [{ node, parent }, ...flatten(node.children, node.name)]);
}

function UnitCard({
  node,
  selected,
  dimmed,
  onSelect,
  className,
  root = false,
}: {
  root?: boolean;
  node: OrgNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: number) => void;
  className?: string;
}) {
  const manager = node.manager
    ? `${node.manager.name}${node.manager_title && node.depth === 0 ? ` · ${node.manager_title}` : ""}`
    : "بدون مدیر";
  return (
    <button
      type="button"
      onClick={() => onSelect(node.id)}
      aria-pressed={selected}
      data-root={root || undefined}
      className={cn(
        "relative flex flex-col gap-3 rounded-lg border bg-panel p-3 text-start shadow-xs transition-[opacity,box-shadow] focus-visible:shadow-focus focus-visible:outline-none",
        selected ? "border-brand ring-2 ring-brand/20" : "border-line hover:border-line-strong",
        dimmed && "opacity-40",
        className,
      )}
    >
      <span className="flex items-start gap-2.5">
        <IconChip icon="buildings" tone="brand" size="sm" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold text-ink">{node.name}</span>
          <span className="truncate text-xs text-ink-3">{manager}</span>
        </span>
      </span>
      <span className="flex items-center justify-between gap-2 border-t border-line pt-2.5 text-xs">
        <span className="text-ink-2">{fa(node.risks)} ریسک فعال</span>
        {node.critical ? (
          <Chip tone="danger">{fa(node.critical)} بحرانی</Chip>
        ) : (
          <Chip tone="success">بدون بحرانی</Chip>
        )}
      </span>
    </button>
  );
}

interface CardProps {
  selectedId: number | undefined;
  term: string;
  onSelect: (id: number) => void;
}

/** زیرواحدها زیر کارت والد، با خط اتصال در لبه‌ی انتهایی. */
function Branch({ nodes, ...props }: { nodes: OrgNode[] } & CardProps) {
  if (!nodes.length) return null;
  return (
    <ul className="relative flex flex-col gap-3 pe-4">
      <span aria-hidden className="absolute end-1.5 top-0 bottom-8 w-px bg-line-strong" />
      {nodes.map((node) => (
        <li key={node.id} className="relative flex flex-col gap-3">
          <span aria-hidden className="absolute -end-2.5 top-8 h-px w-2.5 bg-line-strong" />
          <UnitCard
            node={node}
            selected={props.selectedId === node.id}
            dimmed={!matches(node, props.term)}
            onSelect={props.onSelect}
          />
          <Branch nodes={node.children} {...props} />
        </li>
      ))}
    </ul>
  );
}

function Chart({ tree, zoom, ...props }: { tree: OrgNode[]; zoom: number } & CardProps) {
  const region = useRef<HTMLDivElement>(null);
  // در صفحه‌ی باریک درخت از لبه‌ی راست باز می‌شود؛ یک بار ریشه را وسط ناحیه می‌آوریم.
  useEffect(() => {
    const box = region.current;
    const root = box?.querySelector<HTMLElement>("[data-root]");
    if (!box || !root) return;
    const offset = root.offsetLeft + root.offsetWidth / 2 - box.clientWidth / 2;
    box.scrollTo?.({ left: offset });
  }, []);
  return (
    <div
      ref={region}
      className="relative overflow-auto bg-canvas p-6 [contain:inline-size]"
      role="region"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد
      tabIndex={0}
      aria-label="درخت واحدها، پیمایش افقی"
    >
      <div className="mx-auto w-max origin-top" style={{ zoom: zoom / 100 }}>
        {tree.map((root) => (
          <div key={root.id} className="flex flex-col items-center">
            <UnitCard
              root
              node={root}
              selected={props.selectedId === root.id}
              dimmed={!matches(root, props.term)}
              onSelect={props.onSelect}
              className="w-56"
            />
            {root.children.length > 0 && (
              <>
                <span aria-hidden className="h-6 w-px bg-line-strong" />
                <ul className="relative flex items-start gap-5 pt-6">
                  {root.children.length > 1 && (
                    <span aria-hidden className="absolute inset-x-[6.5rem] top-0 h-px bg-line-strong" />
                  )}
                  {root.children.map((node) => (
                    <li key={node.id} className="relative flex w-52 flex-col gap-3">
                      <span aria-hidden className="absolute start-1/2 -top-6 h-6 w-px bg-line-strong" />
                      <UnitCard
                        node={node}
                        selected={props.selectedId === node.id}
                        dimmed={!matches(node, props.term)}
                        onSelect={props.onSelect}
                      />
                      <Branch nodes={node.children} {...props} />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ data }: { data: PageData }) {
  const unit = data.selected;
  if (!unit) return null;
  const max = Math.max(1, ...unit.levels.map((level) => level.count));
  const rows: [string, ReactNode][] = [
    ["واحد بالادست", unit.parent ?? "— (ریشه)"],
    ["مدیر واحد", unit.manager?.name ?? "—"],
    ["جانشین", unit.deputy?.name ?? "—"],
    ["خدمات تحت پوشش", unit.services.length ? unit.services.join("، ") : "—"],
    ["مشتریان در دامنه", unit.customers.length ? unit.customers.join("، ") : "—"],
    [
      "گروه AD",
      unit.ad_group ? (
        <bdi dir="ltr" className="code text-xs">
          {unit.ad_group}
        </bdi>
      ) : (
        "—"
      ),
    ],
    ["مرجع پذیرش متوسط", unit.acceptance ?? "—"],
  ];
  return (
    <section
      aria-labelledby="unit-detail-title"
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex min-w-0 flex-col gap-1.5">
          <h2 id="unit-detail-title" className="text-h3 font-semibold text-ink">
            {unit.name}
          </h2>
          <span className="flex flex-wrap items-center gap-2">
            {unit.code && <bdi className="code text-xs text-ink-3">{unit.code}</bdi>}
            {unit.ad_group && <Chip tone="success">همگام با AD</Chip>}
          </span>
        </span>
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-brand text-white">
          <Icon name="buildings" size={22} />
        </span>
      </header>
      <dl className="flex flex-col divide-y divide-line px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-2.5 text-sm">
            <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
            <dd className="min-w-0 text-end font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2.5 border-t border-line px-5 py-4">
        <h3 className="text-xs font-semibold text-ink-2">ریسک‌های واحد بر اساس سطح جاری</h3>
        <ul className="flex flex-col gap-2">
          {unit.levels.map((level) => {
            const tone = RISK_CLASSES[riskKey(level)];
            return (
              <li key={level.rank} className="flex items-center gap-3 text-xs">
                <span
                  className={cn(
                    "inline-flex w-16 shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-semibold",
                    tone.bg,
                    tone.fg,
                  )}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", tone.dot)} />
                  {level.name}
                </span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
                  <span
                    className={cn("block h-full rounded-full", tone.dot)}
                    style={{ width: `${(level.count / max) * 100}%` }}
                  />
                </span>
                <span className="w-5 text-end text-ink tabular">{fa(level.count)}</span>
              </li>
            );
          })}
        </ul>
      </div>
      {(unit.edit_url || unit.add_child_url) && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
          {unit.add_child_url && (
            <Button asChild variant="link" size="sm">
              <AppLink href={unit.add_child_url}>
                <Icon name="plus" />
                افزودن زیرواحد
              </AppLink>
            </Button>
          )}
          {unit.edit_url && (
            <Button asChild variant="outline" size="sm">
              <AppLink href={unit.edit_url}>
                <Icon name="pencil" />
                ویرایش واحد
              </AppLink>
            </Button>
          )}
        </footer>
      )}
    </section>
  );
}

function Members({ data }: { data: PageData }) {
  const unit = data.selected;
  if (!unit) return null;
  return (
    <SectionPanel
      title={`اعضای واحد ${unit.name}`}
      description="نقش در سامانه مستقل از سمت سازمانی تخصیص می‌یابد"
      aside={
        data.add_member_url && (
          <AppLink href={data.add_member_url} button={{ variant: "outline", size: "sm" }}>
            <Icon name="plus" />
            افزودن عضو
          </AppLink>
        )
      }
      bodyClassName="p-0"
    >
      {data.members.length ? (
        <div className="table-shell">
          <table className="data-table">
            <caption className="sr-only">اعضای واحد {unit.name}</caption>
            <thead>
              <tr>
                <th scope="col">کاربر</th>
                <th scope="col">سمت سازمانی</th>
                <th scope="col">نقش در سامانه</th>
                <th scope="col">منبع</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.id}>
                  <td data-primary>
                    <span className="flex items-center gap-2.5">
                      <Avatar name={member.name} />
                      <span className="flex min-w-0 flex-col">
                        <span className="font-medium text-ink">{member.name}</span>
                        <bdi className="code text-xs text-ink-3">{member.username}</bdi>
                      </span>
                    </span>
                  </td>
                  <td data-label="سمت سازمانی" className="text-sm text-ink-2">
                    {member.job_title || "—"}
                  </td>
                  <td data-label="نقش در سامانه" data-wide>
                    <span className="flex flex-wrap gap-1">
                      {member.roles.map((role) => (
                        <Chip key={role.label} tone={role.tone}>
                          {role.label}
                        </Chip>
                      ))}
                    </span>
                  </td>
                  <td data-label="منبع">
                    <Chip tone={member.source.value === "ad" ? "info" : "neutral"}>{member.source.label}</Chip>
                  </td>
                  <td data-label="وضعیت">{member.active ? <Chip tone="success">فعال</Chip> : <Chip>غیرفعال</Chip>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-sm text-ink-3">هنوز عضوی به این واحد وصل نشده است.</p>
      )}
    </SectionPanel>
  );
}

function exportCsv(tree: OrgNode[]) {
  const cell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = flatten(tree).map(({ node, parent }) =>
    [node.code ?? "", node.name, parent ?? "", node.manager?.name ?? "", node.risks, node.critical].map(cell).join(","),
  );
  const header = ["کد", "واحد", "بالادست", "مدیر", "ریسک فعال", "بحرانی"].join(",");
  const blob = new Blob(["﻿" + [header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "org-chart.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function OrgChartPage() {
  useTitle("چارت سازمانی");
  const [params, setParams] = useSearchParams();
  const unit = params.get("unit");
  const [term, setTerm] = useState("");
  const [zoom, setZoom] = useState(100);
  const query = useQuery({
    queryKey: ["org-chart", unit ?? "default"],
    queryFn: ({ signal }) => get<PageData>(`org/chart/${unit ? `?unit=${unit}` : ""}`, signal),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const select = (id: number) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("unit", String(id));
        return next;
      },
      { replace: true, preventScrollReset: true },
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="چارت سازمانی"
        breadcrumb={[{ label: "پیکربندی سامانه" }, { label: "چارت سازمانی" }]}
        meta={
          data && (
            <Chip>
              <Icon name="buildings" size={12} />
              {fa(data.summary.units)} واحد · {fa(data.summary.levels)} سطح · {fa(data.summary.users)} کاربر
            </Chip>
          )
        }
        description="ساختار واحدها، مدیران و دامنه‌ی خدمت برای تخصیص مالک ریسک و اختیار پذیرش · همگام با Active Directory"
        actions={
          data && (
            <>
              <Button variant="link" onClick={() => exportCsv(data.tree)}>
                <Icon name="download" />
                خروجی
              </Button>
              {data.ad_sync_url ? (
                <Button asChild variant="outline">
                  <Link to={data.ad_sync_url}>
                    <Icon name="merge" />
                    همگام‌سازی با AD
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled title="همگام‌سازی AD برای مدیر سامانه و پس از پیکربندی اتصال است">
                  <Icon name="merge" />
                  همگام‌سازی با AD
                </Button>
              )}
              {data.add_unit_url && (
                <Button asChild variant="primary">
                  <AppLink href={data.add_unit_url}>
                    <Icon name="plus" />
                    افزودن واحد
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
          <section aria-label="چارت واحدها" className="overflow-hidden rounded-lg border border-line bg-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <div className="relative w-full max-w-xs">
                <Icon
                  name="search"
                  size={16}
                  className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
                />
                <Input
                  type="search"
                  value={term}
                  onChange={(event) => setTerm(event.target.value.trim())}
                  placeholder="جستجوی واحد یا مدیر…"
                  aria-label="جستجوی واحد یا مدیر"
                  className="ps-9"
                />
              </div>
              <label htmlFor="org-zoom" className="flex items-center gap-2 text-sm text-ink-2">
                بزرگ‌نمایی
                <Select
                  id="org-zoom"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                  className="w-24"
                >
                  {ZOOMS.map((value) => (
                    <option key={value} value={value}>
                      {fa(value)}٪
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <Chart tree={data.tree} zoom={zoom} selectedId={data.selected?.id} term={term} onSelect={select} />
          </section>
          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Members data={data} />
            <Detail data={data} />
          </div>
        </>
      )}
    </div>
  );
}
