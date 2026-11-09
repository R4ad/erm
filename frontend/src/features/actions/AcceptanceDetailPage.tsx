import { Ban, Check, FileText, PencilLine, Send, Signature, X } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { useBridgeAction, type ActionValue } from "@/features/forms/bridge-action";
import { FieldControl } from "@/features/forms/field-control";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { ActionError, CodeLinks, Fact, NotesField, Prose, Reasons, Section } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { useSession } from "@/features/session/session";
import { dateTime, fa, faText, longDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import { parseJalali } from "@/lib/jalali";
import type { AcceptanceDetail, AcceptanceSignature, SignForm } from "@/lib/types";

import { AcceptanceStateBadge } from "./tables";

// پرونده‌ی پذیرش ریسک (actions/acceptance_detail.html): متن تصمیم، مشخصات، ارسال برای امضا، امضای صاحبان اختیار
// (برای مدیریت ارشد و کمیته با شماره، تاریخ و فایل نامه یا صورت‌جلسه) و لغو. همه‌ی شرط‌ها با همان view جنگوست؛ این
// صفحه فقط کادرهایی را نشان می‌دهد که جنگو برای همین کاربر فرستاده است.

function Header({ data }: { data?: AcceptanceDetail }) {
  const acceptance = data?.acceptance;
  return (
    <PageHeader
      breadcrumb={[
        { label: "پذیرش‌های ریسک", to: "/actions/acceptances" },
        acceptance ? { label: acceptance.code, code: true } : { label: "پذیرش" },
      ]}
      title={acceptance ? `پذیرش ${acceptance.code}` : "پذیرش ریسک"}
      meta={
        data && (
          <>
            <AcceptanceStateBadge state={data.acceptance.state} />
            <LevelBadge level={data.level} />
          </>
        )
      }
      actions={
        data && (
          <>
            {data.edit_url && (
              <AppLink href={data.edit_url} button={{ variant: "secondary" }}>
                <PencilLine aria-hidden />
                ویرایش
              </AppLink>
            )}
            {data.risk.href && (
              <AppLink href={`${data.risk.href}#acceptances`} button={{ variant: "secondary" }}>
                ریسک
              </AppLink>
            )}
          </>
        )
      }
    />
  );
}

/** متن تصمیم پذیرش معتبر یا منقضی، و پذیرش ردشده یا لغوشده با دلیلش. */
function Decision({ data }: { data: AcceptanceDetail }) {
  const { acceptance } = data;
  const state = acceptance.state.value;
  if ((state === "active" || state === "expired") && acceptance.decision_text) {
    const expired = state === "expired";
    return (
      <Alert tone={expired ? "danger" : "success"} title="متن تصمیم">
        <p className="whitespace-pre-line">{acceptance.decision_text}</p>
        {expired ? (
          <p className="mt-1 text-xs">
            تاریخ پایان گذشته و پذیرش منقضی است. تمدید خودکار نیست؛ ادامه پذیرش تازه با همه‌ی امضاها می‌خواهد.
          </p>
        ) : (
          acceptance.days_left !== null &&
          acceptance.days_left <= 30 && (
            <p className="mt-1 text-xs">{fa(acceptance.days_left)} روز تا پایان اعتبار مانده است.</p>
          )
        )}
      </Alert>
    );
  }
  if (acceptance.closed) {
    const closed = acceptance.closed;
    return (
      <Alert tone="info" title={closed.label}>
        {[closed.by?.name, closed.at ? dateTime(closed.at) : ""].filter(Boolean).join("، ")}
        {closed.reason && <p className="mt-1 whitespace-pre-line">{closed.reason}</p>}
      </Alert>
    );
  }
  return null;
}

function Facts({ data }: { data: AcceptanceDetail }) {
  const { acceptance, risk, assessment, cap } = data;
  return (
    <Card>
      <CardContent className="pt-5">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
          <Fact label="ریسک">
            {risk.href ? (
              <AppLink href={risk.href}>
                <bdi className="code">{risk.code}</bdi> {risk.title}
              </AppLink>
            ) : (
              <>
                <bdi className="code">{risk.code}</bdi> {risk.title}
              </>
            )}
            {risk.owner && <span className="text-muted">، مالک: {risk.owner.name}</span>}
          </Fact>
          <Fact label="ارزیابی">
            <span className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AppLink href={assessment.href} className="code">
                  {assessment.code}
                </AppLink>
                <span className="text-muted">(روش نسخه‌ی {fa(assessment.method_version)})</span>
                {assessment.score !== null && <span>امتیاز تصمیم {fa(assessment.score)}</span>}
                <span>اطمینان {assessment.confidence ?? "-"}</span>
                <LevelBadge level={data.level} />
              </span>
              {data.temporary && (
                <span className="text-xs text-muted">
                  برای این سطح پذیرش فقط موقت و استثنایی و کنار طرح مواجهه است (بخش ۱۹).
                </span>
              )}
              {data.non_normal && (
                <span className="text-xs text-danger">
                  ارزیابی ناقص است یا اطمینان کم دارد، پس این پذیرش عادی نیست و مهلت جمع‌آوری شاهد و مجوز موقت مقام
                  بالاتر می‌خواهد.
                </span>
              )}
              {assessment.tolerance_exceeded && (
                <span className="text-xs text-danger">عبور از حد تحمل مشتری اختیار پذیرش عمومی را محدود کرده است.</span>
              )}
            </span>
          </Fact>
          {data.plan && (
            <Fact label="طرح مواجهه">
              <AppLink href={data.plan.href}>{data.plan.option}</AppLink>
            </Fact>
          )}
          {data.renews && (
            <Fact label="به جای پذیرش">
              <AppLink href={data.renews.href} className="code">
                {data.renews.code}
              </AppLink>
            </Fact>
          )}
          {data.renewals.length > 0 && (
            <Fact label="پذیرش‌های بعدی">
              <ul className="flex flex-col gap-1.5">
                {data.renewals.map((item) => (
                  <li key={item.code} className="flex flex-wrap items-center gap-2">
                    <AppLink href={item.href} className="code text-xs">
                      {item.code}
                    </AppLink>
                    <AcceptanceStateBadge state={item.state} />
                  </li>
                ))}
              </ul>
            </Fact>
          )}
          <Fact label="اعتبار">
            <span className="flex flex-col gap-1">
              <span>
                {longDate(acceptance.start)} تا {longDate(acceptance.end)}
              </span>
              {cap.until && cap.value !== null && (
                <span className="text-xs text-muted">
                  سقف سطح «{data.level?.name}»: {fa(cap.value)} {cap.unit}، یعنی تا {longDate(cap.until)}. تمدید خودکار
                  نیست.
                </span>
              )}
            </span>
          </Fact>
          {acceptance.evidence_due && <Fact label="مهلت جمع‌آوری شاهد">{longDate(acceptance.evidence_due)}</Fact>}
          {data.decision_due && (
            <Fact label="مهلت ثبت تصمیم">
              <span className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  {longDate(data.decision_due)}
                  {data.decision_due_passed && <Badge tone="danger">گذشته است</Badge>}
                </span>
                <span className="text-xs text-muted">
                  سکوت، تأخیر در پاسخ یا نبود بودجه به معنی پذیرش نیست (بخش ۲۵).
                </span>
              </span>
            </Fact>
          )}
          <Fact label="دامنه">
            <Prose text={acceptance.scope} />
          </Fact>
          <Fact label="ضرورت و دلیل">
            <Prose text={acceptance.reason} />
          </Fact>
          <Fact label="گزینه‌های بررسی‌شده">
            <Prose text={acceptance.alternatives} />
          </Fact>
          <Fact label="کنترل جبرانی">
            <span className="flex flex-col gap-1">
              <Prose text={acceptance.compensating_controls} />
              {acceptance.controls.length > 0 && <CodeLinks items={acceptance.controls} />}
            </span>
          </Fact>
          <Fact label="شروط ادامه">
            <Prose text={acceptance.conditions} />
          </Fact>
          <Fact label="محدودیت مشتری">
            <Prose text={acceptance.customer_constraints} />
          </Fact>
          <Fact label="شاخص پایش">
            <Prose text={acceptance.monitoring} />
          </Fact>
          <Fact label="شرط لغو یا تصعید">
            <Prose text={acceptance.revocation_triggers} />
          </Fact>
          <Fact label="مسئول پیگیری">{acceptance.follow_up_by?.name ?? "-"}</Fact>
        </dl>
      </CardContent>
    </Card>
  );
}

function SubmitBox({ data }: { data: AcceptanceDetail }) {
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  const url = data.submit_url;
  if (!url) return null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <ActionError error={action.error} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg">
            متن پذیرش بعد از ارسال قفل می‌شود و صاحبان اختیار روی همین متن امضا می‌کنند.
          </p>
          <Button variant="primary" loading={action.isPending} onClick={() => setConfirming(true)}>
            {!action.isPending && <Send aria-hidden className="rtl:-scale-x-100" />}
            ارسال برای امضا
          </Button>
        </div>
      </CardContent>
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
    </Card>
  );
}

