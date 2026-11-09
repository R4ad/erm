import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ComparePage as ComparePageData } from "@/lib/types";

// مقایسه‌ی دو تا چهار ارزیابی یک ریسک (assessments/compare.html). جدول، ترتیب ستون‌ها و جهت تغییر هر خانه نسبت به
// ستون اول را جنگو حساب می‌کند (assessments/comparison.py)؛ این صفحه فقط نشانش می‌دهد.

function Trend({ trend }: { trend: "" | "up" | "down" }) {
  if (trend === "down") {
    return (
      <span className="inline-flex items-center text-success" title="کمتر از ستون اول">
        <ArrowDown aria-hidden className="size-4" />
        <span className="sr-only">کمتر از ستون اول</span>
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span className="inline-flex items-center text-danger" title="بیشتر از ستون اول">
        <ArrowUp aria-hidden className="size-4" />
        <span className="sr-only">بیشتر از ستون اول</span>
      </span>
    );
  }
  return null;
}

function Header({ data }: { data?: ComparePageData }) {
  return (
    <div className="flex flex-col gap-3">
      {data && (
        <AppLink
          href={`${data.risk.href}#assessments`}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          <ArrowRight aria-hidden className="size-4 ltr:-scale-x-100" />
          برگشت به ریسک
        </AppLink>
      )}
      <PageHeader
        title="مقایسه‌ی ارزیابی‌ها"
        breadcrumb={[
          { label: "رجیستر ریسک", to: "/risks" },
          ...(data ? [{ label: data.risk.code, to: `/risks/${data.risk.id}`, code: true }] : []),
          { label: "مقایسه" },
        ]}
        description={
          data && (
            <AppLink href={data.risk.href}>
              <bdi className="code">{data.risk.code}</bdi> {data.risk.title}
            </AppLink>
          )
        }
      />
    </div>
  );
}

export function ComparePage() {
  const page = usePageData<ComparePageData>();
  useTitle(page.data?.title ?? "مقایسه‌ی ارزیابی‌ها");
  if (!page.data) return <DetailState query={page} header={<Header />} />;
  const data = page.data;

  return (
    <div className="flex flex-col gap-6">
      <Header data={data} />
      {data.error ? (
        <Alert tone="warning" role="alert">
          {faText(data.error)}
        </Alert>
      ) : (
        <>
          {data.method_changed && (
            <Alert tone="warning">
              نسخه‌ی روش این ارزیابی‌ها یکی نیست؛ بخشی از تغییر سطح ممکن است از تغییر روش آمده باشد و جدا از اثر
              اقدام‌ها گزارش می‌شود (بخش ۲۱).
            </Alert>
          )}
          <Card className="table-shell overflow-clip">
            <div className="table-scroll">
              <table className="data-table data-matrix">
                <caption className="sr-only">
                  مقایسه‌ی ارزیابی‌های ریسک {data.risk.code}؛ جهت تغییر هر خانه نسبت به ستون اول است.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">مؤلفه</th>
                    {data.profiles.map((profile, index) => (
                      <th key={profile.id} scope="col" className="text-center">
                        <span className="flex flex-col items-center gap-1">
                          <AppLink href={profile.href} className="code">
                            {profile.code}
                          </AppLink>
                          {/* سرستون جدول یک‌خطی است؛ نوع و نسخه در ستون باریک موبایل به خط بعد می‌روند. */}
                          <span className="text-xs font-normal whitespace-normal text-muted">
                            {profile.kind.label}،{" "}
                            <span className="whitespace-nowrap">روش نسخه‌ی {fa(profile.method_version)}</span>
                          </span>
                          <span className="flex flex-wrap justify-center gap-1">
                            {index === 0 && <Badge tone="info">مبنای مقایسه</Badge>}
                            {profile.incomplete && <Badge tone="danger">ناقص</Badge>}
                          </span>
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="min-w-32 text-start font-normal text-fg sm:min-w-48">
                        {faText(row.label)}
                      </th>
                      {row.cells.map((cell, index) => (
                        <td key={data.profiles[index]?.id ?? index} className="text-center whitespace-nowrap">
                          <span className="inline-flex items-center justify-center gap-1.5 tabular">
                            {cell.level ? <LevelBadge level={cell.level} /> : faText(cell.text)}
                            <Trend trend={cell.trend} />
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <p className="text-xs leading-6 text-muted">
            پیامد هر بُعد بیشترین سطح آن در ستون‌های داتین و بانک‌هاست؛ «؟» یعنی خانه‌ای نامعلوم یا ثبت‌نشده است.{" "}
            <ArrowDown aria-hidden className="inline size-3.5 text-success" />
            <span className="sr-only">پیکان رو به پایین</span> یعنی کمتر از ستون اول و{" "}
            <ArrowUp aria-hidden className="inline size-3.5 text-danger" />
            <span className="sr-only">پیکان رو به بالا</span> یعنی بیشتر.
          </p>
        </>
      )}
    </div>
  );
}
