import { ChevronDown, Gauge, Grid3x3, History, ListChecks, Scale, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/states";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { Fact, Section, SectionNav } from "@/features/records/dossier";
import { useRouteOf } from "@/features/session/links";
import { cn } from "@/lib/cn";
import { dateTime, fa, faText, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { MethodLevel, MethodPage as MethodData, MethodScale } from "@/lib/types";

import { Paragraphs } from "./paragraphs";

// روش ارزیابی (methodology/version_detail.html): مقیاس‌ها و معیارها، جدول احتمال، قاعده‌های Bc، ماتریس تصمیم،
// قواعد هر سطح و پارامترهای یک نسخه. فقط خواندنی است؛ نسخه‌ی تازه در پنل مدیریت ساخته می‌شود.

/** نام نسخه با رقم محلی، ولی نام سند (روش v5) همان‌طور که هست. */
function versionName(name: string) {
  return name.replace(/(?<![A-Za-z])[0-9]+/g, (digits) => fa(digits));
}

const SECTIONS = [
  { id: "likelihood", label: "احتمال" },
  { id: "impact", label: "پیامد" },
  { id: "levels", label: "سطح ریسک و تصمیم" },
  { id: "rules", label: "قواعد هر سطح" },
  { id: "parameters", label: "پارامترها" },
];

function VersionLink({ version }: { version: MethodData["versions"][number] }) {
  const route = useRouteOf()(version.href);
  const label = (
    <>
      <span className="min-w-0 flex-1">{versionName(version.name)}</span>
      <span className="text-xs text-muted">{version.status.label}</span>
    </>
  );
  return (
    <DropdownMenuItem asChild className={cn(version.current && "bg-accent-soft")}>
      {route ? (
        <Link to={route} viewTransition aria-current={version.current ? "page" : undefined}>
          {label}
        </Link>
      ) : (
        <a href={version.href}>{label}</a>
      )}
    </DropdownMenuItem>
  );
}

function Versions({ versions }: { versions: MethodData["versions"] }) {
  if (versions.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary">
          <History aria-hidden />
          نسخه‌های دیگر
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        <DropdownMenuLabel>نسخه‌های روش ارزیابی</DropdownMenuLabel>
        {versions.map((version) => (
          <VersionLink key={version.number} version={version} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MethodHeader({ data }: { data?: MethodData }) {
  const version = data?.version;
  return (
    <PageHeader
      title="روش ارزیابی"
      description={version && versionName(version.name)}
      meta={
        version && (
          <>
            <Badge tone={version.status.value === "active" ? "success" : "neutral"} dot>
              {version.status.label}
            </Badge>
            {version.is_trial && <Badge tone="warning">آزمایشی</Badge>}
          </>
        )
      }
      actions={data && <Versions versions={data.versions} />}
    />
  );
}

/** یک مقیاس با سطح‌ها و معیارهایش (methodology/includes/scale.html). */
function ScaleBlock({ scale }: { scale: MethodScale }) {
  const id = `scale-${scale.code}`;
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-3">
      <h3 id={`${id}-title`} className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-fg">
        <bdi className="code text-accent-text">{scale.code}</bdi>
        <span>{scale.name}</span>
      </h3>
      {scale.scope && <p className="text-sm text-muted">{scale.scope}</p>}
      <Paragraphs text={scale.description} level={4} />
      {scale.levels.length ? (
        <Card className="table-shell overflow-clip">
          <table className="data-table">
            <caption className="sr-only">{`سطح‌های ${scale.code}: ${scale.name}`}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-0">
                  سطح
                </th>
                {scale.has_level_names && <th scope="col">نام</th>}
                {scale.has_bounds && <th scope="col">مرز عددی</th>}
                <th scope="col">معیار</th>
              </tr>
            </thead>
            <tbody>
              {scale.levels.map((level) => (
                <tr key={level.value}>
                  <td data-primary className="w-0 text-center">
                    <Badge tone="accent" className="tabular">
                      {scale.code}
                      {fa(level.value)}
                    </Badge>
                  </td>
                  {scale.has_level_names && (
                    <td data-label="نام" data-empty={level.name ? undefined : ""} className="min-w-32 font-medium">
                      {level.name}
                    </td>
                  )}
                  {scale.has_bounds && (
                    <td data-label="مرز عددی" data-wide data-empty={level.bounds ? undefined : ""}>
                      {level.bounds}
                    </td>
                  )}
                  <td data-label="معیار" data-wide className="min-w-64 leading-7">
                    {level.criteria || <span className="text-muted">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <p className="text-sm text-muted">سطحی ثبت نشده است.</p>
      )}
      <Paragraphs text={scale.guidance} level={4} />
    </section>
  );
}

function BcRules({ data }: { data: MethodData }) {
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-fg">قاعده‌های Bc</h4>
      <Card className="table-shell w-full max-w-xl overflow-clip">
        {/* جدول دوستونی کوتاه در عرض کم هم جدول می‌ماند. */}
        <table className="data-table data-matrix">
          <caption className="sr-only">قاعده‌های Bc</caption>
          <thead>
            <tr>
              <th scope="col">شرط</th>
              <th scope="col" className="w-0 text-center">
                Bc
              </th>
            </tr>
          </thead>
          <tbody>
            {data.bc_rules.map((rule) => (
              <tr key={rule.condition}>
                <td data-primary>{faText(rule.condition)}</td>
                <td data-label="Bc" className="text-center tabular">
                  {fa(rule.bc)}
                </td>
              </tr>
            ))}
            <tr>
              <td data-primary>هیچ‌کدام از شرط‌های بالا برقرار نیست</td>
              <td data-label="Bc" className="text-center tabular">
                {data.bc_default === null ? "-" : fa(data.bc_default)}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted">اگر چند شرط برقرار باشد، کمترین Bc انتخاب می‌شود.</p>
    </div>
  );
}

function LikelihoodGrid({ data }: { data: MethodData }) {
  const scale = data.l_scale;
  if (!scale) return null;
  return (
    <section id="scale-L" aria-labelledby="scale-L-title" className="flex scroll-mt-24 flex-col gap-3">
      <h3 id="scale-L-title" className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-fg">
        <bdi className="code text-accent-text">{scale.code}</bdi>
        <span>{scale.name}</span>
      </h3>
      {scale.scope && <p className="text-sm text-muted">{scale.scope}</p>}
      <Paragraphs text={scale.description} level={4} />
      <Card className="table-shell w-full max-w-xl overflow-clip">
        {/* جعبه‌ی پیمایش با صفحه‌کلید هم پیمایش می‌شود، چون خانه‌های جدول چیزی برای فوکوس ندارند (WCAG 2.1.1). */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد */}
        <div className="table-scroll" tabIndex={0} role="region" aria-label="جدول L">
          <table className="data-table data-matrix text-center">
            <caption className="sr-only">L برای هر ترکیب A در سطر و B در ستون</caption>
            <thead>
              <tr>
                <th scope="col">A در سطر و B در ستون</th>
                {data.levels_range.map((b) => (
                  <th key={b} scope="col" className="text-center">
                    <bdi className="code">B{b}</bdi>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scale.grid.map((row) => (
                <tr key={row.a}>
                  <th scope="row" className="font-medium">
                    <bdi className="code">A{row.a}</bdi>
                  </th>
                  {row.values.map((value, index) => (
                    <td key={data.levels_range[index]} className="text-center tabular">
                      {value === null ? "-" : `L${value}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Paragraphs text={scale.guidance} level={4} />
    </section>
  );
}

function LevelChip({ level }: { level: MethodLevel }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-2 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap text-fg"
      style={{
        borderColor: `color-mix(in oklab, ${level.color} 45%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${level.color} 14%, transparent)`,
      }}
    >
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: level.color }} />
      {level.name}
    </span>
  );
}

function DecisionMatrix({ data }: { data: MethodData }) {
  return (
    <Card className="table-shell overflow-clip">
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد */}
      <div className="table-scroll" tabIndex={0} role="region" aria-label="ماتریس تصمیم">
        <table className="data-table data-matrix text-center">
          <caption className="sr-only">سطح تصمیم برای هر احتمال (L) در سطر و پیامد (I) در ستون</caption>
          <thead>
            <tr>
              <th scope="col">احتمال و پیامد</th>
              {data.levels_range.map((impact) => (
                <th key={impact} scope="col" className="text-center">
                  <bdi className="code">I{impact}</bdi>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.decision_matrix.map((row) => (
              <tr key={row.likelihood}>
                <th scope="row" className="font-medium">
                  <bdi className="code">L{row.likelihood}</bdi>
                </th>
                {row.cells.map((cell, index) => (
                  <td
                    key={data.levels_range[index]}
                    className="min-w-20 px-2! text-center"
                    style={
                      cell.level
                        ? { backgroundColor: `color-mix(in oklab, ${cell.level.color} 20%, transparent)` }
                        : undefined
                    }
                  >
                    <span className="flex flex-col items-center gap-0.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-fg">
                        {cell.level && (
                          <span
                            aria-hidden
                            className="size-2 rounded-full"
                            style={{ backgroundColor: cell.level.color }}
                          />
                        )}
                        {cell.level?.name ?? "-"}
                      </span>
                      <span className="text-xs text-muted tabular">
                        {fa(cell.score)}
                        {cell.raised && " · کف"}
                      </span>
                    </span>
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

function Strategy({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <p className="max-w-prose text-sm leading-8 text-fg/90">
      راهبرد: <span className="font-medium text-fg">{label}</span>. {children}
    </p>
  );
}

function Formula({ children }: { children: string }) {
  return (
    <code dir="ltr" className="code rounded-md bg-surface px-1.5 py-0.5 text-xs text-fg">
      {children}
    </code>
  );
}

export function MethodPage() {
  const page = usePageData<MethodData>();
  useTitle(page.data?.title ?? "روش ارزیابی");
  if (!page.data) return <DetailState query={page} header={<MethodHeader />} />;
  const data = page.data;
  const { version } = data;
  const active = version.status.value === "active";
  return (
    <article className="flex flex-col gap-6">
      <MethodHeader data={data} />
      {version.is_trial && (
        <Alert tone="warning" title="نسخه‌ی آزمایشی">
          این نسخه هنوز تصویب نشده است. طبق «شرط اجرای سازمانی» سند v5، تا پیش از ابلاغ فقط برای ارزیابی آزمایشی به کار
          می‌رود و جایگزین اختیارات و تعهدات مصوب جاری نمی‌شود.
        </Alert>
      )}
      {!active && (
        <Alert tone="info">
          این نسخه فعال نیست. ارزیابی‌های تازه با{" "}
          <AppLink href={data.active_url} className="underline">
            نسخه‌ی فعال
          </AppLink>{" "}
          انجام می‌شوند.
        </Alert>
      )}
      <Card>
        <CardHeader icon={<ListChecks />} title="مشخصات نسخه" />
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[9rem_1fr]">
            <Fact label="منبع">{version.source || <span className="text-muted">-</span>}</Fact>
            {version.based_on && <Fact label="کپی‌شده از">{versionName(version.based_on)}</Fact>}
            <Fact label="تصویب">
              {version.approved_on ? (
                <>
                  نامه‌ی شماره‌ی <bdi>{version.approval_ref}</bdi> به تاریخ{" "}
                  <time dateTime={version.approved_on.iso}>{longDate(version.approved_on)}</time>
                  {version.approval_recorded_by && (
                    <span className="text-muted"> (ثبت: {version.approval_recorded_by.name})</span>
                  )}
                </>
              ) : (
                "تصویب نشده"
              )}
            </Fact>
            {version.activated_at && (
              <Fact label="زمان فعال شدن">
                <time dateTime={version.activated_at.iso}>{dateTime(version.activated_at)}</time>
              </Fact>
            )}
            {version.change_notes && (
              <Fact label="شرح تغییرات">
                <Paragraphs text={version.change_notes} />
              </Fact>
            )}
          </dl>
        </CardContent>
      </Card>
      <SectionNav label="بخش‌های روش ارزیابی" sections={SECTIONS} />

      <Section id="likelihood" title="احتمال" icon={<Gauge />}>
        <Strategy label={version.likelihood_strategy.label}>
          {version.likelihood_strategy.value === "paths_v5" &&
            "در هر مسیر، B کمینه‌ی B0 و Bc همان مسیر است؛ B سناریو بیشینه‌ی B مسیرهاست و L از جدول A × B خوانده می‌شود (بخش ۱۵ و ۱۷ سند v5)."}
        </Strategy>
        <div className="flex flex-col gap-10">
          {data.likelihood_scales.map((scale) => (
            <div key={scale.code} className="flex flex-col gap-4">
              <ScaleBlock scale={scale} />
              {scale.code === "Bc" && <BcRules data={data} />}
            </div>
          ))}
          <LikelihoodGrid data={data} />
        </div>
      </Section>

      <Section id="impact" title="پیامد" icon={<Scale />}>
        <Strategy label={version.impact_strategy.label}>
          {version.impact_strategy.value === "max" && (
            <>
              پیامد نهایی بزرگ‌ترین سطح معتبر بین بُعدها و ذی‌نفعان است:{" "}
              <Formula>{`I = max(${data.impact_scales.map((scale) => scale.code).join(", ")})`}</Formula>
            </>
          )}
        </Strategy>
        <Paragraphs text={version.impact_guidance} />
        <Card className="table-shell overflow-clip">
          <table className="data-table">
            <caption className="sr-only">بُعدهای پیامد</caption>
            <thead>
              <tr>
                <th scope="col" className="w-0">
                  نماد
                </th>
                <th scope="col">بُعد</th>
                <th scope="col">دامنه</th>
              </tr>
            </thead>
            <tbody>
              {data.impact_scales.map((scale) => (
                <tr key={scale.code}>
                  <td data-label="نماد" className="w-0">
                    <a href={`#scale-${scale.code}`} className="code text-accent-text underline underline-offset-4">
                      {scale.code}
                    </a>
                  </td>
                  <td data-primary className="font-medium whitespace-nowrap">
                    {scale.name}
                  </td>
                  <td data-label="دامنه" data-wide>
                    {scale.scope}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="flex flex-col gap-10">
          {data.impact_scales.map((scale) => (
            <ScaleBlock key={scale.code} scale={scale} />
          ))}
        </div>
      </Section>

      <Section id="levels" title="سطح ریسک و تصمیم" icon={<Grid3x3 />}>
        <p className="text-sm">
          <Formula>Score = L × I</Formula>
        </p>
        <Paragraphs text={version.decision_guidance} />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4">
            <h3 className="text-base font-semibold text-fg">مرز سطح‌ها</h3>
            <Card className="table-shell overflow-clip">
              <table className="data-table">
                <caption className="sr-only">بازه‌ی امتیاز هر سطح ریسک</caption>
                <thead>
                  <tr>
                    <th scope="col">سطح</th>
                    <th scope="col">امتیاز</th>
                  </tr>
                </thead>
                <tbody>
                  {data.risk_levels.map((level) => (
                    <tr key={level.name}>
                      <td data-primary>
                        <LevelChip level={level} />
                      </td>
                      <td data-label="امتیاز" className="tabular">
                        {fa(level.min_score)} تا {fa(level.max_score)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <h3 className="text-base font-semibold text-fg">کف سطح تصمیم</h3>
            {data.floors.length ? (
              <ul className="flex list-disc flex-col gap-1.5 ps-5 text-sm leading-7">
                {data.floors.map((floor) => (
                  <li key={floor.min_impact}>
                    پیامد {fa(floor.min_impact)} یا بیشتر: دست‌کم «{floor.min_level}»، هر چه امتیاز باشد
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">کفی تعریف نشده است.</p>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <h3 className="text-base font-semibold text-fg">سطح تصمیم برای هر L و I</h3>
            <DecisionMatrix data={data} />
            <p className="text-xs leading-6 text-muted">
              عدد کوچک هر خانه امتیاز L × I است. «کف» یعنی کف پیامد سطح را بالاتر از سطح پایه‌ی امتیاز برده است.
            </p>
          </div>
        </div>
      </Section>

      <Section id="rules" title="قواعد هر سطح و پذیرش" icon={<ListChecks />}>
        <Paragraphs text={version.acceptance_guidance} />
        <Card className="table-shell overflow-clip">
          <table className="data-table">
            <caption className="sr-only">تصمیم، امضا و مهلت‌های هر سطح ریسک</caption>
            <thead>
              <tr>
                <th scope="col">سطح</th>
                <th scope="col">تصمیم و مرجع مجاز</th>
                <th scope="col">امضای کنار مالک ریسک</th>
                <th scope="col">مهلت مهار</th>
                <th scope="col">مهلت طرح</th>
                <th scope="col">حداکثر اعتبار پذیرش</th>
                <th scope="col">دوره‌ی بازبینی</th>
              </tr>
            </thead>
            <tbody>
              {data.risk_levels.map((level) => (
                <tr key={level.name}>
                  <td data-primary className="w-0">
                    <LevelChip level={level} />
                  </td>
                  <td data-label="تصمیم" data-wide className="min-w-64 leading-7">
                    {level.decision_rule}
                  </td>
                  <td data-label="امضای کنار مالک" data-wide>
                    {level.co_approver}
                  </td>
                  {(["containment", "plan", "acceptance", "review"] as const).map((key) => (
                    <td
                      key={key}
                      data-label={
                        { containment: "مهلت مهار", plan: "مهلت طرح", acceptance: "اعتبار پذیرش", review: "بازبینی" }[
                          key
                        ]
                      }
                      className="whitespace-nowrap"
                    >
                      {level[key] ? faText(level[key]) : <span className="text-muted">-</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-xs text-muted">
          ماه، ماه تقویم شمسی است؛ مثلاً پذیرش ۶ ماهه از ۱۰ مهر تا ۱۰ فروردین اعتبار دارد.
        </p>
      </Section>

      <Section id="parameters" title="پارامترها" icon={<SlidersHorizontal />}>
        {data.parameters.length ? (
          <Card className="table-shell overflow-clip">
            <table className="data-table">
              <caption className="sr-only">پارامترهای این نسخه</caption>
              <thead>
                <tr>
                  <th scope="col">پارامتر</th>
                  <th scope="col">مقدار</th>
                  <th scope="col">منبع</th>
                </tr>
              </thead>
              <tbody>
                {data.parameters.map((parameter) => (
                  <tr key={parameter.key}>
                    <td data-primary className="min-w-56">
                      {parameter.label}
                    </td>
                    <td data-label="مقدار" className="whitespace-nowrap">
                      <span className="font-medium text-fg tabular">{fa(parameter.value)}</span>{" "}
                      <span className="text-muted">{parameter.unit}</span>
                    </td>
                    <td data-label="منبع" data-wide data-empty={parameter.note ? undefined : ""}>
                      <span className="text-xs text-muted">{parameter.note}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="text-sm text-muted">پارامتری ثبت نشده است.</p>
        )}
      </Section>
    </article>
  );
}
