import { useState } from "react";
import { Link } from "react-router-dom";

import { Avatar } from "@/components/ui/avatar";
import { Icon, type IconName } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useLogout, useSession } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import { readPreference, writePreference } from "@/lib/storage";
import type { Navigation, NavLink, NavModule, NavModuleKey } from "@/lib/types";

import { Brand } from "./brand";

// منوی کناری فیگما («Sidebar» و «Navigation 2.0 — منوی ماژولار»): زمینه‌ی تیره با نور ملایم، «میز کار» و سه ماژول یک
// چرخه با گام‌های شماره‌دار، کارت چرخه‌ی ارزیابی و کارت کاربر. پیوند فعال زمینه‌ی نیلی ملایم، متن روشن و نوار طلایی دارد.

const TIP_SIDE = locale.dir === "rtl" ? "left" : "right";

/** آیکون پیوندهای «میز کار» (آیکون‌های فیگما). */
const DESK_ICONS: Record<string, IconName> = {
  "actions:my_work": "tray",
  "risks:risk_list": "list",
  "actions:notices": "bell",
  "reports:management": "chart-bar",
};

/** کاشی هر ماژول: گرادیان، آیکون و رنگ ریل و نشانگر گام فعال (Nav/Module Tile). */
const MODULES: Record<
  NavModuleKey,
  { icon: IconName; tile: string; glow: string; rail: string; marker: string; markerGlow: string }
> = {
  assessment: {
    icon: "gauge",
    tile: "from-[#818cf8] to-[#6d28d9]",
    glow: "shadow-[0_6px_14px_-3px_rgb(99_102_241/0.55),inset_0_-2px_3px_rgb(0_0_0/0.22)]",
    rail: "from-[rgb(129_140_248/0.75)]",
    marker: "from-[#818cf8] to-[#7c3aed]",
    markerGlow: "shadow-[0_0_10px_rgb(99_102_241/0.7)]",
  },
  treatment: {
    icon: "shield-check",
    tile: "from-[#34d399] to-[#047857]",
    glow: "shadow-[0_6px_14px_-3px_rgb(16_185_129/0.5),inset_0_-2px_3px_rgb(0_0_0/0.22)]",
    rail: "from-[rgb(52_211_153/0.7)]",
    marker: "from-[#34d399] to-[#047857]",
    markerGlow: "shadow-[0_0_10px_rgb(16_185_129/0.7)]",
  },
  config: {
    icon: "gear",
    tile: "from-[#fcd34d] to-[#d96506]",
    glow: "shadow-[0_6px_14px_-3px_rgb(249_115_22/0.5),inset_0_-2px_3px_rgb(0_0_0/0.22)]",
    rail: "from-[rgb(252_191_36/0.7)]",
    marker: "from-[#fcd34d] to-[#d96506]",
    markerGlow: "shadow-[0_0_10px_rgb(249_115_22/0.7)]",
  },
};

/**
 * صفحه‌هایی که نشانی‌شان زیر پیوند منوی خودشان نیست: پرونده‌ی ارزیابی و پروفایل پیامد زیر «آنالیز ریسک»، طرح مواجهه
 * زیر «ریسک‌های در حال درمان»، پذیرش زیر «نیازمند اقدام»، کار بازبینی پایش زیر «کارهای من».
 */
const NAV_ALIASES: [prefix: string, route: string][] = [
  ["/assessments", "/analysis"],
  ["/actions/plans/", "/treatment/board"],
  ["/actions/acceptances", "/treatment/required"],
  ["/actions/reviews/", "/"],
  ["/method/", "/method"],
  ["/accounts/", "/accounts/users"],
  ["/risks/coverage", "/identification"],
  ["/risks/scenarios", "/identification"],
  ["/committee", "/evaluation"],
];

function allLinks(navigation: Navigation): NavLink[] {
  return [...navigation.desk.items, ...navigation.modules.flatMap((module) => module.items)];
}

