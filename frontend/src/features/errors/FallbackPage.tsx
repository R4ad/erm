import { useLocation } from "react-router-dom";

import { FormPage } from "@/features/forms/FormPage";
import { useSession } from "@/features/session/session";
import { isFormRoute } from "@/lib/routes";

import { NotFoundPage } from "./NotFoundPage";

/** نشانی‌ای که مسیر صریح ندارد: اگر جدول پیوندهای سرور آن را فرم می‌داند فرم عمومی، وگرنه «پیدا نشد». */
export function FallbackPage() {
  const { pathname } = useLocation();
  const { routes } = useSession();
  return isFormRoute(pathname, routes) ? <FormPage key={pathname} /> : <NotFoundPage />;
}
