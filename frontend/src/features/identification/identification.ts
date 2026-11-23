import type { IdentificationChoices, IdentificationPart, IdentificationValues } from "@/lib/types";

// منطق ویزارد شناسایی که به رندر بسته نیست: کدام فیلد مال کدام گام است، پیشنهاد خدمت از نوشته‌ی پرسش اول، واحدی که
// سرور خودکار انتخاب می‌کند، عنوان و شرحی که در رجیستر ثبت می‌شود، و «شرط پذیرش ورودی».

export type PartName = IdentificationPart["name"];
export type StepKey = PartName | "review";
export type Target = IdentificationChoices["target"][number];
export type Unit = IdentificationChoices["org_unit"][number];

export const REVIEW = "review" as const;

/** شناسه‌ی هر فیلد ویزارد، تا پیوند فهرست خطا و فوکوس بعد از هر جابه‌جایی آن را پیدا کنند. */
export const fieldId = (name: string) => `identification-${name}`;
export const errorId = (name: string) => `${fieldId(name)}-error`;

/**
 * گامی که خطای هر فیلد در آن نشان داده می‌شود. خدمت (target) و واحد پشت صحنه‌ی پرسش اول‌اند؛ هر فیلد ناشناخته (و
 * شاهد، پیامد، وابستگی و فایل) در «بازبینی» است.
 */
export function stepOfField(field: string, parts: IdentificationPart[]): StepKey {
  if (field === "target" || field === "org_unit") return parts[0]?.name ?? REVIEW;
  return parts.find((part) => part.name === field)?.name ?? REVIEW;
}

/** «ي» و «ك» عربی و نیم‌فاصله همان فارسی و فاصله‌اند، تا «ساتنا» با هر صفحه‌کلیدی پیدا شود. */
export function normalize(text: string): string {
  return text
    .replace(/[ي]/g, "ی")
    .replace(/[ك]/g, "ک")
    .replace(/[‌‏‎]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * خدمت‌هایی که برچسبشان همه‌ی واژه‌های نوشته‌شده را دارد، به همان ترتیب فهرست سرور. اگر هیچ خدمتی همه را نداشت
 * (مثلاً موضوعی که مدیر واحد آزاد نوشته، «سامانه‌ی ساتنا در محیط تولید»)، خدمت‌هایی که دست‌کم یکی از واژه‌های
 * سه‌حرفی یا بلندتر را دارند، با بیشترین واژه‌ی یافته اول؛ واژه‌های کوتاه‌تر («در»، «و») تقریباً در هر نامی هستند.
 */
export function matchTargets(query: string, targets: Target[]): Target[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return targets;
  const labels = targets.map((target) => normalize(target.label));
  const every = targets.filter((_, index) => words.every((word) => labels[index]?.includes(word)));
  if (every.length) return every;
  const long = words.filter((word) => word.length >= 3);
  return targets
    .map((target, index) => ({ target, hits: long.filter((word) => labels[index]?.includes(word)).length }))
    .filter((item) => item.hits > 0)
    .sort((first, second) => second.hits - first.hits)
    .map((item) => item.target);
}

/**
 * مقدارهایی که انتخاب یک خدمت پیشنهادی می‌گذارد. موضوع وقتی نام خدمت می‌شود که خالی است یا فقط بخشی از همان نام را
 * برای جست‌وجو تایپ کرده‌اند؛ متنی که کاربر خودش نوشته («ساتنا · محیط تولید») عوض نمی‌شود. مشتری و هدف مثل همیشه
 * فقط اگر خالی باشند از خدمت و تعهد پیشنهاد می‌شوند.
 */
export function withTarget(values: IdentificationValues, target: Target): IdentificationValues {
  const typed = normalize(values.subject);
  const searching = !typed || normalize(target.service.name).includes(typed);
  return {
    ...values,
    target: target.value,
    subject: searching ? target.service.name : values.subject,
    customer: values.customer.trim()
      ? values.customer
      : target.customer
        ? `${target.customer} و داتین`
        : "همه‌ی مشتریان",
    objective: values.objective.trim() || !target.commitment ? values.objective : target.commitment,
  };
}

/** همان انتخاب auto_unit سرور: تنها واحد کاربر، وگرنه واحد مالک خدمت اگر جزو واحدهای کاربر است. */
export function autoUnit(choices: IdentificationChoices, targetValue: string): Unit | null {
  if (choices.org_unit.length === 1) return choices.org_unit[0] ?? null;
  const target = choices.target.find((item) => item.value === targetValue);
  if (!target?.unit) return null;
  return choices.org_unit.find((unit) => unit.value === target.unit) ?? null;
}

/** شرح ریسک با الگوی بخش ۴ روش، همان narrative سرور؛ جزء بی‌جواب «…» است. */
export function narrative(values: IdentificationValues): string {
  const part = (name: PartName) => values[name].trim() || "…";
  return (
    `در خدمت یا فرآیند ${part("subject")}، به علت یا در شرایط ${part("conditions")}، ممکن است ${part("event")} ` +
    `رخ دهد و انجام ${part("objective")} برای ${part("customer")} را مختل کند. ` +
    `پیامد قابل مشاهده‌ی آن ${part("harm")} است.`
  );
}

/** عنوان ریسک همان رویداد است، با نام خدمت اگر رویداد آن را نگفته باشد (risk_title سرور). */
export function riskTitle(event: string, service: string | null): string {
  const text = event.split(/\s+/).filter(Boolean).join(" ");
  if (!text) return "";
  return (service && !text.includes(service) ? `${text} در ${service}` : text).slice(0, 300);
}

export interface EntryCheck {
  key: string;
  label: string;
  met: boolean;
}

/** شاخص‌های «شرط پذیرش ورودی»: هدف، رویداد، دامنه‌ی خدمت و مشتری، مالک و شاهد یا فرض قابل آزمون. */
export function entryChecks(values: IdentificationValues, owner: string | null) {
  const filled = (text: string) => text.trim().length > 0;
  const evidence: "met" | "assumption" | "missing" = values.evidence_items.length
    ? "met"
    : filled(values.evidence)
      ? "assumption"
      : "missing";
  const checks: EntryCheck[] = [
    { key: "objective", label: "هدف یا تعهد مشخص", met: filled(values.objective) },
    { key: "event", label: "رویداد مشخص", met: filled(values.event) },
    { key: "scope", label: "دامنه‌ی خدمت و مشتری", met: Boolean(values.target) && filled(values.customer) },
    { key: "owner", label: owner ? `مالک: ${owner}` : "مالک ریسک", met: Boolean(owner) },
  ];
  return {
    checks,
    evidence,
    met: checks.filter((check) => check.met).length + (evidence === "met" ? 1 : 0),
    total: checks.length + 1,
  };
}
