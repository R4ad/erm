import { BookOpen, PencilLine, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { RiskTable } from "@/features/risks/RiskTable";
import { count, fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ScenarioDetail, ScenarioList, ScenarioRow } from "@/lib/types";

function Status({ scenario }: { scenario: ScenarioRow }) {
  return (
    <Badge tone={scenario.is_active ? "success" : "neutral"} dot>
      {scenario.is_active ? "فعال" : "غیرفعال"}
    </Badge>
  );
}

export function ScenarioListPage() {
  useTitle("کتابخانه‌ی سناریو");
  const [params] = useSearchParams();
  const page = usePageData<ScenarioList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کتابخانه‌ی سناریوهای مرجع"
        description={
          page.data ? `${count(page.data.count, "سناریو")} در کتابخانه سناریو.` : "سناریوهای ثبت‌شده را مرور کنید."
        }
        actions={
          page.data?.create_url && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              سناریوی تازه
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر سناریوها" />
      <ListBody
        query={page}
        label="سناریوها"
        filtered={filtered}
        empty={{
          icon: <BookOpen />,
          title: "هنوز سناریویی ثبت نشده",
          filteredTitle: "سناریویی با این فیلترها پیدا نشد",
        }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">سناریوهای مرجع</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">عنوان</th>
                <th scope="col">دسته</th>
                <th scope="col">نسخه</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((scenario) => (
                <tr key={scenario.id}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-accent-text">{scenario.code}</bdi>
                  </td>
                  <td data-primary className="min-w-56">
                    <AppLink
                      href={scenario.href}
                      className="font-medium text-fg hover:text-accent-text hover:no-underline"
                    >
                      {scenario.title}
                    </AppLink>
                  </td>
                  <td data-label="دسته" className="whitespace-nowrap">
                    <bdi className="code">{scenario.category.code}</bdi>{" "}
                    <span className="text-xs text-muted">{scenario.category.name}</span>
                  </td>
                  <td data-label="نسخه" className="tabular">
                    {fa(scenario.version)}
                  </td>
                  <td data-label="وضعیت">
                    <Status scenario={scenario} />
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted">{title}</h3>
      <p className="text-sm leading-8 whitespace-pre-line text-fg/90">{children}</p>
    </div>
  );
}

export function ScenarioDetailPage() {
  const page = usePageData<ScenarioDetail>();
  useTitle(page.data?.title ?? "سناریو");
  const crumbs = [{ label: "کتابخانه‌ی سناریو", to: "/risks/scenarios" }];
  if (!page.data) {
    return (
      <DetailState query={page} header={<PageHeader title="سناریو" breadcrumb={[...crumbs, { label: "پرونده" }]} />} />
    );
  }
  const { scenario, risks } = page.data;
  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[...crumbs, { label: scenario.code, code: true }]}
        title={scenario.title}
        meta={
          <>
            <Badge className="code">{scenario.code}</Badge>
            <Badge>نسخه‌ی {fa(scenario.version)}</Badge>
            <Status scenario={scenario} />
          </>
        }
        actions={
          <>
            {page.data.create_risk_url && (
              <AppLink href={page.data.create_risk_url} button={{ variant: "primary" }}>
                <Plus aria-hidden />
                ثبت ریسک از این سناریو
              </AppLink>
            )}
            {page.data.edit_url && (
              <AppLink href={page.data.edit_url} button={{ variant: "secondary" }}>
                <PencilLine aria-hidden />
                ویرایش
              </AppLink>
            )}
          </>
        }
      />
      <Card>
        <CardHeader
          icon={<BookOpen />}
          title="شرح سناریو"
          description={`دسته‌ی اصلی ${scenario.category.code} ${scenario.category.name}`}
        />
        <CardContent className="flex flex-col gap-5">
          {scenario.narrative && <Section title="متن سناریو">{scenario.narrative}</Section>}
          <Section title="رویداد اصلی">{scenario.event}</Section>
          <Section title="شرایط">{scenario.conditions}</Section>
          <Section title="پیامد">{scenario.consequence}</Section>
        </CardContent>
      </Card>
      <section aria-labelledby="scenario-risks" className="flex flex-col gap-3">
        <h2 id="scenario-risks" className="text-heading font-semibold">
          ریسک‌های ساخته‌شده از این سناریو
        </h2>
        <RiskTable
          risks={risks}
          caption="ریسک‌های ساخته‌شده از این سناریو"
          empty="ریسکی از این سناریو که شما ببینید ثبت نشده است."
        />
      </section>
    </article>
  );
}
