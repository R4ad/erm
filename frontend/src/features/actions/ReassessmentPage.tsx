import { ArrowLeftRight } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/states";
import { ComparisonTable } from "@/features/assessments/ComparisonTable";
import { FormPage } from "@/features/forms/FormPage";
import { SchemaForm } from "@/features/forms/SchemaForm";
import type { JalaliDate } from "@/lib/jalali";
import type { FormPageData } from "@/lib/types";

// فرم بازسنجی طرح مواجهه (actions/reassessment_form.html): ارزیابی جاری تازه کنار ارزیابی مبنا و هدف، اقدام‌هایی که
// هنوز تأیید نشده‌اند و با بسته شدن طرح باز می‌مانند، و فرم تصمیم. مقایسه و فرم هر دو از همان view جنگو می‌آیند.

function ReassessmentForm({ data, path, today }: { data: FormPageData; path: string; today?: JalaliDate }) {
  const openActions = data.open_actions ?? [];
  return (
    <div className="flex flex-col gap-6">
      {data.risk?.href && (
        <p className="text-sm">
          <AppLink href={data.risk.href}>
            <bdi className="code">{data.risk.code}</bdi> {data.risk.title}
          </AppLink>
        </p>
      )}
      {data.comparison && (
        <ComparisonTable
          data={data.comparison}
          caption={`مقایسه‌ی ارزیابی مبنا، ارزیابی تازه و هدف${data.risk ? ` ریسک ${data.risk.code}` : ""}`}
        />
      )}
      {openActions.length > 0 && (
        <Alert tone="warning" title="این اقدام‌ها هنوز تأیید نشده‌اند و با بسته شدن طرح باز می‌مانند:">
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {openActions.map((action) => (
              <li key={action.code}>
                <AppLink href={action.href} className="code">
                  {action.code}
                </AppLink>{" "}
                <span className="text-xs">({action.status.label})</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {data.form ? (
        <Card className="max-w-3xl p-5 sm:p-7">
          <SchemaForm
            schema={data.form}
            path={path}
            cancel={data.cancel}
            today={today}
            submitLabel={data.submit}
            submitIcon={<ArrowLeftRight aria-hidden />}
          />
        </Card>
      ) : (
        <Alert tone="danger">این صفحه فرمی ندارد.</Alert>
      )}
    </div>
  );
}

export function ReassessmentPage() {
  return (
    <FormPage body={(data, { path, today }) => <ReassessmentForm key={path} data={data} path={path} today={today} />} />
  );
}
