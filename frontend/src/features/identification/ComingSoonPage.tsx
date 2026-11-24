import { Link, useParams } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { NotFoundPage } from "@/features/errors/NotFoundPage";
import { useTitle } from "@/lib/hooks";

import { SourceIllustration } from "./illustrations";
import { SOURCES } from "./sources";

// صفحه‌ی «به‌زودی» برای منبع‌های شناسایی که هنوز ساخته نشده‌اند (/identification/sources/:source). متن‌ها از جدول
// تأییدشده‌ی implementation-plan.md (بخش ۱۰) است.

export function ComingSoonPage() {
  const { source: slug } = useParams();
  const source = SOURCES.find((item) => item.slug === slug);
  const title = source ? `شناسایی ریسک از ${source.title}` : "شناسایی ریسک";
  useTitle(title);
  if (!source) return <NotFoundPage />;
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        title={title}
        meta={<Badge tone="tangerine">به‌زودی</Badge>}
        description={source.description}
        breadcrumb={[{ label: "شناسایی ریسک", to: "/identification" }, { label: source.title }]}
      />
      <Card className="flex flex-col items-center gap-5 px-6 py-10 text-center">
        <div className="h-[9.375rem] w-full max-w-[15.625rem] overflow-hidden rounded-item bg-brand-subtle/60">
          <SourceIllustration slug={source.slug} />
        </div>
        <p className="max-w-xl text-base text-ink-2">
          این منبع شناسایی هنوز آماده نیست و به‌زودی اضافه می‌شود. تا آن زمان ریسک‌ها را از پاسخنامه‌ها یا «ثبت دستی
          ریسک» شناسایی کنید.
        </p>
        <Link to="/identification" viewTransition className={buttonClasses({ variant: "secondary" })}>
          <Icon name="arrow-right" className="ltr:rotate-180" />
          بازگشت به شناسایی ریسک
        </Link>
      </Card>
    </div>
  );
}
