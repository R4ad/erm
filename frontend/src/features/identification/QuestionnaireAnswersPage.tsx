import { Link } from "react-router-dom";

import { buttonClasses } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { useTitle } from "@/lib/hooks";

import { IdentificationWizard } from "./IdentificationWizard";
import { RecentEntries } from "./RecentEntries";
import { useWizardPage } from "./use-wizard-page";

// «پاسخ به پرسشنامه‌ها»: مدیر واحد، مالک «ثبت مأموریت و سناریو» در RACI روش، همان شش پرسش «شناسایی ریسک» را پاسخ
// می‌دهد، بی انتخاب از فهرست خدمت‌ها. ارسال ریسک نمی‌سازد؛ ورودی «در حال شناسایی» می‌شود و در جدول همین صفحه
// بی‌پیوند می‌ماند تا کارشناس ریسک خدمت را انتخاب و ریسک را ثبت کند. نوار گام‌های فرایند اینجا نیست؛ مدیر فقط
// همین یک گام را می‌بیند.

export function QuestionnaireAnswersPage() {
  useTitle("پاسخ به پرسشنامه‌ها");
  const { query, formKey, onDraftSaved, onSubmitted, focusFirst } = useWizardPage("answer");
  const denied = query.error instanceof ApiError && query.error.status === 403;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="پاسخ به پرسشنامه‌ها"
        description="سناریوی واحدتان را با شش پرسش جلسه‌ی شناسایی بنویسید · انتخاب از فهرست خدمت‌ها لازم نیست؛ کارشناس ریسک خدمت را تطبیق می‌دهد و ریسک را ثبت می‌کند"
        breadcrumb={[{ label: "پاسخ به پرسشنامه‌ها" }]}
      />
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : denied ? (
        <Alert tone="info" title="«پاسخ به پرسشنامه‌ها» برای مدیر واحد است">
          <p>این صفحه را مدیر واحدی می‌بیند که دست‌کم یک واحد دارد. ورودی‌های شناسایی را در «شناسایی ریسک» ببینید.</p>
          <Link
            to="/identification"
            viewTransition
            className={buttonClasses({ variant: "outline", size: "sm", className: "mt-2" })}
          >
            شناسایی ریسک
            <Icon name="arrow-left" className="ltr:rotate-180" />
          </Link>
        </Alert>
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <IdentificationWizard
            key={formKey}
            mode="answer"
            data={query.data}
            onDraftSaved={onDraftSaved}
            onSubmitted={onSubmitted}
            focusFirst={focusFirst}
          />
          <RecentEntries rows={query.data.recent} registerUrl={query.data.register_url} />
        </>
      )}
    </div>
  );
}
