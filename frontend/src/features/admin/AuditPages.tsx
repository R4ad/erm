import { FileSpreadsheet, History, ScrollText } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { buttonClasses } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { FilterBar, ListBody } from "@/features/pages/listing";
import { activeFilters, usePageData } from "@/features/pages/page-data";
import { useRouteOf } from "@/features/session/links";
import { cn } from "@/lib/cn";
import { count, dateTime, faText } from "@/lib/format";
import { useTitle } from "@/lib/hooks";
import type { AuditChangeList, AuditChangeRow, AuditEventList, AuditEventRow, AuditTab, Listing } from "@/lib/types";

// سوابق ممیزی (audit/event_list.html و change_list.html): ورودها و رویدادهای امنیتی، و تغییر داده‌ها از تاریخچه‌ی
// هر رکورد. هر دو فقط خواندنی‌اند و جنگو آن‌ها را به مدیر سامانه و نقش «فقط مشاهده» نشان می‌دهد. خروجی Excel همان
// نشانی جنگوست: فایل را جنگو با همین فیلترها می‌سازد و خود خروجی گرفتن را هم در سوابق ثبت می‌کند.

const DESCRIPTION =
  "هر ورود، ورود ناموفق، دسترسی ردشده، تغییر نقش و خروجی گرفتن، و هر تغییر داده با کاربر و زمانش. این سوابق ویرایش و حذف نمی‌شوند.";

