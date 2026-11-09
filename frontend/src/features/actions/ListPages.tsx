import { ListChecks, ListTodo, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { count } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { AcceptanceList, ActionList } from "@/lib/types";

import { AcceptanceTable, ActionTable } from "./tables";

// فهرست همه‌ی اقدام‌ها و پذیرش‌های ریسک (actions/action_list.html و acceptance_list.html)، با همان فرم فیلتر جنگو
// و همان دسترسی: هر کس فقط اقدام و پذیرش ریسک‌هایی را می‌بیند که اجازه‌ی دیدنشان را دارد.

function MyWorkLink() {
  return (
    <Link to="/" viewTransition className={buttonClasses({ variant: "secondary" })}>
      <ListTodo aria-hidden />
      کارهای من
    </Link>
  );
}

export function ActionListPage() {
  useTitle("اقدام‌ها");
  const [params] = useSearchParams();
  const page = usePageData<ActionList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="اقدام‌ها"
        description={
          page.data
            ? `${count(page.data.count, "اقدام")} در طرح‌های مواجهه. «عقب‌افتاده» یعنی سررسید گذشته و نتیجه هنوز تأیید نشده است.`
            : "اقدام‌های طرح‌های مواجهه. «عقب‌افتاده» یعنی سررسید گذشته و نتیجه هنوز تأیید نشده است."
        }
        actions={<MyWorkLink />}
      />
      <FilterBar schema={page.data?.filters} label="فیلتر اقدام‌ها" />
      <ListBody
        query={page}
        label="اقدام‌ها"
        filtered={filtered}
        empty={{
          icon: <ListChecks />,
          title: "هنوز اقدامی ثبت نشده",
          filteredTitle: "اقدامی با این مشخصات پیدا نشد",
          description: "اقدام‌ها در طرح مواجهه‌ی هر ریسک ثبت می‌شوند.",
        }}
      >
        {(data) => <ActionTable actions={data.results} caption="اقدام‌ها" showRisk />}
      </ListBody>
    </div>
  );
}

export function AcceptanceListPage() {
  useTitle("پذیرش‌های ریسک");
  const [params] = useSearchParams();
  const page = usePageData<AcceptanceList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="پذیرش‌های ریسک"
        description="پذیرش زمان‌دار ریسک باقیمانده. پذیرش تمدید خودکار ندارد و بعد از تاریخ پایان «منقضی» است."
        actions={<MyWorkLink />}
      />
      <FilterBar schema={page.data?.filters} label="فیلتر پذیرش‌ها" />
      <ListBody
        query={page}
        label="پذیرش‌ها"
        filtered={filtered}
        empty={{
          icon: <ShieldCheck />,
          title: "هنوز پذیرشی ثبت نشده",
          filteredTitle: "پذیرشی با این مشخصات پیدا نشد",
          description: "پذیرش زمان‌دار از پرونده‌ی ریسک و با امضای صاحبان اختیار ثبت می‌شود.",
        }}
      >
        {(data) => <AcceptanceTable acceptances={data.results} caption="پذیرش‌های ریسک" showRisk />}
      </ListBody>
    </div>
  );
}
