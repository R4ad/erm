import { locale } from "./i18n";
import type { Day, Deadline, Moment } from "./types";

// سرور تاریخ شمسی را به شکل 1405/08/13 می‌دهد (همان تبدیل صفحه‌های جنگو)؛ این‌جا فقط شکل نمایشش ساخته
// می‌شود: رقم محلی و نام ماه. عدد خالص با Intl و همان locale قالب می‌گیرد.

const numbers = new Intl.NumberFormat(locale.tag);
const LOCAL_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

/** رقم‌های لاتین هر متن یا عددی را فارسی می‌کند؛ بقیه‌ی نویسه‌ها دست نمی‌خورند. */
export function fa(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[0-9]/g, (digit) => LOCAL_DIGITS[Number(digit)] ?? digit);
}

/** عدد با رقم و جداکننده‌ی هزارگان محلی: 1234 → ۱٬۲۳۴ */
export function formatNumber(value: number): string {
  return numbers.format(value);
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
  const [year, month, date] = (day.jalali.split(" ")[0] ?? "").split("/").map(Number);
  if (!year || !month || !date) return fa(day.jalali);
  return `${fa(date)} ${MONTHS[month - 1]} ${fa(year)}`;
}

/** 1405/08/13 14:30 → ۱۳ آبان ۱۴۰۵، ساعت ۱۴:۳۰ */
export function dateTime(moment: Moment | null | undefined): string {
  if (!moment) return "";
  const time = moment.jalali.split(" ")[1];
  return time ? `${longDate(moment)}، ساعت ${fa(time)}` : longDate(moment);
}

/** زمان گذشته به زبان آدم: «همین حالا»، «۲ دقیقه پیش»، «۳ ساعت پیش» و بعد از یک روز تاریخ. */
export function ago(moment: Moment, now: number): string {
  const minutes = Math.floor((now - Date.parse(moment.iso)) / 60_000);
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${fa(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${fa(hours)} ساعت پیش`;
  return shortDate(moment);
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
  // «۲۰ مگابایت» به‌جای «۲۰٫۰ مگابایت»؛ کسر فقط وقتی هست که چیزی بگوید.
  return `${fa((bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")).replace(".", "٫")} مگابایت`;
}

/** بازه‌ی سطح یا امتیاز: «۶» یا «۳ تا ۴». */
export function band(value: readonly [number, number] | null | undefined): string {
  if (!value) return "";
  return value[0] === value[1] ? fa(value[0]) : `${fa(value[0])} تا ${fa(value[1])}`;
}

/** شمار با نام چیز: «۳ ریسک»، و برای صفر «هیچ ریسکی». */
export function count(value: number, noun: string): string {
  return value === 0 ? `هیچ ${noun}ی` : `${formatNumber(value)} ${noun}`;
}

/** فقط نشانی http و https به پیوند بیرونی تبدیل می‌شود؛ javascript: و data: و مانند آن متن ساده می‌مانند. */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

/** مقصد بعد از ورود فقط مسیری در همین سایت است (/app/...، /risks/...)، نه //سایت-دیگر. */
export function safeNext(value: string | null | undefined, fallback = "/app/"): string {
  if (!value || !/^\/(?![/\\])/.test(value)) return fallback;
  return value;
}
