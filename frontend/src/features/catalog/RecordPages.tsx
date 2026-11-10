import { FileText, PencilLine } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { Fact, Prose } from "@/features/records/dossier";
import { useTitle } from "@/lib/hooks";
import type { AssetDetail, SupplierDetail } from "@/lib/types";

import { ActiveBadge, CiaTags, DependentsSection } from "./parts";

// پرونده‌ی تأمین‌کننده و دارایی (catalog/supplier_detail.html و asset_detail.html): مشخصات و خدمت‌هایی که
// کاربر می‌بیند و به آن وابسته‌اند.

function EditLink({ href }: { href: string | null | undefined }) {
  if (!href) return null;
  return (
    <AppLink href={href} button={{ variant: "secondary" }}>
      <PencilLine aria-hidden />
      ویرایش
    </AppLink>
  );
}

function RecordLayout({
  header,
  facts,
  label,
  children,
}: {
  header: ReactNode;
  facts: ReactNode;
  label: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6">
      {header}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">{children}</div>
        <aside aria-label={label}>
          <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <CardHeader title="مشخصات" />
            <CardContent>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-4 gap-y-3 text-sm">{facts}</dl>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

// --- تأمین‌کننده ---

const SUPPLIERS = { label: "تأمین‌کنندگان", to: "/catalog/suppliers" };

function SupplierHeader({ data }: { data?: SupplierDetail }) {
  const supplier = data?.supplier;
  return (
    <PageHeader
      breadcrumb={[SUPPLIERS, { label: supplier?.name ?? "تأمین‌کننده" }]}
      title={supplier?.name ?? "تأمین‌کننده"}
      meta={
        supplier && (
          <>
            {supplier.is_critical && <Badge tone="danger">حیاتی</Badge>}
            {!supplier.is_active && (
              <Badge tone="neutral" dot>
                غیرفعال
              </Badge>
            )}
          </>
        )
      }
      actions={<EditLink href={data?.edit_url} />}
    />
  );
}

export function SupplierDetailPage() {
  const page = usePageData<SupplierDetail>();
  useTitle(page.data?.title ?? "تأمین‌کننده");
  if (!page.data) return <DetailState query={page} header={<SupplierHeader />} />;
  const data = page.data;
  const { supplier } = data;
  return (
    <RecordLayout
      header={<SupplierHeader data={data} />}
      label="مشخصات تأمین‌کننده"
      facts={
        <>
          <Fact label="مسئول قرارداد">{supplier.contract_owner?.name ?? <span className="text-muted">-</span>}</Fact>
          <Fact label="حیاتی">{supplier.is_critical ? "بله" : "خیر"}</Fact>
          <Fact label="وضعیت">
            <ActiveBadge active={supplier.is_active} />
          </Fact>
        </>
      }
    >
      <Card>
        <CardHeader icon={<FileText />} title="خدمت یا کالا" />
        <CardContent className="text-sm leading-8 text-fg/90">
          <Prose text={supplier.description} />
        </CardContent>
      </Card>
      <DependentsSection dependents={data.dependents} />
    </RecordLayout>
  );
}

// --- دارایی ---

const ASSETS = { label: "دارایی‌ها", to: "/catalog/assets" };

function AssetHeader({ data }: { data?: AssetDetail }) {
  const asset = data?.asset;
  return (
    <PageHeader
      breadcrumb={[ASSETS, asset ? { label: asset.code, code: true } : { label: "دارایی" }]}
      title={asset?.name ?? "دارایی"}
      meta={
        asset && (
          <>
            <Badge className="code">{asset.code}</Badge>
            <Badge tone="accent">{asset.kind.label}</Badge>
            {!asset.is_active && (
              <Badge tone="neutral" dot>
                غیرفعال
              </Badge>
            )}
          </>
        )
      }
      actions={<EditLink href={data?.edit_url} />}
    />
  );
}

export function AssetDetailPage() {
  const page = usePageData<AssetDetail>();
  useTitle(page.data?.title ?? "دارایی");
  if (!page.data) return <DetailState query={page} header={<AssetHeader />} />;
  const data = page.data;
  const { asset } = data;
  return (
    <RecordLayout
      header={<AssetHeader data={data} />}
      label="مشخصات دارایی"
      facts={
        <>
          <Fact label="نوع">{asset.kind.label}</Fact>
          <Fact label="واحد مالک">{asset.org_unit}</Fact>
          <Fact label="مالک">{asset.owner.name}</Fact>
          <Fact label="طبقه‌ی اطلاعات">{asset.data_class?.label ?? <span className="text-muted">-</span>}</Fact>
          <Fact label="CIA">
            <CiaTags letters={asset.cia} />
          </Fact>
          <Fact label="وضعیت">
            <ActiveBadge active={asset.is_active} />
          </Fact>
        </>
      }
    >
      <DependentsSection dependents={data.dependents} />
    </RecordLayout>
  );
}