/** دو صفحه‌ی سوابق، مثل زبانه‌های قالب جنگو؛ هر زبانه صفحه‌ی خودش است، پس پیوند است با aria-current. */
function AuditTabs({ tabs }: { tabs: AuditTab[] | undefined }) {
  const routeOf = useRouteOf();
  const { pathname } = useLocation();
  const icons = [<ScrollText key="events" aria-hidden />, <History key="changes" aria-hidden />];
  const items = tabs ?? [
    { label: "ورود و رویدادها", href: "/audit/" },
    { label: "تغییرات داده", href: "/audit/changes/" },
  ];
  return (
    <nav aria-label="بخش‌های سوابق ممیزی" className="border-b border-line">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {items.map((tab, index) => {
          const route = routeOf(tab.href) ?? tab.href;
          const active = route.split("?")[0] === pathname;
          return (
            <li key={tab.href}>
              <Link
                to={route}
                viewTransition
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors [&_svg]:size-4",
                  active
                    ? "border-accent font-medium text-fg"
                    : "border-transparent text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {icons[index]}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function AuditLayout<T, D extends Listing<T> & { tabs: AuditTab[] }>({
  title,
  noun,
  icon,
  emptyTitle,
  actions,
  children,
}: {
  title: string;
  noun: string;
  icon: ReactNode;
  emptyTitle: string;
  actions?: (data: D) => ReactNode;
  children: (data: D) => ReactNode;
}) {
  useTitle(title);
  const [params] = useSearchParams();
  const page = usePageData<D>();
  const filtered = activeFilters(page.data?.filters, params).length > 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="سوابق ممیزی" description={DESCRIPTION} actions={page.data && actions?.(page.data)} />
      <AuditTabs tabs={page.data?.tabs} />
      <FilterBar schema={page.data?.filters} label={`فیلتر ${noun}`} />
      <ListBody<T, D>
        query={page}
        label={noun}
        filtered={filtered}
        empty={{ icon, title: emptyTitle, filteredTitle: emptyTitle }}
      >
        {children}
      </ListBody>
    </div>
  );
}

function Who({ name, username }: { name: string | null | undefined; username?: string | null }) {
  if (!name && !username) return <span className="text-xs text-muted">خط فرمان</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {name && <span>{name}</span>}
      {username && (
        <bdi className="code text-xs text-muted" dir="ltr">
          {username}
        </bdi>
      )}
    </span>
  );
}

export function AuditEventListPage() {
  return (
    <AuditLayout<AuditEventRow, AuditEventList>
      title="ورود و رویدادها"
      noun="رویدادها"
      icon={<ScrollText />}
      emptyTitle="رویدادی با این مشخصات پیدا نشد"
      actions={(data) =>
        data.export_url && (
          // دانلود فایل از خود جنگو، با همان کوکی نشست؛ صفحه عوض نمی‌شود.
          <a href={data.export_url} download className={buttonClasses({ variant: "secondary" })}>
            <FileSpreadsheet aria-hidden />
            خروجی Excel
          </a>
        )
      }
    >
      {(data) => (
        <table className="data-table">
          <caption className="sr-only">{`رویدادها، ${count(data.count, "رویداد")}`}</caption>
          <thead>
            <tr>
              <th scope="col">زمان</th>
              <th scope="col">کاربر</th>
              <th scope="col">رویداد</th>
              <th scope="col">شرح</th>
              <th scope="col">نشانی IP</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((event) => (
              <tr key={event.id}>
                <td data-label="زمان" className="whitespace-nowrap">
                  <time dateTime={event.at.iso}>{dateTime(event.at)}</time>
                </td>
                <td data-primary>
                  <Who name={event.user} username={event.username} />
                </td>
                <td data-label="رویداد">
                  <Badge tone={event.warning ? "warning" : "neutral"} dot={event.warning}>
                    {event.event.label}
                  </Badge>
                </td>
                <td
                  data-label="شرح"
                  data-wide
                  data-empty={event.summary ? undefined : ""}
                  className="text-xs [overflow-wrap:anywhere]"
                >
                  {event.summary && <bdi>{faText(event.summary)}</bdi>}
                </td>
                <td data-label="نشانی IP" data-empty={event.ip_address ? undefined : ""}>
                  {event.ip_address && (
                    <bdi className="code text-xs" dir="ltr">
                      {event.ip_address}
                    </bdi>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AuditLayout>
  );
}

const TYPE_TONES: Record<string, "success" | "info" | "danger"> = { "+": "success", "~": "info", "-": "danger" };

function Changes({ row }: { row: AuditChangeRow }) {
  if (row.changes.length) {
    return (
      <ul className="flex flex-col gap-1.5 text-xs leading-6">
        {row.changes.map((change) => (
          <li key={change.label}>
            <span className="text-muted">{change.label}: </span>
            <del className="text-muted decoration-muted/60">{faText(change.old)}</del>
            <span aria-hidden className="mx-1.5 text-muted">
              ←
            </span>
            <span className="sr-only"> به </span>
            <ins className="text-fg no-underline">{faText(change.new)}</ins>
          </li>
        ))}
      </ul>
    );
  }
  if (row.hidden_edit) {
    return <span className="text-xs text-muted">فیلدی که این‌جا نشان داده شود عوض نشد (مثلاً رمز یا نقش)</span>;
  }
  return null;
}

export function AuditChangeListPage() {
  return (
    <AuditLayout<AuditChangeRow, AuditChangeList>
      title="تغییرات داده"
      noun="تغییرها"
      icon={<History />}
      emptyTitle="تغییری با این مشخصات پیدا نشد"
    >
      {(data) => (
        <table className="data-table">
          <caption className="sr-only">{`تغییرات داده، ${count(data.count, "تغییر")}`}</caption>
          <thead>
            <tr>
              <th scope="col">زمان</th>
              <th scope="col">کاربر</th>
              <th scope="col">تغییر</th>
              <th scope="col">رکورد</th>
              <th scope="col">چه چیزی عوض شد</th>
            </tr>
          </thead>
          <tbody>
            {data.results.map((row) => (
              <tr key={row.id}>
                <td data-label="زمان" className="whitespace-nowrap">
                  <time dateTime={row.at.iso}>{dateTime(row.at)}</time>
                </td>
                <td data-label="کاربر">
                  <Who name={row.user?.name} />
                </td>
                <td data-label="تغییر">
                  <Badge tone={TYPE_TONES[row.type.value] ?? "neutral"}>{row.type.label}</Badge>
                </td>
                <td data-primary className="min-w-48">
                  <span className="font-medium text-fg">{faText(row.record)}</span>
                  {row.reason && <span className="mt-1 block text-xs text-muted">{faText(row.reason)}</span>}
                </td>
                <td
                  data-label="چه چیزی عوض شد"
                  data-wide
                  data-empty={row.changes.length || row.hidden_edit ? undefined : ""}
                >
                  <Changes row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AuditLayout>
  );
}
