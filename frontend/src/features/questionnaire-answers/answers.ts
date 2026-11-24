import { fa } from "@/lib/format";
import type { AnswerImpact, AnswerSummary, AnswerValues } from "@/lib/types";

// گام‌ها، متن پرسش‌ها و قاعده‌های ویزارد «پاسخ به پرسشنامه‌ها» (فریم‌های 30 تا 30e). متن گام ۱ و ۵ تا ۸ عیناً از
// docs/design/copy.md است و پرسش و راهنمای گام ۲ تا ۴ همان متن «شناسایی ریسک» بی بخش انتخاب از کاتالوگ. جنگو همین
// قاعده‌ها را دوباره می‌سنجد (apps/questionnaires/answers.py).

export const STEPS = [
  { key: "service", label: "خدمت" },
  { key: "objective", label: "هدف یا تعهد" },
  { key: "conditions", label: "عامل و وضعیت" },
  { key: "responsibility", label: "داتین یا مشتری" },
  { key: "paths", label: "مسیر تحقق" },
  { key: "events", label: "رویداد مشخص" },
  { key: "impacts", label: "نوع و دامنه‌ی پیامد" },
  { key: "review", label: "بازبینی" },
] as const;

export type StepKey = (typeof STEPS)[number]["key"];
export type BasicKey = "service" | "objective" | "conditions" | "responsibility";
export const BASIC_KEYS: BasicKey[] = ["service", "objective", "conditions", "responsibility"];

export function isBasic(key: string): key is BasicKey {
  return (BASIC_KEYS as string[]).includes(key);
}

export const BASIC: Record<BasicKey, { question: string; hint: string }> = {
  service: {
    question: "موضوع بررسی کدام خدمت یا فرآیند است؟",
    hint: "نام خدمت یا فرآیند را همان‌طور که در واحد می‌شناسید بنویسید؛ کارشناس ریسک آن را با فهرست خدمت‌ها تطبیق می‌دهد.",
  },
  objective: {
    question: "کدام هدف یا تعهد مختل می‌شود؟",
    hint: "تعهد یا خروجی‌ای که مختل می‌شود؛ مثلاً «پردازش دستورها در پنجره‌ی SLA».",
  },
  conditions: {
    question: "چه علت یا شرایطی زمینه‌ی اختلال را فراهم می‌کند؟",
    hint: "علت یا وضعیتی که زمینه را فراهم می‌کند؛ مثلاً «ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار».",
  },
  responsibility: {
    question: "داتین، مشتری یا هر دو متأثرند؟",
    hint: "داتین، مشتری مشخص یا هر دو.",
  },
};

export const MESSAGES = {
  required: "این پرسش را پاسخ دهید.",
  noPath: "دست‌کم یک مسیر تحقق اضافه کنید.",
  emptyPath: "شرح این مسیر تحقق را بنویسید.",
  emptyEvent: "برای این مسیر یک رویداد بنویسید یا از رویدادهای قبلی انتخاب کنید.",
  noType: "دست‌کم یک نوع پیامد انتخاب کنید.",
  noScope: "دامنه‌ی پیامد را بنویسید.",
  noDescription: "شرح پیامد را بنویسید.",
};

export type Errors = Partial<Record<string, string[]>>;

export const fieldId = (name: string) => `answer-${name.replace(/\./g, "-")}`;
export const errorId = (name: string) => `${fieldId(name)}-error`;

/** کلید تازه برای مسیر یا رویداد؛ سرور فقط حرف و رقم و - و _ می‌پذیرد. */
export function newKey(prefix: "p" | "e"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
}

/** رویدادهایی که مسیرها به آن‌ها می‌رسند، به ترتیب اولین مسیر؛ با شماره‌ی رویداد و مسیرهای هر کدام. */
export function eventGroups(values: AnswerValues) {
  const texts = new Map(values.events.map((event) => [event.key, event.text]));
  const groups: { key: string; number: number; text: string; paths: number[] }[] = [];
  values.paths.forEach((path, index) => {
    const found = groups.find((group) => group.key === path.event);
    if (found) found.paths.push(index + 1);
    else
      groups.push({
        key: path.event,
        number: groups.length + 1,
        text: texts.get(path.event) ?? "",
        paths: [index + 1],
      });
  });
  return groups;
}

