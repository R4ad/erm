import { Grid3x3, PencilLine, Plus, Tags } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ListBody } from "@/features/pages/listing";
import { usePageData } from "@/features/pages/page-data";
import { useTitle } from "@/lib/hooks";
import type { CategoryList } from "@/lib/types";

export function CategoryListPage() {
  useTitle("دسته‌های ریسک");
  const page = usePageData<CategoryList>();
  const canEdit = Boolean(page.data?.create_url);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="دسته‌های ریسک"
        description="هر نمونه‌ی ریسک یک دسته‌ی اصلی دارد. دسته برای تخصیص مالک و گزارش است و امتیاز را عوض نمی‌کند. دسته حذف نمی‌شود؛ دسته‌ی غیرفعال از جدول پوشش بیرون می‌رود ولی سابقه‌اش می‌ماند."
        actions={
          <>
            {page.data?.create_url && (
              <AppLink href={page.data.create_url} button={{ variant: "primary" }}>
                <Plus aria-hidden />
                دسته‌ی تازه
              </AppLink>
            )}
            {page.data && (
              <AppLink href={page.data.coverage_url} button={{ variant: "secondary" }}>
                <Grid3x3 aria-hidden />
                جهان ریسک
              </AppLink>
            )}
          </>
        }
      />
      <ListBody query={page} label="دسته‌ها" filtered={false} empty={{ icon: <Tags />, title: "دسته‌ای ثبت نشده است" }}>
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">دسته‌های ریسک</caption>
            <thead>
              <tr>
                <th scope="col">کد</th>
                <th scope="col">نام</th>
                <th scope="col">وضعیت</th>
                {canEdit && (
                  <th scope="col">
                    <span className="sr-only">کارها</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.results.map((category) => (
                <tr key={category.id}>
                  <td data-label="کد" className="w-0">
                    <bdi className="code text-accent-text">{category.code}</bdi>
                  </td>
                  <td data-primary className="font-medium">
                    {category.name}
                  </td>
                  <td data-label="وضعیت">
                    <Badge tone={category.is_active ? "success" : "neutral"} dot>
                      {category.is_active ? "فعال" : "غیرفعال"}
                    </Badge>
                  </td>
                  {canEdit && (
                    <td className="text-end">
                      {category.edit_url && (
                        <AppLink
                          href={category.edit_url}
                          button={{ variant: "ghost", size: "sm" }}
                          aria-label={`ویرایش ${category.code} ${category.name}`}
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
        )}
      </ListBody>
    </div>
  );
}
