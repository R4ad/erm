import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const tones = {
  neutral: "border-line bg-surface text-muted",
  accent: "border-accent-line/60 bg-accent-soft text-accent-text",
  success: "border-success/25 bg-success-soft text-success",
  warning: "border-warning/30 bg-warning-soft text-warning",
  danger: "border-danger/30 bg-danger-soft text-danger",
  info: "border-info/25 bg-info-soft text-info",
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
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3.5",
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

/** شمار کوچک کنار عنوان بخش یا زبانه. */
export function Count({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1.5 text-[0.6875rem] font-semibold text-muted tabular",
        className,
      )}
    >
      {value}
    </span>
  );
}
