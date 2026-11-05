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
import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { useSession } from "@/features/session/session";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { band, dateTime, fa, faText, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
import type {
  AssessmentDetail,
  AssessmentImpacts,
  AssessmentLikelihood,
  AssessmentPath,
  AssessmentReview,
  EvidenceRef,
  FormField,
} from "@/lib/types";

// پرونده‌ی ارزیابی (assessments/assessment_detail.html): نتیجه‌ی موتور محاسبه، کنترل کیفیت، احتمال و پروفایل پیامد.
// هر عدد همان است که جنگو برای همین ارزیابی حساب کرده و هر دکمه فقط وقتی هست که جنگو اجازه‌اش را داده است.

const SECTIONS = [
  { id: "result", label: "نتیجه" },
  { id: "review", label: "کنترل کیفیت" },
  { id: "likelihood", label: "احتمال" },
  { id: "impacts", label: "پروفایل پیامد" },
];

/** بعد از بارگذاری، صفحه به #بخشی می‌رود که جنگو بعد از هر کار به آن برمی‌گرداند (#review، #likelihood، #path-12). */
function useSectionFromHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
}

function EvidenceLinks({ items }: { items: EvidenceRef[] }) {
  if (!items.length) return <span className="text-muted">-</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {items.map((item) => (
        <AppLink key={item.code} href={item.href} className="code text-xs">
          {item.code}
        </AppLink>
      ))}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

function Section({
  id,
  title,
  icon,
  actions,
  children,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-lg font-semibold text-fg">
          <span aria-hidden className="text-accent-text [&>svg]:size-5">
            {icon}
          </span>
          {title}
        </h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function Reasons({ tone, title, items }: { tone: "danger" | "warning" | "info"; title?: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Alert tone={tone} title={title}>
      <ul className={cn("flex flex-col gap-1", items.length > 1 && "list-disc ps-5")}>
        {items.map((item) => (
          <li key={item}>{faText(item)}</li>
        ))}
      </ul>
    </Alert>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface/50 p-4">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xl font-semibold text-fg tabular">{children}</span>
    </div>
  );
}

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
      {outcome.problems.length > 0 ? (
        <Reasons tone="info" title="نتیجه هنوز حساب نمی‌شود:" items={outcome.problems} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="احتمال (L)">{band(outcome.likelihood) || "-"}</Stat>
            <Stat label="پیامد (I)">{band(outcome.impact) || "-"}</Stat>
            <Stat label="امتیاز (L × I)">{band(outcome.score) || "-"}</Stat>
            <Stat label="سطح پایه">
              <LevelBadge level={outcome.base_level} />
            </Stat>
            <Stat label="سطح تصمیم">
              <LevelBadge level={outcome.decision_level} />
            </Stat>
            <Stat label="اطمینان کل">{outcome.confidence || "-"}</Stat>
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
    </Section>
  );
}

/** کادر توضیح یک کار کنترل کیفیت، از توصیف فیلد همان فرم جنگو. */
function NotesField({
  field,
  value,
  onChange,
  disabled,
  label,
  error,
}: {
  field?: FormField;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  label?: string;
  error?: string;
}) {
  return (
    <Field label={label ?? field?.label ?? "توضیح"} hint={field?.help || undefined} error={error}>
      <Textarea
        rows={field?.rows ?? 2}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function ActionError({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Alert tone="danger" role="alert">
      {faText(errorMessage(error))}
    </Alert>
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
    <Card>
      <CardHeader as="h3" icon={<Send className="rtl:-scale-x-100" />} title="ارسال برای کنترل کیفیت" />
      <CardContent className="flex flex-col gap-4">
        <ActionError error={action.error} />
        <NotesField
          label="توضیح برای کنترل‌کننده (اختیاری)"
          value={notes}
          onChange={setNotes}
          disabled={action.isPending}
        />
        <div>
          <Button
            variant="primary"
            loading={action.isPending}
            onClick={() => action.mutate({ url, values: { notes } })}
          >
            {!action.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
            ارسال برای کنترل کیفیت
          </Button>
        </div>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader
        as="h3"
        icon={<ClipboardCheck />}
        title="کنترل کیفیت شما"
        description="برگشت به ارزیاب و ارجاع به کارگروه توضیح می‌خواهد."
      />
      <CardContent className="flex flex-col gap-4">
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
      </CardContent>
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
    </Card>
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
    <Card>
      <CardHeader as="h3" icon={<Users />} title="تصمیم کارگروه امنیت" />
      <CardContent className="flex flex-col gap-4">
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
      </CardContent>
    </Card>
  );
}

function Review({ data }: { data: AssessmentDetail }) {
  const { review, assessment } = data;
  const status = assessment.status.value;
  return (
    <Section id="review" title="کنترل کیفیت" icon={<ClipboardCheck />}>
      <SubmitBox review={review} />
      {status === "in_qc" && !review.can_review && !review.can_submit && (
        <p className="text-sm text-muted">کنترل کیفیت با عضو GRC دیگری است که ارزیاب همین پرونده نیست.</p>
      )}
      <ReviewBox review={review} code={assessment.code} />
      <ReferralBox review={review} />
      {status === "referred" && !review.can_decide_referral && (
        <p className="text-sm text-muted">
          اختلاف به کارگروه امنیت ارجاع شده است. تصمیم کارگروه را عضو کارگروه امنیت یا عضو GRC دیگری ثبت می‌کند که طرف
          این اختلاف نیست.
        </p>
      )}
      {assessment.is_approved && assessment.approved_at && (
        <Alert tone="success">
          تأییدشده در {dateTime(assessment.approved_at)}؛ ارزیابی قفل است و ارزیابی بعدی ردیف تازه است.
        </Alert>
      )}
      {review.history.length > 0 ? (
        <Card className="overflow-clip">
          <ol aria-label="سابقه‌ی کنترل کیفیت" className="divide-y divide-line">
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
        </Card>
      ) : (
        !review.can_submit &&
        status === "draft" && <p className="text-sm text-muted">هنوز برای کنترل کیفیت فرستاده نشده است.</p>
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
      <Fact label="A">
        {faText(likelihood.a)}
        {initiator.confidence && <span className="text-muted">، اطمینان {initiator.confidence}</span>}
      </Fact>
      <Fact label="دلیل">
        <span className="whitespace-pre-line">{initiator.rationale || "-"}</span>
      </Fact>
      <Fact label="شواهد">
        <EvidenceLinks items={initiator.evidence} />
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
        {path.b0_confidence && <span className="block text-xs text-muted">اطمینان {path.b0_confidence}</span>}
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

      <Card>
        <CardHeader as="h3" title="عامل آغازگر" />
        <CardContent>
          <Initiator likelihood={likelihood} />
        </CardContent>
      </Card>

      <Card className="table-shell overflow-clip">
        <CardHeader as="h3" icon={<GitFork />} title="مسیرهای تحقق" />
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
      </Card>
      {remove.error !== null && <ActionError error={remove.error} />}
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
    <Card className="table-shell overflow-clip">
      <div className="table-scroll">
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
                        {cell.confidence && <span className="text-xs text-muted">اطمینان {cell.confidence}</span>}
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
    </Card>
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
          {impacts.unknown.length > 0 && <p className="mt-1 text-xs">نامعلوم: {faText(impacts.unknown.join("، "))}</p>}
          {impacts.missing.length > 0 && <p className="mt-1 text-xs">ثبت‌نشده: {faText(impacts.missing.join("، "))}</p>}
        </Alert>
      ) : (
        impacts.missing.length > 0 && <Alert tone="info">ثبت‌نشده: {faText(impacts.missing.join("، "))}</Alert>
      )}
      <ImpactTable impacts={impacts} />
      <p className="text-xs text-muted">
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

function Facts({ data }: { data: AssessmentDetail }) {
  const { assessment } = data;
  const escalation = assessment.escalation;
  return (
    <Card>
      <CardContent className="pt-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
          <Fact label="ریسک">
            <AppLink href={assessment.risk.href}>
              <bdi className="code">{assessment.risk.code}</bdi> {assessment.risk.title}
            </AppLink>
          </Fact>
          <Fact label="نسخه‌ی روش">
            <AppLink href={assessment.method_version.href}>{faText(assessment.method_version.label)}</AppLink>
          </Fact>
          <Fact label="افق">{fa(assessment.horizon_months)} ماه</Fact>
          {assessment.horizon_rationale && <Fact label="دلیل افق">{assessment.horizon_rationale}</Fact>}
          {assessment.target_due && <Fact label="موعد تحقق هدف">{longDate(assessment.target_due)}</Fact>}
          {assessment.scope_snapshot?.service && (
            <Fact label="دامنه هنگام تأیید">
              {assessment.scope_snapshot.service}؛ {assessment.scope_snapshot.customers.map((c) => c.name).join("، ")}
            </Fact>
          )}
          <Fact label="جلسه‌ی کارگروه">
            {assessment.meeting_date ? longDate(assessment.meeting_date) : "بدون جلسه (ارزیابی عادی)"}
          </Fact>
          <Fact label="فرض‌ها">
            <span className="whitespace-pre-line">{assessment.assumptions || "-"}</span>
          </Fact>
          <Fact label="ثبت‌کننده">
            {assessment.created_by?.name}، {longDate(assessment.created_at)}
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
                <EvidenceLinks items={escalation.evidence} />
              </span>
            </Fact>
          )}
        </dl>
      </CardContent>
    </Card>
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
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Header data={data} />
        <nav aria-label="بخش‌های ارزیابی" className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex h-8 items-center rounded-full border border-line bg-surface px-3.5 text-sm text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {section.label}
            </a>
          ))}
        </nav>
      </div>
      <Facts data={data} />
      <Outcome data={data} />
      <Review data={data} />
      <Likelihood data={data} />
      <Impacts data={data} />
    </div>
  );
}
