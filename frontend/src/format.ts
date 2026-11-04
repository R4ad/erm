import type { Day, Deadline, Moment } from "./types";

// سرور تاریخ شمسی را به شکل 1405/08/13 می‌دهد؛ این‌جا فقط شکل نمایشش ساخته می‌شود: رقم فارسی و نام ماه.

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** رقم‌های لاتین هر متن یا عددی را فارسی می‌کند؛ بقیه‌ی نویسه‌ها دست نمی‌خورند. */
export function fa(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

// کد رکوردها (RK-1405-0012، CT-0001، دسته‌ی T1) لاتین می‌ماند تا با صفحه‌های جنگو و جست‌وجو یکی باشد.
const CODE = /([A-Z]{1,4}[0-9]*(?:-[0-9]+)+|\b[A-Z][0-9]+\b)/;

/** مثل fa، ولی کدهای رکورد درون متن را دست نمی‌زند؛ برای پیام‌ها و برچسب‌هایی که از سرور می‌آیند. */
export function faText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(CODE)
    .map((part, index) => (index % 2 === 1 ? part : fa(part)))
    .join("");
}

/** 1405/08/13 → ۱۴۰۵/۰۸/۱۳ */
export function shortDate(day: Day | Moment | null | undefined): string {
  if (!day) return "";
  return fa(day.jalali.split(" ")[0]);
}

/** 1405/08/13 → ۱۳ آبان ۱۴۰۵ */
export function longDate(day: Day | Moment | null | undefined): string {
  if (!day) return "";
  const [year, month, date] = day.jalali.split(" ")[0].split("/").map(Number);
  return `${fa(date)} ${MONTHS[month - 1]} ${fa(year)}`;
}

/** 1405/08/13 14:30 → ۱۳ آبان ۱۴۰۵، ساعت ۱۴:۳۰ */
export function dateTime(moment: Moment | null | undefined): string {
  if (!moment) return "";
  const time = moment.jalali.split(" ")[1];
  return time ? `${longDate(moment)}، ساعت ${fa(time)}` : longDate(moment);
}

export function isDeadline(value: Day | Deadline | null | undefined): value is Deadline {
  return Boolean(value && "days_left" in value);
}

/** مهلت به زبان آدم: «۳ روز مانده»، «مهلت امروز»، «۲ روز گذشته». */
export function daysLeft(deadline: Deadline): string {
  const days = deadline.days_left;
  if (days === 0) return "مهلت امروز";
  if (days === 1) return "تا فردا";
  if (days > 1) return `${fa(days)} روز مانده`;
  return `${fa(-days)} روز گذشته`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${fa(bytes)} بایت`;
  if (bytes < 1024 * 1024) return `${fa(Math.round(bytes / 1024))} کیلوبایت`;
  return `${fa((bytes / (1024 * 1024)).toFixed(1)).replace(".", "٫")} مگابایت`;
}

/** شمار با نام چیز: «۳ ریسک»، و برای صفر «هیچ ریسکی». */
export function count(value: number, noun: string): string {
  return value === 0 ? `هیچ ${noun}ی` : `${fa(value)} ${noun}`;
}
