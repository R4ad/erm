import { Hourglass, Search } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/states";
import { FormPage } from "@/features/forms/FormPage";
import { SchemaForm } from "@/features/forms/SchemaForm";
import { count } from "@/lib/format";
import type { JalaliDate } from "@/lib/jalali";
import type { FormPageData } from "@/lib/types";

// ثبت ریسک در انتظار در رجیستر (questionnaires:pending_convert). مثل صفحه‌ی جنگو دو قدم دارد: اول سناریوی مرجع فعالی
// که ریسک از آن ساخته می‌شود (risks/pending_scenario_select.html)، بعد همان فرم ثبت ریسک از سناریو که مقدارهای پاسخ
// از پیش در آن پر شده‌اند.

function PendingBrief({ data }: { data: FormPageData }) {
  if (!data.pending) return null;
  return (
    <Card>
      <CardHeader icon={<Hourglass />} title="ریسک در انتظار" description={`منبع: ${data.pending.source}`} />
      <CardContent>
        <p className="text-sm leading-7 whitespace-pre-line text-fg/90">{data.pending.description}</p>
      </CardContent>
    </Card>
  );
}

function ScenarioPicker({ data, path }: { data: FormPageData; path: string }) {
  const [query, setQuery] = useState("");
  const scenarios = data.scenarios ?? [];
  const text = query.trim();
  const shown = text
    ? scenarios.filter((item) => `${item.code} ${item.title} ${item.service}`.includes(text))
    : scenarios;
  const base = path.split("?")[0];
  return (
    <div className="flex flex-col gap-5">
      <PendingBrief data={data} />
      <Card>
        <CardHeader
          title="سناریوی مرتبط را انتخاب کنید"
          description="ریسک از سناریوی مرجع فعالی ساخته می‌شود که خدمت فعال دارد."
        />
        <CardContent className="flex flex-col gap-4">
          {scenarios.length > 6 && (
            <Field label="جست‌وجوی سناریو">
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                />
                <Input
                  type="search"
                  value={query}
                  className="ps-10"
                  placeholder="کد، عنوان یا خدمت"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </Field>
          )}
          {scenarios.length > 6 && (
            <p aria-live="polite" className="text-xs text-muted">
              {count(shown.length, "سناریو")}
            </p>
          )}
          {shown.length ? (
            <ul
              aria-label="سناریوهای فعال"
              className="flex flex-col divide-y divide-line rounded-xl border border-line"
            >
              {shown.map((scenario) => (
                <li key={scenario.id}>
                  <AppLink
                    href={`${base}?scenario=${scenario.id}`}
                    className="flex flex-col gap-0.5 px-4 py-3 text-fg transition-colors hover:bg-surface hover:no-underline"
                  >
                    <span className="font-medium">
                      <bdi className="code text-accent-text">{scenario.code}</bdi> {scenario.title}
                    </span>
                    <span className="text-xs text-muted">{scenario.service}</span>
                  </AppLink>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<Search />}
              title={scenarios.length ? "سناریویی با این عبارت پیدا نشد" : "سناریوی فعالی با خدمت فعال وجود ندارد"}
              description={scenarios.length ? undefined : "اول سناریوی مرجع را در کتابخانه‌ی سناریوها ثبت کنید."}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ConvertForm({ data, path, today }: { data: FormPageData; path: string; today?: JalaliDate }) {
  if (data.scenarios) return <ScenarioPicker data={data} path={path} />;
  if (!data.form) return null;
  return (
    <div className="flex flex-col gap-5">
      <PendingBrief data={data} />
      <Card className="p-5 sm:p-7">
        <SchemaForm schema={data.form} path={path} submitLabel={data.submit} cancel={data.cancel} today={today} />
      </Card>
    </div>
  );
}

export function PendingConvertPage() {
  return (
    <FormPage body={(data, { path, today }) => <ConvertForm key={path} data={data} path={path} today={today} />} />
  );
}
