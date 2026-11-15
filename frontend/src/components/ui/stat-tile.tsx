import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

// کارت شمار بالای صفحه‌ها (کارهای من، جهان ریسک): یک عدد بزرگ، برچسبش و یک خط توضیح. همه‌ی صفحه‌ها همین یکی را
// به کار می‌برند تا شمارها در کل سامانه یک شکل باشند.

export type StatTone = "neutral" | "danger" | "warning" | "success";

const TONES: Record<StatTone, string> = {
  neutral: "text-accent-text",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
};

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  /** عدد یا متن آماده (درصد، خط تیره)؛ قالب‌بندی رقم با خود صفحه است. */
  value: string;
  hint?: string;
  icon?: LucideIcon;
  /** رنگ فقط وقتی به عدد می‌خورد که مقدارش هشدار باشد؛ رنگ تنها نشانه نیست و برچسب همیشه نوشته می‌شود. */
  tone?: StatTone;
  /** عدد را رنگی کن (مثل «مهلت گذشته» وقتی بزرگ‌تر از صفر است). */
  emphasize?: boolean;
}) {
  const accent = TONES[tone];
  return (
    <Card className="flex flex-col gap-2 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs text-muted">{label}</p>
          <p className={cn("text-display font-bold tabular", tone === "neutral" ? "text-fg" : accent)}>{value}</p>
        </div>
        {Icon && (
          <span
            aria-hidden
            className={cn("grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface", accent)}
          >
            <Icon className="size-5" />
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </Card>
  );
}
