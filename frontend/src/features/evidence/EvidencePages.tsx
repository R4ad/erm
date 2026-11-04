import { FileSearch, Lock, PencilLine, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { RiskTable } from "@/features/risks/RiskTable";
import { count, longDate, safeExternalUrl, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { EvidenceDetail, EvidenceList, EvidenceRow } from "@/lib/types";

function Flags({ item }: { item: EvidenceRow }) {
  return (
    <>
      {item.confidential && (
        <Badge tone="info">
          <Lock aria-hidden />
          محرمانه
        </Badge>
      )}
      {item.expired && <Badge tone="danger">منقضی</Badge>}
    </>
  );
}

export function EvidenceListPage() {
  useTitle("شواهد");
  const [params] = useSearchParams();
  const page = usePageData<EvidenceList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="شواهد"
        description={
          page.data
            ? `${count(page.data.count, "شاهد")} که اجازه‌ی دیدنشان را دارید؛ تازه‌ترین بالا.`
            : "رخداد، آمار، آزمون و هر ادعای قابل ردیابی که ریسک‌ها به آن استناد می‌کنند."
        }
        actions={
          page.data?.create_url && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              شاهد تازه
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر شواهد" />
      <ListBody
        query={page}
        label="شواهد"
        filtered={filtered}
        empty={{ icon: <FileSearch />, title: "هنوز شاهدی ثبت نشده", filteredTitle: "شاهدی با این فیلترها پیدا نشد" }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">شواهد</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">عنوان</th>
                <th scope="col">نوع</th>
                <th scope="col">زمان</th>
                <th scope="col">اعتبار</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((item) => (
                <tr key={item.id}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-accent-text">{item.code}</bdi>
                  </td>
                  <td data-primary className="min-w-56">
                    <AppLink href={item.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                      {item.title}
                    </AppLink>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Flags item={item} />
                    </div>
                  </td>
                  <td data-label="نوع" className="whitespace-nowrap">
                    {item.kind.label}
                  </td>
                  <td data-label="زمان" className="whitespace-nowrap text-muted">
                    <time dateTime={item.observed_on.iso}>{shortDate(item.observed_on)}</time>
                  </td>
                  <td data-label="اعتبار" className="whitespace-nowrap">
                    {item.reliability.label}
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export function EvidenceDetailPage() {
  const page = usePageData<EvidenceDetail>();
  useTitle(page.data?.title ?? "شاهد");
  const crumbs = [{ label: "شواهد", to: "/risks/evidence" }];
  if (!page.data) {
    return (
      <DetailState query={page} header={<PageHeader title="شاهد" breadcrumb={[...crumbs, { label: "پرونده" }]} />} />
    );
  }
  const { evidence, risks } = page.data;
  const link = safeExternalUrl(evidence.url);
  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[...crumbs, { label: evidence.code, code: true }]}
        title={evidence.title}
        meta={
          <>
            <Badge className="code">{evidence.code}</Badge>
            <Badge tone="accent">{evidence.kind.label}</Badge>
            <Flags item={evidence} />
          </>
        }
        actions={
          page.data.edit_url && (
            <AppLink href={page.data.edit_url} button={{ variant: "secondary" }}>
              <PencilLine aria-hidden />
              ویرایش
            </AppLink>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader icon={<FileSearch />} title="خلاصه" />
            <CardContent className="flex flex-col gap-3">
              <p className="text-sm leading-8 whitespace-pre-line text-fg/90">{evidence.summary}</p>
              {evidence.scope && (
                <p className="rounded-lg bg-surface px-3 py-2 text-xs whitespace-pre-line text-muted">
                  دامنه: {evidence.scope}
                </p>
              )}
            </CardContent>
          </Card>
          <section aria-labelledby="evidence-risks" className="flex flex-col gap-3">
            <h2 id="evidence-risks" className="text-heading font-semibold">
              ریسک‌های مرتبط
            </h2>
            <RiskTable risks={risks} caption="ریسک‌های مرتبط با این شاهد" empty="به ریسکی که شما ببینید وصل نیست." />
          </section>
          <Attachments record={page.data} />
          <Comments record={page.data} />
        </div>
        <aside aria-label="مشخصات شاهد">
          <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <CardHeader title="مشخصات" />
            <CardContent>
              <dl className="flex flex-col divide-y divide-line">
                <Fact label="منبع">{evidence.source}</Fact>
                <Fact label="زمان">{longDate(evidence.observed_on)}</Fact>
                <Fact label="اعتبار">{evidence.reliability.label}</Fact>
                <Fact label="معتبر تا">{evidence.valid_until ? longDate(evidence.valid_until) : null}</Fact>
                <Fact label="طبقه‌ی دسترسی">{evidence.access_class.label}</Fact>
                <Fact label="بانک">{evidence.customer}</Fact>
                <Fact label="مالک">{evidence.owner?.name}</Fact>
                <Fact label="پیوند">
                  {evidence.url &&
                    (link ? (
                      <a
                        href={link}
                        rel="noopener noreferrer"
                        target="_blank"
                        className="break-all text-accent-text hover:underline"
                        dir="ltr"
                      >
                        {evidence.url}
                        <span className="sr-only"> (در برگه‌ی تازه)</span>
                      </a>
                    ) : (
                      <bdi className="break-all">{evidence.url}</bdi>
                    ))}
                </Fact>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}
