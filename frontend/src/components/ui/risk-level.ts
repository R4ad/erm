import type { Level } from "@/lib/types";

// رنگ چهار سطح ریسک برای LevelBadge، ScoreChip و ماتریس‌ها و نمودارهای صفحه‌ها. رنگ‌ها جزو نسخه‌ی روش‌اند (پایین سبز،
// متوسط زرد، بالا نارنجی، بحرانی قرمز) و با رتبه‌ی سطح انتخاب می‌شوند. جدا از level-badge.tsx است تا آن فایل فقط
// کامپوننت صادر کند و Fast Refresh کار کند.

export type RiskKey = "low" | "medium" | "high" | "critical" | "none";

export function riskKey(level: Pick<Level, "rank"> | null | undefined): RiskKey {
  if (!level) return "none";
  if (level.rank <= 1) return "low";
  if (level.rank === 2) return "medium";
  if (level.rank === 3) return "high";
  return "critical";
}

export const RISK_CLASSES: Record<RiskKey, { bg: string; fg: string; dot: string; border: string; solid: string }> = {
  low: {
    bg: "bg-risk-low-bg",
    fg: "text-risk-low-fg",
    dot: "bg-risk-low",
    border: "border-risk-low",
    solid: "#16a34a",
  },
  medium: {
    bg: "bg-risk-medium-bg",
    fg: "text-risk-medium-fg",
    dot: "bg-risk-medium",
    border: "border-risk-medium",
    solid: "#eab308",
  },
  high: {
    bg: "bg-risk-high-bg",
    fg: "text-risk-high-fg",
    dot: "bg-risk-high",
    border: "border-risk-high",
    solid: "#ea580c",
  },
  critical: {
    bg: "bg-risk-critical-bg",
    fg: "text-risk-critical-fg",
    dot: "bg-risk-critical",
    border: "border-risk-critical",
    solid: "#dc2626",
  },
  none: {
    bg: "bg-risk-none-bg",
    fg: "text-risk-none-fg",
    dot: "bg-risk-none",
    border: "border-risk-none",
    solid: "#94a3b8",
  },
};
