import {
  ClipboardCheck,
  Gauge,
  GitFork,
  Layers,
  PencilLine,
  Plus,
  Send,
  ShieldCheck,
  Target,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import {
  ActionError,
  CodeLinks,
  DossierLayout,
  Fact,
  Facts,
  NotesField,
  Reasons,
  Section,
  SectionBody,
  SectionEmpty,
  Stat,
} from "@/features/records/dossier";
import { useSession } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { band, dateTime, fa, faText, longDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
import type {
  AssessmentDetail,
  AssessmentImpacts,
  AssessmentLikelihood,
  AssessmentPath,
  AssessmentReview,
} from "@/lib/types";

// پرونده‌ی ارزیابی (assessments/assessment_detail.html): نتیجه‌ی موتور محاسبه، کنترل کیفیت، احتمال و پروفایل پیامد.
// هر عدد همان است که جنگو برای همین ارزیابی حساب کرده و هر دکمه فقط وقتی هست که جنگو اجازه‌اش را داده است.

function Outcome({ data }: { data: AssessmentDetail }) {
  const outcome = data.outcome;
  return (
    <Section
      id="result"
      title="نتیجه"
      icon={<Gauge />}
      actions={
        outcome.provisional && <span className="text-xs text-muted">محاسبه‌ی همین حالا؛ هنگام تأیید ثابت می‌شود</span>
      }
    >
      <SectionBody className="flex flex-col gap-4">
        {outcome.problems.length > 0 ? (
          <Reasons tone="info" title="نتیجه هنوز حساب نمی‌شود:" items={outcome.problems} />
        ) : (
          <>
            {/* سطح تصمیم جوابی است که پرونده را برای آن باز می‌کنند؛ بقیه‌ی عددها پشتیبان همین‌اند. */}
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 rounded-xl border border-line bg-surface/50 p-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs text-muted">سطح تصمیم</span>
                <LevelBadge level={outcome.decision_level} size="lg" />
              </div>
              <dl className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <dt className="text-muted">سطح پایه</dt>
                  <dd>
                    <LevelBadge level={outcome.base_level} />
                  </dd>
                </div>
                <div className="flex items-center gap-2">
                  <dt className="text-muted">اطمینان کل</dt>
                  <dd className="font-medium text-fg">{outcome.confidence || "-"}</dd>
                </div>
              </dl>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="احتمال (L)">{band(outcome.likelihood) || "-"}</Stat>
              <Stat label="پیامد (I)">{band(outcome.impact) || "-"}</Stat>
              <Stat label="امتیاز (L × I)">{band(outcome.score) || "-"}</Stat>
            </div>
            {outcome.score && outcome.score[0] !== outcome.score[1] && outcome.decision_score !== null && (
              <p className="text-sm text-muted">
                امتیاز بازه است و تصمیم بر کران بالای آن ({fa(outcome.decision_score)}) گرفته می‌شود.
              </p>
            )}
            <Reasons tone="warning" title="ارزیابی ناقص: پذیرش عادی مسدود است." items={outcome.incomplete_reasons} />
            <Reasons tone="danger" title="علت تصعید" items={outcome.escalation_reasons} />
            {outcome.out_of_acceptance_authority ? (
              <Alert tone="danger">خارج از اختیار پذیرش.</Alert>
            ) : (
              outcome.acceptance_restricted && <Alert tone="warning">اختیار پذیرش عمومی محدود است.</Alert>
            )}
          </>
        )}
      </SectionBody>
    </Section>
  );
}

/** یک کار کنترل کیفیت داخل بخش «کنترل کیفیت»: عنوان h3 و محتوا، با خط جداکننده از کار قبلی. */
function ReviewBlock({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-line px-5 py-4 last:border-b-0">
      <div className="flex flex-col gap-1">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <span aria-hidden className="text-accent-text [&>svg]:size-4">
            {icon}
          </span>
          {title}
        </h3>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function SubmitBox({ review }: { review: AssessmentReview }) {
  const [notes, setNotes] = useState("");
  const action = useBridgeAction();
  if (!review.can_submit || !review.submit_url) return null;
  if (review.submission_problems.length) {
    return <Reasons tone="info" title="پیش از ارسال برای کنترل کیفیت لازم است:" items={review.submission_problems} />;
  }
  const url = review.submit_url;
  return (
    <ReviewBlock icon={<Send className="rtl:-scale-x-100" />} title="ارسال برای کنترل کیفیت">
      <ActionError error={action.error} />
      <NotesField
        label="توضیح برای کنترل‌کننده (اختیاری)"
        value={notes}
        onChange={setNotes}
        disabled={action.isPending}
      />
      <div>
        <Button variant="primary" loading={action.isPending} onClick={() => action.mutate({ url, values: { notes } })}>
          {!action.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
          ارسال برای کنترل کیفیت
        </Button>
      </div>
    </ReviewBlock>
  );
}

function ReviewBox({ review, code }: { review: AssessmentReview; code: string }) {
  const [notes, setNotes] = useState("");
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  if (!review.can_review || !review.review_url) return null;
  const url = review.review_url;
  const decide = (value: string) => action.mutate({ url, values: { action: value, notes } });
  const busy = (value: string) => action.isPending && action.variables?.values.action === value;
  return (
    <ReviewBlock
      icon={<ClipboardCheck />}
      title="کنترل کیفیت شما"
      description="برگشت به ارزیاب و ارجاع به کارگروه توضیح می‌خواهد."
    >
      <ActionError error={action.error} />
      <NotesField field={review.review_notes} value={notes} onChange={setNotes} disabled={action.isPending} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={busy("approve")}
          disabled={action.isPending}
          onClick={() => setConfirming(true)}
        >
          {!busy("approve") && <ShieldCheck aria-hidden />}
          تأیید ارزیابی
        </Button>
        <Button
          variant="secondary"
          loading={busy("return")}
          disabled={action.isPending}
          onClick={() => decide("return")}
        >
          {!busy("return") && <Undo2 aria-hidden />}
          برگشت به ارزیاب
        </Button>
        <Button variant="danger" loading={busy("refer")} disabled={action.isPending} onClick={() => decide("refer")}>
          {!busy("refer") && <Users aria-hidden />}
          ارجاع به کارگروه امنیت
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`ارزیابی ${code} تأیید شود؟`}
        description="با تأیید، نتیجه همین حالا ثابت و ارزیابی قفل می‌شود؛ ارزیابی بعدی ردیف تازه است."
        confirmLabel="تأیید ارزیابی"
        loading={busy("approve")}
        onConfirm={() => {
          setConfirming(false);
          decide("approve");
        }}
      />
    </ReviewBlock>
  );
}

function ReferralBox({ review }: { review: AssessmentReview }) {
  const { today } = useSession();
  const [meeting, setMeeting] = useState("");
  const [notes, setNotes] = useState("");
  const action = useBridgeAction();
  if (!review.can_decide_referral || !review.referral_url) return null;
  const url = review.referral_url;
  const fields = Object.fromEntries(review.referral_form.fields.map((field) => [field.name, field]));
  const busy = (value: string) => action.isPending && action.variables?.values.action === value;
  const decide = (value: string) => action.mutate({ url, values: { action: value, notes, meeting_date: meeting } });
  return (
    <ReviewBlock icon={<Users />} title="تصمیم کارگروه امنیت">
      <ActionError error={action.error} />
      <Field
        label={fields.meeting_date?.label ?? "تاریخ جلسه‌ی کارگروه"}
        hint={fields.meeting_date?.help || "برای تأیید با تصمیم کارگروه لازم است."}
      >
        <DatePicker
          value={meeting}
          onChange={setMeeting}
          disabled={action.isPending}
          today={parseJalali(today.jalali) ?? undefined}
        />
      </Field>
      <NotesField field={fields.notes} value={notes} onChange={setNotes} disabled={action.isPending} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={busy("workgroup_approve")}
          disabled={action.isPending}
          onClick={() => decide("workgroup_approve")}
        >
          {!busy("workgroup_approve") && <ShieldCheck aria-hidden />}
          تأیید ارزیابی با تصمیم کارگروه
        </Button>
        <Button
          variant="secondary"
          loading={busy("workgroup_return")}
          disabled={action.isPending}
          onClick={() => decide("workgroup_return")}
        >
          {!busy("workgroup_return") && <Undo2 aria-hidden />}
          برگشت به ارزیاب
        </Button>
      </div>
    </ReviewBlock>
  );
}

function Review({ data }: { data: AssessmentDetail }) {
  const { review, assessment } = data;
  const status = assessment.status.value;
  return (
    <Section id="review" title="کنترل کیفیت" icon={<ClipboardCheck />}>
      <SubmitBox review={review} />
      {status === "in_qc" && !review.can_review && !review.can_submit && (
        <p className="px-5 py-4 text-sm text-muted">کنترل کیفیت با عضو GRC دیگری است که ارزیاب همین پرونده نیست.</p>
      )}
      <ReviewBox review={review} code={assessment.code} />
      <ReferralBox review={review} />
      {status === "referred" && !review.can_decide_referral && (
        <p className="px-5 py-4 text-sm text-muted">
          اختلاف به کارگروه امنیت ارجاع شده است. تصمیم کارگروه را عضو کارگروه امنیت یا عضو GRC دیگری ثبت می‌کند که طرف
          این اختلاف نیست.
        </p>
      )}
      {assessment.is_approved && assessment.approved_at && (
        <SectionBody>
          <Alert tone="success">
            تأییدشده در {dateTime(assessment.approved_at)}؛ ارزیابی قفل است و ارزیابی بعدی ردیف تازه است.
          </Alert>
        </SectionBody>
      )}
      {review.history.length > 0 ? (
        <>
          <h3 className="border-t border-line px-5 py-3 text-sm font-semibold text-fg">سابقه‌ی کنترل کیفیت</h3>
          <ol aria-label="سابقه‌ی کنترل کیفیت" className="divide-y divide-line border-t border-line">
            {review.history.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 px-5 py-3.5 text-sm">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium text-fg">{item.action.label}</span>
                  <span className="text-xs text-muted">
                    {item.by?.name}، {dateTime(item.at)}
                    {item.meeting_date && `، جلسه‌ی ${longDate(item.meeting_date)}`}
                  </span>
                </p>
                {item.notes && <p className="whitespace-pre-line text-fg/90">{item.notes}</p>}
              </li>
            ))}
          </ol>
        </>
      ) : (
        !review.can_submit && status === "draft" && <SectionEmpty>هنوز برای کنترل کیفیت فرستاده نشده است.</SectionEmpty>
      )}
    </Section>
  );
}

function Initiator({ likelihood }: { likelihood: AssessmentLikelihood }) {
  const initiator = likelihood.initiator;
  if (!initiator) return <p className="text-sm text-muted">A هنوز ثبت نشده است.</p>;
  const rate = initiator.rate;
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_1fr]">
      <Fact label="مسیر">{initiator.basis.label}</Fact>
      {rate && (
        <Fact label="داده">
          <span className="flex flex-col gap-1">
            <span>
              {fa(rate.count ?? 0)} آغازگر یکتا در {fa(rate.months ?? 0)} ماه
              {rate.denominator && ` از ${rate.denominator}`}
              {rate.coverage !== null && `، پوشش ثبت ${fa(rate.coverage)} درصد`}
            </span>
            {rate.suggestion && (
              <span className="text-muted">
                {faText(rate.suggestion.note)}
                {rate.suggestion.level !== null && ` پیشنهاد سامانه: A${fa(rate.suggestion.level)}.`}
              </span>
            )}
            {rate.insufficient.map((reason) => (
              <span key={reason} className="text-warning">
                {faText(reason)}
              </span>
            ))}
          </span>
        </Fact>
      )}
      <Fact label="A">{faText(likelihood.a)}</Fact>
      <Fact label="دلیل">
        <span className="whitespace-pre-line">{initiator.rationale || "-"}</span>
      </Fact>
      <Fact label="شواهد">
        <CodeLinks items={initiator.evidence} />
      </Fact>
    </dl>
  );
}