export function impactOf(values: AnswerValues, event: string): AnswerImpact {
  return values.impacts.find((impact) => impact.event === event) ?? { event, types: [], scope: "", description: "" };
}

/** مقدارها هم‌خوان با مسیرها: رویداد و پیامدی که دیگر مسیری به آن نمی‌رسد کنار می‌رود. */
export function tidy(values: AnswerValues): AnswerValues {
  const used = new Set(values.paths.map((path) => path.event));
  return {
    ...values,
    events: values.events.filter((event) => used.has(event.key)),
    impacts: values.impacts.filter((impact) => used.has(impact.event)),
  };
}

export function summary(values: AnswerValues): AnswerSummary {
  const groups = eventGroups(values).filter((group) => group.text.trim());
  const impacts = groups.filter((group) => {
    const impact = impactOf(values, group.key);
    return impact.types.length && impact.scope.trim() && impact.description.trim();
  });
  return { paths: values.paths.length, events: groups.length, impacts: impacts.length };
}

/** مشکل‌هایی که رفتن به گام بعد یا ارسال را نگه می‌دارند، برای یک گام. */
export function stepProblems(values: AnswerValues, step: StepKey): Errors {
  if (step === "review") return {};
  if (isBasic(step)) {
    return values[step].trim() ? {} : { [step]: [MESSAGES.required] };
  }
  const found: Errors = {};
  if (step === "paths") {
    if (!values.paths.length) found.paths = [MESSAGES.noPath];
    for (const path of values.paths) {
      if (!path.description.trim()) found[`paths.${path.key}`] = [MESSAGES.emptyPath];
    }
  }
  if (step === "events") {
    for (const group of eventGroups(values)) {
      if (group.text.trim()) continue;
      for (const number of group.paths) {
        const path = values.paths[number - 1];
        if (path) found[`paths.${path.key}.event`] = [MESSAGES.emptyEvent];
      }
    }
  }
  if (step === "impacts") {
    for (const group of eventGroups(values)) {
      if (!group.text.trim()) continue;
      const impact = impactOf(values, group.key);
      const key = `impacts.${group.key}`;
      if (!impact.types.length) found[`${key}.types`] = [MESSAGES.noType];
      if (!impact.scope.trim()) found[`${key}.scope`] = [MESSAGES.noScope];
      if (!impact.description.trim()) found[`${key}.description`] = [MESSAGES.noDescription];
    }
  }
  return found;
}

/** گام هر فیلد خطادار، برای رفتن به همان گام. */
export function stepOfField(name: string): StepKey {
  if (isBasic(name)) return name;
  // واحد پاسخنامه‌ی تازه کنار پرسش خدمت انتخاب می‌شود.
  if (name === "org_unit") return "service";
  if (name.startsWith("impacts.")) return "impacts";
  if (name.startsWith("events.") || /^paths\.[^.]+\.event$/.test(name)) return "events";
  if (name.startsWith("paths")) return "paths";
  return "review";
}

export function stepIndex(key: StepKey): number {
  return STEPS.findIndex((step) => step.key === key);
}

/**
 * مسیر دیگری که رویدادِ این مسیر را از «رویدادهای قبلی» انتخاب کرده است؛ تا آن مسیر عوض نشود این مسیر حذف نمی‌شود
 * (متن تأییدشده‌ی «حذف مسیری که رویدادش مشترک است»). شماره‌ی آن مسیر، یا null.
 */
export function sharedBy(values: AnswerValues, key: string): number | null {
  const index = values.paths.findIndex((path) => path.key === key);
  const path = values.paths[index];
  if (!path || values.paths.findIndex((item) => item.event === path.event) !== index) return null;
  const other = values.paths.findIndex((item, position) => position > index && item.event === path.event);
  return other < 0 ? null : other + 1;
}

export const sharedMessage = (number: number) =>
  `رویداد این مسیر در مسیر ${fa(number)} هم انتخاب شده است؛ اول آن مسیر را تغییر دهید.`;