/** کدام پیوند منو صفحه‌ی فعلی است: طولانی‌ترین route که مسیر با آن شروع می‌شود. */
export function activeRoute(pathname: string, navigation: Navigation): string | null {
  const routes = allLinks(navigation)
    .map((link) => link.route)
    .filter((route): route is string => route !== null);
  const match = (path: string) =>
    routes
      .filter((route) => (route === "/" ? path === "/" : path === route || path.startsWith(`${route}/`)))
      .sort((a, b) => b.length - a.length)[0] ?? null;
  const direct = match(pathname);
  // جایگزین وقتی برنده است که از پیوند مستقیم دقیق‌تر باشد؛ مثلاً جهان ریسک (/risks/coverage) زیر «شناسایی ریسک»
  // می‌آید، نه زیر رجیستر (/risks).
  const alias = NAV_ALIASES.find(([prefix]) => pathname.startsWith(prefix));
  if (alias && routes.includes(alias[1]) && (!direct || direct === "/" || alias[0].length > direct.length)) {
    return alias[1];
  }
  return direct;
}

/** پیوند فعال و گروهش، برای مسیر صفحه در نوار بالا. */
export function activeTrail(pathname: string, navigation: Navigation) {
  const route = activeRoute(pathname, navigation);
  if (!route) return null;
  const module = navigation.modules.find((item) => item.items.some((link) => link.route === route));
  const link = allLinks(navigation).find((item) => item.route === route);
  return link ? { link, module: module ?? null } : null;
}

function CountPill({ value, tone, label }: { value: number; tone: NavLink["tone"]; label: string }) {
  return (
    <span
      className={cn(
        "inline-grid h-[1.125rem] min-w-[1.125rem] shrink-0 place-items-center rounded-full px-1.5 text-xs font-medium tabular",
        tone === "red" ? "bg-[#ef4444] text-white" : "bg-gold-bright text-ink",
      )}
    >
      <span className="sr-only">{label}: </span>
      {fa(value)}
    </span>
  );
}

const itemBase =
  "relative flex items-center rounded-lg border border-transparent text-sm transition-colors duration-150 focus-visible:outline-offset-0";
const itemActive =
  "border-white/8 bg-gradient-to-r from-[rgb(139_92_246/0.03)] to-[rgb(99_102_241/0.26)] font-semibold text-on-dark";

function DeskItem({
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
  const icon = (
    <Icon name={DESK_ICONS[link.key] ?? "file-text"} size={18} className={active ? "text-gold-bright" : ""} />
  );
  const content = (
    <>
      {active && (
        <span
          aria-hidden
          className="h-[18px] w-[3px] shrink-0 rounded-[2px] bg-gold-bright shadow-[0_0_8px_rgb(234_179_8/0.85)]"
        />
      )}
      {icon}
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{link.label}</span>
      {link.count !== null && !collapsed && <CountPill value={link.count} tone={link.tone} label="منتظر" />}
      {link.count !== null && collapsed && (
        <span aria-hidden className="absolute top-1.5 end-1.5 size-2 rounded-full bg-gold-bright" />
      )}
    </>
  );
  const classes = cn(
    itemBase,
    "h-9 gap-2.5 px-3 font-medium text-on-dark-muted hover:bg-nav-hover hover:text-on-dark",
    active && itemActive,
    collapsed && "justify-center px-0",
  );
  return (
    <Tooltip content={link.label} side={TIP_SIDE} disabled={!collapsed}>
      {link.route === null ? (
        <a href={link.href} className={classes}>
          {content}
        </a>
      ) : (
        <Link
          to={link.route}
          viewTransition
          aria-current={active ? "page" : undefined}
          className={classes}
          onClick={onNavigate}
        >
          {content}
        </Link>
      )}
    </Tooltip>
  );
}

function StepItem({
  link,
  index,
  active,
  module,
  onNavigate,
}: {
  link: NavLink;
  index: number;
  active: boolean;
  module: NavModuleKey;
  onNavigate?: () => void;
}) {
  const style = MODULES[module];
  const content = (
    <>
      <span
        aria-hidden
        className={cn(
          "relative z-[1] grid size-5 shrink-0 place-items-center rounded-full border text-[0.6875rem] font-medium",
          active
            ? cn("border-white/35 bg-gradient-to-br text-on-dark", style.marker, style.markerGlow)
            : "border-white/18 bg-[#0e142b] text-on-dark-muted",
        )}
      >
        {fa(index)}
      </span>
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
      {link.count !== null && <CountPill value={link.count} tone={link.tone} label="منتظر" />}
    </>
  );
  const classes = cn(
    itemBase,
    "h-[2.125rem] gap-2 ps-[5px] pe-2 font-medium text-on-dark-muted hover:bg-nav-hover hover:text-on-dark",
    active && cn(itemActive, "font-medium"),
  );
  return link.route === null ? (
    <a href={link.href} className={classes}>
      {content}
    </a>
  ) : (
    <Link
      to={link.route}
      viewTransition
      aria-current={active ? "page" : undefined}
      className={classes}
      onClick={onNavigate}
    >
      {content}
    </Link>
  );
}

function ModuleTile({ module, size = 30 }: { module: NavModuleKey; size?: number }) {
  const style = MODULES[module];
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-[9px] border border-white/30 bg-gradient-to-br text-white",
        style.tile,
        style.glow,
      )}
    >
      <span className="absolute inset-0 bg-gradient-to-b from-white/38 to-transparent to-50%" />
      <Icon name={style.icon} size={18} className="relative" />
    </span>
  );
}