function SignatureRow({ row }: { row: AcceptanceSignature }) {
  const signature = row.signature;
  return (
    <li className="flex flex-col gap-1.5 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-fg">{row.label}</span>
        {signature ? (
          signature.approved ? (
            <Badge tone="success">
              <Check aria-hidden />
              تأیید
            </Badge>
          ) : (
            <Badge tone="danger">
              <X aria-hidden />
              رد
            </Badge>
          )
        ) : (
          row.waiting && <Badge tone="warning">منتظر</Badge>
        )}
      </div>
      <p className="text-xs text-muted">{faText(row.reason)}</p>
      {row.candidates && (
        <p className="text-xs">
          مدیران واحد «{row.candidates.unit}»:{" "}
          {row.candidates.names.length ? row.candidates.names.join("، ") : "هیچ‌کس"}
        </p>
      )}
      {signature && (
        <div className="flex flex-col gap-1 text-xs">
          <p>
            {[
              signature.by?.name,
              dateTime(signature.at),
              signature.reference || signature.reference_date
                ? `${signature.reference_kind} ${signature.reference}${
                    signature.reference_date ? ` مورخ ${longDate(signature.reference_date)}` : ""
                  }`.trim()
                : "",
            ]
              .filter(Boolean)
              .map((part) => faText(part))
              .join("، ")}
            {signature.letter && (
              <>
                {"، "}
                <a href={signature.letter} className="inline-flex items-center gap-1 text-accent-text hover:underline">
                  <FileText aria-hidden className="size-3.5" />
                  فایل نامه
                </a>
              </>
            )}
          </p>
          {signature.note && <p className="whitespace-pre-line text-fg/90">{signature.note}</p>}
        </div>
      )}
    </li>
  );
}

