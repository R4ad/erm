import {
  ChevronDown,
  FileSignature,
  Grid3x3,
  Landmark,
  Network,
  PencilLine,
  Plus,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Link } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/ui/page-header";
import { CoverageCellBadge } from "@/features/coverage/CoveragePage";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { Fact, Prose, Section, SectionNav } from "@/features/records/dossier";
import { RiskTable } from "@/features/risks/RiskTable";
import { useRouteOf } from "@/features/session/links";
import { faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { ServiceDetail } from "@/lib/types";

import { ActionsHeader, ActiveBadge, DependentsSection, EmptyNote, RowEdit, ValidityText } from "./parts";
import { hasValidity } from "./validity";

// پرونده‌ی خدمت (catalog/service_detail.html): تعهدها، وابستگی‌ها و مرز مسئولیت، خدمت‌های وابسته، زمان‌های بازیابی
// هر بانک، پوشش جهان ریسک و ریسک‌ها. هر دکمه همان است که جنگو به همین کاربر می‌دهد.

const SERVICES = { label: "خدمات و فرایندها", to: "/catalog/services" };

function ServiceHeader({ data }: { data?: ServiceDetail }) {
  const service = data?.service;
  return (
    <PageHeader
      breadcrumb={[SERVICES, service ? { label: service.code, code: true } : { label: "خدمت" }]}
      title={service?.name ?? "خدمت"}
      meta={
        service && (
          <>
            <Badge className="code">{service.code}</Badge>
            <Badge tone="accent">{service.kind.label}</Badge>
            {service.is_critical && <Badge tone="danger">حیاتی</Badge>}
            {!service.is_active && (
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

/** یک گزینه‌ی منوی «افزودن وابستگی»؛ فرم وابستگی در همین رابط باز می‌شود. */
function MenuLink({ href, label }: { href: string; label: string }) {
  const route = useRouteOf()(href);
  return (
    <DropdownMenuItem asChild>
      {route ? (
        <Link to={route} viewTransition>
          {label}
        </Link>
      ) : (
        <a href={href}>{label}</a>
      )}
    </DropdownMenuItem>
  );
}

function AddDependency({ items }: { items: ServiceDetail["add_dependency"] }) {
  if (!items.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="primary" size="sm">
          <Plus aria-hidden />
          افزودن وابستگی
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <MenuLink key={item.href} {...item} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Commitments({ data }: { data: ServiceDetail }) {
  if (!data.commitments.length) return <EmptyNote>هنوز تعهدی برای این خدمت ثبت نشده است.</EmptyNote>;
  const canEdit = data.commitments.some((item) => item.edit_url);
  return (
    <Card className="table-shell overflow-clip">
      <table className="data-table">
        <caption className="sr-only">تعهدهای این خدمت</caption>
        <thead>
          <tr>
            <th scope="col">عنوان</th>
            <th scope="col">نوع</th>
            <th scope="col">مرجع بند</th>
            <th scope="col">بانک</th>
            <th scope="col">مسئول اجرا</th>
            <th scope="col">اعتبار</th>
            {canEdit && <ActionsHeader />}
          </tr>
        </thead>
        <tbody>
          {data.commitments.map((item) => (
            <tr key={item.id}>
              <td data-primary className="min-w-56">
                <span className="font-medium text-fg">{item.title}</span>
                {item.description && (
                  <span className="mt-1 block text-xs leading-6 whitespace-pre-line text-muted">
                    {item.description}
                  </span>
                )}
              </td>
              <td data-label="نوع" data-empty={item.kind ? undefined : ""} className="whitespace-nowrap">
                {item.kind?.label}
              </td>
              <td data-label="مرجع بند" data-empty={item.clause_ref ? undefined : ""}>
                {item.clause_ref}
              </td>
              <td data-label="بانک" className="whitespace-nowrap">
                {item.customer ?? "همه"}
              </td>
              <td data-label="مسئول اجرا" data-empty={item.owner ? undefined : ""} className="whitespace-nowrap">
                {item.owner?.name}
              </td>
              <td data-label="اعتبار" data-wide data-empty={hasValidity(item.validity) ? undefined : ""}>
                <ValidityText validity={item.validity} />
              </td>
              {canEdit && (
                <td className="text-end">{item.edit_url && <RowEdit href={item.edit_url} name={item.title} />}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Dependencies({ data }: { data: ServiceDetail }) {
  if (!data.dependencies.length) return <EmptyNote>هنوز وابستگی‌ای برای این خدمت ثبت نشده است.</EmptyNote>;
  const canEdit = data.dependencies.some((item) => item.edit_url);
  return (
    <Card className="table-shell overflow-clip">
      <table className="data-table">
        <caption className="sr-only">وابستگی‌های این خدمت و مرز مسئولیت هر کدام</caption>
        <thead>
          <tr>
            <th scope="col">به چه</th>
            <th scope="col">شرح و جایگزین</th>
            <th scope="col">مرز مسئولیت</th>
            <th scope="col">اعتبار</th>
            {canEdit && <ActionsHeader />}
          </tr>
        </thead>
        <tbody>
          {data.dependencies.map((item) => (
            <tr key={item.id}>
              <td data-primary className="min-w-48">
                <span className="block text-xs text-muted">{item.target_kind}</span>
                {item.target_url ? (
                  <AppLink href={item.target_url} className="font-medium">
                    {item.target}
                  </AppLink>
                ) : (
                  <span className="font-medium text-fg">{item.target}</span>
                )}
                {item.is_shared_point && (
                  <div className="mt-1">
                    <Badge tone="warning">نقطه‌ی شکست مشترک</Badge>
                  </div>
                )}
              </td>
              <td data-label="شرح و جایگزین" data-wide className="min-w-48">
                <div className="min-w-0">
                  <Prose text={item.description} />
                  {item.alternative && (
                    <span className="mt-1 block text-xs leading-6 whitespace-pre-line text-muted">
                      جایگزین: {item.alternative}
                    </span>
                  )}
                </div>
              </td>
              <td data-label="مرز مسئولیت" data-wide className="min-w-56">
                {item.boundary ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {item.boundary.map((row) => (
                      <Fact key={row.label} label={row.label}>
                        {row.value === "-" ? <span className="text-muted">-</span> : row.value}
                      </Fact>
                    ))}
                  </dl>
                ) : (
                  <span className="text-sm text-muted">ثبت نشده</span>
                )}
              </td>
              <td data-label="اعتبار" data-empty={hasValidity(item.validity) ? undefined : ""}>
                <ValidityText validity={item.validity} />
              </td>
              {canEdit && (
                <td className="text-end">
                  {item.edit_url && <RowEdit href={item.edit_url} name={`وابستگی به ${item.target}`} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Duration({ value }: { value: string | null }) {
  return value ? <span className="whitespace-nowrap">{faText(value)}</span> : <span className="text-muted">-</span>;
}

function CustomerLinks({ data }: { data: ServiceDetail }) {
  if (!data.customer_links.length) return <EmptyNote>هنوز بانکی برای این خدمت ثبت نشده است.</EmptyNote>;
  const canEdit = data.customer_links.some((item) => item.edit_url);
  return (
    <Card className="table-shell overflow-clip">
      <table className="data-table">
        <caption className="sr-only">بانک‌های این خدمت و زمان‌های بازیابی هر کدام</caption>
        <thead>
          <tr>
            <th scope="col">بانک</th>
            <th scope="col">
              <abbr title="زمان هدف بازیابی" className="no-underline">
                RTO
              </abbr>
            </th>
            <th scope="col">
              <abbr title="حداکثر زمان قابل تحمل اختلال" className="no-underline">
                MTPD
              </abbr>
            </th>
            <th scope="col">
              <abbr title="نقطه‌ی هدف بازیابی" className="no-underline">
                RPO
              </abbr>
            </th>
            <th scope="col">مرجع BIA</th>
            <th scope="col">اعتبار</th>
            {canEdit && <ActionsHeader />}
          </tr>
        </thead>
        <tbody>
          {data.customer_links.map((item) => (
            <tr key={item.id}>
              <td data-primary className="min-w-48">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{item.customer}</span>
                  {item.is_key && <Badge tone="warning">کلیدی</Badge>}
                </span>
                {item.tolerance_notes && (
                  <span className="mt-1 block text-xs leading-6 whitespace-pre-line text-muted">
                    {item.tolerance_notes}
                  </span>
                )}
              </td>
              <td data-label="RTO">
                <Duration value={item.rto} />
              </td>
              <td data-label="MTPD">
                <Duration value={item.mtpd} />
              </td>
              <td data-label="RPO">
                <Duration value={item.rpo} />
              </td>
              <td data-label="مرجع BIA" data-empty={item.bia_reference ? undefined : ""}>
                <bdi>{item.bia_reference}</bdi>
              </td>
              <td data-label="اعتبار" data-empty={hasValidity(item.validity) ? undefined : ""}>
                <ValidityText validity={item.validity} />
              </td>
              {canEdit && (
                <td className="text-end">
                  {item.edit_url && <RowEdit href={item.edit_url} name={`بانک ${item.customer}`} />}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Coverage({ coverage, service }: { coverage: NonNullable<ServiceDetail["coverage"]>; service: string }) {
  if (!coverage.cells.length) return <EmptyNote>هیچ دسته‌ی ریسک فعالی نیست.</EmptyNote>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-label="پوشش این خدمت در هر دسته‌ی ریسک">
      {coverage.cells.map((cell) => (
        <li key={cell.category} className="flex items-start justify-between gap-3 rounded-xl border border-line p-3">
          <span className="min-w-0 text-sm">
            <bdi className="code text-accent-text">{cell.category}</bdi>
            {cell.category_name && <span className="ms-2 text-fg">{cell.category_name}</span>}
          </span>
          <CoverageCellBadge cell={cell} service={service} />
        </li>
      ))}
    </ul>
  );
}

export function ServiceDetailPage() {
  const page = usePageData<ServiceDetail>();
  useTitle(page.data?.title ?? "خدمت");
  if (!page.data) return <DetailState query={page} header={<ServiceHeader />} />;
  const data = page.data;
  const { service, coverage } = data;
  const sections = [
    { id: "commitments", label: "تعهدها" },
    { id: "dependencies", label: "وابستگی‌ها" },
    { id: "dependents", label: "خدمت‌های وابسته" },
    { id: "customers", label: "بانک‌ها" },
    ...(coverage ? [{ id: "coverage", label: "پوشش جهان ریسک" }] : []),
    { id: "risks", label: "ریسک‌ها" },
  ];
  return (
    <article className="flex flex-col gap-6">
      <ServiceHeader data={data} />
      <SectionNav label="بخش‌های پرونده‌ی خدمت" sections={sections} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Card>
            <CardHeader icon={<Target />} title="مأموریت و خروجی" />
            <CardContent className="text-sm leading-8 text-fg/90">
              <Prose text={service.description} />
            </CardContent>
          </Card>
          <Section
            id="commitments"
            title="تعهدها"
            icon={<FileSignature />}
            actions={
              data.add_commitment_url && (
                <AppLink href={data.add_commitment_url} button={{ variant: "primary", size: "sm" }}>
                  <Plus aria-hidden />
                  افزودن تعهد
                </AppLink>
              )
            }
          >
            <Commitments data={data} />
          </Section>
          <Section
            id="dependencies"
            title="وابستگی‌ها"
            icon={<Network />}
            actions={<AddDependency items={data.add_dependency} />}
          >
            <Dependencies data={data} />
          </Section>
          <DependentsSection dependents={data.dependents} />
          <Section
            id="customers"
            title="بانک‌ها و زمان‌های بازیابی"
            icon={<Landmark />}
            actions={
              data.add_customer_url && (
                <AppLink href={data.add_customer_url} button={{ variant: "primary", size: "sm" }}>
                  <Plus aria-hidden />
                  افزودن بانک
                </AppLink>
              )
            }
          >
            <CustomerLinks data={data} />
          </Section>
          {coverage && (
            <Section
              id="coverage"
              title="پوشش جهان ریسک"
              icon={<Grid3x3 />}
              actions={
                <AppLink href={coverage.table_url} button={{ variant: "secondary", size: "sm" }}>
                  جدول پوشش
                </AppLink>
              }
            >
              <Coverage coverage={coverage} service={service.name} />
            </Section>
          )}
          <Section
            id="risks"
            title="ریسک‌ها"
            icon={<ShieldCheck />}
            actions={
              data.create_risk_url && (
                <AppLink href={data.create_risk_url} button={{ variant: "primary", size: "sm" }}>
                  <Plus aria-hidden />
                  انتخاب سناریو برای ثبت ریسک
                </AppLink>
              )
            }
          >
            <RiskTable
              risks={data.risks}
              caption="ریسک‌های این خدمت"
              empty="ریسکی برای این خدمت که شما ببینید ثبت نشده است."
            />
          </Section>
        </div>
        <aside aria-label="مشخصات خدمت">
          <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <CardHeader title="مشخصات" />
            <CardContent>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-3 text-sm">
                <Fact label="نوع">{service.kind.label}</Fact>
                <Fact label="واحد مالک">{service.org_unit}</Fact>
                <Fact label="مالک خدمت">{service.owner.name}</Fact>
                <Fact label="چرخه‌ی عمر">{service.lifecycle_stage.label}</Fact>
                <Fact label="محیط اجرا">{service.environment.label}</Fact>
                <Fact label="حیاتی">{service.is_critical ? "بله" : "خیر"}</Fact>
                <Fact label="وضعیت">
                  <ActiveBadge active={service.is_active} />
                </Fact>
              </dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}
