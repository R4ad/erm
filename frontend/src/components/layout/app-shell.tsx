import { useQuery } from "@tanstack/react-query";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Tooltip } from "@/components/ui/tooltip";
import { SessionProvider, sessionQuery } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { locale, t } from "@/lib/i18n";
import { readPreference, writePreference } from "@/lib/storage";

import { Brand } from "./brand";
import { activeRoute, NavGroups } from "./nav";
import { OfflineBanner } from "./offline-banner";
import { Topbar } from "./topbar";

/** نوار باریک بالای صفحه وقتی صفحه‌ی بعدی (بخش کد جدا) در حال بار شدن است. */
function RouteProgress() {
  const navigation = useNavigation();
  if (navigation.state === "idle") return null;
  return (
    <div
      role="progressbar"
      aria-label={t("state.loading")}
      className="fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden"
    >
      <div className="h-full w-full origin-center animate-progress bg-accent shadow-[0_0_12px_var(--accent)]" />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-64 shrink-0 flex-col gap-4 border-e border-line bg-panel/60 p-4 lg:flex">
        <Skeleton className="h-9 w-40" />
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </div>
      <div className="flex-1 px-4 py-8 sm:px-8">
        <PageSkeleton label={t("state.loading")} />
      </div>
    </div>
  );
}

export function AppShell() {
  const session = useQuery(sessionQuery);
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readPreference("sidebar", ["open", "collapsed"], "open") === "collapsed",
  );
  const main = useRef<HTMLElement>(null);
  const firstPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === firstPath.current) return;
    firstPath.current = location.pathname;
    // بعد از رفتن به صفحه‌ی تازه، صفحه‌خوان و صفحه‌کلید از بالای محتوا شروع کنند.
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  if (session.isPending) return <ShellSkeleton />;
  if (session.isError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl items-center px-4">
        <ErrorState error={session.error} retry={() => session.refetch()} className="w-full" />
      </main>
    );
  }

  const data = session.data;
  const active = activeRoute(location.pathname, data.navigation);

  function toggleCollapsed() {
    setCollapsed((current) => {
      writePreference("sidebar", current ? "open" : "collapsed");
      return !current;
    });
  }

  return (
    <SessionProvider value={data}>
      <a
        href="#main"
        className="sr-only z-[80] rounded-lg bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
      >
        {t("shell.skip")}
      </a>
      <RouteProgress />
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-panel/70 backdrop-blur-xl transition-[width] duration-300 ease-out lg:flex",
            collapsed ? "w-[4.75rem]" : "w-64",
          )}
        >
          <div
            className={cn(
              "flex h-(--topbar-h) items-center gap-2 border-b border-line px-4",
              collapsed && "justify-center px-0",
            )}
          >
            <Brand compact={collapsed} />
          </div>
          <nav aria-label={t("shell.mainNav")} className="flex-1 overflow-y-auto px-3 py-5 [scrollbar-width:thin]">
            <NavGroups groups={data.navigation} active={active} collapsed={collapsed} />
          </nav>
          <div className={cn("border-t border-line p-3", collapsed && "flex justify-center")}>
            <Tooltip
              content={collapsed ? t("shell.expand") : t("shell.collapse")}
              side={locale.dir === "rtl" ? "left" : "right"}
            >
              <Button
                variant="ghost"
                size={collapsed ? "icon" : "sm"}
                className={cn(!collapsed && "w-full justify-start")}
                aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
                aria-expanded={!collapsed}
                onClick={toggleCollapsed}
              >
                {collapsed ? (
                  <PanelRightOpen className="ltr:-scale-x-100" />
                ) : (
                  <PanelRightClose className="ltr:-scale-x-100" />
                )}
                {!collapsed && <span>{t("shell.collapse")}</span>}
              </Button>
            </Tooltip>
          </div>
        </aside>

        <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
          <DrawerContent title={t("shell.mainNav")} hideTitle side="start">
            <div className="border-b border-line px-4 pt-1 pb-4">
              <Brand />
            </div>
            <nav aria-label={t("shell.mainNav")} className="flex-1 overflow-y-auto px-3 py-5">
              <NavGroups groups={data.navigation} active={active} onNavigate={() => setMenuOpen(false)} />
            </nav>
          </DrawerContent>
        </Drawer>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
          <OfflineBanner />
          <main
            id="main"
            ref={main}
            tabIndex={-1}
            className="pad-safe mx-auto w-full max-w-[88rem] flex-1 py-6 outline-none [view-transition-name:main] lg:py-8"
          >
            <Outlet />
          </main>
          <footer className="pad-safe border-t border-line/70 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-muted">
            <div className="mx-auto flex max-w-[88rem] flex-wrap items-center justify-between gap-3">
              <p>{t("shell.footer")}</p>
              <a href={data.classic_home} className="text-accent-text underline-offset-4 hover:underline">
                {t("shell.classicHome")}
              </a>
            </div>
          </footer>
        </div>
      </div>
      <ScrollRestoration />
    </SessionProvider>
  );
}
