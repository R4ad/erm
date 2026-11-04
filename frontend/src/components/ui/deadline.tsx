import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/cn";
import { daysLeft, isDeadline, longDate } from "@/lib/format";
import type { Day, Deadline as DeadlineValue } from "@/lib/types";

/** مهلت با کلمه («۳ روز مانده») و تاریخ کامل زیرش؛ مهلت گذشته قرمز و مهلت نزدیک کهربایی است. */
export function Deadline({
  value,
  label = "مهلت",
  className,
}: {
  value: DeadlineValue | Day | null;
  label?: string;
  className?: string;
}) {
  if (!value) return null;
  if (!isDeadline(value)) {
    return (
      <time dateTime={value.iso} className={cn("text-xs text-muted", className)}>
        {longDate(value)}
      </time>
    );
  }
  const tone = value.overdue ? "text-danger" : value.days_left <= 3 ? "text-warning" : "text-fg";
  return (
    <span className={cn("inline-flex items-start gap-2 text-start", className)}>
      <CalendarClock aria-hidden className={cn("mt-0.5 size-4 shrink-0", tone)} />
      <span className="flex flex-col leading-5">
        <span className={cn("text-sm font-medium whitespace-nowrap", tone)}>{daysLeft(value)}</span>
        <span className="text-xs text-muted whitespace-nowrap">
          <span className="sr-only">{label}: </span>
          <time dateTime={value.iso}>{longDate(value)}</time>
        </span>
      </span>
    </span>
  );
}
