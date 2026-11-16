import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppLink } from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { IconChip } from "@/components/ui/icon-chip";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Chip, SectionPanel } from "@/components/ui/section-panel";
import { PageSkeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { ErrorState } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { get } from "@/lib/api";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { DirectoryRole, DirectoryUser, UsersRolesPage as PageData } from "@/lib/types";

// «تعریف کاربر و نقش» به چیدمان فیگما ۱۹: کاشی‌های خلاصه، کاربران و نقش‌ها در دو زبانه، ماتریس نقش و دسترسی
// (برگرفته از RACI روش)، تفکیک وظایف و کارت نقش انتخاب‌شده. نقش‌های گروهی در پنل مدیریت داده می‌شوند و بقیه از روی
// سوابق (مالک ریسک، مسئول کنترل، ...) شناخته می‌شوند؛ این صفحه آن‌ها را کنار هم نشان می‌دهد.

const PAGE_SIZE = 8;
const SCOPES: { value: DirectoryRole["scope"]["value"]; label: string }[] = [
  { value: "unit", label: "واحد خود و زیرواحدها" },
  { value: "assigned", label: "خدمات و مشتریان تخصیص‌یافته" },
  { value: "all", label: "همه‌ی واحدها" },
];

function matches(user: DirectoryUser, term: string) {
  if (!term) return true;
  return [user.name, user.username, user.unit ?? ""].some((value) => value.toLowerCase().includes(term.toLowerCase()));
}

function SourceChip({ source }: { source: DirectoryUser["source"] }) {
  const ad = source.value === "ad";
  return (
    <Chip tone={ad ? "info" : "neutral"}>
      <Icon name={ad ? "link" : "lock"} size={12} />
      {source.label}
    </Chip>
  );
}

function Customers({ customers }: { customers: string[] | null }) {
  if (customers === null) return <Chip>همه‌ی مشتریان</Chip>;
  if (!customers.length) return <span className="text-ink-3">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {customers.map((name) => (
        <Chip key={name}>{name}</Chip>
      ))}
    </span>
  );
}

