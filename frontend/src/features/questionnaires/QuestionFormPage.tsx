import { ListPlus } from "lucide-react";

import { Card } from "@/components/ui/card";
import { FormPage } from "@/features/forms/FormPage";
import { SchemaForm } from "@/features/forms/SchemaForm";
import { fa } from "@/lib/format";
import type { JalaliDate } from "@/lib/jalali";
import type { FormField, FormPageData, FormSchema } from "@/lib/types";

// سؤال پرسشنامه و گزینه‌هایش در یک صفحه (questionnaires/question_form.html). فرم سؤال و فرم هر گزینه (formset جنگو با
// پیشوند options-<شماره> و فیلدهای مدیریت پنهانش) با هم به همان view فرستاده می‌شوند؛ پس قاعده‌هایی مثل «سؤال گزینه‌ای
// دست‌کم دو گزینه‌ی فعال می‌خواهد» و «سناریو فقط برای گزینه‌ی نشانه‌ی ریسک» همان قاعده‌های جنگوست.

const QUESTION_LAYOUT = [["text"], ["kind", "stage", "order"], ["help_text"], ["is_required", "is_active"]];

function QuestionForm({ data, path, today }: { data: FormPageData; path: string; today?: JalaliDate }) {
  const question = data.form;
  const options = data.options;
  if (!question || !options) return null;
  const rows = options.rows;
  const schema: FormSchema = {
    fields: [...question.fields, ...options.management, ...rows.flatMap((row) => row.fields)],
    errors: [...question.errors, ...options.errors, ...rows.flatMap((row) => row.errors)],
    multipart: false,
  };
  const questionNames = new Set(question.fields.map((field) => field.name));
  // نام هر فیلد گزینه در خلاصه‌ی خطاها با شماره‌ی همان گزینه، چون «متن گزینه» در هر ردیف تکرار می‌شود.
  const rowOf = new Map(rows.flatMap((row, index) => row.fields.map((field) => [field.name, index + 1] as const)));
  const summaryLabel = (field: FormField) => {
    const row = rowOf.get(field.name);
    return row ? `گزینه‌ی ${fa(row)}، ${field.label}` : field.label;
  };
  return (
    <Card className="p-5 sm:p-7">
      <SchemaForm
        schema={schema}
        path={path}
        cancel={data.cancel}
        today={today}
        stickyActions={!data.structured}
        summaryLabel={summaryLabel}
        layout={(field) => (
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-5">
              {QUESTION_LAYOUT.map((names) => {
                const present = names.filter((name) => questionNames.has(name));
                if (!present.length) return null;
                return (
                  <div key={names.join("-")} className={present.length > 1 ? "grid gap-5 sm:grid-cols-3" : undefined}>
                    {present.map((name) => (
                      <div key={name} className={name === "kind" && present.length === 2 ? "sm:col-span-2" : undefined}>
                        {field(name)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {data.structured ? (
              <p className="text-xs text-muted">
                پرسش‌های این پرسشنامه متنی‌اند و گزینه ندارند؛ بخش سؤال جای تکرار آن را در خدمت، اتفاق، راه، تمهید،
                پیامد یا شاهد مشخص می‌کند.
              </p>
            ) : (
              <section aria-labelledby="options-title" className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <h2 id="options-title" className="flex items-center gap-2 text-lg font-semibold text-fg">
                    <ListPlus aria-hidden className="size-5 text-accent-text" />
                    گزینه‌ها
                  </h2>
                  <p className="text-xs leading-6 text-muted">
                    برای سؤال متنی گزینه لازم نیست. برای «بله و خیر» اگر گزینه‌ای ننویسید، بله و خیر خودکار ساخته می‌شود
                    و بعد می‌توانید مشخص کنید کدام نشانه‌ی ریسک است. گزینه‌ای که جواب گرفته حذف نمی‌شود؛ غیرفعالش کنید.
                    ردیف بی‌متن نادیده گرفته می‌شود و برای گزینه‌های بیشتر، بعد از ذخیره دوباره ویرایش کنید.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {rows.map((row, index) => (
                    <fieldset
                      key={row.prefix}
                      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface/40 p-4"
                    >
                      <legend className="float-start text-xs font-semibold text-muted">گزینه‌ی {fa(index + 1)}</legend>
                      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-4">
                        {field(`${row.prefix}-order`)}
                        {field(`${row.prefix}-text`)}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {field(`${row.prefix}-scenario`)}
                        {field(`${row.prefix}-category`)}
                      </div>
                      <div className="flex flex-wrap gap-x-8 gap-y-3">
                        {field(`${row.prefix}-indicates_risk`)}
                        {field(`${row.prefix}-is_active`)}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      />
    </Card>
  );
}

export function QuestionFormPage() {
  return (
    <FormPage body={(data, { path, today }) => <QuestionForm key={path} data={data} path={path} today={today} />} />
  );
}
