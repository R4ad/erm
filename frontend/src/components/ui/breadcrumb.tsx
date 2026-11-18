import { usePageCrumbs } from "@/components/layout/crumbs-context";

export interface Crumb {
  label: string;
  to?: string;
  code?: boolean;
}

/**
 * مسیر صفحه. در فیگما مسیر فقط در نوار بالا می‌آید («خانه › … › صفحه»)، پس این کامپوننت چیزی درون صفحه نمی‌کشد و
 * تکه‌ها را به نوار بالا می‌دهد. آخرین تکه صفحه‌ی فعلی است و پیوند ندارد.
 */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  usePageCrumbs(items);
  return null;
}
