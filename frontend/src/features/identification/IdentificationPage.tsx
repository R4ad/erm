import { Link } from "react-router-dom";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { ProcessSteps, type StepState } from "@/components/ui/process-step";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useTitle } from "@/lib/hooks";

import { IdentificationWizard } from "./IdentificationWizard";
import { RecentEntries } from "./RecentEntries";
import { useWizardPage } from "./use-wizard-page";

// «شناسایی ریسک»: عضو GRC و مدیر سامانه ریسک را با ویزارد شش پرسش ثبت می‌کنند و ورودی‌های «در حال شناسایی» مدیران
// واحد را، که بالای جدول ورودی‌های اخیر می‌آیند، با انتخاب خدمت تکمیل می‌کنند. مدیر واحد سناریو را از «پاسخ به
// پرسشنامه‌ها» می‌فرستد و اینجا فقط وضعیت ورودی‌های خودش را می‌بیند.

const PROCESS: { label: string; state: StepState }[] = [
  { label: "شناسایی", state: "current" },
  { label: "گردآوری شواهد", state: "upcoming" },
  { label: "تحلیل", state: "upcoming" },
  { label: "ارزیابی", state: "upcoming" },
  { label: "تصمیم و اجرا", state: "upcoming" },
  { label: "آزمون و بازسنجی", state: "upcoming" },
  { label: "پایش و گزارش", state: "upcoming" },
];

export function IdentificationPage() {
  useTitle("شناسایی ریسک");
  const { query, formKey, onDraftSaved } = useWizardPage("identify");

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="شناسایی ریسک"
        description="ثبت سناریو با شش پرسش جلسه‌ی شناسایی طبق الگوی بخش ۴ روش · افق پیش‌فرض ۱۲ ماه · دارایی ورودی اجباری نیست"
        breadcrumb={[{ label: "شناسایی ریسک" }]}
      />
      <Card
        className="overflow-x-auto px-5 py-[0.9375rem]"
        role="region"
        tabIndex={0}
        aria-label="گام‌های فرایند مدیریت ریسک"
      >
        <ProcessSteps steps={PROCESS} className="min-w-[40rem]" />
      </Card>
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          {query.data.can_identify && query.data.choices ? (
            <IdentificationWizard key={formKey} mode="identify" data={query.data} onDraftSaved={onDraftSaved} />
          ) : query.data.can_answer ? (
            <Alert tone="info" title="ثبت و تکمیل ریسک در این صفحه با عضو GRC است">
              <p>
                سناریوی واحدتان را از «پاسخ به پرسشنامه‌ها» بفرستید. وضعیت پاسخ‌هایی را که فرستاده‌اید پایین همین صفحه
                می‌بینید.
              </p>
              <Link
                to="/questionnaire-answers"
                viewTransition
                className={buttonClasses({ variant: "outline", size: "sm", className: "mt-2" })}
              >
                پاسخ به پرسشنامه‌ها
                <Icon name="arrow-left" className="ltr:rotate-180" />
              </Link>
            </Alert>
          ) : (
            <Alert tone="info" title="ثبت ورودی شناسایی با عضو GRC و مدیر سامانه است">
              ورودی‌های اخیری را که به آن‌ها دسترسی دارید پایین همین صفحه می‌بینید.
            </Alert>
          )}
          <RecentEntries rows={query.data.recent} registerUrl={query.data.register_url} />
        </>
      )}
    </div>
  );
}
