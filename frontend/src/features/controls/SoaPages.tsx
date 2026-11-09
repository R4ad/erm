import { FileCheck, PencilLine, ShieldCheck, Workflow } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { Prose, Section } from "@/features/records/dossier";
import { RiskTable } from "@/features/risks/RiskTable";
import { cn } from "@/lib/cn";
import { count, fa, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { SoaDetail, SoaList, SoaRow } from "@/lib/types";

import { ApplicabilityBadge, ControlTable } from "./parts";

// بیانیه‌ی کاربردپذیری (controls/soa_list.html و soa_detail.html): برای هر کنترل پیوست A استاندارد ISO/IEC
// 27001:2022 کاربرد، دلیل و وضعیت اجرا، با ردیابی به کنترل‌های سازمان و ریسک‌هایی که به آن‌ها تکیه دارند.

const SOA = { label: "بیانیه‌ی کاربردپذیری", to: "/controls/soa" };

/** خلاصه‌ی بالای بیانیه؛ هر عدد به همان فیلتر فهرست می‌رود. */
function Summary({ summary }: { summary: SoaList["summary"] }) {
  const [params] = useSearchParams();
  const items = [
    { label: "همه", value: summary.total, search: "" },
    { label: "کاربرد دارد", value: summary.applicable, search: "state=applicable" },
    { label: "کاربرد ندارد", value: summary.not_applicable, search: "state=not_applicable" },
    { label: "تعیین‌نشده", value: summary.undetermined, search: "state=undetermined", warn: summary.undetermined > 0 },
    { label: "اجراشده", value: summary.implemented, search: "implementation=implemented" },
    { label: "بدون کنترل سازمان", value: summary.gaps, search: "state=gap", warn: summary.gaps > 0 },
  ];
  const current = params.toString();
  return (
    <nav aria-label="خلاصه‌ی بیانیه">
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => {
          const active = current === item.search;
          return (
            <li key={item.label}>
              <Link
                to={{ search: item.search }}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col gap-1.5 rounded-xl border bg-surface/50 p-4 transition-colors hover:border-line-strong",
                  item.warn ? "border-warning/40" : "border-line",
                  active && "border-accent bg-accent-soft/40",
                )}
              >
                <span className="text-xs text-muted">{item.label}</span>
                <span className={cn("text-xl font-semibold tabular", item.warn ? "text-warning" : "text-fg")}>
                  {fa(item.value)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SoaListPage() {
  useTitle("بیانیه‌ی کاربردپذیری");
  const [params] = useSearchParams();
  const page = usePageData<SoaList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="بیانیه‌ی کاربردپذیری (SoA)"
        description="برای هر کنترل پیوست A استاندارد ISO/IEC 27001:2022 ثبت می‌شود که کاربرد دارد یا نه و چرا، و اگر دارد تا کجا اجرا شده است. ستون ریسک‌ها ریسک‌هایی را می‌شمارد که به کنترل‌های سازمانِ همان ردیف تکیه دارند و شما می‌بینید."
        actions={
          page.data && (
            <AppLink href={page.data.controls_url} button={{ variant: "secondary" }}>
              <ShieldCheck aria-hidden />
              کتابخانه‌ی کنترل
            </AppLink>
          )
        }
      />
      {page.data && <Summary summary={page.data.summary} />}
      <FilterBar schema={page.data?.filters} label="فیلتر بیانیه" />
      <ListBody<SoaRow, SoaList>
        query={page}
        label="کنترل‌های پیوست A"
        filtered={filtered}
        empty={{ icon: <FileCheck />, title: "فهرست پیوست A خالی است", filteredTitle: "کنترلی با این مشخصات پیدا نشد" }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">{`کنترل‌های پیوست A، ${count(data.count, "ردیف")}`}</caption>
            <thead>
              <tr>
                <th scope="col">شماره</th>
                <th scope="col">عنوان</th>
                <th scope="col">موضوع</th>
                <th scope="col">کاربرد</th>
                <th scope="col">کنترل‌های سازمان</th>
                <th scope="col">ریسک‌ها</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td data-label="شماره" className="w-0">
                    <bdi className="code text-accent-text">{row.code}</bdi>
                  </td>
                  <td data-primary className="min-w-64">
                    <AppLink href={row.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                      {row.title}
                    </AppLink>
                    <span className="mt-0.5 block text-end text-xs text-muted" dir="ltr" lang="en">
                      {row.title_en}
                    </span>
                  </td>
                  <td data-label="موضوع" className="whitespace-nowrap">
                    {row.theme.label}
                  </td>
                  <td data-label="کاربرد" data-wide>
                    <ApplicabilityBadge value={row.applicability} />
                  </td>
                  <td data-label="کنترل‌های سازمان">
                    <span className="tabular">{fa(row.control_count)}</span>
                    {row.gap && (
                      <Badge tone="warning" className="ms-2">
                        بدون کنترل
                      </Badge>
                    )}
                  </td>
                  <td data-label="ریسک‌ها" className="tabular">
                    {fa(row.risk_count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </div>
  );
}

function SoaHeader({ data }: { data?: SoaDetail }) {
  const iso = data?.iso_control;
  return (
    <PageHeader
      breadcrumb={[SOA, iso ? { label: iso.code, code: true } : { label: "کنترل پیوست A" }]}
      title={iso?.title ?? "کنترل پیوست A"}
      description={
        iso && (
          <span dir="ltr" lang="en" className="block text-end">
            {iso.code} {iso.title_en}
          </span>
        )
      }
      meta={
        iso && (
          <>
            <Badge className="code">{iso.code}</Badge>
            <Badge tone="accent">{iso.theme.label}</Badge>
            <ApplicabilityBadge value={iso.applicability} />
          </>
        )
      }
      actions={
        data?.edit_url && (
          <AppLink href={data.edit_url} button={{ variant: data.iso_control.justification ? "secondary" : "primary" }}>
            <PencilLine aria-hidden />
            {data.edit_label}
          </AppLink>
        )
      }
    />
  );
}

export function SoaDetailPage() {
  const page = usePageData<SoaDetail>();
  useTitle(page.data?.title ?? "کنترل پیوست A");
  if (!page.data) return <DetailState query={page} header={<SoaHeader />} />;
  const data = page.data;
  const iso = data.iso_control;
  return (
    <article className="flex flex-col gap-6">
      <SoaHeader data={data} />
      {data.warning && (
        <Alert tone="warning" title="ناهمخوانی بیانیه و نگاشت کنترل‌ها">
          {data.warning}
        </Alert>
      )}
      <Card>
        <CardHeader
          icon={<FileCheck />}
          title="ردیف بیانیه"
          description={iso.updated_at ? `آخرین تغییر ${longDate(iso.updated_at)}` : undefined}
        />
        <CardContent className="text-sm leading-8 text-fg/90">
          {iso.justification !== null ? (
            <>
              <span className="block text-xs text-muted">دلیل</span>
              <Prose text={iso.justification} />
            </>
          ) : (
            <p className="text-muted">
              کاربرد این کنترل هنوز تعیین نشده است. کاربرد، دلیل و وضعیت اجرا را عضو GRC ثبت می‌کند.
            </p>
          )}
        </CardContent>
      </Card>
      <Section id="controls" title="کنترل‌های سازمان" icon={<ShieldCheck />}>
        <ControlTable
          controls={data.controls}
          caption="کنترل‌های سازمان که این کنترل پیوست A را اجرا می‌کنند"
          empty="کنترل سازمانی به این کنترل نگاشت نشده است."
        />
      </Section>
      <Section id="risks" title="ریسک‌هایی که به این کنترل‌ها تکیه دارند" icon={<Workflow />}>
        <RiskTable
          risks={data.risks}
          caption="ریسک‌هایی که به کنترل‌های این ردیف تکیه دارند"
          empty="ریسکی که شما ببینید به این کنترل‌ها تکیه ندارد."
        />
      </Section>
    </article>
  );
}
