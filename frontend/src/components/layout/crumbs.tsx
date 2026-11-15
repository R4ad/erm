import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { Crumb } from "@/components/ui/breadcrumb";

// مسیر صفحه در نوار بالا (فیگما: «خانه › گروه › صفحه»). پیش‌فرض از پیوند فعال منو ساخته می‌شود؛ صفحه‌ی پرونده
// (ریسک، ارزیابی، طرح) تکه‌های خودش را با usePageCrumbs می‌گذارد.

type Setter = (crumbs: Crumb[] | null) => void;

const CrumbsContext = createContext<{ crumbs: Crumb[] | null; setCrumbs: Setter } | null>(null);

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  return <CrumbsContext.Provider value={{ crumbs, setCrumbs }}>{children}</CrumbsContext.Provider>;
}

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
