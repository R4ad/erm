import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";
import type { Level } from "@/lib/types";

// «Risk/Level Badge» و «Risk/Score Chip» فیگما. رنگ چهار سطح جزو نسخه‌ی روش است (پایین سبز، متوسط زرد، بالا نارنجی،
// بحرانی قرمز) و با رتبه‌ی سطح انتخاب می‌شود؛ نام سطح همیشه نوشته می‌شود تا رنگ تنها نشانه نباشد.

export type RiskKey = "low" | "medium" | "high" | "critical" | "none";

export function riskKey(level: Pick<Level, "rank"> | null | undefined): RiskKey {
  if (!level) return "none";
  if (level.rank <= 1) return "low";
  if (level.rank === 2) return "medium";
  if (level.rank === 3) return "high";
  return "critical";
}

export const RISK_CLASSES: Record<RiskKey, { bg: string; fg: string; dot: string; border: string; solid: string }> = {
  low: { bg: "bg-risk-low-bg", fg: "text-risk-low-fg", dot: "bg-risk-low", border: "border-risk-low", solid: "#16a34a" },
  medium: {
    bg: "bg-risk-medium-bg",
    fg: "text-risk-medium-fg",
    dot: "bg-risk-medium",
    border: "border-risk-medium",
    solid: "#eab308",
  },
  high: { bg: "bg-risk-high-bg", fg: "text-risk-high-fg", dot: "bg-risk-high", border: "border-risk-high", solid: "#ea580c" },
  critical: {
    bg: "bg-risk-critical-bg",
    fg: "text-risk-critical-fg",
    dot: "bg-risk-critical",
    border: "border-risk-critical",
    solid: "#dc2626",
  },
  none: { bg: "bg-risk-none-bg", fg: "text-risk-none-fg", dot: "bg-risk-none", border: "border-risk-none", solid: "#94a3b8" },
};

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
