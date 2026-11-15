import { ClipboardList, ListChecks, PencilLine, Plus } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DetailState, ListBody } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { Section, SectionEmpty } from "@/features/records/dossier";
import { cn } from "@/lib/cn";
import { fa, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { QuestionnaireDetail, QuestionnaireList, QuestionnaireOption, QuestionnaireQuestion } from "@/lib/types";

// تعریف پرسشنامه‌ها (questionnaires/questionnaire_list.html و questionnaire_detail.html): فهرست، سؤال‌ها و گزینه‌های
// هر پرسشنامه. سؤال‌ها محرمانه نیستند و همه می‌بینند؛ دکمه‌های تعریف و ویرایش فقط وقتی هست که جنگو به همین کاربر
// اجازه داده است (عضو GRC و مدیر سامانه).

function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge tone="success" dot>
      فعال
    </Badge>
  ) : (
    <Badge dot>غیرفعال</Badge>
  );
}

export function QuestionnaireListPage() {
  useTitle("تعریف پرسشنامه‌ها");
  const page = usePageData<QuestionnaireList>();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="تعریف پرسشنامه‌ها"
        description="سؤال‌ها و گزینه‌های هر پرسشنامه. فقط پرسشنامه‌ی فعال پاسخ تازه می‌گیرد."
        actions={
          page.data?.create_url && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              پرسشنامه‌ی جدید
            </AppLink>
          )
        }
      />
      <ListBody
        query={page}
        label="پرسشنامه‌ها"
        filtered={false}
        empty={{
          icon: <ClipboardList />,
          title: "هنوز پرسشنامه‌ای تعریف نشده است",
          description: "عضو GRC پرسشنامه را می‌سازد و بعد سؤال‌هایش را اضافه می‌کند.",
        }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">پرسشنامه‌ها</caption>
            <thead>
              <tr>
                <th scope="col">عنوان</th>
                <th scope="col">سؤال فعال</th>
                <th scope="col">پاسخ</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td data-primary className="min-w-56">
                    <AppLink href={row.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                      {row.title}
                    </AppLink>
                    {row.is_structured && <span className="ms-2 text-xs text-muted">شاخه‌ای</span>}
                  </td>
                  <td data-label="سؤال فعال" className="tabular">
                    {formatNumber(row.question_count)}
                  </td>
                  <td data-label="پاسخ" className="tabular">
                    {formatNumber(row.response_count)}
                  </td>
                  <td data-label="وضعیت">
                    <ActiveBadge active={row.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </div>
  );
}

function OptionItem({ option }: { option: QuestionnaireOption }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", !option.is_active && "text-muted")}>
      {option.is_active ? (
        <span>{option.text}</span>
      ) : (
        <>
          <s>{option.text}</s>
          <span className="sr-only">(غیرفعال)</span>
        </>
      )}
      {option.indicates_risk && <Badge tone="warning">نشانه‌ی ریسک</Badge>}
      {option.scenario && (
        <bdi className="code text-xs text-muted" title={option.scenario.name}>
          {option.scenario.code}
        </bdi>
      )}
      {option.category && (
        <bdi className="code text-xs text-muted" title={option.category.name}>
          {option.category.code}
        </bdi>
      )}
    </li>
  );
}

