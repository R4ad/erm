import { cn } from "@/lib/cn";
import { fa, isDeadline, longDate, shortDate } from "@/lib/format";
import type { Day, Deadline as DeadlineValue } from "@/lib/types";

import { Icon } from "./icon";

/** متن مهلت مثل فیگما: «امروز»، «۲ روز دیگر»، «۳ روز تأخیر». */
function dueText(value: DeadlineValue): string {
  const days = value.days_left;
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  if (days > 1) return `${fa(days)} روز دیگر`;
  return `${fa(-days)} روز تأخیر`;
}

function dueTone(value: DeadlineValue | null | undefined): string {
  if (!value) return "text-ink-3";
  if (value.overdue || value.days_left <= 0) return "text-danger";
  if (value.days_left <= 1) return "text-warning";
  return "text-ink-2";
}

/** مهلت فشرده با آیکون ساعت (ستون مهلت صف کارها): گذشته و امروز قرمز، فردا کهربایی، بقیه خاکستری. */
export function DueLabel({
  value,
  text,
  emptyText = "بدون مهلت",
  className,
}: {
  value: DeadlineValue | null | undefined;
  /** متن جایگزین وقتی مهلت به روز کاری شمرده می‌شود («۱ روز کاری»). */
  text?: string | null;
  emptyText?: string;
  className?: string;
}) {
  const tone = dueTone(value);
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap", tone, className)}>
      <Icon name="clock" size={14} />
      {value ? (
        <time dateTime={value.iso} title={longDate(value)}>
          {text || dueText(value)}
        </time>
      ) : (
        emptyText
      )}
    </span>
  );
}

/** مهلت با کلمه و تاریخ شمسی زیرش؛ مهلت گذشته قرمز با آیکون ساعت. */
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
      <time dateTime={value.iso} className={cn("text-xs text-ink-2", className)}>
        {shortDate(value)}
      </time>
    );
  }
  const tone = dueTone(value);
  return (
    <span className={cn("inline-flex items-start gap-1.5 text-start", className)}>
      <Icon name="clock" size={14} className={cn("mt-[3px]", tone)} />
      <span className="flex flex-col">
        <span className={cn("text-sm font-medium whitespace-nowrap", tone)}>{dueText(value)}</span>
        <span className="text-xs whitespace-nowrap text-ink-3">
          <span className="sr-only">{label}: </span>
          <time dateTime={value.iso}>{shortDate(value)}</time>
        </span>
      </span>
    </span>
  );
}
