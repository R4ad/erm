import { SquareArrowOutUpLeft } from "lucide-react";
import { Link } from "react-router-dom";

import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { locale, t } from "@/lib/i18n";
import type { NavGroup, NavLink } from "@/lib/types";

import { FALLBACK_ICON, NAV_ICONS } from "./nav-icons";

// راهنمای منوی جمع‌شده رو به محتوا باز می‌شود: منو در رابط راست‌به‌چپ سمت راست است.
const TIP_SIDE = locale.dir === "rtl" ? "left" : "right";

/** کدام پیوند منو صفحه‌ی فعلی است: طولانی‌ترین route که مسیر با آن شروع می‌شود. */
export function activeRoute(pathname: string, groups: NavGroup[]): string | null {
  const routes = groups
    .flatMap((group) => group.items)
    .map((link) => link.route)
    .filter((route): route is string => route !== null);
  const matches = routes.filter((route) =>
    route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`),
  );
  // پاسخ‌ها زیر «پاسخ به سؤال‌ها» هستند، هرچند نشانی‌شان /responses/ است.
  if (pathname.startsWith("/responses/")) matches.push("/questionnaires");
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
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
  const classes = cn(
    "group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-muted transition-colors duration-150",
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
  const label = <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{link.label}</span>;

  if (link.route === null) {
    return (
      <Tooltip content={`${link.label}، ${t("shell.classic")}`} side={TIP_SIDE} disabled={!collapsed}>
        <a href={link.href} className={classes}>
          {icon}
          {label}
          {!collapsed && <SquareArrowOutUpLeft aria-hidden className="size-3.5 shrink-0 text-faint ltr:-scale-x-100" />}
          <span className="sr-only">({t("shell.classic")})</span>
        </a>
      </Tooltip>
    );
  }
  return (
    <Tooltip content={link.label} side={TIP_SIDE} disabled={!collapsed}>
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
    <div className="flex flex-col gap-5">
      {groups.map((group, index) => {
        const id = `nav-group-${index}`;
        return (
          <section key={group.title} aria-labelledby={id} className="flex flex-col gap-1">
            <h2 id={id} className={cn("px-2.5 pb-1 text-[0.6875rem] font-medium text-muted", collapsed && "sr-only")}>
              {group.title}
            </h2>
            {collapsed && index > 0 && <span aria-hidden className="mx-3 mb-1 h-px bg-line" />}
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
