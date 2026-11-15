import { FileText, PencilLine } from "lucide-react";
import type { ReactNode } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { DetailState } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { DossierLayout, Fact, Facts, Prose, Section, SectionBody } from "@/features/records/dossier";
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
  navLabel,
  sections,
  children,
}: {
  header: ReactNode;
  facts: ReactNode;
  label: string;
  navLabel: string;
  sections: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6">
      {header}
      <DossierLayout navLabel={navLabel} factsLabel={label} sections={sections} facts={<Facts>{facts}</Facts>}>
        {children}
      </DossierLayout>
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
      navLabel="بخش‌های پرونده‌ی تأمین‌کننده"
      sections={[
        { id: "offering", label: "خدمت یا کالا" },
        { id: "dependents", label: "خدمت‌های وابسته" },
      ]}
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
      <Section id="offering" title="خدمت یا کالا" icon={<FileText />}>
        <SectionBody className="text-sm leading-8 text-fg/90">
          <Prose text={supplier.description} />
        </SectionBody>
      </Section>
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
      navLabel="بخش‌های پرونده‌ی دارایی"
      sections={[{ id: "dependents", label: "خدمت‌های وابسته" }]}
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
