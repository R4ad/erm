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

function subscribeMinute(notify: () => void) {
  const timer = window.setInterval(notify, 30_000);
  return () => window.clearInterval(timer);
}

const minuteNow = () => Math.floor(Date.now() / 60_000) * 60_000;

/** ساعت دیواری با دقت دقیقه برای «۲ دقیقه پیش»؛ هر دقیقه دوباره رندر می‌کند. */
export function useNow(): number {
  return useSyncExternalStore(subscribeMinute, minuteNow, minuteNow);
}
