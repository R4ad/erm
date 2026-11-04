import { useNavigate } from "react-router-dom";

import { leaveTo } from "@/lib/navigation";
import { toRoute } from "@/lib/routes";
import type { AppHref } from "@/lib/types";

import { useSession } from "./session";

/** مسیر React یک نشانی جنگو با جدول پیوندهای نشست، یا null اگر آن صفحه هنوز فقط در جنگو است. */
export function useRouteOf() {
  const { routes } = useSession();
  return (href: string | null | undefined) => toRoute(href, routes);
}

/** رفتن به صفحه‌ای که سرور گفته (مثلاً مقصد بعد از ذخیره): در همین رابط اگر هست، وگرنه صفحه‌ی جنگو. */
export function useGoTo() {
  const navigate = useNavigate();
  const routeOf = useRouteOf();
  return (target: AppHref | string | null | undefined, fallback = "/") => {
    const href = typeof target === "string" ? target : target?.href;
    const route = (typeof target === "object" && target?.route) || routeOf(href);
    if (route) void navigate(route, { viewTransition: true });
    else if (href) leaveTo(href);
    else void navigate(fallback);
  };
}
