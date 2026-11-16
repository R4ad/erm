import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

export type ChipTone = "neutral" | "success" | "warning" | "info" | "brand" | "danger";

// کارت صفحه‌های تازه‌ی فیگما (شناسایی، آنالیز، ...): سرکارت با خط جداکننده، عنوان H3، توضیح ۱۳ و نشان یا اقدام در
// سمت چپ؛ و تراشه‌ی کپسولی ۲۲ پیکسلی که شمار و وضعیت کوتاه را نشان می‌دهد.

/** کارت فیگما با سرکارت جداشده: عنوان H3، توضیح ۱۳ و نشان یا اقدام در سمت چپ. */
export function SectionPanel({
  id: anchor,
  title,
  description,
  aside,
  children,
  className,
  bodyClassName,
}: {
  /** شناسه‌ی پیوند درون صفحه، مثل #method-base. */
  id?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const id = useId();
  return (
    <Card
      id={anchor}
      role="region"
      aria-labelledby={id}
      className={cn("overflow-hidden", anchor && "scroll-mt-20", className)}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <div className="flex min-w-[min(100%,15rem)] flex-1 flex-col gap-0.5">
          <h2 id={id} className="text-h3 font-semibold text-ink">
            {title}
          </h2>
          {description && <p className="text-sm leading-[1.375rem] text-ink-3">{description}</p>}
        </div>
        {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
      </div>
      <div className={cn("px-5 py-4", bodyClassName)}>{children}</div>
    </Card>
  );
}

export function Chip({ tone = "neutral", children }: { tone?: ChipTone; children: ReactNode }) {
  const tones = {
    neutral: "bg-subtle text-ink-2",
    success: "bg-success-subtle text-success",
    warning: "bg-warning-subtle text-warning",
    info: "bg-info-subtle text-info",
    brand: "bg-brand-subtle text-brand",
    danger: "bg-danger-subtle text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
