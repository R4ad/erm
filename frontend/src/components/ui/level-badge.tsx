import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import type { Level } from "@/lib/types";

import { RISK_CLASSES, riskKey } from "./risk-level";

// «Risk/Level Badge» و «Risk/Score Chip» فیگما. رنگ سطح از risk-level.ts می‌آید؛ نام سطح همیشه نوشته می‌شود تا رنگ
// تنها نشانه نباشد.

/** نشان کپسولی سطح ریسک با نقطه‌ی رنگی؛ بدون سطح «ارزیابی‌نشده». */
export function LevelBadge({
  level,
  size = "md",
  className,
}: {
  level: Level | null;
  size?: "md" | "lg";
  className?: string;
}) {
  const key = riskKey(level);
  const tone = RISK_CLASSES[key];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "lg" ? "h-8 px-3.5 text-sm" : "h-[1.375rem] px-2.5 text-xs",
        tone.bg,
        tone.fg,
        className,
      )}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", tone.dot)} />
      <span>
        <span className="sr-only">سطح ریسک: </span>
        {level ? level.name : "ارزیابی‌نشده"}
      </span>
    </span>
  );
}

/** امتیاز ریسک (۱ تا ۲۵) در خانه‌ای با حاشیه‌ی رنگ سطح. */
export function ScoreChip({
  score,
  level,
  className,
  label,
}: {
  score: number | null;
  level: Pick<Level, "rank"> | null;
  className?: string;
  /** متن صفحه‌خوان؛ پیش‌فرض «امتیاز». */
  label?: string;
}) {
  const tone = RISK_CLASSES[score === null ? "none" : riskKey(level)];
  return (
    <span
      className={cn(
        "inline-grid h-7 min-w-9 shrink-0 place-items-center rounded-md border-[1.5px] px-1.5 text-sm font-semibold tabular",
        tone.bg,
        tone.fg,
        tone.border,
        className,
      )}
    >
      <span className="sr-only">{label ?? "امتیاز"}: </span>
      {score === null ? "—" : fa(score)}
    </span>
  );
}
