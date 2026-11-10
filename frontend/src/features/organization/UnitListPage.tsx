import { Network, PencilLine, Plus } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListBody } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { count } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { UnitList, UnitRow } from "@/lib/types";

// ساختار سازمانی (organization/unit_list.html): واحدها به ترتیب درخت، هر واحد زیر واحد بالادستش و با تورفتگی به
// اندازه‌ی عمقش. فقط مدیر سامانه واحد می‌سازد یا ویرایش می‌کند.

/** نام واحد بالادست هر ردیف، از ترتیب درخت: آخرین واحدی که یک سطح بالاتر از این ردیف آمده است. */
function parents(units: UnitRow[]) {
  const stack: string[] = [];
  return units.map((unit) => {
    stack.length = unit.depth;
    const parent = unit.depth > 0 ? stack[unit.depth - 1] : undefined;
    stack[unit.depth] = unit.name;
    return parent;
  });
}

export function UnitListPage() {
  useTitle("ساختار سازمانی");
  const page = usePageData<UnitList>();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="ساختار سازمانی"
        description="واحدهای سازمان و مدیران هر کدام. مدیر واحد خدمت‌ها و دارایی‌های واحد خودش و زیرمجموعه‌هایش را می‌بیند."
        actions={
          page.data?.create_url && (
            <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
              <Plus aria-hidden />
              واحد تازه
            </AppLink>
          )
        }
      />
      <ListBody<UnitRow, UnitList>
        query={page}
        label="واحدها"
        filtered={false}
        empty={{ icon: <Network />, title: "هنوز واحدی ثبت نشده است" }}
      >
        {(data) => {
          const canEdit = data.results.some((unit) => unit.edit_url);
          const parentOf = parents(data.results);
          return (
            <table className="data-table">
              <caption className="sr-only">{`واحدهای سازمان به ترتیب درخت، ${count(data.count, "واحد")}`}</caption>
              <thead>
                <tr>
                  <th scope="col">نام</th>
                  <th scope="col">کد</th>
                  <th scope="col">مدیران</th>
                  <th scope="col">وضعیت</th>
                  {canEdit && (
                    <th scope="col">
                      <span className="sr-only">کارها</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.results.map((unit, index) => (
                  <tr key={unit.id}>
                    <td data-primary className="min-w-56">
                      <span
                        className="flex items-center gap-2"
                        style={{ paddingInlineStart: `${Math.min(unit.depth, 8) * 1.5}rem` }}
                      >
                        {unit.depth > 0 && (
                          <span
                            aria-hidden
                            className="-mt-2 inline-block size-3 shrink-0 rounded-es-sm border-b border-s border-line-strong"
                          />
                        )}
                        <span className={unit.depth === 0 ? "font-semibold text-fg" : "font-medium text-fg"}>
                          {unit.name}
                        </span>
                        {parentOf[index] && <span className="sr-only">، زیرمجموعه‌ی {parentOf[index]}</span>}
                      </span>
                    </td>
                    <td data-label="کد" data-empty={unit.code ? undefined : ""} className="w-0">
                      <bdi className="code text-xs">{unit.code}</bdi>
                    </td>
                    <td data-label="مدیران">
                      {unit.managers.length ? (
                        unit.managers.map((manager) => manager.name).join("، ")
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td data-label="وضعیت">
                      <Badge tone={unit.is_active ? "success" : "neutral"} dot>
                        {unit.is_active ? "فعال" : "غیرفعال"}
                      </Badge>
                    </td>
                    {canEdit && (
                      <td className="text-end">
                        {unit.edit_url && (
                          <AppLink
                            href={unit.edit_url}
                            button={{ variant: "ghost", size: "sm" }}
                            aria-label={`ویرایش ${unit.name}`}
                          >
                            <PencilLine aria-hidden />
                            ویرایش
                          </AppLink>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        }}
      </ListBody>
    </div>
  );
}
