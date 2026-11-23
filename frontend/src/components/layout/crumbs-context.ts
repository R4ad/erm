import { createContext, useContext, useEffect } from "react";

import type { Crumb } from "@/components/ui/breadcrumb";

// مسیر صفحه در نوار بالا (فیگما: «خانه › گروه › صفحه»). پیش‌فرض از پیوند فعال منو ساخته می‌شود؛ صفحه‌ی پرونده
// (ریسک، ارزیابی، طرح) تکه‌های خودش را با usePageCrumbs می‌گذارد. CrumbsProvider در crumbs.tsx است تا آن فایل فقط
// کامپوننت صادر کند و Fast Refresh کار کند.

type Setter = (crumbs: Crumb[] | null) => void;

export const CrumbsContext = createContext<{ crumbs: Crumb[] | null; setCrumbs: Setter } | null>(null);

export function usePageCrumbsValue() {
  return useContext(CrumbsContext)?.crumbs ?? null;
}

/** تکه‌های مسیر این صفحه، بعد از «خانه». آخرین تکه صفحه‌ی فعلی است. */
export function usePageCrumbs(crumbs: Crumb[] | null) {
  const setCrumbs = useContext(CrumbsContext)?.setCrumbs;
  const key = crumbs ? JSON.stringify(crumbs) : "";
  useEffect(() => {
    if (!setCrumbs) return;
    setCrumbs(key ? (JSON.parse(key) as Crumb[]) : null);
    return () => setCrumbs(null);
  }, [key, setCrumbs]);
}