function QuestionItem({ question }: { question: QuestionnaireQuestion }) {
  return (
    <li className={cn("flex gap-4 px-5 py-4", !question.is_active && "bg-surface/40")}>
      <span
        aria-hidden
        className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-xs font-semibold text-muted tabular"
      >
        {fa(question.order)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <p
            className={cn(
              "min-w-0 flex-1 leading-7 whitespace-pre-line",
              question.is_active ? "text-fg" : "text-muted",
            )}
          >
            <span className="sr-only">ترتیب {fa(question.order)}: </span>
            {question.text}
          </p>
          {question.edit_url && (
            <AppLink
              href={question.edit_url}
              button={{ variant: "ghost", size: "sm" }}
              aria-label={`ویرایش سؤال ${fa(question.order)}`}
            >
              <PencilLine aria-hidden />
              ویرایش
            </AppLink>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{question.kind.label}</Badge>
          {question.stage && <Badge tone="info">{question.stage.label}</Badge>}
          {question.required && <Badge tone="accent">اجباری</Badge>}
          {!question.is_active && <Badge>غیرفعال</Badge>}
        </div>
        {question.help && <p className="text-xs text-muted">{question.help}</p>}
        {question.options.length > 0 && (
          <ul aria-label="گزینه‌ها" className="flex flex-col gap-1.5 text-sm">
            {question.options.map((option) => (
              <OptionItem key={option.id} option={option} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function DetailHeader({ data }: { data?: QuestionnaireDetail }) {
  const questionnaire = data?.questionnaire;
  return (
    <PageHeader
      breadcrumb={[
        { label: "تعریف پرسشنامه‌ها", to: "/questionnaires/manage" },
        { label: questionnaire?.title ?? "پرسشنامه" },
      ]}
      title={questionnaire?.title ?? "پرسشنامه"}
      meta={
        questionnaire && (
          <>
            <ActiveBadge active={questionnaire.is_active} />
            {questionnaire.is_structured && <Badge tone="info">شاخه‌ای</Badge>}
          </>
        )
      }
      actions={
        data && (
          <>
            {data.add_question_url && (
              <AppLink href={data.add_question_url} button={{ variant: "primary" }}>
                <Plus aria-hidden />
                سؤال جدید
              </AppLink>
            )}
            {data.edit_url && (
              <AppLink href={data.edit_url} button={{ variant: "secondary" }}>
                <PencilLine aria-hidden />
                ویرایش
              </AppLink>
            )}
          </>
        )
      }
    />
  );
}

export function QuestionnaireDetailPage() {
  const page = usePageData<QuestionnaireDetail>();
  useTitle(page.data?.questionnaire.title ?? "پرسشنامه");
  if (!page.data) return <DetailState query={page} header={<DetailHeader />} />;
  const data = page.data;
  const { questionnaire, questions } = data;
  return (
    <article className="flex flex-col gap-6">
      <DetailHeader data={data} />
      {questionnaire.description && (
        <p className="max-w-3xl text-sm leading-7 whitespace-pre-line text-fg/90">{questionnaire.description}</p>
      )}
      <p className="max-w-3xl text-xs leading-6 text-muted">
        {questionnaire.is_structured
          ? "بخش هر سؤال محل تکرار آن را در خدمت، اتفاق، راه، تمهید، پیامد یا شاهد مشخص می‌کند. پرسش‌های غیرفعال در پاسخ‌های تازه نمایش داده نمی‌شوند."
          : "هر پاسخ با کارکردهای اصلی واحد و هشت پرسش جلسه‌ی شناسایی بخش ۴ سند v5 شروع می‌شود (نتیجه، تعهد، رویداد مخل، شرایط، پیامد، وابستگی، شاهد و کنترل فعلی)، بعد این سؤال‌ها می‌آیند و در آخر «مورد جدید» با شرح آزاد. گزینه‌ای که «نشانه‌ی ریسک» است، با انتخاب شدن یک «ریسک در انتظار» برای بررسی GRC می‌سازد."}
      </p>
      <Section id="questions" title="سؤال‌ها" icon={<ListChecks />} count={questions.length}>
        {questions.length ? (
          <ol aria-label="سؤال‌های پرسشنامه" className="divide-y divide-line">
            {questions.map((question) => (
              <QuestionItem key={question.id} question={question} />
            ))}
          </ol>
        ) : (
          <SectionEmpty>
            {data.add_question_url ? "هنوز سؤالی ندارد. با «سؤال جدید» اولین سؤال را اضافه کنید." : "هنوز سؤالی ندارد."}
          </SectionEmpty>
        )}
      </Section>
    </article>
  );
}