function PathRow({ path, onDelete }: { path: AssessmentPath; onDelete: (path: AssessmentPath) => void }) {
  return (
    <tr id={`path-${path.id}`} className="scroll-mt-24">
      <th scope="row" data-primary className="min-w-60 text-start font-normal">
        <span className="font-medium text-fg">{path.name}</span>
        <span className="mt-1 line-clamp-3 block text-xs text-muted">{path.description}</span>
        {path.independent && (
          <span className="mt-1 block text-xs text-muted">موانع مستقل‌اند: {path.independence_rationale}</span>
        )}
        {path.exceptions && <span className="mt-1 block text-xs text-muted">استثناها: {path.exceptions}</span>}
        {path.notes.map((note) => (
          <span key={note} className="mt-1 block text-xs text-danger">
            {note}
          </span>
        ))}
      </th>
      <td data-label="B0" className="tabular" title={path.b0_rationale || undefined}>
        {faText(path.b0)}
      </td>
      <td data-label="کنترل‌های پیشگیرانه" className="text-xs">
        {path.controls.length ? (
          <ul className="flex flex-col gap-1">
            {path.controls.map((control) => (
              <li key={control.code}>
                <AppLink href={control.href} className="code">
                  {control.code}
                </AppLink>{" "}
                E{fa(control.e)}
                {control.note && (
                  <span className="text-danger">
                    {" "}
                    (ثبت‌شده E{fa(control.recorded_e)}، {control.note})
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">بدون کنترل</span>
        )}
      </td>
      <td data-label="Bc" className="tabular">
        {band(path.bc) || "-"}
      </td>
      <td data-label="B مسیر" className="font-semibold tabular">
        {band(path.b) || "نامعلوم"}
      </td>
      {(path.edit_url || path.delete_url) && (
        <td data-label="کارها" className="whitespace-nowrap">
          <span className="flex gap-1">
            {path.edit_url && (
              <AppLink href={path.edit_url} button={{ variant: "ghost", size: "sm" }}>
                <PencilLine aria-hidden />
                ویرایش <span className="sr-only">مسیر {path.name}</span>
              </AppLink>
            )}
            {path.delete_url && (
              <Button variant="ghost" size="sm" className="text-danger" onClick={() => onDelete(path)}>
                <Trash2 aria-hidden />
                حذف <span className="sr-only">مسیر {path.name}</span>
              </Button>
            )}
          </span>
        </td>
      )}
    </tr>
  );
}

function Likelihood({ data }: { data: AssessmentDetail }) {
  const { likelihood, actions } = data;
  const [deleting, setDeleting] = useState<AssessmentPath | null>(null);
  const remove = useBridgeAction();
  const editable = likelihood.paths.some((path) => path.edit_url || path.delete_url);
  return (
    <Section
      id="likelihood"
      title="احتمال"
      icon={<Target />}
      actions={
        <>
          {actions.initiator && (
            <AppLink href={actions.initiator} button={{ variant: "secondary", size: "sm" }}>
              عامل آغازگر (A)
            </AppLink>
          )}
          {actions.add_path && (
            <AppLink href={actions.add_path} button={{ variant: "secondary", size: "sm" }}>
              <Plus aria-hidden />
              مسیر تازه
            </AppLink>
          )}
        </>
      }
    >
      <SectionBody className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="A">{faText(likelihood.a)}</Stat>
          <Stat label="B">{band(likelihood.b) || "-"}</Stat>
          <Stat label="احتمال (L)">{band(likelihood.likelihood) || "هنوز معلوم نیست"}</Stat>
        </div>
        <p className="text-xs text-muted">B سناریو بزرگ‌ترین B مسیرهاست و L فقط از جدول A × B نسخه‌ی روش می‌آید.</p>
        {likelihood.problems.map((problem) => (
          <Alert key={problem} tone="danger">
            {faText(problem)}
          </Alert>
        ))}
        <Reasons tone="warning" items={likelihood.incomplete} />
        <Reasons tone="info" title="برای تأیید نهایی لازم است:" items={likelihood.blockers} />
      </SectionBody>

      <h3 className="border-t border-line px-5 py-3 text-sm font-semibold text-fg">عامل آغازگر</h3>
      <div className="border-t border-line px-5 py-4">
        <Initiator likelihood={likelihood} />
      </div>

      <h3 className="flex items-center gap-2 border-t border-line px-5 py-3 text-sm font-semibold text-fg">
        <GitFork aria-hidden className="size-4 text-accent-text" />
        مسیرهای تحقق
      </h3>
      {likelihood.paths.length ? (
        <div className="table-scroll border-t border-line">
          <table className="data-table">
            <caption className="sr-only">مسیرهای تحقق</caption>
            <thead>
              <tr>
                <th scope="col">مسیر</th>
                <th scope="col">B0</th>
                <th scope="col">کنترل‌های پیشگیرانه</th>
                <th scope="col">Bc</th>
                <th scope="col">B مسیر</th>
                {editable && (
                  <th scope="col">
                    <span className="sr-only">کارها</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {likelihood.paths.map((path) => (
                <PathRow key={path.id} path={path} onDelete={setDeleting} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="border-t border-line px-5 py-6 text-center text-sm text-muted">هنوز مسیری ثبت نشده است.</p>
      )}
      {remove.error !== null && (
        <SectionBody>
          <ActionError error={remove.error} />
        </SectionBody>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`مسیر «${deleting?.name ?? ""}» حذف شود؟`}
        description="مسیر پیش‌نویس حذف می‌شود و حذفش در تاریخچه می‌ماند."
        confirmLabel="حذف مسیر"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting?.delete_url) return;
          remove.mutate({ url: deleting.delete_url, values: {} }, { onSettled: () => setDeleting(null) });
        }}
      />
    </Section>
  );
}

function ImpactTable({ impacts }: { impacts: AssessmentImpacts }) {
  return (
    <div className="table-scroll border-t border-line">
      <table className="data-table">
        <caption className="sr-only">سطح هر بُعد پیامد برای داتین و هر بانک</caption>
        <thead>
          <tr>
            <th scope="col">بُعد</th>
            {impacts.stakeholders.map((name) => (
              <th key={name} scope="col" className="text-center">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {impacts.rows.map((row) => (
            <tr key={row.code}>
              <th scope="row" data-primary className="text-start font-normal">
                <bdi className="code text-accent-text">{row.code}</bdi> {row.name}
              </th>
              {row.cells.map((cell, index) => (
                <td
                  key={impacts.stakeholders[index]}
                  data-label={impacts.stakeholders[index]}
                  className="text-center"
                  title={cell?.rationale || undefined}
                >
                  {cell ? (
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className={cn("tabular", cell.unknown ? "text-warning" : "font-semibold text-fg")}>
                        {faText(cell.level)}
                      </span>
                      {cell.value !== null && (
                        <span className="text-xs text-muted">
                          {fa(cell.value)} {cell.unit}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted">
                      -<span className="sr-only">ثبت‌نشده</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Impacts({ data }: { data: AssessmentDetail }) {
  const { impacts, actions } = data;
  return (
    <Section
      id="impacts"
      title="پروفایل پیامد"
      icon={<Layers />}
      actions={
        actions.impact_profile && (
          <AppLink href={actions.impact_profile} button={{ variant: "secondary", size: "sm" }}>
            <PencilLine aria-hidden />
            ثبت پروفایل پیامد
          </AppLink>
        )
      }
    >
      <SectionBody className="flex flex-col gap-4">
        <p className="text-sm">
          <span className="font-semibold text-fg">پیامد (I): {band(impacts.impact) || "هنوز معلوم نیست"}</span>
          {impacts.impact && <span className="ms-2 text-xs text-muted">بیشترین سطح معتبر بین ابعاد و ذی‌نفعان.</span>}
        </p>
        {impacts.problems.map((problem) => (
          <Alert key={problem} tone="danger">
            {faText(problem)}
          </Alert>
        ))}
        {impacts.incomplete.length > 0 ? (
          <Alert tone="warning" title="پیامد هنوز کران بالای قابل دفاعی ندارد.">
            خانه‌های نامعلوم یا ثبت‌نشده می‌توانند آن را بالاتر ببرند.
            {impacts.unknown.length > 0 && (
              <p className="mt-1 text-xs">نامعلوم: {faText(impacts.unknown.join("، "))}</p>
            )}
            {impacts.missing.length > 0 && (
              <p className="mt-1 text-xs">ثبت‌نشده: {faText(impacts.missing.join("، "))}</p>
            )}
          </Alert>
        ) : (
          impacts.missing.length > 0 && <Alert tone="info">ثبت‌نشده: {faText(impacts.missing.join("، "))}</Alert>
        )}
      </SectionBody>
      <ImpactTable impacts={impacts} />
      <p className="border-t border-line px-5 py-3 text-xs text-muted">
        صفر یعنی «اثر ندارد» و نامعلوم با صفر پر نمی‌شود. وقتی سطح بازه است، تصمیم بر کران بالای آن گرفته می‌شود.
      </p>
    </Section>
  );
}

function Header({ data }: { data: AssessmentDetail }) {
  const { assessment, actions } = data;
  return (
    <PageHeader
      breadcrumb={[
        { label: "رجیستر ریسک", to: "/risks" },
        { label: assessment.risk.code, to: `/risks/${assessment.risk.id}`, code: true },
        { label: assessment.code, code: true },
      ]}
      title={`ارزیابی ${assessment.kind.label} ${assessment.code}`}
      meta={
        <Badge tone={assessment.is_approved ? "success" : "neutral"} dot>
          {assessment.status.label}
        </Badge>
      }
      actions={
        <>
          {actions.add_evidence && (
            <AppLink href={actions.add_evidence} button={{ variant: "secondary" }}>
              <Plus aria-hidden />
              ثبت شاهد
            </AppLink>
          )}
          {actions.impact_profile && (
            <AppLink href={actions.impact_profile} button={{ variant: "primary" }}>
              <Layers aria-hidden />
              پروفایل پیامد
            </AppLink>
          )}
          {actions.edit && (
            <AppLink href={actions.edit} button={{ variant: "secondary" }}>
              <PencilLine aria-hidden />
              ویرایش
            </AppLink>
          )}
        </>
      }
    />
  );
}

/** مشخصات کوتاه پرونده برای ستون کناری. متن‌های بلند (دامنه، فرض‌ها، تقدم) در بخش «دامنه و فرض‌ها» می‌آیند. */
function AssessmentFacts({ data }: { data: AssessmentDetail }) {
  const { assessment } = data;
  return (
    <Facts>
      <Fact label="ریسک">
        <AppLink href={assessment.risk.href}>
          <bdi className="code">{assessment.risk.code}</bdi> {assessment.risk.title}
        </AppLink>
      </Fact>
      <Fact label="نسخه‌ی روش">
        <AppLink href={assessment.method_version.href}>{faText(assessment.method_version.label)}</AppLink>
      </Fact>
      <Fact label="افق">{fa(assessment.horizon_months)} ماه</Fact>
      {assessment.target_due && <Fact label="موعد تحقق هدف">{longDate(assessment.target_due)}</Fact>}
      <Fact label="ثبت‌کننده">
        {assessment.created_by?.name}، {longDate(assessment.created_at)}
      </Fact>
    </Facts>
  );
}

/** دامنه، فرض‌ها، قاعده‌ی تقدم و اطلاعات ریسک: همان «پرونده و دامنه»‌ی سند روش، پیش از پیامد و احتمال. */
function Scope({ data }: { data: AssessmentDetail }) {
  const { assessment } = data;
  const escalation = assessment.escalation;
  return (
    <Section id="scope" title="دامنه و فرض‌ها" icon={<ClipboardCheck />}>
      <SectionBody>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          {assessment.horizon_rationale && <Fact label="دلیل افق">{assessment.horizon_rationale}</Fact>}
          {assessment.scope_snapshot?.service && (
            <Fact label="دامنه هنگام تأیید">
              {assessment.scope_snapshot.service}؛ {assessment.scope_snapshot.customers.map((c) => c.name).join("، ")}
            </Fact>
          )}
          <Fact label="فرض‌ها">
            <span className="whitespace-pre-line">{assessment.assumptions || "-"}</span>
          </Fact>
          {escalation && (
            <Fact label="قاعده‌ی تقدم">
              <span className="flex flex-col gap-2">
                <span className="flex flex-wrap gap-1.5">
                  {escalation.flags.map((flag) => (
                    <Badge key={flag.label} tone={flag.tone}>
                      {flag.label}
                    </Badge>
                  ))}
                </span>
                {escalation.rationale && <span className="whitespace-pre-line">{escalation.rationale}</span>}
                <CodeLinks items={escalation.evidence} />
              </span>
            </Fact>
          )}
          {data.risk_details?.map((row) => (
            <Fact key={row.label} label={row.label}>
              <span className="whitespace-pre-line">{row.value || "—"}</span>
            </Fact>
          ))}
        </dl>
      </SectionBody>
    </Section>
  );
}

function AssessmentInputs({ data }: { data: AssessmentDetail }) {
  const { actions } = data;
  if (!actions.initiator && !actions.add_path && !actions.impact_profile) return null;
  return (
    <Section
      id="inputs"
      title="ثبت پارامترهای ارزیابی"
      icon={<ClipboardCheck />}
      description="عامل آغازگر، مسیر تحقق و پیامد را تکمیل کنید؛ نتیجه پس از ثبت اطلاعات محاسبه می‌شود."
    >
      <SectionBody className="flex flex-wrap gap-2">
        {actions.initiator && (
          <AppLink href={actions.initiator} button={{ variant: "secondary" }}>
            ۱. عامل آغازگر (A)
          </AppLink>
        )}
        {actions.add_path && (
          <AppLink href={actions.add_path} button={{ variant: "secondary" }}>
            ۲. مسیر تحقق (B0)
          </AppLink>
        )}
        {actions.impact_profile && (
          <AppLink href={actions.impact_profile} button={{ variant: "secondary" }}>
            ۳. پروفایل پیامد (I)
          </AppLink>
        )}
      </SectionBody>
    </Section>
  );
}

export function AssessmentDetailPage() {
  const page = usePageData<AssessmentDetail>();
  useTitle(page.data?.title ?? "ارزیابی");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) {
    return (
      <DetailState
        query={page}
        header={
          <PageHeader title="ارزیابی" breadcrumb={[{ label: "رجیستر ریسک", to: "/risks" }, { label: "ارزیابی" }]} />
        }
      />
    );
  }
  const data = page.data;
  const { actions } = data;
  const hasInputs = Boolean(actions.initiator || actions.add_path || actions.impact_profile);
  // ترتیب بخش‌ها همان ترتیب خود روش است: نتیجه، بعد دامنه، پیامد (I)، احتمال (A × B) و آخر کنترل کیفیت.
  const sections = [
    ...(hasInputs ? [{ id: "inputs", label: "پارامترها" }] : []),
    { id: "result", label: "نتیجه" },
    { id: "scope", label: "دامنه و فرض‌ها" },
    { id: "impacts", label: "پیامد (I)" },
    { id: "likelihood", label: "احتمال (L)" },
    { id: "review", label: "کنترل کیفیت" },
  ];
  return (
    <div className="flex flex-col gap-6">
      <Header data={data} />
      <DossierLayout
        navLabel="بخش‌های ارزیابی"
        factsLabel="مشخصات ارزیابی"
        sections={sections}
        facts={<AssessmentFacts data={data} />}
      >
        <AssessmentInputs data={data} />
        <Outcome data={data} />
        <Scope data={data} />
        <Impacts data={data} />
        <Likelihood data={data} />
        <Review data={data} />
      </DossierLayout>
    </div>
  );
}
