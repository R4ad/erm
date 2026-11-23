import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { usePageCrumbs } from "@/components/layout/crumbs-context";
import { PageSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { get } from "@/lib/api";
import { useTitle } from "@/lib/hooks";
import type { QuestionnaireAnswersData } from "@/lib/types";

import { AnswerWizard } from "./AnswerWizard";
import { RecentResponses } from "./RecentResponses";

// «پاسخ به پرسشنامه‌ها» (فریم‌های 30 تا 30f): ویزارد هشت‌گامی مدیر واحد و پاسخنامه‌های اخیر. صفحه سرصفحه‌ی دیداری
// ندارد و عنوانش فقط در مسیر نوار بالا و برای صفحه‌خوان است. ?response= پیش‌نویس یا پاسخنامه‌ی بازگشتی را ادامه می‌دهد.

export function QuestionnaireAnswersPage() {
  useTitle("پاسخ به پرسشنامه‌ها");
  usePageCrumbs([{ label: "پاسخ به پرسشنامه‌ها" }]);
  const [params] = useSearchParams();
  const response = params.get("response") ?? "";
  // پاسخنامه‌ای که همین فرم ذخیره یا ارسال کرده فرم را از نو نمی‌سازد، تا گام و فوکوس سر جایش بماند.
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState({ response, key: response });
  if (formKey.response !== response) {
    setFormKey({ response, key: saved === response ? formKey.key : response });
  }
  const [fresh, setFresh] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["questionnaire-answers", response],
    queryFn: ({ signal }) =>
      get<QuestionnaireAnswersData>(`questionnaire-answers/${response ? `?response=${response}` : ""}`, signal),
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">پاسخ به پرسشنامه‌ها</h1>
      {query.isPending ? (
        <PageSkeleton rows={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <AnswerWizard key={formKey.key} data={query.data} onSaved={setSaved} onSent={setFresh} />
          <RecentResponses rows={query.data.recent} allUrl={query.data.all_url} fresh={fresh} />
        </>
      )}
    </div>
  );
}
