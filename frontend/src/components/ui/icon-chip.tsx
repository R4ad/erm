import { cn } from "@/lib/cn";

import { Icon, type IconName } from "./icon";

// مربع آیکون رنگی صفحه‌های فیگما (کاشی شاخص، ردیف صف کار): زمینه‌ی کم‌رنگ و آیکون با رنگ پررنگ همان لحن.
const tones = {
  brand: "bg-brand-subtle text-brand",
  danger: "bg-danger-subtle text-danger",
  warning: "bg-warning-subtle text-warning",
  success: "bg-success-subtle text-success",
  info: "bg-info-subtle text-info",
  gold: "bg-gold-subtle text-gold",
  neutral: "bg-subtle text-ink-2",
} as const;

export type ChipTone = keyof typeof tones;

const sizes = {
  sm: { box: "size-7 rounded-md", icon: 16 },
  md: { box: "size-8 rounded-lg", icon: 18 },
  lg: { box: "size-9 rounded-lg", icon: 20 },
} as const;

export function IconChip({
  icon,
  tone = "brand",
  size = "md",
  className,
}: {
  icon: IconName;
  tone?: ChipTone;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center", sizes[size].box, tones[tone], className)}>
      <Icon name={icon} size={sizes[size].icon} />
    </span>
  );
}
