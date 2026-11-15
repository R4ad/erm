import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

/** `asSection` کارتی است که خودش یک بخش صفحه است و عنوان دارد (بخش‌های پرونده‌ها). */
export function Card({ className, asSection, ...props }: ComponentProps<"div"> & { asSection?: boolean }) {
  const Tag = asSection ? "section" : "div";
  return <Tag className={cn("rounded-2xl border border-line bg-panel shadow-card", className)} {...props} />;
}

interface CardHeaderProps extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** شمار ردیف‌های این کارت، کنار عنوان. بیرون از خود عنوان می‌ماند تا نام عنوان برای صفحه‌خوان عوض نشود. */
  count?: number;
  /** سطح عنوان در ساختار صفحه؛ پیش‌فرض h2. */
  as?: "h2" | "h3";
  titleId?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  count,
  as: Heading = "h2",
  titleId,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 px-5 pt-5 pb-3", className)} {...props}>
      {icon && (
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-surface text-accent-text [&_svg]:size-[1.125rem]"
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <Heading id={titleId} className="min-w-0 text-heading font-semibold text-fg">
            {title}
          </Heading>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted tabular">
              {formatNumber(count)}
            </span>
          )}
        </div>
        {description && <p className="text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5 text-xs text-muted", className)}
      {...props}
    />
  );
}