function ModuleGroup({
  module,
  active,
  collapsed,
  onNavigate,
}: {
  module: NavModule;
  active: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const containsActive = module.items.some((link) => link.route !== null && link.route === active);
  const [open, setOpen] = useState(
    () => containsActive || readPreference(`nav-${module.key}`, ["open", "closed"], "open") === "open",
  );
  const id = `nav-module-${module.key}`;

  if (collapsed) {
    const first = module.items[0];
    return (
      <Tooltip content={module.title} side={TIP_SIDE}>
        <Link
          to={first?.route ?? "/"}
          viewTransition
          aria-label={module.title}
          className={cn(
            "mx-auto grid size-10 place-items-center rounded-xl border border-transparent",
            containsActive && "border-white/12 bg-white/5",
          )}
          onClick={onNavigate}
        >
          <ModuleTile module={module.key} />
        </Link>
      </Tooltip>
    );
  }

  function toggle() {
    setOpen((current) => {
      writePreference(`nav-${module.key}`, current ? "closed" : "open");
      return !current;
    });
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex flex-col gap-1 rounded-[14px] border border-transparent p-1.5",
        containsActive && "border-white/10 bg-gradient-to-b from-white/7 to-white/1",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-steps`}
        onClick={toggle}
        className="flex h-[2.125rem] items-center gap-2.5 rounded-lg ps-0 pe-1.5 text-start"
      >
        <ModuleTile module={module.key} />
        <h3 id={`${id}-title`} className="min-w-0 flex-1 truncate text-base font-semibold text-on-dark">
          {module.title}
        </h3>
        <Icon
          name="chevron-up"
          size={16}
          className={cn("text-on-dark-muted transition-transform duration-200", !open && "rotate-180")}
        />
      </button>
      {open && (
        <div id={`${id}-steps`} className="relative">
          <span
            aria-hidden
            className={cn(
              "absolute -top-2 bottom-4 start-[14px] w-0.5 rounded-[1px] bg-gradient-to-b to-white/10",
              MODULES[module.key].rail,
            )}
          />
          <ul className="flex flex-col gap-0.5">
            {module.items.map((link, index) => (
              <li key={link.key}>
                <StepItem
                  link={link}
                  index={index + 1}
                  active={link.route !== null && link.route === active}
                  module={module.key}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function SectionTitle({ children, collapsed }: { children: string; collapsed: boolean }) {
  return (
    <h2 className={cn("px-2.5 pt-1.5 pb-1 text-xs font-medium text-on-dark-muted", collapsed && "sr-only")}>
      {children}
    </h2>
  );
}

/** کارت «چرخه‌ی ارزیابی» پایین منو. */
function CycleCard() {
  const { cycle } = useSession();
  const percent = cycle.total ? Math.round((cycle.assessed / cycle.total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-white/12 bg-gradient-to-br from-[rgb(99_102_241/0.28)] to-[rgb(217_70_239/0.08)] p-3 backdrop-blur-lg">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-on-dark">چرخه‌ی ارزیابی {fa(cycle.year)}</span>
          <span className="text-xs text-on-dark-muted">
            {cycle.total ? `${fa(cycle.assessed)} از ${fa(cycle.total)} ریسک سنجیده شد` : "هنوز ریسکی در رجیستر نیست"}
          </span>
        </div>
        <span className="text-stat font-bold text-on-dark">{fa(percent)}٪</span>
      </div>
      <div
        role="progressbar"
        aria-label={`چرخه‌ی ارزیابی ${fa(cycle.year)}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#f0abfc] via-[#c084fc] to-[#818cf8] shadow-[0_0_8px_rgb(168_85_247/0.6)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function UserCard({ collapsed }: { collapsed: boolean }) {
  const { user } = useSession();
  const logout = useLogout();
  const detail = [user.roles[0], user.org_unit].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[14px] border border-white/8 bg-white/5 px-2 py-2.5",
        collapsed && "flex-col px-1",
      )}
    >
      <Avatar name={user.name} />
      <div className={cn("flex min-w-0 flex-1 flex-col", collapsed && "sr-only")}>
        <span className="truncate text-sm font-semibold text-on-dark">{user.name}</span>
        {detail && <span className="truncate text-xs text-on-dark-muted">{detail}</span>}
      </div>
      <Tooltip content={t("shell.logout")} side="top">
        <button
          type="button"
          aria-label={t("shell.logout")}
          disabled={logout.isPending}
          onClick={() => logout.mutate()}
          className="grid size-[1.875rem] shrink-0 place-items-center rounded-md text-on-dark-muted transition-colors hover:bg-white/8 hover:text-on-dark disabled:opacity-50"
        >
          <Icon name="sign-out" size={18} />
        </button>
      </Tooltip>
    </div>
  );
}

