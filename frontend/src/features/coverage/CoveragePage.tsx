import { Grid3x3, Tags } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { count, fa, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { CoverageCell, CoveragePage as CoverageData } from "@/lib/types";

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

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4 sm:p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-display font-bold text-fg tabular">{value}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function CoveragePage() {
  useTitle("جهان ریسک");
  const [params] = useSearchParams();
  const page = usePageData<CoverageData>();
  const data = page.data;
  const filtered = activeFilters(data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="جهان ریسک"
        description="پوشش هر خدمت فعال در هر دسته‌ی ریسک: بررسی‌شده، نامرتبط با دلیل، یا هنوز در انتظار بررسی."
        actions={
          data && (
            <AppLink href={data.categories_url} button={{ variant: "secondary" }}>
              <Tags aria-hidden />
              دسته‌های ریسک
            </AppLink>
          )
        }
      />
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Stat
            label="پوشش خدمات حیاتی"
            value={data.critical.percent === null ? "—" : `${fa(data.critical.percent)}٪`}
            hint={
              data.critical.percent === null
                ? "خدمت حیاتی فعالی نیست."
                : `${formatNumber(data.critical.complete)} از ${formatNumber(data.critical.total)} خدمت حیاتی، بدون خانه‌ی در انتظار`
            }
          />
          <Stat label="بررسی‌شده" value={formatNumber(data.counts.reviewed)} hint="خانه در خدمت‌هایی که می‌بینید" />
          <Stat label="نامرتبط" value={formatNumber(data.counts.not_relevant)} hint="با دلیل مستند" />
          <Stat label="در انتظار بررسی" value={formatNumber(data.counts.pending)} />
        </div>
      )}
      <FilterBar schema={data?.filters} label="فیلتر جهان ریسک" />
      {data && !data.categories.length ? (
        <Card className="p-6 text-sm text-muted">هیچ دسته‌ی ریسک فعالی نیست.</Card>
      ) : (
        <ListBody
          query={page}
          label="خدمت‌ها"
          filtered={filtered}
          empty={{ icon: <Grid3x3 />, title: "خدمت فعالی نیست", filteredTitle: "خدمتی با این مشخصات پیدا نشد" }}
        >
          {(grid) => (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">پوشش خدمت‌ها در دسته‌های ریسک</caption>
                <thead>
                  <tr>
                    <th scope="col">خدمت</th>
                    {grid.categories.map((category) => (
                      <th key={category.id} scope="col" className="text-center">
                        <abbr title={category.name} className="code no-underline">
                          {category.code}
                        </abbr>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.results.map((row) => (
                    <tr key={row.service.id}>
                      <th scope="row" data-primary className="min-w-48 text-start font-normal">
                        <span className="flex flex-wrap items-center gap-2">
                          <AppLink href={row.service.href}>
                            <bdi className="code">{row.service.code}</bdi>
                          </AppLink>
                          <span className="font-medium text-fg">{row.service.name}</span>
                          {row.service.is_critical && <Badge tone="danger">حیاتی</Badge>}
                        </span>
                        <span className="mt-1 block text-xs text-muted">{row.service.org_unit}</span>
                      </th>
                      {row.cells.map((cell, index) => (
                        <td key={cell.category} data-label={grid.categories[index]?.code}>
                          <CoverageCellBadge cell={cell} service={row.service.name} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ListBody>
      )}
      {data && data.categories.length > 0 && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted" aria-label="دسته‌ها">
          {data.categories.map((category) => (
            <li key={category.id}>
              <bdi className="code">{category.code}</bdi>: {category.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
