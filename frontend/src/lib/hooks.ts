import { useEffect, useState, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";

import { t } from "./i18n";

export function useTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} | ${t("app.name")}` : t("app.name");
  }, [title]);
}

/** مقدار را بعد از delay میلی‌ثانیه سکون برمی‌گرداند؛ برای جست‌وجو هنگام تایپ. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline() {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (callback) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", callback);
      return () => list.removeEventListener("change", callback);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** بعد از بارگذاری، صفحه به #بخشی می‌رود که جنگو بعد از هر کار به آن برمی‌گرداند (#review، #progress، #path-12). */
export function useSectionFromHash(ready: boolean) {
  const { hash } = useLocation();
  useEffect(() => {
    if (!ready || !hash) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: "start" });
  }, [ready, hash]);
}

/**
 * کدام بخش صفحه الان جلوی چشم است، برای پررنگ کردن همان بخش در فهرست بخش‌ها. بخشی که بالاتر از همه از زیر نوار
 * بالا گذشته باشد انتخاب می‌شود، و تا وقتی هیچ‌کدام نگذشته‌اند، بخش اول.
 */
export function useActiveSection(ids: string[]): string | null {
  const key = ids.join(",");
  const [active, setActive] = useState<string | null>(ids[0] ?? null);
  useEffect(() => {
    const sections = key ? key.split(",") : [];
    if (sections.length === 0) return;
    function pick() {
      // مرز، کمی زیر نوار بالای چسبان است تا عنوان بخشی که تازه از زیرش رد شده فعال شمرده شود.
      const edge = (document.documentElement.clientHeight || 0) * 0.3;
      let current = sections[0] ?? null;
      for (const id of sections) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= edge) current = id;
      }
      setActive(current);
    }
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [key]);
  return active;
}
