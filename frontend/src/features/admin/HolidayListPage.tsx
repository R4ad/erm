import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ActionsHeader, RowEdit } from "@/features/catalog/parts";
import { useBridgeAction } from "@/features/forms/bridge-action";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { ActionError } from "@/features/records/dossier";
import { count, longDate } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { HolidayList, HolidayRow } from "@/lib/types";

// تعطیلات (workcalendar/holiday_list.html): تعطیلی‌های رسمی که مهلت‌های روزکاری از آن‌ها حساب می‌شوند. فهرست
// پیش‌فرض همان امسال جنگوست؛ حذف همان view جنگوست که فقط POST می‌پذیرد و پیامش را برمی‌گرداند.

export function HolidayListPage() {
  useTitle("تعطیلات");
  const [params] = useSearchParams();
  const page = usePageData<HolidayList>();
  const remove = useBridgeAction();
  const [deleting, setDeleting] = useState<HolidayRow | null>(null);
  // سال پیش‌فرض را خود جنگو می‌گذارد؛ فقط سالی که کاربر انتخاب کرده فیلتر حساب می‌شود.
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="تعطیلات"
        description={page.data?.note}
        actions={
          page.data && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              تعطیلی تازه
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر تعطیلات" />
      {remove.error !== null && <ActionError error={remove.error} />}
      <ListBody<HolidayRow, HolidayList>
        query={page}
        label="تعطیلات"
        filtered={filtered}
        empty={{
          icon: <CalendarDays />,
          title: "تعطیلی‌ای ثبت نشده است",
          filteredTitle: "تعطیلی‌ای ثبت نشده است",
          description: "تعطیلات رسمی هر سال را از تقویم رسمی وارد کنید.",
        }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">{`تعطیلات، ${count(data.count, "روز")}`}</caption>
            <thead>
              <tr>
                <th scope="col">تاریخ</th>
                <th scope="col">روز</th>
                <th scope="col">مناسبت</th>
                <ActionsHeader />
              </tr>
            </thead>
            <tbody>
              {data.results.map((holiday) => (
                <tr key={holiday.id}>
                  <td data-label="تاریخ" className="whitespace-nowrap">
                    <time dateTime={holiday.date.iso}>{longDate(holiday.date)}</time>
                  </td>
                  <td data-label="روز">{holiday.weekday}</td>
                  <td data-primary className="font-medium text-fg">
                    {holiday.title}
                  </td>
                  <td className="text-end">
                    <div className="flex flex-wrap justify-end gap-1">
                      <RowEdit href={holiday.edit_url} name={holiday.title} />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        aria-label={`حذف ${holiday.title}`}
                        onClick={() => setDeleting(holiday)}
                      >
                        <Trash2 aria-hidden />
                        حذف
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`تعطیلی «${deleting?.title ?? ""}» حذف شود؟`}
        description="این روز دیگر در حساب مهلت‌های روزکاری تعطیل شمرده نمی‌شود. حذفش در سوابق ممیزی می‌ماند."
        confirmLabel="حذف تعطیلی"
        tone="danger"
        loading={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate({ url: deleting.delete_url, values: {} }, { onSettled: () => setDeleting(null) });
        }}
      />
    </div>
  );
}
