import { ArrowRight } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ComparePage as ComparePageData } from "@/lib/types";

import { ComparisonTable } from "./ComparisonTable";

// مقایسه‌ی دو تا چهار ارزیابی یک ریسک (assessments/compare.html). جدول، ترتیب ستون‌ها و جهت تغییر هر خانه نسبت به
// ستون اول را جنگو حساب می‌کند (assessments/comparison.py)؛ این صفحه فقط نشانش می‌دهد.

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
        <ComparisonTable data={data} caption={`مقایسه‌ی ارزیابی‌های ریسک ${data.risk.code}`} />
      )}
    </div>
  );
}
