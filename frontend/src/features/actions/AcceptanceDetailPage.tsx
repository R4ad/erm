import { Ban, FileText, Send, Signature } from "lucide-react";
import { useId, useRef, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge, type Tone } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Radio, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction, type ActionValue } from "@/features/forms/bridge-action";
import { FieldControl } from "@/features/forms/field-control";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, CodeLinks, MetaItem, NotesField, Panel, Prose, Reasons } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { useSession } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { dateTime, fa, faText, longDate, shortDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
import type { AcceptanceDetail, AcceptanceSignature, SignForm } from "@/lib/types";

import { AcceptanceStateBadge } from "./tables";

// پذیرش ریسک به چیدمان فیگما ۰۸ (Risk Acceptance · Signer): سرپرونده، برگه‌ی فقط‌خواندنی پذیرش با متن تصمیم، دوره‌ی
// اعتبار با یادآوری‌ها، و در ستون کناری چهار گام امضا که امضای همین کاربر درون گام خودش ثبت می‌شود. همه‌ی شرط‌ها با
// همان view جنگوست؛ این صفحه فقط کادرهایی را نشان می‌دهد که جنگو برای همین کاربر فرستاده است.

// ─────────────────────────────── سرپرونده ───────────────────────────────

function StateChip({ data }: { data: AcceptanceDetail }) {
  const { acceptance } = data;
  if (acceptance.state.value === "pending") {
    return (
      <Badge tone="warning" dot>
        {acceptance.state.label} · {fa(acceptance.approvals)} از {fa(acceptance.required)}
      </Badge>
    );
  }
  return <AcceptanceStateBadge state={acceptance.state} />;
}

function SubmitButton({ data }: { data: AcceptanceDetail }) {
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  const url = data.submit_url;
  if (!url) return null;
  return (
    <>
      <Button variant="primary" loading={action.isPending} onClick={() => setConfirming(true)}>
        {!action.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
        ارسال برای امضا
      </Button>
      <ActionError error={action.error} />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`پذیرش ${data.acceptance.code} برای امضا فرستاده شود؟`}
        description="بعد از ارسال، متن پذیرش دیگر ویرایش نمی‌شود و صاحبان اختیار روی همین متن امضا می‌کنند."
        confirmLabel="ارسال برای امضا"
        loading={action.isPending}
        onConfirm={() => {
          setConfirming(false);
          action.mutate({ url, values: {} });
        }}
      />
    </>
  );
}

function RecordHeader({ data }: { data: AcceptanceDetail }) {
  const { acceptance, risk, assessment } = data;
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <bdi className="code text-sm font-medium text-ink-2">{acceptance.code}</bdi>
          <StateChip data={data} />
          <LevelBadge level={data.level} />
          <Badge tone="neutral">{acceptance.kind}</Badge>
        </div>
        <h1 className="text-h1 font-bold text-ink">{faText(data.title)}</h1>
        <dl className="flex max-w-[48rem] flex-wrap gap-x-4 gap-y-1.5">
          <MetaItem icon="list" label="ریسک">
            {risk.href ? (
              <AppLink href={risk.href} className="text-ink">
                <bdi className="code">{risk.code}</bdi>
              </AppLink>
            ) : (
              <bdi className="code">{risk.code}</bdi>
            )}
          </MetaItem>
          <MetaItem icon="gauge" label="ارزیابی مبنا">
            <AppLink href={assessment.href} className="text-ink">
              <bdi className="code">{assessment.code}</bdi>
            </AppLink>{" "}
            · {assessment.kind} · {assessment.status}
          </MetaItem>
          <MetaItem icon="calendar" label="اعتبار">
            {shortDate(acceptance.start)} تا {shortDate(acceptance.end)}
          </MetaItem>
          <MetaItem icon="user" label="مسئول پیگیری">
            {acceptance.follow_up_by?.name ?? "-"}
          </MetaItem>
        </dl>
      </div>
      <div className="flex flex-col gap-2 print:hidden lg:shrink-0 lg:items-end">
        <div className="flex flex-wrap items-center gap-2 lg:flex-row-reverse lg:justify-start">
          <SubmitButton data={data} />
          {data.edit_url && (
            <AppLink href={data.edit_url} button={{ variant: "outline" }}>
              <Icon name="pencil" size={18} />
              ویرایش پذیرش
            </AppLink>
          )}
          <AppLink href={assessment.href} button={{ variant: "outline" }}>
            <Icon name="gauge" size={18} />
            مشاهده‌ی ارزیابی
          </AppLink>
          <Button variant="ghost" onClick={() => window.print()}>
            <Icon name="download" size={18} />
            دریافت PDF برگه
          </Button>
        </div>
      </div>
    </header>
  );
}

