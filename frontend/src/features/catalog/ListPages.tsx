import { Boxes, Building2, FileSignature, Landmark, Plus, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { count, formatNumber } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type {
  AssetList,
  AssetRow,
  CommitmentList,
  CommitmentRow,
  CustomerList,
  CustomerRow,
  Listing,
  ServiceList,
  ServiceRow,
  SupplierList,
  SupplierRow,
} from "@/lib/types";

import { ActionsHeader, ActiveBadge, CiaTags, RowEdit, ValidityText } from "./parts";
import { hasValidity } from "./validity";

// فهرست‌های کاتالوگ (catalog/*_list.html): خدمات، تعهدها، دارایی‌ها، تأمین‌کنندگان و بانک‌ها. هر فهرست همان
// رکوردهایی است که view جنگو به همین کاربر نشان می‌دهد و دکمه‌ی ثبت فقط برای کسی که جنگو اجازه‌ی ویرایش می‌دهد.

interface CatalogListProps<T, D extends Listing<T> & { create_url: string | null }> {
  title: string;
  description: string;
  createLabel: string;
  noun: string;
  icon: ReactNode;
  empty: string;
  /** همان متن خالی صفحه‌ی جنگو برای فهرست فیلترشده. */
  notFound: string;
  emptyDescription?: string;
  children: (data: D) => ReactNode;
}

function CatalogList<T, D extends Listing<T> & { create_url: string | null }>({
  title,
  description,
  createLabel,
  noun,
  icon,
  empty,
  notFound,
  emptyDescription,
  children,
}: CatalogListProps<T, D>) {
  useTitle(title);
  const [params] = useSearchParams();
  const page = usePageData<D>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={
          page.data?.create_url && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              {createLabel}
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label={`فیلتر ${noun}`} />
      <ListBody<T, D>
        query={page}
        label={noun}
        filtered={filtered}
        empty={{ icon, title: empty, filteredTitle: notFound, description: emptyDescription }}
      >
        {children}
      </ListBody>
    </div>
  );
}

function Owner({ name }: { name?: string | null }) {
  return name ? <>{name}</> : <span className="text-muted">-</span>;
}

// --- خدمات ---

export function ServiceRows({ services, caption }: { services: ServiceRow[]; caption: string }) {
  return (
    <table className="data-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">کد</th>
          <th scope="col">نام</th>
          <th scope="col">نوع</th>
          <th scope="col">واحد مالک</th>
          <th scope="col">مالک</th>
          <th scope="col">چرخه‌ی عمر</th>
          <th scope="col">وضعیت</th>
        </tr>
      </thead>
      <tbody>
        {services.map((service) => (
          <tr key={service.id}>
            <td data-label="کد" className="w-0">
              <bdi className="code text-accent-text">{service.code}</bdi>
            </td>
            <td data-primary className="min-w-52">
              <AppLink href={service.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                {service.name}
              </AppLink>
              {service.is_critical && (
                <div className="mt-1">
                  <Badge tone="danger">حیاتی</Badge>
                </div>
              )}
            </td>
            <td data-label="نوع" className="whitespace-nowrap">
              {service.kind.label}
            </td>
            <td data-label="واحد مالک">{service.org_unit}</td>
            <td data-label="مالک" className="whitespace-nowrap">
              {service.owner.name}
            </td>
            <td data-label="چرخه‌ی عمر" className="whitespace-nowrap">
              {service.lifecycle_stage.label}
            </td>
            <td data-label="وضعیت">
              <ActiveBadge active={service.is_active} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ServiceListPage() {
  return (
    <CatalogList<ServiceRow, ServiceList>
      title="خدمات و فرایندها"
      description="خدمت یا فرایند داتین واحدی است که ریسک‌ها روی آن شناسایی می‌شوند و تعهدها، وابستگی‌ها و زمان‌های بازیابی بانک‌ها به آن وصل‌اند."
      createLabel="خدمت تازه"
      noun="خدمت‌ها"
      icon={<Boxes />}
      empty="خدمتی ثبت نشده است"
      notFound="خدمتی با این مشخصات پیدا نشد"
      emptyDescription="خدمت‌هایی که مالکشان هستید یا در واحدهای شما اجرا می‌شوند این‌جا می‌آیند."
    >
      {(data) => <ServiceRows services={data.results} caption={`خدمت‌ها، ${count(data.count, "خدمت")}`} />}
    </CatalogList>
  );
}

// --- تعهدها ---

export function CommitmentListPage() {
  return (
    <CatalogList<CommitmentRow, CommitmentList>
      title="تعهدها"
      description="بند SLA، قرارداد یا الزام ابلاغی. یک تعهد می‌تواند چند خدمت را بپوشاند و بدون بانک یعنی برای همه‌ی بانک‌هاست."
      createLabel="تعهد تازه"
      noun="تعهدها"
      icon={<FileSignature />}
      empty="تعهدی ثبت نشده است"
      notFound="تعهدی با این مشخصات پیدا نشد"
    >
      {(data) => {
        const canEdit = data.results.some((row) => row.edit_url);
        return (
          <table className="data-table">
            <caption className="sr-only">{`تعهدها، ${count(data.count, "تعهد")}`}</caption>
            <thead>
              <tr>
                <th scope="col">عنوان</th>
                <th scope="col">نوع</th>
                <th scope="col">مرجع بند</th>
                <th scope="col">خدمت‌ها</th>
                <th scope="col">بانک</th>
                <th scope="col">مسئول اجرا</th>
                <th scope="col">اعتبار</th>
                {canEdit && <ActionsHeader />}
              </tr>
            </thead>
            <tbody>
              {data.results.map((row) => (
                <tr key={row.id}>
                  <td data-primary className="min-w-56">
                    <span className="font-medium text-fg">{row.title}</span>
                    {row.description && (
                      <span className="mt-1 line-clamp-2 block text-xs leading-6 text-muted">{row.description}</span>
                    )}
                  </td>
                  <td data-label="نوع" data-empty={row.kind ? undefined : ""} className="whitespace-nowrap">
                    {row.kind?.label}
                  </td>
                  <td data-label="مرجع بند" data-empty={row.clause_ref ? undefined : ""}>
                    {row.clause_ref}
                  </td>
                  <td data-label="خدمت‌ها">
                    {row.services.length ? (
                      <span className="flex flex-wrap gap-x-2 gap-y-1">
                        {row.services.map((service) => (
                          <AppLink key={service.code} href={service.href} className="text-xs">
                            <bdi className="code">{service.code}</bdi>
                          </AppLink>
                        ))}
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td data-label="بانک">{row.customer ?? "همه"}</td>
                  <td data-label="مسئول اجرا" className="whitespace-nowrap">
                    <Owner name={row.owner?.name} />
                  </td>
                  <td data-label="اعتبار" data-wide data-empty={hasValidity(row.validity) ? undefined : ""}>
                    <ValidityText validity={row.validity} />
                  </td>
                  {canEdit && (
                    <td className="text-end">{row.edit_url && <RowEdit href={row.edit_url} name={row.title} />}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </CatalogList>
  );
}

// --- دارایی‌ها ---

export function AssetListPage() {
  return (
    <CatalogList<AssetRow, AssetList>
      title="دارایی‌ها"
      description="سامانه، سخت‌افزار، اطلاعات، مکان یا نیروی انسانی. دارایی شرط ثبت ریسک نیست؛ خدمت‌ها از راه وابستگی به آن وصل می‌شوند."
      createLabel="دارایی تازه"
      noun="دارایی‌ها"
      icon={<Building2 />}
      empty="دارایی‌ای ثبت نشده است"
      notFound="دارایی‌ای با این مشخصات پیدا نشد"
    >
      {(data) => (
        <table className="data-table">
          <caption className="sr-only">{`دارایی‌ها، ${count(data.count, "دارایی")}`}</caption>
          <thead>
            <tr>
              <th scope="col">کد</th>
              <th scope="col">نام</th>
              <th scope="col">نوع</th>
              <th scope="col">واحد مالک</th>
              <th scope="col">مالک</th>
              <th scope="col">طبقه‌ی اطلاعات</th>
              <th scope="col">CIA</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((asset) => (
              <tr key={asset.id}>
                <td data-label="کد" className="w-0">
                  <bdi className="code text-accent-text">{asset.code}</bdi>
                </td>
                <td data-primary className="min-w-48">
                  <AppLink href={asset.href} className="font-medium text-fg hover:text-accent-text hover:no-underline">
                    {asset.name}
                  </AppLink>
                </td>
                <td data-label="نوع">{asset.kind.label}</td>
                <td data-label="واحد مالک">{asset.org_unit}</td>
                <td data-label="مالک" className="whitespace-nowrap">
                  {asset.owner.name}
                </td>
                <td data-label="طبقه‌ی اطلاعات" data-empty={asset.data_class ? undefined : ""}>
                  {asset.data_class?.label}
                </td>
                <td data-label="CIA" data-empty={asset.cia.length ? undefined : ""}>
                  <CiaTags letters={asset.cia} />
                </td>
                <td data-label="وضعیت">
                  <ActiveBadge active={asset.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CatalogList>
  );
}

// --- تأمین‌کنندگان ---

export function SupplierListPage() {
  return (
    <CatalogList<SupplierRow, SupplierList>
      title="تأمین‌کنندگان"
      description="تأمین‌کننده یا پیمانکار بیرونی. خدمت‌ها از راه وابستگی به آن وصل می‌شوند و مرز مسئولیت هر وابستگی در صفحه‌ی خدمت ثبت است."
      createLabel="تأمین‌کننده‌ی تازه"
      noun="تأمین‌کنندگان"
      icon={<Truck />}
      empty="تأمین‌کننده‌ای ثبت نشده است"
      notFound="تأمین‌کننده‌ای با این مشخصات پیدا نشد"
    >
      {(data) => (
        <table className="data-table">
          <caption className="sr-only">{`تأمین‌کنندگان، ${count(data.count, "تأمین‌کننده")}`}</caption>
          <thead>
            <tr>
              <th scope="col">نام</th>
              <th scope="col">خدمت یا کالا</th>
              <th scope="col">مسئول قرارداد</th>
              <th scope="col">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((supplier) => (
              <tr key={supplier.id}>
                <td data-primary className="min-w-48">
                  <AppLink
                    href={supplier.href}
                    className="font-medium text-fg hover:text-accent-text hover:no-underline"
                  >
                    {supplier.name}
                  </AppLink>
                  {supplier.is_critical && (
                    <div className="mt-1">
                      <Badge tone="danger">حیاتی</Badge>
                    </div>
                  )}
                </td>
                <td data-label="خدمت یا کالا" data-wide data-empty={supplier.description ? undefined : ""}>
                  <span className="line-clamp-2 text-sm">{supplier.description}</span>
                </td>
                <td data-label="مسئول قرارداد" className="whitespace-nowrap">
                  <Owner name={supplier.contract_owner?.name} />
                </td>
                <td data-label="وضعیت">
                  <ActiveBadge active={supplier.is_active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </CatalogList>
  );
}

// --- بانک‌ها ---

export function CustomerListPage() {
  return (
    <CatalogList<CustomerRow, CustomerList>
      title="بانک‌ها"
      description="بانک‌ها و مشتریان دیگر داتین. زمان‌های بازیابی هر خدمت برای هر بانک در صفحه‌ی همان خدمت ثبت می‌شود و مبنای مالی بانک در سنجش پیامد مالی به کار می‌رود."
      createLabel="بانک تازه"
      noun="بانک‌ها"
      icon={<Landmark />}
      empty="بانکی ثبت نشده است"
      notFound="بانکی با این مشخصات پیدا نشد"
    >
      {(data) => {
        const canEdit = data.results.some((row) => row.edit_url);
        return (
          <table className="data-table">
            <caption className="sr-only">{`بانک‌ها، ${count(data.count, "بانک")}`}</caption>
            <thead>
              <tr>
                <th scope="col">نام</th>
                <th scope="col">مشتری کلیدی</th>
                <th scope="col">مبنای مالی (ریال)</th>
                <th scope="col">وضعیت</th>
                {canEdit && <ActionsHeader />}
              </tr>
            </thead>
            <tbody>
              {data.results.map((customer) => (
                <tr key={customer.id}>
                  <td data-primary className="min-w-40 font-medium">
                    {customer.name}
                  </td>
                  <td data-label="مشتری کلیدی" data-empty={customer.is_key ? undefined : ""}>
                    {customer.is_key && <Badge tone="warning">کلیدی</Badge>}
                  </td>
                  <td
                    data-label="مبنای مالی (ریال)"
                    data-empty={customer.financial_basis === null ? "" : undefined}
                    className="whitespace-nowrap tabular"
                  >
                    {customer.financial_basis !== null && formatNumber(customer.financial_basis)}
                  </td>
                  <td data-label="وضعیت">
                    <ActiveBadge active={customer.is_active} />
                  </td>
                  {canEdit && (
                    <td className="text-end">
                      {customer.edit_url && <RowEdit href={customer.edit_url} name={customer.name} />}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }}
    </CatalogList>
  );
}