function UsersTable({ users }: { users: DirectoryUser[] }) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <caption className="sr-only">کاربران سامانه</caption>
        <thead>
          <tr>
            <th scope="col">کاربر</th>
            <th scope="col">واحد</th>
            <th scope="col">نقش‌ها</th>
            <th scope="col">دامنه‌ی مشتری</th>
            <th scope="col">منبع</th>
            <th scope="col">آخرین ورود</th>
            <th scope="col">وضعیت</th>
            <th scope="col">
              <span className="sr-only">کار</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td data-primary>
                <span className="flex items-center gap-2.5">
                  <Avatar name={user.name} />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-ink">{user.name}</span>
                    <bdi className="code text-xs text-ink-3">{user.username}</bdi>
                  </span>
                </span>
              </td>
              <td data-label="واحد" className="text-sm text-ink-2">
                {user.unit ?? "—"}
              </td>
              <td data-label="نقش‌ها" data-wide>
                {user.roles.length ? (
                  <span className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Chip key={role.key} tone={role.tone}>
                        {role.label}
                      </Chip>
                    ))}
                  </span>
                ) : (
                  <span className="text-xs text-ink-3">بدون نقش سامانه‌ای</span>
                )}
              </td>
              <td data-label="دامنه‌ی مشتری" data-wide>
                <Customers customers={user.customers} />
              </td>
              <td data-label="منبع">
                <SourceChip source={user.source} />
              </td>
              <td data-label="آخرین ورود" className="text-sm whitespace-nowrap text-ink-2 tabular">
                {user.last_login?.label ?? "—"}
              </td>
              <td data-label="وضعیت">
                <Chip tone={user.status.tone}>{user.status.label}</Chip>
              </td>
              <td className="text-end">
                <Button asChild variant="ghost" size="icon-sm">
                  <a href={user.edit_url} aria-label={`ویرایش ${user.name} در پنل مدیریت`}>
                    <Icon name="dots" />
                  </a>
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RolesTable({ roles, onSelect }: { roles: DirectoryRole[]; onSelect: (key: string) => void }) {
  return (
    <div className="table-shell">
      <table className="data-table">
        <caption className="sr-only">نقش‌های سامانه</caption>
        <thead>
          <tr>
            <th scope="col">نقش</th>
            <th scope="col">نوع</th>
            <th scope="col">دامنه</th>
            <th scope="col">کاربر</th>
            <th scope="col">شرح</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.key}>
              <td data-primary>
                <button
                  type="button"
                  onClick={() => onSelect(role.key)}
                  className="rounded-sm text-start focus-visible:shadow-focus focus-visible:outline-none"
                >
                  <Chip tone={role.tone}>{role.label}</Chip>
                </button>
              </td>
              <td data-label="نوع" className="text-sm text-ink-2">
                {role.kind_label}
              </td>
              <td data-label="دامنه" className="text-sm text-ink-2">
                {role.scope.label}
              </td>
              <td data-label="کاربر" className="text-sm text-ink tabular">
                {fa(role.count)}
              </td>
              <td data-label="شرح" data-wide className="max-w-md text-xs leading-5 text-ink-2">
                {role.description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AccessMark({ value }: { value: "F" | "L" | undefined }) {
  if (value === "F")
    return (
      <span className="inline-grid size-6 place-items-center rounded-full bg-brand text-white">
        <Icon name="check" size={14} />
        <span className="sr-only">کامل</span>
      </span>
    );
  if (value === "L")
    return (
      <span className="inline-grid size-6 place-items-center rounded-full border-2 border-brand text-brand">
        <Icon name="check" size={12} />
        <span className="sr-only">محدود به دامنه</span>
      </span>
    );
  return (
    <span className="text-ink-3">
      <span aria-hidden>—</span>
      <span className="sr-only">بدون دسترسی</span>
    </span>
  );
}

function Matrix({ data, selected, onSelect }: { data: PageData; selected: string; onSelect: (key: string) => void }) {
  return (
    <SectionPanel
      id="access-matrix"
      title="ماتریس نقش و دسترسی"
      description="برگرفته از جدول RACI روش و نقش‌های سند تحلیل · دسترسی «محدود» فقط در دامنه‌ی واحد یا مشتری تخصیص‌یافته"
      aside={
        <ul className="flex flex-wrap items-center gap-3 text-xs text-ink-2" aria-label="راهنمای ماتریس">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3.5 rounded-full bg-brand" />
            کامل
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="size-3.5 rounded-full border-2 border-brand" />
            محدود به دامنه
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="text-ink-3">
              —
            </span>
            بدون دسترسی
          </li>
        </ul>
      }
      bodyClassName="p-0"
    >
      <div
        className="overflow-x-auto [contain:inline-size]"
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ناحیه‌ی پیمایش باید فوکوس بگیرد
        tabIndex={0}
        aria-label="ماتریس، پیمایش افقی"
      >
        <table className="w-full min-w-[60rem] border-collapse text-sm">
          <caption className="sr-only">دسترسی هر نقش به هر فعالیت؛ برای دیدن جزئیات نقش، سرستون آن را بزنید</caption>
          <thead>
            <tr className="border-b border-line bg-subtle text-xs text-ink-2">
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                دسترسی
              </th>
              {data.roles.map((role) => (
                <th key={role.key} scope="col" className="px-1 py-2 font-medium">
                  <button
                    type="button"
                    onClick={() => onSelect(role.key)}
                    aria-pressed={selected === role.key}
                    className={cn(
                      "w-full rounded-md px-1 py-1 leading-4 transition-colors hover:bg-panel focus-visible:shadow-focus focus-visible:outline-none",
                      selected === role.key && "bg-brand-subtle font-semibold text-brand",
                    )}
                  >
                    {role.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, index) => (
              <tr key={row.key} className={cn("border-b border-line last:border-0", index % 2 === 1 && "bg-subtle/60")}>
                <th scope="row" className="px-4 py-2.5 text-start font-normal">
                  <span className="block font-medium text-ink">{row.label}</span>
                  <span className="block text-xs text-ink-3">{row.stage}</span>
                </th>
                {data.roles.map((role) => (
                  <td
                    key={role.key}
                    className={cn("px-1 py-2.5 text-center", selected === role.key && "bg-brand-subtle/50")}
                  >
                    <AccessMark value={row.access[role.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

function Separation({ data }: { data: PageData }) {
  const { conflicts, rules } = data.sod;
  return (
    <SectionPanel
      title="تفکیک وظایف (SoD)"
      description="قواعد ناسازگاری نقش و فعالیت؛ هنگام تخصیص نقش و در گردش کار بررسی می‌شود"
      aside={
        conflicts.length ? (
          <Chip tone="warning">
            <Icon name="warning" size={12} />
            {fa(conflicts.length)} تعارض باز
          </Chip>
        ) : (
          <Chip tone="success">بدون تعارض</Chip>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {conflicts.length > 0 && (
          <ul className="flex flex-col gap-3" aria-label="تعارض‌های باز">
            {conflicts.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning/40 bg-warning-subtle px-4 py-3"
              >
                <span className="flex min-w-0 flex-1 items-start gap-2.5">
                  <Icon name="warning" size={18} className="mt-0.5 shrink-0 text-warning" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-semibold text-ink">
                      {item.user.name} · {item.title}
                    </span>
                    <span className="text-xs leading-5 text-ink-2">{item.note}</span>
                  </span>
                </span>
                <Button asChild variant="outline" size="sm">
                  <AppLink href={item.href}>
                    <Icon name="user" />
                    تعیین تأییدکننده
                  </AppLink>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-col divide-y divide-line" aria-label="قواعد تفکیک وظایف">
          {rules.map((rule) => (
            <li key={rule.text} className="flex items-start justify-between gap-3 py-2.5 text-sm">
              <span className="flex items-start gap-2 text-ink-2">
                <Icon name="lock" size={14} className="mt-1 shrink-0 text-ink-3" />
                {rule.text}
              </span>
              <span className="shrink-0 text-xs text-ink-3">{rule.where}</span>
            </li>
          ))}
        </ul>
      </div>
    </SectionPanel>
  );
}

function RoleCard({ role, onShowUsers }: { role: DirectoryRole; onShowUsers: () => void }) {
  return (
    <section
      aria-labelledby="role-card-title"
      className="flex flex-col overflow-hidden rounded-lg border border-line bg-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <span className="flex min-w-0 flex-col gap-1">
          <h2 id="role-card-title" className="text-h3 font-semibold text-ink">
            نقش: {role.label}
          </h2>
          <span className="text-xs text-ink-3">
            {fa(role.count)} کاربر · {role.kind_label}
          </span>
        </span>
        <IconChip icon="shield-check" tone={role.tone === "neutral" ? "brand" : role.tone} />
      </header>
      <div className="flex flex-col gap-4 px-5 py-4">
        <p className="text-sm leading-6 text-ink-2">{role.description}</p>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-ink-2">دامنه‌ی دسترسی</h3>
          <ul className="flex flex-col gap-2">
            {SCOPES.map((scope) => {
              const active = scope.value === role.scope.value;
              return (
                <li
                  key={scope.value}
                  aria-current={active || undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
                    active ? "border-brand bg-brand-subtle font-semibold text-ink" : "border-line text-ink-2",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-4 place-items-center rounded-full border-2",
                      active ? "border-brand" : "border-line-strong",
                    )}
                  >
                    {active && <span className="size-1.5 rounded-full bg-brand" />}
                  </span>
                  {scope.label}
                </li>
              );
            })}
          </ul>
        </div>
        {role.acceptance.length > 0 && (
          <dl className="flex flex-col divide-y divide-line border-t border-line">
            {role.acceptance.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <dt className="text-ink-2">{row.label}</dt>
                <dd>
                  <Chip tone={row.tone}>{row.text}</Chip>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3">
        <Button variant="link" size="sm" onClick={onShowUsers}>
          <Icon name="users" />
          کاربران این نقش
        </Button>
        {role.edit_url ? (
          <Button asChild variant="outline" size="sm">
            <a href={role.edit_url}>
              <Icon name="pencil" />
              ویرایش نقش
            </a>
          </Button>
        ) : (
          <span className="text-xs text-ink-3">با تخصیص در پرونده‌ها داده می‌شود</span>
        )}
      </footer>
    </section>
  );
}

function exportCsv(users: DirectoryUser[]) {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = ["نام", "شناسه", "واحد", "نقش‌ها", "دامنه‌ی مشتری", "منبع", "آخرین ورود", "وضعیت"];
  const rows = users.map((user) =>
    [
      user.name,
      user.username,
      user.unit ?? "",
      user.roles.map((role) => role.label).join("، "),
      user.customers === null ? "همه‌ی مشتریان" : user.customers.join("، "),
      user.source.label,
      user.last_login?.label ?? "",
      user.status.label,
    ]
      .map(cell)
      .join(","),
  );
  const blob = new Blob(["﻿" + [header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "access-report.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function UsersRolesPage() {
  useTitle("تعریف کاربر و نقش");
  const query = useQuery({
    queryKey: ["users-roles"],
    queryFn: ({ signal }) => get<PageData>("accounts/roles/", signal),
  });
  const data = query.data;
  const [tab, setTab] = useState("users");
  const [term, setTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedRole, setSelectedRole] = useState("owner");

  const filtered = useMemo(
    () =>
      (data?.users ?? []).filter(
        (user) => matches(user, term) && (!roleFilter || user.roles.some((role) => role.key === roleFilter)),
      ),
    [data, term, roleFilter],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const role = data?.roles.find((item) => item.key === selectedRole) ?? data?.roles[0];

  const showRoleUsers = (key: string) => {
    setRoleFilter(key);
    setTerm("");
    setPage(1);
    setTab("users");
    document.getElementById("directory")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="تعریف کاربر و نقش"
        breadcrumb={[{ label: "پیکربندی سامانه" }, { label: "تعریف کاربر و نقش" }]}
        description="کاربران از Active Directory همگام یا به‌صورت محلی تعریف می‌شوند · دسترسی بر پایه‌ی نقش و دامنه‌ی واحد/مشتری · هر فعالیت دقیقاً یک پاسخ‌گوی نهایی (A) دارد"
        actions={
          data && (
            <>
              <Button variant="link" onClick={() => exportCsv(data.users)}>
                <Icon name="download" />
                گزارش دسترسی
              </Button>
              <Button variant="outline" disabled title="اتصال Active Directory هنوز پیکربندی نشده است">
                <Icon name="merge" />
                همگام‌سازی AD
              </Button>
              <Button asChild variant="primary">
                <a href={data.add_user_url}>
                  <Icon name="plus" />
                  کاربر جدید
                </a>
              </Button>
            </>
          )
        }
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : !data || !role ? (
        <PageSkeleton rows={8} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <StatTile
              label="کاربران فعال"
              value={fa(data.summary.active)}
              note={`در ${fa(data.summary.units)} واحد سازمانی`}
              icon="users"
            />
            <StatTile
              label="همگام با AD"
              value={fa(data.summary.ad)}
              note="حساب‌هایی که منبعشان Active Directory است"
              icon="link"
              tone="success"
            />
            <StatTile
              label="کاربر محلی و موقت"
              value={fa(data.summary.local)}
              note={`${fa(data.summary.temporary)} دسترسی موقت تا ۳۰ روز`}
              icon="user"
              tone="neutral"
            />
            <StatTile
              label="نقش‌های تعریف‌شده"
              value={fa(data.summary.roles)}
              note="RACI روش و سند تحلیل"
              icon="shield-check"
              tone="info"
            />
            <StatTile
              label="تعارض تفکیک وظایف"
              value={fa(data.summary.conflicts)}
              note="نیازمند بازبینی مدیر سامانه"
              icon="warning"
              tone="warning"
              valueTone={data.summary.conflicts ? "warning" : "ink"}
              className="col-span-2 xl:col-span-1"
            />
          </div>

          <section
            id="directory"
            aria-label="کاربران و نقش‌ها"
            className="scroll-mt-20 overflow-hidden rounded-lg border border-line bg-panel"
          >
            <Tabs value={tab} onValueChange={setTab}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4">
                <div className="flex flex-wrap items-center gap-5">
                  <TabsList className="border-0">
                    <TabsTrigger value="users" count={fa(data.users.length)}>
                      کاربران
                    </TabsTrigger>
                    <TabsTrigger value="roles" count={fa(data.roles.length)}>
                      نقش‌ها
                    </TabsTrigger>
                  </TabsList>
                  <a href="#access-matrix" className="text-sm font-medium text-ink-2 hover:text-ink">
                    ماتریس دسترسی
                  </a>
                  <AppLink href={data.login_report_url} className="text-sm font-medium text-ink-2 hover:text-ink">
                    گزارش ورود
                  </AppLink>
                </div>
                {tab === "users" && (
                  <div className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="relative w-56">
                      <Icon
                        name="search"
                        size={16}
                        className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-3"
                      />
                      <Input
                        type="search"
                        value={term}
                        onChange={(event) => {
                          setTerm(event.target.value.trim());
                          setPage(1);
                        }}
                        placeholder="جستجوی نام یا شناسه…"
                        aria-label="جستجوی نام یا شناسه"
                        className="ps-9"
                      />
                    </div>
                    <Select
                      value={roleFilter}
                      onChange={(event) => {
                        setRoleFilter(event.target.value);
                        setPage(1);
                      }}
                      aria-label="نقش"
                      className="w-40"
                    >
                      <option value="">همه‌ی نقش‌ها</option>
                      {data.roles.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
              <TabsContent value="users" className="mt-0">
                {visible.length ? (
                  <UsersTable users={visible} />
                ) : (
                  <p className="px-5 py-8 text-center text-sm text-ink-3">کاربری با این جستجو پیدا نشد.</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
                  <span className="text-xs text-ink-3">
                    {fa(visible.length)} از {fa(filtered.length)} کاربر
                  </span>
                  <Pagination page={current} pages={pages} onChange={setPage} />
                </div>
              </TabsContent>
              <TabsContent value="roles" className="mt-0">
                <RolesTable roles={data.roles} onSelect={setSelectedRole} />
              </TabsContent>
            </Tabs>
          </section>

          <Matrix data={data} selected={role.key} onSelect={setSelectedRole} />

          <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <Separation data={data} />
            <RoleCard role={role} onShowUsers={() => showRoleUsers(role.key)} />
          </div>
        </>
      )}
    </div>
  );
}
