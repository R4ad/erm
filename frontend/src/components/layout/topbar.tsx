import { Menu, Search } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useSession } from "@/features/session/session";
import { longDate } from "@/lib/format";
import { t } from "@/lib/i18n";

import { Brand } from "./brand";
import { ThemeMenu } from "./theme-menu";
import { UserMenu } from "./user-menu";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** جست‌وجوی سریع رجیستر از هر صفحه. کلید / فوکوس را به آن می‌برد. */
function QuickSearch() {
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTyping(event.target)) {
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
    <form role="search" onSubmit={submit} className="relative hidden w-full max-w-md sm:block">
      <label htmlFor="quick-search" className="sr-only">
        {t("shell.search")}
      </label>
      <Search aria-hidden className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        id="quick-search"
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("shell.searchPlaceholder")}
        className="h-10 w-full rounded-xl border border-line bg-surface/70 ps-9 pe-10 text-sm text-fg placeholder:text-muted transition-[border-color,box-shadow] hover:border-line-strong focus-visible:border-accent-line focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent-soft"
      />
      <Kbd aria-hidden className="absolute end-3 top-1/2 -translate-y-1/2">
        /
      </Kbd>
    </form>
  );
}

export function Topbar({ onOpenMenu, menuOpen }: { onOpenMenu: () => void; menuOpen: boolean }) {
  const { today } = useSession();
  return (
    <header className="glass sticky top-0 z-40 border-b border-line/80 pt-[env(safe-area-inset-top)]">
      <div className="pad-safe flex h-(--topbar-h) items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label={t("shell.menu")}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          onClick={onOpenMenu}
        >
          <Menu />
        </Button>
        <div className="lg:hidden">
          <Brand compact />
        </div>
        <QuickSearch />
        <div className="ms-auto flex items-center gap-1.5">
          <Button asChild variant="ghost" size="icon" className="sm:hidden">
            <Link to="/risks" aria-label={t("shell.search")} viewTransition>
              <Search />
            </Link>
          </Button>
          <p className="hidden pe-2 text-xs text-muted xl:block">
            <time dateTime={today.iso}>
              {today.weekday} {longDate(today)}
            </time>
          </p>
          <ThemeMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
