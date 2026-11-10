import { ChevronDown, ListChecks, RotateCcw, Save, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { FormPage } from "@/features/forms/FormPage";
import { SchemaForm } from "@/features/forms/SchemaForm";
import { ActionError } from "@/features/records/dossier";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { FormResult, ImportSection, StaffImportResult } from "@/lib/types";

// ورود کارکنان از فایل منابع انسانی (accounts/staff_import.html). همان دو قدم صفحه‌ی جنگو: فایل بارگذاری می‌شود و
// view جنگو گزارش آزمایشی می‌دهد بی آن‌که چیزی ذخیره کند؛ بعد «تأیید و ذخیره» یا «انصراف» به view تأیید فرستاده
// می‌شود. خواندن فایل، اعتبارسنجی، ذخیره و پاک کردن فایل همه کار جنگوست و این صفحه فقط گزارش را نشان می‌دهد.

const TITLE = "ورود کارکنان از فایل منابع انسانی";
const BREADCRUMB = [{ label: "کاربران", to: "/accounts/users" }, { label: "ورود کارکنان" }];

function isImportResult(result: FormResult): result is StaffImportResult {
  return "report" in result;
}

const SECTION_TONES = {
  warning: { box: "border-warning/30 bg-warning-soft/40", text: "text-warning" },
  danger: { box: "border-danger/30 bg-danger-soft/40", text: "text-danger" },
} as const;

/** یک بخش گزارش: بخشی که سطر دارد باز و بسته می‌شود، و بخش هشدار یا خطا از اول باز است (مثل قالب جنگو). */
function ReportSection({ section }: { section: ImportSection }) {
  const tone = section.level ? SECTION_TONES[section.level] : null;
  const heading = (
    <span className={cn("flex flex-1 items-center justify-between gap-3", tone?.text)}>
      <span>{section.title}</span>
      <Badge tone={section.level ?? (section.count ? "accent" : "neutral")} className="tabular">
        {fa(section.count)}
      </Badge>
    </span>
  );
  if (!section.lines.length) {
    // جای خالی هم‌اندازه‌ی فلش بخش‌های بازشونده، تا عنوان‌ها زیر هم بیفتند.
    return (
      <li className="flex items-center gap-2 px-4 py-3 text-sm">
        <span aria-hidden className="size-4 shrink-0" />
        {heading}
      </li>
    );
  }
  return (
    <li className={cn(tone && "border-y", tone?.box)}>
      <details open={Boolean(section.level)} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm marker:hidden hover:bg-surface/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          {heading}
        </summary>
        <ul className="flex list-disc flex-col gap-1 ps-12 pe-4 pb-3 text-xs leading-6 text-fg/90">
          {section.lines.map((line, index) => (
            <li key={`${index}-${line}`}>{faText(line)}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

function ImportReport({
  result,
  onResult,
  onRestart,
}: {
  result: StaffImportResult;
  onResult: (result: StaffImportResult) => void;
  onRestart: () => void;
}) {
  const action = useBridgeAction();
  const heading = useRef<HTMLHeadingElement>(null);
  const { report, confirm } = result;
  // فرم و دکمه‌ای که فوکوس داشت رفته‌اند؛ فوکوس به عنوان گزارش می‌رود تا صفحه‌خوان از همان‌جا بخواند.
  useEffect(() => heading.current?.focus(), [result]);
  // فایلی که دیگر نیست (لغو یا تأییدشده یا فایل تازه‌تر) دوباره تأیید نمی‌شود؛ فقط بارگذاری از نو می‌ماند.
  const expired = action.error instanceof ApiError && action.error.status === 400;
  const pressed = action.isPending ? ("cancel" in (action.variables?.values ?? {}) ? "cancel" : "confirm") : null;

  function send(button: "confirm" | "cancel") {
    if (!confirm) return;
    action.mutate(
      { url: confirm.url, values: { ...confirm.values, [button]: "" } },
      { onSuccess: (next) => (isImportResult(next) ? onResult(next) : onRestart()) },
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader breadcrumb={BREADCRUMB} title={TITLE} />
      {report.dry_run ? (
        <Alert tone="warning" title="اجرای آزمایشی: هنوز چیزی ذخیره نشده است.">
          گزارش را بخوانید و اگر درست بود، تأیید کنید.
        </Alert>
      ) : (
        <Alert tone="success" title={faText(result.message)} />
      )}
      <Card className="overflow-clip">
        <CardHeader
          icon={<ListChecks />}
          title={
            <span ref={heading} tabIndex={-1} className="rounded-sm focus:outline-none">
              {report.dry_run ? "گزارش آزمایشی" : "گزارش آن‌چه انجام شد"}
            </span>
          }
          description="بخش‌هایی که کار دستی لازم دارند باز و رنگی‌اند؛ بقیه را برای دیدن جزئیات باز کنید."
        />
        <CardContent className="px-0 pb-0">
          <ul className="divide-y divide-line border-t border-line">
            {report.sections.map((section) => (
              <ReportSection key={section.title} section={section} />
            ))}
          </ul>
        </CardContent>
      </Card>
      {action.error !== null && <ActionError error={action.error} />}
      <div className="flex flex-wrap gap-2">
        {confirm && !expired ? (
          <>
            <Button loading={pressed === "confirm"} disabled={action.isPending} onClick={() => send("confirm")}>
              <Save aria-hidden />
              تأیید و ذخیره
            </Button>
            <Button
              variant="secondary"
              loading={pressed === "cancel"}
              disabled={action.isPending}
              onClick={() => send("cancel")}
            >
              <X aria-hidden />
              انصراف
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onRestart}>
            <RotateCcw aria-hidden />
            بارگذاری فایل دیگر
          </Button>
        )}
      </div>
    </div>
  );
}

export function StaffImportPage() {
  const [result, setResult] = useState<StaffImportResult | null>(null);
  useTitle("ورود کارکنان");
  if (result) return <ImportReport result={result} onResult={setResult} onRestart={() => setResult(null)} />;
  return (
    <FormPage
      narrow
      body={(data, { path, today }) =>
        data.form && (
          <Card className="p-5 sm:p-7">
            <SchemaForm
              schema={data.form}
              path={path}
              submitLabel={data.submit}
              submitIcon={<Upload aria-hidden />}
              cancel={data.cancel}
              today={today}
              onSaved={(saved) => isImportResult(saved) && setResult(saved)}
            />
          </Card>
        )
      }
    />
  );
}