/** پذیرش ردشده یا لغوشده با دلیلش، و پذیرش منقضی. */
function Closed({ data }: { data: AcceptanceDetail }) {
  const { acceptance } = data;
  if (acceptance.closed) {
    const closed = acceptance.closed;
    return (
      <Alert tone="danger" title={closed.label}>
        {[closed.by?.name, closed.at ? dateTime(closed.at) : ""].filter(Boolean).join("، ")}
        {closed.reason && <p className="mt-1 whitespace-pre-line">{closed.reason}</p>}
      </Alert>
    );
  }
  if (acceptance.state.value === "expired") {
    return (
      <Alert tone="danger" title="پذیرش منقضی است">
        تاریخ پایان گذشته است. تمدید خودکار نیست؛ ادامه پذیرش تازه با همه‌ی امضاها می‌خواهد.
      </Alert>
    );
  }
  return null;
}

function LockNote({ locked }: { locked: boolean }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-info/25 bg-info-subtle px-4 py-3 text-sm text-info">
      <Icon name="lock" size={18} className="mt-0.5 shrink-0" />
      <p>
        {locked
          ? "متن پذیرش پس از ارسال برای امضا قفل است. سکوت یا تأخیر در امضا پذیرش نیست و یک رد، پذیرش را می‌بندد."
          : "پیش‌نویس است؛ پس از ارسال برای امضا متن قفل می‌شود و صاحبان اختیار روی همین متن امضا می‌کنند."}
      </p>
    </div>
  );
}

// ─────────────────────────────── برگه و اعتبار ───────────────────────────────

function SheetItem({ label, text, children }: { label: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="text-sm leading-6 text-ink">
        <Prose text={text} />
        {children}
      </dd>
    </div>
  );
}

