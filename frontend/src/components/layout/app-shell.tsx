import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Outlet, ScrollRestoration, useLocation, useNavigation } from "react-router-dom";

import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { PageSkeleton, Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { SessionProvider, sessionQuery } from "@/features/session/session";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { readPreference, writePreference } from "@/lib/storage";

import { CrumbsProvider } from "./crumbs";
import { activeRoute, Sidebar } from "./nav";
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
      <div className="h-full w-full origin-center animate-progress bg-brand" />
    </div>
  );
}

function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <div className="hidden w-(--sidebar-w) shrink-0 flex-col gap-4 bg-nav p-4 lg:flex">
        <Skeleton className="h-9 w-40 opacity-20" />
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full opacity-20" />
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
      <CrumbsProvider>
        <a
          href="#main"
          className="sr-only z-[80] rounded-md bg-brand px-4 py-2 text-on-brand focus:not-sr-only focus:fixed focus:start-4 focus:top-4"
        >
          {t("shell.skip")}
        </a>
        <RouteProgress />
        <div className="flex min-h-dvh">
          <aside
            className={cn(
              "sticky top-0 hidden h-dvh shrink-0 border-e border-white/7 transition-[width] duration-300 ease-out lg:block",
              collapsed ? "w-[4.5rem]" : "w-(--sidebar-w)",
            )}
          >
            <Sidebar
              navigation={data.navigation}
              active={active}
              collapsed={collapsed}
              onToggleCollapsed={toggleCollapsed}
            />
          </aside>

          <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
            <DrawerContent title={t("shell.mainNav")} hideTitle side="start" className="w-(--sidebar-w) bg-nav p-0">
              <Sidebar navigation={data.navigation} active={active} onNavigate={() => setMenuOpen(false)} />
            </DrawerContent>
          </Drawer>

          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} />
            <OfflineBanner />
            <main
              id="main"
              ref={main}
              tabIndex={-1}
              className="pad-safe w-full flex-1 py-6 outline-none [view-transition-name:main] lg:px-8"
            >
              <Outlet />
            </main>
          </div>
        </div>
      </CrumbsProvider>
      <ScrollRestoration />
    </SessionProvider>
  );
}
