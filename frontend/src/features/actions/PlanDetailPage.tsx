import { ArrowLeftRight, ClipboardList, ListChecks, PencilLine, Plus, ShieldCheck, Stamp } from "lucide-react";
import { useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { LevelBadge } from "@/components/ui/level-badge";
import { PageHeader } from "@/components/ui/page-header";
import { ComparisonTable } from "@/features/assessments/ComparisonTable";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import {
  ActionError,
  Fact,
  Prose,
  Reasons,
  Section,
  SectionBody,
  SectionEmpty,
  SectionNav,
} from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { dateTime, fa, faText, longDate } from "@/lib/format";
import { useSectionFromHash, useTitle } from "@/lib/hooks";
import type { PlanDetail } from "@/lib/types";

import { AcceptanceTable, ActionTable } from "./tables";

// پرونده‌ی طرح مواجهه (actions/plan_detail.html): مشخصات طرح، تأیید مالک ریسک، اقدام‌ها، بازسنجی و پذیرش‌ها.
// هر دکمه فقط وقتی هست که جنگو نشانی‌اش را برای همین کاربر فرستاده است و هر کار با همان view جنگو انجام می‌شود.

const STATE_TONES = { pending: "warning", approved: "success", closed: "neutral" } as const;

function Header({ data }: { data?: PlanDetail }) {
  const plan = data?.plan;
  return (
    <PageHeader
      breadcrumb={[
        { label: "رجیستر ریسک", to: "/risks" },
        ...(plan?.risk.href ? [{ label: plan.risk.code, to: `/risks/${plan.risk.id}`, code: true }] : []),
        { label: "طرح مواجهه" },
      ]}
      title={data ? faText(data.title) : "طرح مواجهه"}
      meta={
        plan && (
          <Badge tone={STATE_TONES[plan.state.value]} dot>
            {plan.state.label}
          </Badge>
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
            {data.plan.risk.href && (
              <AppLink href={`${data.plan.risk.href}#treatment`} button={{ variant: "secondary" }}>
                ریسک
              </AppLink>
            )}
          </>
        )
      }
    />
  );
}

function Summary({ data }: { data: PlanDetail }) {
  const { plan } = data;
  return (
    <Section id="summary" title="خلاصه‌ی طرح" icon={<ClipboardList />}>
      <SectionBody>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
          <Fact label="ریسک">
            {plan.risk.href ? (
              <AppLink href={plan.risk.href}>
                <bdi className="code">{plan.risk.code}</bdi> {plan.risk.title}
              </AppLink>
            ) : (
              <>
                <bdi className="code">{plan.risk.code}</bdi> {plan.risk.title}
              </>
            )}
          </Fact>
          <Fact label="مالک ریسک">{plan.risk_owner?.name ?? "-"}</Fact>
          <Fact label="ارزیابی مبنا">
            <span className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AppLink href={plan.assessment.href} className="code">
                  {plan.assessment.code}
                </AppLink>
                {plan.assessment.score !== null && <span>امتیاز تصمیم {fa(plan.assessment.score)}</span>}
                <LevelBadge level={plan.level} />
              </span>
              {plan.plan_required && (
                <span className="text-xs text-muted">
                  برای این سطح طرح مواجهه الزامی است و پذیرش فقط موقت و استثنایی است (بخش ۱۹).
                </span>
              )}
            </span>
          </Fact>
          <Fact label="مهلت طرح">
            <span className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                {plan.decision_due ? longDate(plan.decision_due) : "-"}
                {plan.overdue && <Badge tone="danger">گذشته است</Badge>}
              </span>
              {plan.containment_due && (
                <span className="text-xs text-muted">مهلت مهار: {dateTime(plan.containment_due)}</span>
              )}
            </span>
          </Fact>
          <Fact label="دلیل و گزینه‌های بررسی‌شده">
            <Prose text={plan.rationale} />
          </Fact>
          {plan.option_details && (
            <Fact label="شرط‌های گزینه">
              <Prose text={plan.option_details} />
            </Fact>
          )}
          <Fact label="ارزیابی هدف">
            {plan.target ? (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <AppLink href={plan.target.href} className="code">
                  {plan.target.code}
                </AppLink>
                <span className="text-muted">({plan.target.status})</span>
                {plan.target.level && (
                  <>
                    <span>سطح هدف</span>
                    <LevelBadge level={plan.target.level} />
                  </>
                )}
              </span>
            ) : (
              "-"
            )}
          </Fact>
          <Fact label="تأیید مالک">
            {plan.approved_by && plan.approved_at ? `${plan.approved_by.name}، ${dateTime(plan.approved_at)}` : "-"}
          </Fact>
        </dl>
      </SectionBody>
    </Section>
  );
}

function Approval({ data }: { data: PlanDetail }) {
  const { approval, plan } = data;
  const [confirming, setConfirming] = useState(false);
  const action = useBridgeAction();
  const url = approval.approve_url;
  const empty = !approval.problems.length && !url && !approval.waiting_for_owner;
  if (empty) return null;
  return (
    <Section id="approval" title="تأیید مالک ریسک" icon={<ShieldCheck />}>
      <SectionBody className="flex flex-col gap-4">
        <Reasons tone="info" title="پیش از تأیید مالک ریسک لازم است:" items={approval.problems} />
        {url && (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-fg">{faText(approval.message)}</p>
              <Button variant="primary" loading={action.isPending} onClick={() => setConfirming(true)}>
                {!action.isPending && <ShieldCheck aria-hidden />}
                تأیید طرح
              </Button>
            </div>
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              title={`طرح «${plan.option.label}» ریسک ${plan.risk.code} تأیید شود؟`}
              description="با تأیید، طرح و همه‌ی اقدام‌های برنامه‌ریزی‌شده‌اش مصوب می‌شوند و تأیید شما در تاریخچه می‌ماند."
              confirmLabel="تأیید طرح"
              loading={action.isPending}
              onConfirm={() => {
                setConfirming(false);
                action.mutate({ url, values: {} });
              }}
            />
          </>
        )}
        <ActionError error={action.error} />
        {approval.waiting_for_owner && (
          <p className="text-sm text-muted">طرح و اقدام‌های تازه را مالک ریسک تأیید می‌کند.</p>
        )}
      </SectionBody>
    </Section>
  );
}

function Actions({ data }: { data: PlanDetail }) {
  return (
    <Section
      id="actions"
      title="اقدام‌ها"
      icon={<ListChecks />}
      actions={
        data.add_action_url && (
          <AppLink href={data.add_action_url} button={{ variant: "primary", size: "sm" }}>
            <Plus aria-hidden />
            اقدام تازه
          </AppLink>
        )
      }
    >
      {data.actions.length ? (
        <ActionTable actions={data.actions} caption="اقدام‌های این طرح" />
      ) : (
        <SectionEmpty>هنوز اقدامی ثبت نشده است.</SectionEmpty>
      )}
    </Section>
  );
}

function Reassessment({ data }: { data: PlanDetail }) {
  const { reassessment } = data;
  if (!reassessment && !data.reassess_url) return null;
  return (
    <Section
      id="reassessment"
      title="بازسنجی"
      icon={<ArrowLeftRight />}
      actions={
        data.reassess_url && (
          <AppLink href={data.reassess_url} button={{ variant: "primary", size: "sm" }}>
            ثبت بازسنجی
          </AppLink>
        )
      }
    >
      {reassessment ? (
        <SectionBody>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
            <Fact label="تاریخ و مسئول">
              {longDate(reassessment.performed_on)}، {reassessment.responsible?.name}
            </Fact>
            <Fact label="ارزیابی تازه">
              <AppLink href={reassessment.assessment.href} className="code">
                {reassessment.assessment.code}
              </AppLink>
            </Fact>
            <Fact label="مقایسه با هدف">
              <span className="flex flex-col gap-1.5">
                {reassessment.target_met === null ? (
                  <span>طرح ارزیابی هدف تأییدشده نداشت.</span>
                ) : reassessment.target_met ? (
                  <Badge tone="success" className="self-start">
                    هدف محقق شد
                  </Badge>
                ) : (
                  <Badge tone="warning" className="self-start">
                    هدف هنوز محقق نشده است
                  </Badge>
                )}
                {reassessment.method_changed && (
                  <span className="text-xs text-warning">
                    روش ارزیابی عوض شده و بخشی از تغییر ممکن است از روش باشد.
                  </span>
                )}
              </span>
            </Fact>
            <Fact label="تصمیم">
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{reassessment.decision.label}</span>
                <Prose text={reassessment.note} />
              </span>
            </Fact>
          </dl>
        </SectionBody>
      ) : (
        <SectionEmpty>
          ارزیابی جاری تازه‌ای بعد از این طرح تأیید شده است. پیش از طرح دور تازه، نتیجه را با هدف مقایسه و تصمیم پذیرش
          یا ادامه‌ی اصلاح را ثبت کنید.
        </SectionEmpty>
      )}
      {data.comparison && (
        <ComparisonTable
          bare
          data={data.comparison}
          caption={`مقایسه‌ی ارزیابی مبنا، تازه و هدف ریسک ${data.plan.risk.code}`}
        />
      )}
    </Section>
  );
}

function Acceptances({ data }: { data: PlanDetail }) {
  return (
    <Section
      id="acceptances"
      title="پذیرش"
      icon={<Stamp />}
      actions={
        data.add_acceptance_url && (
          <AppLink href={data.add_acceptance_url} button={{ variant: "secondary", size: "sm" }}>
            <Plus aria-hidden />
            پذیرش زمان‌دار
          </AppLink>
        )
      }
    >
      <p className="border-b border-line px-5 py-3 text-sm text-muted">{faText(data.acceptance_note)}</p>
      {data.acceptances.length ? (
        <AcceptanceTable acceptances={data.acceptances} caption="پذیرش‌های این طرح" />
      ) : (
        <SectionEmpty>پذیرشی برای این طرح ثبت نشده است.</SectionEmpty>
      )}
    </Section>
  );
}

export function PlanDetailPage() {
  const page = usePageData<PlanDetail>();
  useTitle(page.data ? `${page.data.title} ${page.data.plan.risk.code}` : "طرح مواجهه");
  useSectionFromHash(Boolean(page.data));
  if (!page.data) return <DetailState query={page} header={<Header />} />;
  const data = page.data;
  const sections = [
    { id: "summary", label: "خلاصه", show: true },
    { id: "approval", label: "تأیید", show: Boolean(data.approval.problems.length || data.approval.approve_url) },
    { id: "actions", label: "اقدام‌ها", show: true },
    { id: "reassessment", label: "بازسنجی", show: Boolean(data.reassessment || data.reassess_url) },
    { id: "acceptances", label: "پذیرش", show: true },
    { id: "attachments", label: "پیوست‌ها", show: true },
    { id: "comments", label: "نظرها", show: true },
  ].filter((section) => section.show);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        <Header data={data} />
        <SectionNav label="بخش‌های طرح" sections={sections} />
      </div>
      <Summary data={data} />
      <Approval data={data} />
      <Actions data={data} />
      <Reassessment data={data} />
      <Acceptances data={data} />
      <Attachments record={data} />
      <Comments record={data} />
    </div>
  );
}