function Sheet({ data }: { data: AcceptanceDetail }) {
  const { acceptance, assessment } = data;
  const decided = Boolean(acceptance.decision_text);
  const notes = [
    data.temporary && "برای این سطح پذیرش فقط موقت و استثنایی و کنار طرح مواجهه است (بخش ۱۹).",
    data.non_normal &&
      "ارزیابی ناقص است یا اطمینان کم دارد، پس این پذیرش عادی نیست و مهلت جمع‌آوری شاهد و مجوز موقت مقام بالاتر می‌خواهد.",
    assessment.tolerance_exceeded && "عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود کرده است.",
  ].filter((note): note is string => Boolean(note));
  return (
    <Panel
      title="برگه‌ی پذیرش"
      description="بخش‌های ۱۹ و ۲۵ روش · فقط‌خواندنی"
      actions={<Badge tone="neutral">{acceptance.locked ? "قفل‌شده" : "پیش‌نویس"}</Badge>}
    >
      <CardContent className="flex flex-col gap-5">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
          <SheetItem label="دامنه" text={acceptance.scope} />
          <SheetItem label="ضرورت و دلیل عملیاتی" text={acceptance.reason} />
          <SheetItem label="گزینه‌های بررسی‌شده" text={acceptance.alternatives} />
          <SheetItem label="کنترل جبرانی" text={acceptance.compensating_controls}>
            {acceptance.controls.length > 0 && (
              <span className="mt-1 block">
                <CodeLinks items={acceptance.controls} />
              </span>
            )}
          </SheetItem>
          <SheetItem label="شروط ادامه" text={acceptance.conditions} />
          <SheetItem label="محدودیت مشتری بررسی‌شده" text={acceptance.customer_constraints} />
          <SheetItem label="شاخص پایش" text={acceptance.monitoring} />
          <SheetItem label="شرط لغو یا تصعید" text={acceptance.revocation_triggers} />
        </dl>
        {(decided || acceptance.decision_preview) && (
          <div className="flex flex-col gap-1.5 rounded-lg border border-gold/30 bg-gold-subtle px-4 py-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-gold">
              <Signature aria-hidden className="size-4" />
              {decided ? "متن تصمیم" : "متن تصمیم — پس از آخرین تأیید نوشته می‌شود"}
            </p>
            <p className="text-sm leading-6 whitespace-pre-line text-ink">
              «{faText(decided ? acceptance.decision_text : acceptance.decision_preview)}»
            </p>
          </div>
        )}
        {notes.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-warning">
            {notes.map((note) => (
              <li key={note} className="flex items-start gap-1.5">
                <Icon name="warning" size={14} className="mt-0.5 shrink-0" />
                {note}
              </li>
            ))}
          </ul>
        )}
        {(data.plan || data.renews || data.renewals.length > 0) && (
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-3 text-xs">
            {data.plan && (
              <div className="flex gap-1">
                <dt className="text-ink-3">طرح مواجهه:</dt>
                <dd>
                  <AppLink href={data.plan.href}>{data.plan.option}</AppLink>
                </dd>
              </div>
            )}
            {data.renews && (
              <div className="flex gap-1">
                <dt className="text-ink-3">به جای پذیرش:</dt>
                <dd>
                  <AppLink href={data.renews.href} className="code">
                    {data.renews.code}
                  </AppLink>
                </dd>
              </div>
            )}
            {data.renewals.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <dt className="text-ink-3">پذیرش‌های بعدی:</dt>
                {data.renewals.map((item) => (
                  <dd key={item.code} className="flex items-center gap-1.5">
                    <AppLink href={item.href} className="code">
                      {item.code}
                    </AppLink>
                    <AcceptanceStateBadge state={item.state} />
                  </dd>
                ))}
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Panel>
  );
}

const MARK_TONES: Record<string, string> = {
  start: "text-ink-2",
  today: "text-ink font-semibold",
  first: "text-warning",
  second: "text-warning",
  end: "text-danger",
};

function Validity({ data }: { data: AcceptanceDetail }) {
  const { validity, acceptance } = data;
  const progress = Math.min(Math.max(validity.progress, 0), 100);
  return (
    <Panel title="دوره‌ی اعتبار" description={faText(validity.note)}>
      <CardContent className="flex flex-col gap-4">
        {acceptance.state.value === "active" && acceptance.days_left !== null && (
          <p className={cn("text-sm", acceptance.days_left <= 30 ? "text-warning" : "text-ink-2")}>
            {fa(acceptance.days_left)} روز تا پایان اعتبار مانده است.
          </p>
        )}
        <div
          role="progressbar"
          aria-label="گذشت دوره‌ی اعتبار"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          className="h-1.5 overflow-hidden rounded-full bg-subtle"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
        </div>
        <ol className="flex flex-wrap justify-between gap-x-4 gap-y-3" aria-label="نقطه‌های دوره‌ی اعتبار">
          {validity.marks.map((mark) => (
            <li key={mark.key} className="flex flex-col gap-0.5 text-xs">
              <span className={cn("font-medium", MARK_TONES[mark.key] ?? "text-ink-2")}>{faText(mark.label)}</span>
              <time dateTime={mark.day.iso} className="text-ink-3">
                {shortDate(mark.day)}
              </time>
            </li>
          ))}
        </ol>
        {(acceptance.evidence_due || data.decision_due) && (
          <dl className="flex flex-col gap-1.5 border-t border-line pt-3 text-xs">
            {acceptance.evidence_due && (
              <div className="flex gap-1">
                <dt className="text-ink-3">مهلت جمع‌آوری شاهد:</dt>
                <dd className="text-ink">{longDate(acceptance.evidence_due)}</dd>
              </div>
            )}
            {data.decision_due && (
              <div className="flex flex-wrap items-center gap-1">
                <dt className="text-ink-3">مهلت ثبت تصمیم:</dt>
                <dd className="flex items-center gap-1.5 text-ink">
                  {longDate(data.decision_due)}
                  {data.decision_due_passed && <Badge tone="danger">گذشته است</Badge>}
                </dd>
                <dd className="basis-full text-ink-3">
                  سکوت، تأخیر در پاسخ یا نبود بودجه به معنی پذیرش نیست (بخش ۲۵).
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Panel>
  );
}

// ─────────────────────────────── امضاها ───────────────────────────────

type Decision = "approve" | "reject";

/** امضای همین کاربر درون گام خودش: تأیید یا رد، با توضیح، و برای کمیته و مدیریت ارشد با صورت‌جلسه یا نامه. */
function SignBox({ form, url, code }: { form: SignForm; url: string; code: string }) {
  const { today } = useSession();
  const [values, setValues] = useState<Record<string, ActionValue>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.name, field.kind === "file" ? null : (field.value ?? "")])),
  );
  const [decision, setDecision] = useState<Decision>("approve");
  const [noteError, setNoteError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const action = useBridgeAction();
  const name = useId();
  const set = (field: string, value: ActionValue) => setValues((current) => ({ ...current, [field]: value }));
  const extra = form.fields.filter((field) => field.kind !== "hidden" && field.name !== "note");
  const note = typeof values.note === "string" ? values.note : "";

  function submit() {
    if (decision === "reject" && !note.trim()) {
      setNoteError("برای رد پذیرش دلیل را بنویسید.");
      noteRef.current?.focus();
      return;
    }
    setNoteError("");
    setConfirming(true);
  }

  function reset() {
    setDecision("approve");
    setNoteError("");
    set("note", "");
  }

  return (
    <div className="flex flex-col gap-3 print:hidden" aria-label={`امضای شما به‌عنوان ${form.label}`} role="group">
      {form.intro && <p className="text-xs text-ink-3">{form.intro}</p>}
      {form.errors.length > 0 && <Reasons tone="danger" items={form.errors} />}
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">تصمیم شما</legend>
        <Radio
          card
          name={name}
          label="تأیید پذیرش با شروط بالا"
          checked={decision === "approve"}
          onChange={() => setDecision("approve")}
          disabled={action.isPending}
        />
        <Radio
          card
          name={name}
          label="رد با دلیل (پذیرش بسته می‌شود)"
          checked={decision === "reject"}
          onChange={() => setDecision("reject")}
          disabled={action.isPending}
        />
      </fieldset>
      {extra.map((field) => (
        <FieldControl
          key={field.name}
          field={{ ...field, disabled: field.disabled || action.isPending }}
          id={`sign-${form.authority}-${field.name}`}
          value={values[field.name] ?? null}
          onChange={(value) => set(field.name, value)}
          today={parseJalali(today.jalali) ?? undefined}
        />
      ))}
      <Field label="توضیح (برای رد الزامی است)" error={noteError} required={decision === "reject"}>
        <Textarea
          ref={noteRef}
          rows={3}
          value={note}
          placeholder={decision === "reject" ? "دلیل رد پذیرش…" : "توضیح اختیاری برای تأیید…"}
          onChange={(event) => {
            set("note", event.target.value);
            if (noteError) setNoteError("");
          }}
          disabled={action.isPending}
        />
      </Field>
      <ActionError error={action.error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={decision === "reject" ? "danger" : "primary"} loading={action.isPending} onClick={submit}>
          {!action.isPending && <Signature aria-hidden />}
          ثبت امضا
        </Button>
        <Button variant="ghost" onClick={reset} disabled={action.isPending}>
          انصراف
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={decision === "reject" ? `پذیرش ${code} رد شود؟` : `پذیرش ${code} را تأیید می‌کنید؟`}
        description={`امضای شما به‌عنوان ${form.label} ثبت می‌شود و پس گرفته نمی‌شود.`}
        confirmLabel={decision === "reject" ? "رد پذیرش" : "تأیید پذیرش"}
        tone={decision === "reject" ? "danger" : "primary"}
        loading={action.isPending}
        onConfirm={() => {
          setConfirming(false);
          action.mutate({ url, values: { ...values, decision } });
        }}
      />
    </div>
  );
}

function stepBadge(step: AcceptanceSignature): { tone: Tone; label: string } {
  if (!step.required) return { tone: "neutral", label: "لازم نیست" };
  if (step.signature)
    return step.signature.approved ? { tone: "success", label: "تأیید شد" } : { tone: "danger", label: "رد شد" };
  if (step.waiting) return { tone: "warning", label: step.mine ? "منتظر امضای شما" : "منتظر امضا" };
  return { tone: "neutral", label: "پس از ارسال" };
}

function StepMarker({ step, index }: { step: AcceptanceSignature; index: number }) {
  const signature = step.signature;
  if (signature) {
    return (
      <span
        aria-hidden
        className={cn(
          "grid size-6 place-items-center rounded-full text-on-brand",
          signature.approved ? "bg-success" : "bg-danger",
        )}
      >
        <Icon name={signature.approved ? "check" : "x"} size={14} />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-6 place-items-center rounded-full border-[1.5px] text-xs font-semibold",
        step.mine && step.waiting
          ? "border-brand bg-brand text-on-brand"
          : step.required
            ? "border-line-strong bg-panel text-ink-2"
            : "border-line bg-panel text-ink-3",
      )}
    >
      {fa(index + 1)}
    </span>
  );
}

function SignedLine({ signature }: { signature: NonNullable<AcceptanceSignature["signature"]> }) {
  const time = signature.at.jalali.split(" ")[1];
  const reference =
    signature.reference || signature.reference_date
      ? `${signature.reference_kind} ${signature.reference}${
          signature.reference_date ? ` مورخ ${shortDate(signature.reference_date)}` : ""
        }`
      : "";
  return (
    <p className="text-xs text-ink-2">
      {[
        signature.by?.name,
        `${shortDate(signature.at)}${time ? ` ساعت ${fa(time)}` : ""}`,
        signature.channel,
        reference && faText(reference.trim()),
      ]
        .filter(Boolean)
        .join(" · ")}
      {signature.letter && (
        <>
          {" · "}
          <a href={signature.letter} className="inline-flex items-center gap-1 text-brand hover:underline">
            <FileText aria-hidden className="size-3.5" />
            فایل نامه
          </a>
        </>
      )}
    </p>
  );
}

function Signatures({ data }: { data: AcceptanceDetail }) {
  const forms = new Map(data.sign_forms.map((form) => [form.authority, form]));
  return (
    <section id="signatures" className="flex scroll-mt-24 flex-col gap-3">
      <Panel title="امضاها" description={faText(data.signers)}>
        <CardContent>
          <ol aria-label="گام‌های امضا" className="flex flex-col">
            {data.signatures.map((step, index) => {
              const badge = stepBadge(step);
              const form = forms.get(step.authority);
              const last = index === data.signatures.length - 1;
              return (
                <li key={step.authority} className="relative flex gap-3 pb-5 last:pb-0">
                  {!last && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute start-3 top-7 bottom-1 w-0.5 -translate-x-1/2 rtl:translate-x-1/2",
                        step.signature?.approved ? "bg-success" : "bg-line",
                      )}
                    />
                  )}
                  <StepMarker step={step} index={index} />
                  <div className={cn("flex min-w-0 flex-1 flex-col gap-1.5", !step.required && "opacity-80")}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className={cn("text-sm font-semibold", step.required ? "text-ink" : "text-ink-2")}>
                        {step.label}
                      </h3>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>
                    {step.signature ? (
                      <SignedLine signature={step.signature} />
                    ) : (
                      <p className="text-xs text-ink-3">
                        {faText(step.required ? step.who || step.reason : step.reason)}
                      </p>
                    )}
                    {step.signature?.note && (
                      <p className="rounded-md bg-subtle px-3 py-2 text-xs leading-5 text-ink-2">
                        «{step.signature.note}»
                      </p>
                    )}
                    {form && <SignBox form={form} url={data.sign_url} code={data.acceptance.code} />}
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Panel>
      <p className="flex items-start gap-2 rounded-lg border border-line bg-subtle px-4 py-3 text-xs leading-5 text-ink-2">
        <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-3" />
        هیچ‌کس جز مالک ریسک به جای او امضا نمی‌کند و مالک ریسک امضای دیگری نمی‌دهد. با آخرین تأیید، پذیرش «معتبر»
        می‌شود.
      </p>
      <RevokeBox data={data} />
    </section>
  );
}

function RevokeBox({ data }: { data: AcceptanceDetail }) {
  const revoke = data.revoke;
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  if (!revoke) return null;
  const field = revoke.fields.find((item) => item.name === "reason");
  return (
    <details className="group rounded-lg border border-line bg-panel px-4 py-3 print:hidden">
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium text-danger">
        <Ban aria-hidden className="size-4" />
        لغو پذیرش
      </summary>
      <div className="flex flex-col gap-4 pt-4">
        <ActionError error={action.error} />
        <NotesField field={field} value={reason} onChange={setReason} disabled={action.isPending} />
        <div>
          <Button variant="danger" loading={action.isPending} onClick={() => setConfirming(true)}>
            لغو
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`پذیرش ${data.acceptance.code} لغو شود؟`}
        description="لغو با دلیلش در پرونده می‌ماند و پذیرش لغوشده دوباره معتبر نمی‌شود."
        confirmLabel="لغو پذیرش"
        tone="danger"
        loading={action.isPending}
        onConfirm={() => {
          setConfirming(false);
          action.mutate({ url: revoke.url, values: { reason } });
        }}
      />
    </details>
  );
}

// ─────────────────────────────── صفحه ───────────────────────────────

function Dossier({ data }: { data: AcceptanceDetail }) {
  return (
    <article className="flex flex-col gap-5">
      <Breadcrumb
        items={[
          { label: "پذیرش‌های ریسک", to: "/actions/acceptances" },
          { label: data.acceptance.code, code: true },
        ]}
      />
      <RecordHeader data={data} />
      <Closed data={data} />
      <LockNote locked={data.acceptance.locked} />
      <Reasons tone="info" title={faText(data.problems_title)} items={data.problems} />
      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Sheet data={data} />
          <Validity data={data} />
        </div>
        <Signatures data={data} />
      </div>
      <Attachments record={data} />
      <Comments record={data} />
    </article>
  );
}

export function AcceptanceDetailPage() {
  const page = usePageData<AcceptanceDetail>();
  useTitle(page.data ? `${page.data.acceptance.code} — ${faText(page.data.title)}` : "پذیرش ریسک");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) {
    return (
      <DetailState
        query={page}
        header={
          <PageHeader title="پذیرش ریسک" breadcrumb={[{ label: "پذیرش‌های ریسک", to: "/actions/acceptances" }]} />
        }
      />
    );
  }
  return <Dossier data={page.data} />;
}
