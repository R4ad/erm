import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import type { IconName } from "./icon";
import { IconChip, type ChipTone } from "./icon-chip";

const valueTones = {
  ink: "text-ink",
  brand: "text-brand",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
} as const;

/**
 * «Stat Tile» فیگما: برچسب ۱۳ در راست و کاشی آیکون ۳۲ در چپ، عدد KPI (۳۲ Bold) و توضیح Caption زیرش. صفر، نامعلوم و
 * ثبت‌نشده با متن از هم جدا می‌شوند؛ مقدار را صفحه می‌سازد.
 */
export function StatTile({
  label,
  value,
  note,
  icon,
  aside,
  tone = "brand",
  valueTone = "ink",
  valueClassName,
  className,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** کاشی آیکون سمت چپ؛ به‌جایش می‌شود aside (مثلاً نشان سطح) داد یا هیچ‌کدام. */
  icon?: IconName;
  aside?: ReactNode;
  tone?: ChipTone;
  valueTone?: keyof typeof valueTones;
  valueClassName?: string;
  className?: string;
  /** بین عدد و توضیح، مثل نوار پیشرفت کاشی‌های درصدی. */
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-line bg-panel p-4", className)}>
      <div className="flex min-h-8 items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        {icon ? <IconChip icon={icon} tone={tone} /> : aside}
      </div>
      <span className={cn("text-kpi font-bold tabular", valueTones[valueTone], valueClassName)}>{value}</span>
      {children}
      {note && <span className="text-xs text-ink-3">{note}</span>}
    </div>
  );
}
