import { fa } from "@/lib/format";
import type { AiRunFacts, BasicAnswerKey, Person, ReviewRisk, ReviewRisks } from "@/lib/types";

// متن‌های مشترک صفحه‌ی «بررسی یک پاسخنامه» (12a تا 12c)، عیناً از docs/design/copy.md و جدول تأییدشده‌ی
// docs/implementation-plan.md (بخش ۱۰).

export const BASIC_LABELS: Record<BasicAnswerKey, string> = {
  service: "خدمت",
  objective: "هدف یا تعهد",
  conditions: "عامل و وضعیت",
  responsibility: "داتین یا مشتری",
};

/** «۱»، «۱ و ۳»، «۱، ۲ و ۳». */
export function numberList(numbers: number[]): string {
  const items = numbers.map((n) => fa(n));
  if (items.length < 2) return items.join("");
  return `${items.slice(0, -1).join("، ")} و ${items.at(-1)}`;
}

/** «مسیر ۱ و ۳ ← رویداد ۱ ← پیامد ۱» (منبع ریسک پیشنهادی در 12c). */
export function sourceText(risk: ReviewRisk, withEvent = true): string {
  const parts = [`مسیر ${numberList(risk.source.paths)}`];
  if (withEvent && risk.source.event != null) parts.push(`رویداد ${fa(risk.source.event)}`);
  if (risk.source.impact != null) parts.push(`پیامد ${fa(risk.source.impact)}`);
  return parts.join(" ← ");
}

/** مرحله‌های پنل «در حال شناسایی» (12b) به ترتیب AiRun.stage. */
export function stageLabels(facts: AiRunFacts): string[] {
  return [
    `خواندن ${fa(facts.answers)} پاسخ و ${fa(facts.paths)} مسیر تحقق`,
    `تفکیک پیامدهای متمایز · ${fa(facts.impacts)} پیامد ← ${fa(facts.risks)} ریسک`,
    "استخراج عامل آغازگر، مسیر، رویداد هدف و پیامد",
    `مقایسه با ${fa(facts.registry)} ریسک ثبت‌شده در رجیستر`,
    "ثبت پیش‌نویس‌ها",
  ];
}

/** زمان تقریبی باقی‌مانده تا پایان شناسایی (پانویس 12a: حدود ۳۰ ثانیه)، به گام‌های ۵ ثانیه‌ای و دست‌کم ۵. */
export function secondsLeft(startedIso: string, now: number, total = 30): number {
  const elapsed = Math.max(0, (now - Date.parse(startedIso)) / 1000);
  return Math.max(5, Math.ceil((total - elapsed) / 5) * 5);
}

export const PROMPT_VERSION_LABEL = (version: string) => fa(Number(version.replace(/\D/g, "")) || 3);

/** عنوان سربرگ 12a نام خدمت بدون توضیح داخل پرانتز است: «پرداخت اینترنتی (درگاه پرداخت شاپرک)» ← «پرداخت اینترنتی». */
export function serviceTitle(service: string): string {
  return service.replace(/\s*\([^()]*\)\s*$/, "").trim() || service;
}

/**
 * ریسک‌هایی که در ۱۰ ثانیه‌ی بازگردانی‌اند «تأیید شد · آنالیز ریسک» نشان داده می‌شوند، با نام کاربر و بدون کد RK
 * که هنوز ساخته نشده است. شمارها هم با همین حساب می‌شوند.
 */
export function withApprovals(data: ReviewRisks, approving: ReadonlyMap<number, string>, me: Person): ReviewRisks {
  if (approving.size === 0) return data;
  const risks = data.risks.map((risk): ReviewRisk => {
    const at = approving.get(risk.id);
    if (at === undefined || risk.status.value !== "pending") return risk;
    return {
      ...risk,
      status: { value: "converted", label: "تأیید شد · آنالیز ریسک" },
      decided_by: { id: me.id, name: me.name },
      decided_at: { iso: at, jalali: "" },
    };
  });
  const count = (value: ReviewRisk["status"]["value"]) => risks.filter((risk) => risk.status.value === value).length;
  return {
    ...data,
    risks,
    counts: {
      total: risks.length,
      approved: count("converted"),
      dismissed: count("dismissed"),
      pending: count("pending"),
    },
  };
}
