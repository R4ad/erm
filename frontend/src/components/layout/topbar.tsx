import { useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import type { Crumb } from "@/components/ui/breadcrumb";
import { Icon } from "@/components/ui/icon";
import { sessionQuery, useSession } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import { t } from "@/lib/i18n";

import { usePageCrumbsValue } from "./crumbs-context";
import { activeTrail } from "./nav";
import { UserMenu } from "./user-menu";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** جست‌وجوی سراسری (Ctrl K یا /): کد یا عنوان ریسک را در رجیستر جست‌وجو می‌کند. */
function GlobalSearch() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const ctrlK = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target);
      if (ctrlK || slash) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = value.trim();
    navigate(q ? `/risks?q=${encodeURIComponent(q)}` : "/risks", { viewTransition: true });
    setValue("");
    input.current?.blur();
  }

  return (
    <form
      role="search"
      onSubmit={submit}
      className="relative hidden h-9 w-80 items-center gap-2 rounded-md border border-line bg-subtle px-3 transition-[border-color,box-shadow] focus-within:border-focus focus-within:shadow-focus md:flex"
    >
      <label htmlFor="global-search" className="sr-only">
        {t("shell.search")}
      </label>
      <Icon name="search" size={16} className="text-ink-3" />
      <input
        ref={input}
        id="global-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("shell.searchPlaceholder")}
        className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
      />
      <kbd
        aria-hidden
        className="inline-flex h-5 items-center rounded-sm border border-line bg-panel px-1.5 font-sans text-xs text-ink-3"
      >
        Ctrl K
      </kbd>
    </form>
  );
}

/** مسیر صفحه: «خانه › گروه › صفحه»؛ آخرین تکه پررنگ و بدون پیوند. */
function TopbarCrumbs() {
  const { navigation } = useSession();
  const { pathname } = useLocation();
  const pageCrumbs = usePageCrumbsValue();
  let crumbs: Crumb[];
  if (pageCrumbs) {
    crumbs = [{ label: "خانه", to: "/" }, ...pageCrumbs];
  } else {
    const trail = activeTrail(pathname, navigation);
    crumbs = [{ label: "خانه", to: "/" }];
    // فیگما: «خانه › ماژول › صفحه» و برای صفحه‌های میز کار جز خود خانه «خانه › میز کار › صفحه».
    if (trail?.module) crumbs.push({ label: trail.module.title });
    else if (trail && trail.link.route !== "/") crumbs.push({ label: navigation.desk.title });
    if (trail && trail.link.route !== "/") crumbs.push({ label: trail.link.label, to: trail.link.route ?? undefined });
    if (trail?.link.route === "/") crumbs.push({ label: trail.link.label });
  }
  return (
    <nav aria-label={t("breadcrumb.label")} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          const label = crumb.code ? <bdi className="code text-[0.8125rem]">{crumb.label}</bdi> : crumb.label;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li className={cn("min-w-0 truncate", last ? "font-semibold text-ink" : "text-ink-2")}>
                {crumb.to && !last ? (
                  <Link to={crumb.to} viewTransition className="rounded-sm hover:text-ink">
                    {label}
                  </Link>
                ) : (
                  <span aria-current={last ? "page" : undefined}>{label}</span>
                )}
              </li>
              {!last && (
                <li aria-hidden className="text-ink-3">
                  <Icon name="chevron-left" size={14} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** دکمه‌ی اعلان‌ها با نقطه‌ی قرمز وقتی اعلان پایش نخوانده هست. */
function Notifications() {
  const session = useQuery(sessionQuery);
  const notices = session.data?.navigation.desk.items.find((link) => link.key === "actions:notices");
  const unread = notices?.count ?? 0;
  return (
    <Link
      to={notices?.route ?? "/actions/notices"}
      viewTransition
      aria-label={unread ? `اعلان‌های پایش، ${fa(unread)} نخوانده` : "اعلان‌های پایش"}
      className="relative grid size-9 shrink-0 place-items-center rounded-md border border-line bg-panel text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
    >
      <Icon name="bell" size={18} />
      {unread > 0 && (
        <span
          aria-hidden
          className="absolute top-[7px] end-[8px] size-2 rounded-full border-2 border-panel bg-danger-solid"
        />
      )}
    </Link>
  );
}

/** نوار بالای فیگما (Topbar): مسیر صفحه در راست؛ نسخه‌ی روش، جست‌وجو، اعلان و کاربر در چپ. */
export function Topbar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const { method } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel pt-[env(safe-area-inset-top)] print:hidden">
      <div className="pad-safe flex h-(--topbar-h) items-center justify-between gap-3 py-2.5 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-md text-ink-2 hover:bg-subtle lg:hidden"
            aria-label={t("shell.menu")}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={onOpenMenu}
          >
            <Icon name="list" size={20} />
          </button>
          <TopbarCrumbs />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {method && (
            <Link to={method.route ?? "/method"} viewTransition className="hidden rounded-sm xl:inline-flex">
              <Badge tone="tangerine">
                روش ارزیابی: نسخه‌ی {fa(method.number)} · {method.title}
              </Badge>
            </Link>
          )}
          <GlobalSearch />
          <Link
            to="/risks"
            viewTransition
            aria-label={t("shell.search")}
            className="grid size-9 place-items-center rounded-md border border-line text-ink-2 md:hidden"
          >
            <Icon name="search" size={18} />
          </Link>
          <Notifications />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
