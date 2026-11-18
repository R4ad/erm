import { useState, type ReactNode } from "react";

import type { Crumb } from "@/components/ui/breadcrumb";

import { CrumbsContext } from "./crumbs-context";

// نگه‌دارنده‌ی مسیر صفحه برای نوار بالا؛ هوک‌ها و توضیح در crumbs-context.ts.
export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[] | null>(null);
  return <CrumbsContext.Provider value={{ crumbs, setCrumbs }}>{children}</CrumbsContext.Provider>;
}
