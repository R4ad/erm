import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

// «Status Badge» فیگما: گوشه‌ی ۴ (نه کپسول، تا با نشان سطح ریسک اشتباه نشود)، ارتفاع ۲۲، متن ۱۲ Medium، هفت لحن.
const tones = {
  neutral: "bg-subtle text-ink-2",
  info: "bg-info-subtle text-info",
  success: "bg-success-subtle text-success",
  warning: "bg-warning-subtle text-warning",
  danger: "bg-danger-subtle text-danger",
  brand: "bg-brand-subtle text-brand",
  gold: "bg-gold-subtle text-gold",
  /** نام قدیمی brand */
  accent: "bg-brand-subtle text-brand",
} as const;

export type Tone = keyof typeof tones;

interface BadgeProps extends ComponentProps<"span"> {
  tone?: Tone;
  dot?: boolean;
}

export function Badge({ tone = "neutral", dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.375rem] shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** شمار کوچک کپسولی (زبانه‌ها، عنوان بخش): ارتفاع ۱۸، متن ۱۲. */
export function Count({ value, active = false, className }: { value: string; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full px-1.5 text-xs font-medium tabular",
        active ? "bg-brand-subtle text-brand" : "bg-subtle text-ink-2",
        className,
      )}
    >
      {value}
    </span>
  );
}