export function Sidebar({
  navigation,
  active,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
  className,
}: {
  navigation: Navigation;
  active: string | null;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative isolate flex h-full flex-col gap-2 overflow-hidden bg-nav px-3 py-4 text-on-dark",
        "bg-[linear-gradient(180deg,rgb(59_58_152/0.3)_0%,rgb(11_22_40/0)_45%,rgb(5_8_20/0.35)_100%)]",
        className,
      )}
    >
      {/* نور ملایم پشت منو (Aurora)؛ فقط تزئین است. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[110px] left-[70px] -z-10 size-[230px] rounded-full bg-[#6366f1]/45 blur-[60px]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-[420px] -left-[110px] -z-10 size-[200px] rounded-full bg-[#a855f7]/22 blur-[60px]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute top-[834px] left-[110px] -z-10 size-[200px] rounded-full bg-[#eab308]/12 blur-[60px]"
      />

      <div className={cn("flex items-center gap-2.5 px-2 pt-1 pb-4", collapsed && "flex-col px-0")}>
        <Brand compact={collapsed} />
        {onToggleCollapsed && (
          <Tooltip content={collapsed ? t("shell.expand") : t("shell.collapse")} side={TIP_SIDE}>
            <button
              type="button"
              aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
              aria-expanded={!collapsed}
              onClick={onToggleCollapsed}
              className="grid size-7 shrink-0 place-items-center rounded-md border border-white/9 bg-white/5 text-on-dark-muted transition-colors hover:text-on-dark"
            >
              <Icon name="sidebar" size={16} />
            </button>
          </Tooltip>
        )}
      </div>

      <nav
        aria-label={t("shell.mainNav")}
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 [scrollbar-width:none]"
      >
        <SectionTitle collapsed={collapsed}>{navigation.desk.title}</SectionTitle>
        <ul className="flex flex-col gap-0.5">
          {navigation.desk.items.map((link) => (
            <li key={link.key}>
              <DeskItem
                link={link}
                active={link.route !== null && link.route === active}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
        <span aria-hidden className="h-1.5 shrink-0" />
        <SectionTitle collapsed={collapsed}>ماژول‌ها</SectionTitle>
        <div className={cn("flex flex-col gap-1", collapsed && "gap-2")}>
          {navigation.modules.map((module) => (
            <ModuleGroup
              key={module.key}
              module={module}
              active={active}
              collapsed={collapsed}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      {!collapsed && <CycleCard />}
      <UserCard collapsed={collapsed} />
    </div>
  );
}
