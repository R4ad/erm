import { useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";

import { get } from "../api";
import type { NavLink, Session } from "../types";
import { ClassicIcon, ErrorNotice, Loading } from "./bits";

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside Shell");
  return session;
}

/** پیوندی از منو که هنوز صفحه‌ی React ندارد، با بارگذاری کامل به صفحه‌ی جنگو می‌رود. */
function RailLink({ link, current }: { link: NavLink; current: boolean }) {
  if (link.route === null) {
    return (
      <a className="rail-link is-classic" href={link.href} title="در صفحه‌های فعلی سامانه باز می‌شود">
        <span>{link.label}</span>
        <ClassicIcon />
      </a>
    );
  }
  return (
    <Link className="rail-link" to={link.route} aria-current={current ? "page" : undefined}>
      {link.label}
    </Link>
  );
}

/** کدام پیوند منو صفحه‌ی فعلی است: طولانی‌ترین route که مسیر با آن شروع می‌شود. */
function currentRoute(pathname: string, links: NavLink[]): string | null {
  const routes = links.map((link) => link.route).filter((route): route is string => route !== null);
  const matches = routes.filter((route) =>
    route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`),
  );
  if (pathname.startsWith("/responses/")) matches.push("/questionnaires");
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function Shell() {
  const session = useQuery({ queryKey: ["session"], queryFn: () => get<Session>("session/"), staleTime: 5 * 60_000 });
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const main = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    setMenuOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    // بعد از رفتن به صفحه‌ی تازه، تمرکز صفحه‌خوان و صفحه‌کلید از بالای محتوا شروع شود.
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (session.isPending) {
    return (
      <main className="main">
        <Loading label="در حال باز کردن سامانه" />
      </main>
    );
  }
  if (session.isError) {
    return (
      <main className="main">
        <ErrorNotice error={session.error} retry={() => session.refetch()} />
      </main>
    );
  }

  const data = session.data;
  const links = data.navigation.flatMap((group) => group.items);
  const active = currentRoute(location.pathname, links);

  return (
    <SessionContext.Provider value={data}>
      <a className="skip-link" href="#main">
        رفتن به محتوای صفحه
      </a>
      <div className="shell">
        <header className="topbar">
          <Link to="/" className="brand">
            مدیریت ریسک
          </Link>
          <button
            type="button"
            className="button button-small"
            aria-expanded={menuOpen}
            aria-controls="rail"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "بستن منو" : "منو"}
          </button>
        </header>

        <nav id="rail" className={menuOpen ? "rail is-open" : "rail"} aria-label="منوی اصلی">
          <Link to="/" className="brand">
            مدیریت ریسک
          </Link>
          <div className="rail-groups">
            {data.navigation.map((group) => (
              <section className="rail-group" key={group.title}>
                <h2>{group.title}</h2>
                <ul>
                  {group.items.map((link) => (
                    <li key={link.href}>
                      <RailLink link={link} current={link.route !== null && link.route === active} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="rail-user">
            <strong>{data.user.name}</strong>
            {data.user.roles.length > 0 && <span>{data.user.roles.join("، ")}</span>}
            <form method="post" action={data.logout_url}>
              <input type="hidden" name="csrfmiddlewaretoken" value={data.csrf_token} />
              <button type="submit" className="link-button">
                خروج
              </button>
            </form>
          </div>
        </nav>

        <main id="main" className="main" ref={main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </SessionContext.Provider>
  );
}
