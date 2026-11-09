import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BookOpen, GitBranch, Grid3x3, Info, Send, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useSession } from "@/features/session/session";
import { ApiError, bridge, get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa, faText, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { parseJalali, type JalaliDate } from "@/lib/jalali";
import { djangoPath } from "@/lib/routes";
import type { AppHref, FormPageData } from "@/lib/types";

import { SchemaForm } from "./SchemaForm";

// هر صفحه‌ی فرم جنگو که در جدول پیوندهاست (ویرایش ریسک، شاهد تازه، انتقال گردش کار، پیوست و...) با همین صفحه
// نشان داده می‌شود. فرم، عنوان، نشانی انصراف و چیزهای بیشتر صفحه را همان view جنگو می‌دهد (/api/forms/).

function Messages({ data }: { data: FormPageData }) {
  if (!data.messages.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {data.messages.map((message) => (
        <Alert
          key={message.text}
          tone={message.level === "error" ? "danger" : message.level === "warning" ? "warning" : "info"}
        >
          {faText(message.text)}
        </Alert>
      ))}
    </div>
  );
}

/** انتقال گردش کار: از کجا به کجا، و شرط‌هایی که هنوز برقرار نیستند. */
function TransitionInfo({ data }: { data: FormPageData }) {
  if (!data.transition || !data.risk) return null;
  return (
    <Card>
      <CardHeader
        icon={<GitBranch />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            از «{data.transition.source}» به «{data.transition.target}»
          </span>
        }
        description={data.transition.description}
      />
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted">
          ریسک{" "}
          <AppLink href={`/risks/${data.risk.id}/`}>
            <bdi className="code">{data.risk.code}</bdi> {data.risk.title}
          </AppLink>
        </p>
        {data.problems && data.problems.length > 0 && (
          <Alert tone="warning" title="این شرط‌ها هنوز برقرار نیست:">
            <ul className="mt-1 flex list-disc flex-col gap-1 ps-5">
              {data.problems.map((problem) => (
                <li key={problem}>{faText(problem)}</li>
              ))}
            </ul>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/** خانه‌ی «خدمت × دسته‌ی» جهان ریسک و ریسک‌های فعالی که الان در آن هست. */
function CoverageInfo({ data }: { data: FormPageData }) {
  const cell = data.cell;
  if (!cell) return null;
  return (
    <Card>
      <CardHeader
        icon={<Grid3x3 />}
        title={
          <>
            خدمت {cell.service.name} × <bdi className="code">{cell.category.code}</bdi> {cell.category.name}
          </>
        }
        description={
          cell.reviewed_by && cell.reviewed_on
            ? `آخرین بررسی: ${cell.reviewed_by.name}، ${longDate(cell.reviewed_on)}`
            : "هنوز بررسی نشده است."
        }
        actions={
          <Badge
            tone={
              cell.status.value === "reviewed" ? "success" : cell.status.value === "pending" ? "warning" : "neutral"
            }
          >
            {cell.status.label}
          </Badge>
        }
      />
      <CardContent>
        {data.risks && data.risks.length > 0 ? (
          <ul className="flex flex-col gap-1.5 text-sm">
            {data.risks.map((risk) => (
              <li key={risk.id}>
                <AppLink href={risk.href}>
                  <bdi className="code">{risk.code}</bdi> {risk.title}
                </AppLink>
                {risk.owner && <span className="text-xs text-muted">، مالک {risk.owner.name}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">ریسک فعالی در این خانه ثبت نشده است.</p>
        )}
      </CardContent>
    </Card>
  );
}

/** هشدارهای کنار فرم، مثل پیشنهاد سطح A از روی نرخ یا ناقص بودن تعریف ریسک. */
function FormAlerts({ data }: { data: FormPageData }) {
  if (!data.alerts?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {data.alerts.map((alert) => (
        <Alert
          key={alert.text}
          tone={alert.tone}
          action={
            alert.link && (
              <AppLink href={alert.link.href} className="text-sm whitespace-nowrap">
                {alert.link.label}
              </AppLink>
            )
          }
        >
          {faText(alert.text)}
          {alert.items && alert.items.length > 0 && (
            <ul className="mt-1 flex list-disc flex-col gap-1 ps-5 text-xs">
              {alert.items.map((item) => (
                <li key={item}>{faText(item)}</li>
              ))}
            </ul>
          )}
        </Alert>
      ))}
    </div>
  );
}

function Facts({ data }: { data: FormPageData }) {
  if (!data.facts) return null;
  return (
    <Card>
      <CardHeader icon={<Info />} title={data.facts.title} as="h2" />
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          {data.facts.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="whitespace-pre-line text-fg">{row.value || "-"}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

/** جدول‌های راهنمای روش کنار فرم (سطح‌های A، B0، قاعده‌های Bc)، تا ارزیاب بی‌رفتن به صفحه‌ی روش انتخاب کند. */
function Guides({ data }: { data: FormPageData }) {
  if (!data.guides?.length) return null;
  return (
    <aside aria-label="راهنمای روش" className="flex flex-col gap-4 lg:sticky lg:top-20">
      {data.guides.map((guide) => (
        <Card key={guide.title} className="overflow-clip">
          <CardHeader icon={<BookOpen />} title={guide.title} as="h2" />
          <dl className="divide-y divide-line border-t border-line text-sm">
            {guide.items.map((item, index) => (
              <div key={`${item.term}-${index}`} className="flex gap-3 px-5 py-3">
                {item.term && (
                  <dt className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface font-semibold text-fg tabular">
                    {fa(item.term)}
                  </dt>
                )}
                <dd className="flex min-w-0 flex-col gap-0.5">
                  {item.label && <span className="font-medium text-fg">{faText(item.label)}</span>}
                  <span className="text-muted">{faText(item.text)}</span>
                </dd>
              </div>
            ))}
          </dl>
          {guide.notes.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-line px-5 py-3 text-xs leading-6 text-muted">
              {guide.notes.map((note) => (
                <p key={note}>{faText(note)}</p>
              ))}
            </div>
          )}
        </Card>
      ))}
    </aside>
  );
}

/**
 * فرم بلندی که جنگو بخش‌بندی کرده است (برگه‌ی آزمون کنترل): هر بخش یک fieldset با عنوان و شماره. فیلدی که در هیچ
 * بخشی نیست، اگر باشد، آخر فرم می‌آید تا چیزی از فرم جنگو جا نماند.
 */
function Fieldsets({
  sections,
  names,
  field,
}: {
  sections: NonNullable<FormPageData["fieldsets"]>;
  names: string[];
  field: (name: string) => ReactNode;
}) {
  const placed = new Set(sections.flatMap((section) => section.fields));
  const rest = names.filter((name) => !placed.has(name));
  return (
    <div className="flex flex-col gap-8">
      {sections.map((section, index) => (
        <fieldset
          key={section.title}
          className="flex min-w-0 flex-col gap-5 border-t border-line pt-6 first:border-t-0 first:pt-0"
        >
          <legend className="float-start flex items-center gap-2.5 text-base font-semibold text-fg">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg border border-accent-line/60 bg-accent-soft text-xs text-accent-text tabular"
            >
              {fa(index + 1)}
            </span>
            {faText(section.title)}
          </legend>
          {section.fields.map(field)}
        </fieldset>
      ))}
      {rest.length > 0 && <div className="flex flex-col gap-5">{rest.map(field)}</div>}
    </div>
  );
}

function submitIcon(view: string) {
  if (view === "core:attachment_upload") return <Upload aria-hidden />;
  if (view.startsWith("workflow:")) return <Send aria-hidden className="rtl:-scale-x-100" />;
  return undefined;
}

function Back({ cancel }: { cancel: AppHref | null }) {
  if (!cancel) return null;
  return (
    <AppLink href={cancel.href} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
      <ArrowRight aria-hidden className="size-4 ltr:-scale-x-100" />
      برگشت
    </AppLink>
  );
}

interface FormPageProps {
  /**
   * فرمی که چیدمان خودش را دارد (پروفایل پیامد با چند فرم پیشونددار). بقیه‌ی صفحه، یعنی خواندن فرم، عنوان، پیام‌ها،
   * خطای ۴۰۹ و برگشت، همین صفحه است.
   */
  body?: (data: FormPageData, options: { path: string; today?: JalaliDate }) => ReactNode;
  /** فرم دلخواهی که پهنای فرم ساده را دارد (ورود کارکنان)، نه پهنای فرم‌های چندستونی. */
  narrow?: boolean;
}

export function FormPage({ body, narrow = false }: FormPageProps) {
  const location = useLocation();
  const { today } = useSession();
  const path = djangoPath(location);
  // فرم همیشه تازه خوانده می‌شود و با برگشتن به برگه دوباره خوانده نمی‌شود تا نوشته‌های کاربر پاک نشود.
  const page = useQuery({
    queryKey: ["form", path],
    queryFn: ({ signal }) => get<FormPageData>(bridge("forms", path), signal),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  useTitle(page.data?.title ?? (page.isError ? "فرم باز نشد" : "فرم"));

  if (page.isPending) return <PageSkeleton rows={6} />;

  if (page.isError) {
    const error = page.error;
    // view جنگو فرم را نشان نداد و به صفحه‌ی دیگری فرستاد: این کار از این وضعیت ممکن نیست.
    if (error instanceof ApiError && error.status === 409) {
      const redirect = error.data.redirect as AppHref | undefined;
      return (
        <div className="flex max-w-2xl flex-col gap-6">
          <PageHeader title="این کار الان ممکن نیست" />
          <Alert tone="warning" role="alert">
            {faText(error.message)}
          </Alert>
          {redirect && (
            <div>
              <AppLink href={redirect.href} button={{ variant: "secondary" }}>
                <ArrowRight aria-hidden className="ltr:-scale-x-100" />
                برگشت
              </AppLink>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="فرم باز نشد" />
        <ErrorState error={error} retry={() => page.refetch()} />
      </div>
    );
  }

  const data = page.data;
  const todayDate = parseJalali(today.jalali) ?? undefined;
  const main = (
    <div className="flex min-w-0 flex-col gap-6">
      <Messages data={data} />
      {data.intro && (
        <blockquote className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm leading-7 whitespace-pre-line text-fg/90">
          {data.intro}
        </blockquote>
      )}
      <FormAlerts data={data} />
      <Facts data={data} />
      <TransitionInfo data={data} />
      <CoverageInfo data={data} />
      {body ? (
        body(data, { path, today: todayDate })
      ) : data.form ? (
        <Card className="p-5 sm:p-7">
          <SchemaForm
            key={path}
            schema={data.form}
            path={path}
            submitLabel={data.submit}
            submitIcon={submitIcon(data.view)}
            cancel={data.cancel}
            today={todayDate}
            scenarioCreate={data.view === "risks:scenario_create"}
            layout={
              data.fieldsets
                ? (field) => (
                    <Fieldsets
                      sections={data.fieldsets ?? []}
                      names={data.form?.fields.map((item) => item.name) ?? []}
                      field={field}
                    />
                  )
                : undefined
            }
            stickyActions={Boolean(data.fieldsets)}
          />
        </Card>
      ) : (
        <Alert tone="danger">این صفحه فرمی ندارد.</Alert>
      )}
    </div>
  );
  const guided = Boolean(data.guides?.length);
  return (
    <div className={cn("flex flex-col gap-6", guided || (body && !narrow) ? "max-w-6xl" : "max-w-3xl")}>
      <div className="flex flex-col gap-3">
        <Back cancel={data.cancel} />
        <PageHeader title={faText(data.title)} />
      </div>
      {guided ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {main}
          <Guides data={data} />
        </div>
      ) : (
        main
      )}
    </div>
  );
}
