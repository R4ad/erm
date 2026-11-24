import type { Tone } from "@/components/ui/badge";

/** لحن نشان وضعیت گردش کار ریسک در رجیستر و پرونده (فیگما ۰۳ و ۰۴). */
export const STATUS_TONES: Record<string, Tone> = {
  questions: "warning",
  analysis: "neutral",
  registered: "neutral",
  submitted: "neutral",
  assessment: "info",
  treatment_plan: "warning",
  treatment: "brand",
  review: "gold",
  closed: "success",
  rejected: "danger",
};
