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
  tone = "brand",
  valueTone = "ink",
  className,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  icon: IconName;
  tone?: ChipTone;
  valueTone?: keyof typeof valueTones;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border border-line bg-panel p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-2">{label}</span>
        <IconChip icon={icon} tone={tone} />
      </div>
      <span className={cn("text-kpi font-bold tabular", valueTones[valueTone])}>{value}</span>
      {note && <span className="text-xs text-ink-3">{note}</span>}
      {children}
    </div>
  );
}
