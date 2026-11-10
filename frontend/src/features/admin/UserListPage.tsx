import { FileUp, Users } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { ActiveBadge } from "@/features/catalog/parts";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { count, fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { UserList, UserRow } from "@/lib/types";

// کاربران (accounts/user_list.html): فقط برای مدیر سامانه، با همان فیلتر نام، واحد، نقش و وضعیت. کاربر تازه از
// ورود کارکنان یا پنل مدیریت ساخته می‌شود و نقش‌ها هم همان‌جا داده می‌شوند؛ این فهرست فقط خواندنی است.

export function UserListPage() {
  useTitle("کاربران");
  const [params] = useSearchParams();
  const page = usePageData<UserList>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="کاربران"
        description="کاربران سامانه با واحد و نقش‌هایشان. کارکنان از فایل منابع انسانی وارد می‌شوند و نقش‌ها در پنل مدیریت داده می‌شوند."
        actions={
          page.data && (
            <AppLink href={page.data.import_url} button={{ variant: "secondary" }}>
              <FileUp aria-hidden />
              ورود کارکنان
            </AppLink>
          )
        }
      />
      <FilterBar schema={page.data?.filters} label="فیلتر کاربران" />
      <ListBody<UserRow, UserList>
        query={page}
        label="کاربران"
        filtered={filtered}
        empty={{ icon: <Users />, title: "کاربری ثبت نشده است", filteredTitle: "کاربری با این مشخصات پیدا نشد" }}
      >
        {(data) => (
          <table className="data-table">
            <caption className="sr-only">{`کاربران، ${count(data.count, "کاربر")}`}</caption>
            <thead>
              <tr>
                <th scope="col">نام</th>
                <th scope="col">نام کاربری</th>
                <th scope="col">کد پرسنلی</th>
                <th scope="col">واحد</th>
                <th scope="col">نقش‌ها</th>
                <th scope="col">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((user) => (
                <tr key={user.id}>
                  <td data-primary className="min-w-40 font-medium text-fg">
                    {user.name ?? <span className="text-muted">-</span>}
                  </td>
                  <td data-label="نام کاربری">
                    <bdi className="code text-xs">{user.username}</bdi>
                  </td>
                  <td data-label="کد پرسنلی" data-empty={user.personnel_code ? undefined : ""} className="tabular">
                    {user.personnel_code && fa(user.personnel_code)}
                  </td>
                  <td data-label="واحد" data-empty={user.org_unit ? undefined : ""}>
                    {user.org_unit}
                  </td>
                  <td data-label="نقش‌ها" data-empty={user.roles.length ? undefined : ""}>
                    {user.roles.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5" aria-label={`نقش‌های ${user.name ?? user.username}`}>
                        {user.roles.map((role) => (
                          <li key={role}>
                            <Badge tone="accent">{role}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td data-label="وضعیت">
                    <ActiveBadge active={user.is_active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListBody>
    </div>
  );
}
