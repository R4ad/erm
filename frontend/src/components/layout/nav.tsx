import { SquareArrowOutUpLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import type { NavGroup, NavLink } from "@/lib/types";

import { FALLBACK_ICON, NAV_ICONS } from "./nav-icons";

// راهنمای منوی جمع‌شده رو به محتوا باز می‌شود: منو در رابط راست‌به‌چپ سمت راست است.
const TIP_SIDE = locale.dir === "rtl" ? "left" : "right";

/**
 * صفحه‌هایی که نشانی‌شان زیر پیوند منوی خودشان نیست: پر کردن پاسخ زیر «پاسخ به سؤال‌ها»، ویرایش سؤال زیر «تعریف
 * پرسشنامه‌ها»، ثبت یا کنار گذاشتن ریسک در انتظار زیر «پاسخ‌ها و بررسی» و کار بازبینی پایش زیر «کارهای من».
 */
const NAV_ALIASES: [prefix: string, route: string][] = [
  ["/responses/", "/questionnaires"],
  ["/questionnaires/questions/", "/questionnaires/manage"],
  ["/questionnaires/pending/", "/questionnaires/responses"],
  ["/actions/reviews/", "/"],
];

/** کدام پیوند منو صفحه‌ی فعلی است: طولانی‌ترین route که مسیر با آن شروع می‌شود. */
export function activeRoute(pathname: string, groups: NavGroup[]): string | null {
  const path = NAV_ALIASES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? pathname;
  const routes = groups
    .flatMap((group) => group.items)
    .map((link) => link.route)
    .filter((route): route is string => route !== null);
  const matches = routes.filter((route) =>
    route === "/" ? path === "/" : path === route || path.startsWith(`${route}/`),
  );
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** شمار نخوانده‌های یک صف. در منوی جمع‌شده فقط یک نقطه‌ی کوچک روی آیکون می‌ماند و عدد را راهنما می‌گوید. */
function Badge({ value, collapsed }: { value: number; collapsed: boolean }) {
  if (collapsed) {
    return <span aria-hidden className="absolute end-3.5 top-2 size-1.5 rounded-full bg-accent-text" />;
  }
  return (
    <span aria-hidden className="rounded-full bg-surface px-1.5 text-[0.6875rem] leading-5 font-medium text-fg tabular">
      {formatNumber(value)}
    </span>
  );
}

function NavItem({
  link,
  active,
  collapsed,
  onNavigate,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = NAV_ICONS[link.key] ?? FALLBACK_ICON;
  const badge = link.badge ?? 0;
  const classes = cn(
    "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-fg/75 transition-colors duration-150",
    "hover:bg-surface hover:text-fg",
    active && "bg-accent-soft font-medium text-fg hover:bg-accent-soft",
    collapsed && "justify-center px-0",
  );
  const indicator = active && (
    <span
      aria-hidden
      className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]"
    />
  );
  const icon = (
    <Icon
      aria-hidden
      className={cn("size-[1.125rem] shrink-0 transition-colors", active ? "text-accent-text" : "group-hover:text-fg")}
    />
  );
  const label = (
    <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>
      {link.label}
      {badge > 0 && <span className="sr-only">، {formatNumber(badge)} مورد نخوانده</span>}
    </span>
  );
  const tip = badge > 0 ? `${link.label} (${formatNumber(badge)})` : link.label;

  if (link.route === null) {
    return (
      <Tooltip content={`${tip}، ${t("shell.classic")}`} side={TIP_SIDE} disabled={!collapsed}>
        <a href={link.href} className={classes}>
          {icon}
          {label}
          {badge > 0 && <Badge value={badge} collapsed={collapsed} />}
          {!collapsed && <SquareArrowOutUpLeft aria-hidden className="size-3.5 shrink-0 text-faint ltr:-scale-x-100" />}
          <span className="sr-only">({t("shell.classic")})</span>
        </a>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={tip} side={TIP_SIDE} disabled={!collapsed}>
      <Link
        to={link.route}
        viewTransition
        aria-current={active ? "page" : undefined}
        className={classes}
        onClick={onNavigate}
      >
        {indicator}
        {icon}
        {label}
        {badge > 0 && <Badge value={badge} collapsed={collapsed} />}
      </Link>
    </Tooltip>
  );
}

interface NavGroupsProps {
  groups: NavGroup[];
  active: string | null;
  collapsed?: boolean;
  /** کشوی موبایل بعد از انتخاب پیوند بسته می‌شود. */
  onNavigate?: () => void;
}

export function NavGroups({ groups, active, collapsed = false, onNavigate }: NavGroupsProps) {
  return (
    <div className="flex flex-col">
      {groups.map((group, index) => {
        const id = `nav-group-${index}`;
        return (
          <section
            key={group.title}
            aria-labelledby={id}
            // خط جداکننده و فاصله‌ی بالا، گروه را از گروه قبل جدا می‌کند؛ عنوان گروه کوچک‌تر و کم‌رنگ‌تر از
            // پیوندهاست تا با آن‌ها اشتباه نشود.
            className={cn("flex flex-col gap-1", index > 0 && "mt-5 border-t border-line/70 pt-5")}
          >
            <h2 id={id} className={cn("px-2.5 pb-1 text-[0.6875rem] font-medium text-muted", collapsed && "sr-only")}>
              {group.title}
            </h2>
            <ul className="flex flex-col gap-0.5">
              {group.items.map((link) => (
                <li key={link.key}>
                  <NavItem
                    link={link}
                    active={link.route !== null && link.route === active}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
