import {
  ClipboardCheck,
  FileCheck,
  FileSearch,
  FlaskConical,
  Gauge,
  PencilLine,
  Plus,
  Route,
  ShieldCheck,
  Target,
} from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Deadline } from "@/components/ui/deadline";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { DetailState, FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { DossierLayout, Fact, Facts, Prose, Reasons, Section, SectionBody } from "@/features/records/dossier";
import { Attachments, Comments } from "@/features/records/RecordSections";
import { RiskTable } from "@/features/risks/RiskTable";
import { count, fa, faText, longDate, shortDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ControlAssessmentDetail, ControlDetail, ControlList, ControlRow } from "@/lib/types";

import { ApplicabilityBadge, ControlRows, EffectBadge } from "./parts";

// کتابخانه‌ی کنترل و ارزیابی اثربخشی (controls/control_list.html، control_detail.html و
// control_assessment_detail.html). کنترل و E را عضو GRC ثبت می‌کند و مسئول کنترل شاهد آزمون را پیوست می‌کند؛ هر
// دکمه همان است که جنگو به همین کاربر می‌دهد.

const LIBRARY = { label: "کتابخانه‌ی کنترل", to: "/controls" };

export function ControlListPage() {
  useTitle("کتابخانه‌ی کنترل");
  const [params] = useSearchParams();
  const page = usePageData<ControlList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کتابخانه‌ی کنترل"
        description="کنترل سازمان یک سازوکار مشخص با مسئول است که ریسک‌ها به آن تکیه دارند و به کنترل‌های پیوست A استاندارد ۲۷۰۰۱ نگاشت می‌شود."
        actions={
          page.data && (
            <>
              {page.data.soa_url && (
                <AppLink href={page.data.soa_url} button={{ variant: "secondary" }}>
                  <FileCheck aria-hidden />
                  بیانیه‌ی کاربردپذیری
                </AppLink>
              )}
              {page.data.create_url && (
                <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
                  <Plus aria-hidden />
                  کنترل تازه
                </AppLink>
              )}
            </>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر کنترل‌ها" />
      <ListBody<ControlRow, ControlList>
        query={page}
        label="کنترل‌ها"
        filtered={filtered}
        empty={{
          icon: <ShieldCheck />,
          title: "کنترلی ثبت نشده است",
          filteredTitle: "کنترلی با این مشخصات پیدا نشد",
          description: "کنترل‌هایی که مسئولشان هستید یا ریسک‌های شما به آن‌ها تکیه دارند این‌جا می‌آیند.",
        }}
      >
        {(data) => <ControlRows controls={data.results} caption={`کنترل‌ها، ${count(data.count, "کنترل")}`} />}
      </ListBody>
    </div>
  );
}

function ControlHeader({ data }: { data?: ControlDetail }) {
  const control = data?.control;
  return (
    <PageHeader
      breadcrumb={[LIBRARY, control ? { label: control.code, code: true } : { label: "کنترل" }]}
      title={control?.title ?? "کنترل"}
      meta={
        control && (
          <>
            <Badge className="code">{control.code}</Badge>
            <Badge tone="accent">{control.kind.label}</Badge>
            {control.is_key && <Badge tone="warning">کنترل کلیدی</Badge>}
            {!control.is_active && (
              <Badge tone="neutral" dot>
                غیرفعال
              </Badge>
            )}
          </>
        )
      }
      actions={
        data?.edit_url && (
          <AppLink href={data.edit_url} button={{ variant: "secondary" }}>
            <PencilLine aria-hidden />
            ویرایش
          </AppLink>
        )
      }
    />
  );
}

function EffectivenessTable({ data }: { data: ControlDetail }) {
  if (!data.effectiveness.length) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
        هنوز ارزیابی نشده است؛ کنترل بدون شاهد اثربخشی E۱ است.
      </p>
    );
  }
  return (
    <table className="data-table">
      <caption className="sr-only">ارزیابی‌های اثربخشی این کنترل، تازه‌ترین بالا</caption>
      <thead>
        <tr>
          <th scope="col">کد</th>
          <th scope="col">دامنه</th>
          <th scope="col">E</th>
          <th scope="col">پایان آزمون</th>
          <th scope="col">شاهد معتبر تا</th>
          <th scope="col">تأییدکننده</th>
        </tr>
      </thead>
      <tbody>
        {data.effectiveness.map((item) => (
          <tr key={item.id}>
            <td data-primary className="w-0 whitespace-nowrap">
              <AppLink href={item.href} className="code font-medium">
                {item.code}
              </AppLink>
            </td>
            <td data-label="دامنه" data-wide className="min-w-48">
              <span className="line-clamp-2 text-sm">{item.scope}</span>
            </td>
            <td data-label="E" data-wide className="min-w-40">
              <EffectBadge item={item} compact />
            </td>
            <td
              data-label="پایان آزمون"
              data-wide
              data-empty={item.test_to ? undefined : ""}
              className="whitespace-nowrap"
            >
              {item.test_to && <time dateTime={item.test_to.iso}>{shortDate(item.test_to)}</time>}
            </td>
            <td
              data-label="شاهد معتبر تا"
              data-wide
              data-empty={item.valid_until ? undefined : ""}
              className="whitespace-nowrap"
            >
              {item.valid_until && <time dateTime={item.valid_until.iso}>{shortDate(item.valid_until)}</time>}
            </td>
            <td
              data-label="تأییدکننده"
              data-wide
              data-empty={item.verified_by ? undefined : ""}
              className="whitespace-nowrap"
            >
              {item.verified_by?.name}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function AnnexTable({ data }: { data: ControlDetail }) {
  if (!data.iso_controls.length) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">
        به کنترلی از پیوست A نگاشت نشده است.
      </p>
    );
  }
  return (
    <table className="data-table">
      <caption className="sr-only">کنترل‌های پیوست A که این کنترل بخشی از اجرای آن‌هاست</caption>
      <thead>
        <tr>
          <th scope="col">شماره</th>
          <th scope="col">عنوان</th>
          <th scope="col">بیانیه‌ی کاربردپذیری</th>
        </tr>
      </thead>
      <tbody>
        {data.iso_controls.map((iso) => (
          <tr key={iso.id}>
            <td data-label="شماره" className="w-0">
              <bdi className="code text-accent-text">{iso.code}</bdi>
            </td>
            <td data-primary className="min-w-48">
              {iso.href ? (
                <AppLink href={iso.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                  {iso.title}
                </AppLink>
              ) : (
                <span className="font-medium">{iso.title}</span>
              )}
            </td>
            <td data-label="بیانیه">
              <ApplicabilityBadge value={iso.applicability} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ControlDetailPage() {
  const page = usePageData<ControlDetail>();
  useTitle(page.data?.title ?? "کنترل");
  if (!page.data) return <DetailState query={page} header={<ControlHeader />} />;
  const data = page.data;
  const { control } = data;
  return (
    <article className="flex flex-col gap-6">
      <ControlHeader data={data} />
      <DossierLayout
        navLabel="بخش‌های پرونده‌ی کنترل"
        factsLabel="مشخصات کنترل"
        sections={[
          { id: "objective", label: "هدف و سازوکار" },
          { id: "effectiveness", label: "ارزیابی‌های اثربخشی" },
          { id: "annex", label: "کنترل‌های پیوست A" },
          { id: "risks", label: "ریسک‌های متکی" },
          { id: "attachments", label: "پیوست‌ها" },
          { id: "comments", label: "نظرها" },
        ]}
        facts={
          <Facts>
            <Fact label="نوع">{control.kind.label}</Fact>
            <Fact label="مسئول کنترل">{control.owner.name}</Fact>
            <Fact label="اجراکننده">{control.operated_by.label}</Fact>
            <Fact label="کنترل کلیدی">{control.is_key ? "بله" : "خیر"}</Fact>
            <Fact label="وضعیت">{control.is_active ? "فعال" : "غیرفعال"}</Fact>
          </Facts>
        }
      >
        <Section id="objective" title="هدف و سازوکار" icon={<Target />}>
          <SectionBody className="text-sm leading-8 text-fg/90">
            <Prose text={control.objective} />
          </SectionBody>
        </Section>
        <Section
          id="effectiveness"
          title="ارزیابی‌های اثربخشی (E)"
          icon={<Gauge />}
          actions={
            data.add_assessment_url && (
              <AppLink href={data.add_assessment_url} button={{ variant: "primary", size: "sm" }}>
                <Plus aria-hidden />
                ارزیابی اثربخشی تازه
              </AppLink>
            )
          }
        >
          <EffectivenessTable data={data} />
        </Section>
        <Section id="annex" title="کنترل‌های پیوست A" icon={<FileCheck />}>
          <AnnexTable data={data} />
        </Section>
        <Section id="risks" title="ریسک‌هایی که به این کنترل تکیه دارند" icon={<ShieldCheck />}>
          <RiskTable
            risks={data.risks}
            caption="ریسک‌هایی که به این کنترل تکیه دارند"
            empty="ریسکی که شما ببینید به این کنترل تکیه ندارد."
          />
        </Section>
        <Attachments record={data} />
        <Comments record={data} />
      </DossierLayout>
    </article>
  );
}

// --- ارزیابی اثربخشی ---

function AssessmentHeader({ data }: { data?: ControlAssessmentDetail }) {
  const item = data?.assessment;
  return (
    <PageHeader
      breadcrumb={[
        LIBRARY,
        ...(item
          ? [
              { label: item.control.code, to: `/controls/${item.control.id}`, code: true },
              { label: item.code, code: true },
            ]
          : [{ label: "ارزیابی اثربخشی" }]),
      ]}
      title={item ? `ارزیابی اثربخشی ${item.code}` : "ارزیابی اثربخشی"}
      description={item && `${item.control.code} ${item.control.title}`}
      meta={
        item && (
          <>
            <Badge tone={item.problem ? "neutral" : item.e >= 3 ? "success" : item.e === 2 ? "warning" : "neutral"}>
              E{fa(item.e)}
              {item.level_name && `: ${item.level_name}`}
            </Badge>
            {item.suspended && (
              <Badge tone="danger" dot>
                معلق
              </Badge>
            )}
          </>
        )
      }
      actions={
        item && (
          <>
            <AppLink href={item.control.href} button={{ variant: "secondary" }}>
              پرونده‌ی کنترل
            </AppLink>
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

function yes(value: boolean, on: string, off: string) {
  return value ? on : off;
}

/** یک ردیف برگه‌ی آزمون: در موبایل برچسب بالای مقدار، در صفحه‌ی پهن کنار آن. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}

const SHEET_SECTIONS = [
  { id: "scope", label: "دامنه و پوشش" },
  { id: "test", label: "آزمون" },
  { id: "result", label: "نتیجه" },
  { id: "evidence", label: "شواهد و مسیرها" },
];

export function ControlAssessmentDetailPage() {
  const page = usePageData<ControlAssessmentDetail>();
  useTitle(page.data?.title ?? "ارزیابی اثربخشی");
  if (!page.data) return <DetailState query={page} header={<AssessmentHeader />} />;
  const data = page.data;
  const item = data.assessment;
  const period =
    item.test_from || item.test_to ? `از ${shortDate(item.test_from) || "-"} تا ${shortDate(item.test_to) || "-"}` : "";
  return (
    <article className="flex flex-col gap-6">
      <AssessmentHeader data={data} />
      <Reasons
        tone="warning"
        title={`داده‌های فعلی این برگه دیگر E${fa(item.e)} را پشتیبانی نمی‌کنند`}
        items={data.unmet}
      />
      {item.problem && !data.unmet.length && (
        <Alert tone="warning" title="این ارزیابی الان اعتبار کاهش ندارد">
          {faText(item.problem)}؛ در محاسبه‌ی Bc فقط E۱ حساب می‌شود.
        </Alert>
      )}
      <DossierLayout
        navLabel="بخش‌های برگه‌ی آزمون"
        factsLabel="مشخصات ارزیابی"
        sections={SHEET_SECTIONS}
        facts={
          <Facts>
            <Fact label="کنترل">
              <AppLink href={item.control.href}>
                <bdi className="code">{item.control.code}</bdi> {item.control.title}
              </AppLink>
              <span className="block text-xs text-muted">
                {item.control.kind.label}
                {item.control.is_key && "، کلیدی"}
              </span>
            </Fact>
            <Fact label="مسئول کنترل">{item.control.owner.name}</Fact>
            <Fact label="شاهد معتبر تا">
              {item.valid_until ? (
                <>
                  <Deadline value={item.valid_until} label="شاهد معتبر تا" />
                  <span className="mt-1 block text-xs text-muted">{fa(item.evidence_age)} روز بعد از پایان آزمون</span>
                </>
              ) : (
                "-"
              )}
            </Fact>
            <Fact label="نسخه‌ی روش">
              <AppLink href={item.method_version.href}>{faText(item.method_version.name)}</AppLink>
            </Fact>
            <Fact label="ثبت">
              {longDate(item.created_at)}
              <span className="block text-xs text-muted">{item.created_by.name}</span>
            </Fact>
          </Facts>
        }
      >
        <Section id="scope" title="دامنه، طراحی و پوشش" icon={<Target />}>
          <SectionBody>
            <dl className="flex flex-col divide-y divide-line text-sm leading-7">
              <Row label="دامنه">
                <Prose text={item.scope} />
              </Row>
              <Row label="وجود و طراحی">
                {yes(item.exists, "وجود دارد", "وجود ندارد")}؛ طراحی {yes(item.design_ok, "کافی", "ناکافی")}
              </Row>
              <Row label="پوشش">
                {item.coverage_pct !== null ? `${fa(item.coverage_pct)} درصد` : "ثبت نشده"}
                {item.population && ` از ${item.population}`}
              </Row>
              <Row label="نقاط حیاتی">
                <Prose text={item.critical_points} />
                <span className="block text-xs text-muted">
                  {yes(item.critical_points_covered, "همه پوشش دارند", "همه پوشش ندارند")}
                </span>
              </Row>
              <Row label="استثناها و انحراف‌ها">
                <Prose text={item.exceptions} />
                {item.known_gap && (
                  <span className="block text-xs text-danger">شکست یا شکاف شناخته‌شده در دامنه‌ی مورد اتکا</span>
                )}
              </Row>
            </dl>
          </SectionBody>
        </Section>
        <Section id="test" title="آزمون" icon={<FlaskConical />}>
          <SectionBody>
            <dl className="flex flex-col divide-y divide-line text-sm leading-7">
              <Row label="روش">
                {item.test_method || <span className="text-muted">ثبت نشده</span>}
                {period && <span className="block text-xs text-muted">{period}</span>}
              </Row>
              <Row label="نمونه">
                {item.sample_size !== null ? fa(item.sample_size) : <span className="text-muted">-</span>}
                {item.sample_rationale && (
                  <span className="block text-xs whitespace-pre-line text-muted">{item.sample_rationale}</span>
                )}
              </Row>
              <Row label="نتیجه‌ی آزمون">
                <Prose text={item.test_result} />
                <span className="block text-xs text-muted">
                  اثربخشی عملیاتی: {yes(item.operating_ok, "نشان داده شده", "نشان داده نشده")}؛ اثر محدود اثبات‌شده:{" "}
                  {yes(item.limited_effect_proven, "بله", "خیر")}
                </span>
              </Row>
              <Row label="شکست‌ها و اقدام اصلاحی">
                <Prose text={item.failures} />
              </Row>
              <Row label="شرط‌های E۴ و E۵">
                <ul className="flex flex-wrap gap-2">
                  {item.conditions.map((condition) => (
                    <li key={condition.label}>
                      <Badge tone={condition.value === "بله" ? "success" : "neutral"}>
                        {condition.label}: {condition.value}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Row>
            </dl>
          </SectionBody>
        </Section>
        <Section id="result" title="نتیجه" icon={<ClipboardCheck />}>
          <SectionBody>
            <dl className="flex flex-col divide-y divide-line text-sm leading-7">
              <Row label="E">
                <EffectBadge item={item} />
                {item.level_name && <span className="ms-2 text-muted">{item.level_name}</span>}
              </Row>
              <Row label="دلیل E">
                <Prose text={item.rationale} />
              </Row>
              <Row label="اطمینان E">{item.confidence?.label ?? "-"}</Row>
              <Row label="تأییدکننده">{item.verified_by?.name ?? "-"}</Row>
            </dl>
          </SectionBody>
        </Section>
        <Section id="evidence" title="شواهد و مسیرها" icon={<FileSearch />}>
          <SectionBody className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-fg">شواهد</h3>
              {data.evidence.length ? (
                <ul aria-label="شواهد این ارزیابی" className="flex flex-col gap-2 text-sm">
                  {data.evidence.map((evidence) => (
                    <li key={evidence.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <bdi className="code text-xs text-muted">{evidence.code}</bdi>
                      <AppLink href={evidence.href} className="underline underline-offset-4">
                        {evidence.title}
                      </AppLink>
                      <span className="text-xs text-muted">
                        {evidence.kind.label}، {shortDate(evidence.observed_on)}
                      </span>
                      {evidence.expired && <Badge tone="danger">منقضی</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">شاهدی که شما ببینید انتخاب نشده است.</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Route aria-hidden className="size-4 text-accent-text" />
                مسیرهایی که به این ارزیابی تکیه دارند
              </h3>
              {data.paths.length ? (
                <ul aria-label="مسیرهای متکی به این ارزیابی" className="flex flex-col gap-2 text-sm">
                  {data.paths.map((path) => (
                    <li key={path.id}>
                      <AppLink href={path.href} className="underline underline-offset-4">
                        {path.name}
                      </AppLink>
                      <span className="text-muted">
                        {" "}
                        در <bdi className="code">{path.assessment.code}</bdi> برای{" "}
                        <bdi className="code">{path.risk.code}</bdi> {path.risk.title}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">مسیری که شما ببینید به این ارزیابی تکیه ندارد.</p>
              )}
            </div>
          </SectionBody>
        </Section>
        <Attachments record={data} />
        <Comments record={data} />
      </DossierLayout>
    </article>
  );
}