type Decision = "approve" | "reject";

/** کادر امضای کاربر برای یک مقام: تأیید یا رد، با توضیح و برای مدیریت ارشد و کمیته با نامه یا صورت‌جلسه. */
function SignBox({ form, url, code }: { form: SignForm; url: string; code: string }) {
  const { today } = useSession();
  const [values, setValues] = useState<Record<string, ActionValue>>(() =>
    Object.fromEntries(form.fields.map((field) => [field.name, field.kind === "file" ? null : (field.value ?? "")])),
  );
  const [confirming, setConfirming] = useState<Decision | null>(null);
  const action = useBridgeAction();
  const busy = (decision: Decision) => action.isPending && action.variables?.values.decision === decision;
  const visible = form.fields.filter((field) => field.kind !== "hidden");
  const set = (name: string, value: ActionValue) => setValues((current) => ({ ...current, [name]: value }));
  const titleId = `sign-${form.authority}-title`;
  return (
    <section aria-labelledby={titleId}>
      <Card>
        <CardHeader
          as="h3"
          icon={<Signature />}
          titleId={titleId}
          title={`امضای شما به‌عنوان ${form.label}`}
          description={form.intro || undefined}
        />
        <CardContent className="flex flex-col gap-4">
          <ActionError error={action.error} />
          {form.errors.length > 0 && <Reasons tone="danger" items={form.errors} />}
          {visible.map((field) =>
            field.kind === "textarea" ? (
              <NotesField
                key={field.name}
                field={field}
                value={typeof values[field.name] === "string" ? (values[field.name] as string) : ""}
                onChange={(value) => set(field.name, value)}
                disabled={action.isPending}
              />
            ) : (
              <FieldControl
                key={field.name}
                field={{ ...field, disabled: field.disabled || action.isPending }}
                id={`sign-${form.authority}-${field.name}`}
                value={values[field.name] ?? null}
                onChange={(value) => set(field.name, value)}
                today={parseJalali(today.jalali) ?? undefined}
              />
            ),
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              loading={busy("approve")}
              disabled={action.isPending}
              onClick={() => setConfirming("approve")}
            >
              {!busy("approve") && <Check aria-hidden />}
              تأیید پذیرش
            </Button>
            <Button
              variant="danger"
              loading={busy("reject")}
              disabled={action.isPending}
              onClick={() => setConfirming("reject")}
            >
              {!busy("reject") && <X aria-hidden />}
              رد پذیرش
            </Button>
          </div>
        </CardContent>
        <ConfirmDialog
          open={confirming !== null}
          onOpenChange={(open) => !open && setConfirming(null)}
          title={confirming === "reject" ? `پذیرش ${code} رد شود؟` : `پذیرش ${code} را تأیید می‌کنید؟`}
          description={`امضای شما به‌عنوان ${form.label} ثبت می‌شود و پس گرفته نمی‌شود.`}
          confirmLabel={confirming === "reject" ? "رد پذیرش" : "تأیید پذیرش"}
          tone={confirming === "reject" ? "danger" : "primary"}
          loading={action.isPending}
          onConfirm={() => {
            const decision = confirming;
            setConfirming(null);
            if (decision) action.mutate({ url, values: { ...values, decision } });
          }}
        />
      </Card>
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
    <details className="group rounded-xl border border-line bg-surface/40 px-5 py-3">
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

function Signatures({ data }: { data: AcceptanceDetail }) {
  return (
    <Section id="signatures" title="امضاها" icon={<Signature />}>
      <Card className="overflow-clip">
        <ul aria-label="امضاهای لازم" className="divide-y divide-line">
          {data.signatures.map((row) => (
            <SignatureRow key={row.authority} row={row} />
          ))}
        </ul>
      </Card>
      {data.sign_forms.map((form) => (
        <SignBox key={form.authority} form={form} url={data.sign_url} code={data.acceptance.code} />
      ))}
      <RevokeBox data={data} />
    </Section>
  );
}

export function AcceptanceDetailPage() {
  const page = usePageData<AcceptanceDetail>();
  useTitle(page.data ? faText(page.data.title) : "پذیرش ریسک");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) return <DetailState query={page} header={<Header />} />;
  const data = page.data;
  return (
    <div className="flex flex-col gap-6">
      <Header data={data} />
      <Decision data={data} />
      <Facts data={data} />
      <Reasons tone="info" title={faText(data.problems_title)} items={data.problems} />
      <SubmitBox data={data} />
      <Signatures data={data} />
      <Attachments record={data} />
      <Comments record={data} />
    </div>
  );
}
