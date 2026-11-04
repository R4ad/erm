import { useQuery } from "@tanstack/react-query";
import { ArrowRight, GitBranch, Grid3x3, Send, Upload } from "lucide-react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Alert, ErrorState } from "@/components/ui/states";
import { useSession } from "@/features/session/session";
import { ApiError, bridge, get } from "@/lib/api";
import { faText, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
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

export function FormPage() {
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
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Back cancel={data.cancel} />
        <PageHeader title={faText(data.title)} />
      </div>
      <Messages data={data} />
      {data.intro && (
        <blockquote className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm leading-7 whitespace-pre-line text-fg/90">
          {data.intro}
        </blockquote>
      )}
      <TransitionInfo data={data} />
      <CoverageInfo data={data} />
      {data.form ? (
        <Card className="p-5 sm:p-7">
          <SchemaForm
            key={path}
            schema={data.form}
            path={path}
            submitLabel={data.submit}
            submitIcon={submitIcon(data.view)}
            cancel={data.cancel}
            today={parseJalali(today.jalali) ?? undefined}
          />
        </Card>
      ) : (
        <Alert tone="danger">این صفحه فرمی ندارد.</Alert>
      )}
    </div>
  );
}
