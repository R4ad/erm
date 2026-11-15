import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

// کارت صفحه‌های فیگما: زمینه‌ی سفید، حاشیه‌ی ۱ پیکسل border/default، گوشه‌ی ۱۰، بدون سایه.
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-panel", className)} {...props} />;
}

interface CardHeaderProps extends Omit<ComponentProps<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  /** سطح عنوان در ساختار صفحه؛ پیش‌فرض h2. */
  as?: "h2" | "h3";
  titleId?: string;
}

/** سرکارت فیگما: عنوان H3 (۱۵ SemiBold) و توضیح Caption زیرش در سمت راست، اقدام‌ها در سمت چپ. */
export function CardHeader({
  title,
  description,
  actions,
  icon,
  as: Heading = "h2",
  titleId,
  className,
  ...props
}: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-4 pb-2", className)} {...props}>
      {icon && (
        <span
          aria-hidden
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-subtle text-brand [&_svg]:size-[1.125rem]"
        >
          {icon}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Heading id={titleId} className="text-h3 font-semibold text-ink">
          {title}
        </Heading>
        {description && <p className="text-xs text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-4 pb-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

/** ردیف فهرست درون کارت با خط جداکننده‌ی پایین (ردیف‌های صف کار، طرح‌ها، پذیرش‌ها). */
export function CardRow({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("border-b border-line px-4 py-3 last:border-b-0", className)} {...props} />;
}
