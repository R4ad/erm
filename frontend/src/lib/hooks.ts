import { useEffect, useState, useSyncExternalStore } from "react";

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
