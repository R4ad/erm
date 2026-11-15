import type { ReactNode } from "react";

import { usePageCrumbs } from "@/components/layout/crumbs";
import { cn } from "@/lib/cn";

import type { Crumb } from "./breadcrumb";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** تکه‌های مسیر این صفحه بعد از «خانه»؛ مثل فیگما در نوار بالا نشان داده می‌شوند، نه درون صفحه. */
  breadcrumb?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

/** سرصفحه‌ی فیگما: عنوان H1 (۲۲ Bold) و توضیح ۱۳ زیرش در راست، گروه اقدام‌ها در چپ با اقدام اصلی در انتهای چپ. */
export function PageHeader({ title, description, breadcrumb, actions, meta, className }: PageHeaderProps) {
  usePageCrumbs(breadcrumb ?? null);
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-h1 font-bold text-ink">{title}</h1>
            {meta}
          </div>
          {description && <p className="max-w-3xl text-sm text-ink-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
