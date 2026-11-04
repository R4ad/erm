import { fa } from "./format";

// تبدیل تاریخ شمسی و میلادی برای تقویم انتخاب تاریخ، با الگوریتم تقویم جلالی (همان jalaali-js و jdatetime جنگو).
// سرور تاریخ را همیشه شمسی می‌گیرد و می‌دهد (1405/08/13)؛ این‌جا فقط برای ساختن جدول ماه و جابه‌جایی در آن است.

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

export const MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/** روزهای هفته از شنبه، که ستون اول تقویم شمسی است. */
export const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

const div = (a: number, b: number) => Math.trunc(a / b);
const mod = (a: number, b: number) => a - Math.trunc(a / b) * b;

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0] ?? -61;
  let jump = 0;
  for (let index = 1; index < BREAKS.length; index += 1) {
    const jm = BREAKS[index] ?? 0;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  const d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j += div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function toDayNumber({ year, month, day }: JalaliDate) {
  const { gy, march } = jalCal(year);
  return g2d(gy, 3, march) + (month - 1) * 31 - div(month, 7) * (month - 7) + day - 1;
}

function fromDayNumber(jdn: number): JalaliDate {
  const { gy } = d2g(jdn);
  let year = gy - 621;
  const calendar = jalCal(year);
  let k = jdn - g2d(gy, 3, calendar.march);
  if (k >= 0) {
    if (k <= 185) return { year, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    k -= 186;
  } else {
    year -= 1;
    k += 179;
    if (calendar.leap === 1) k += 1;
  }
  return { year, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

export function isLeapYear(year: number) {
  return jalCal(year).leap === 0;
}

export function monthLength(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isLeapYear(year) ? 30 : 29;
}

export function toJalali(date: Date): JalaliDate {
  return fromDayNumber(g2d(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

export function toGregorian(date: JalaliDate): Date {
  const { gy, gm, gd } = d2g(toDayNumber(date));
  return new Date(gy, gm - 1, gd);
}

/** چند روز جلو یا عقب (منفی). */
export function addDays(date: JalaliDate, days: number): JalaliDate {
  return fromDayNumber(toDayNumber(date) + days);
}

/** چند ماه جلو یا عقب؛ روز ۳۱ در ماه سی‌روزه روز آخر همان ماه می‌شود. */
export function addMonths(date: JalaliDate, months: number): JalaliDate {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, monthLength(year, month)) };
}

/** ستون روز در هفته‌ی شمسی: ۰ شنبه تا ۶ جمعه. */
export function weekdayIndex(date: JalaliDate): number {
  return (toGregorian(date).getDay() + 1) % 7;
}

export function sameDay(a: JalaliDate | null | undefined, b: JalaliDate | null | undefined) {
  return Boolean(a && b && a.year === b.year && a.month === b.month && a.day === b.day);
}

const LATIN_DIGITS: Record<string, string> = {};
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((digit, index) => (LATIN_DIGITS[digit] = String(index)));
"٠١٢٣٤٥٦٧٨٩".split("").forEach((digit, index) => (LATIN_DIGITS[digit] = String(index)));

/** رقم فارسی و عربی را لاتین می‌کند، مثل int() پایتون که جنگو با آن تاریخ را می‌خواند. */
export function latinDigits(text: string): string {
  return text.replace(/[۰-۹٠-٩]/g, (digit) => LATIN_DIGITS[digit] ?? digit);
}

/** متن 1405/8/9 یا ۱۴۰۵/۰۸/۰۹ (یا با -) به تاریخ، یا null اگر تاریخ درستی نیست. همان بازه‌ی سال جنگو. */
export function parseJalali(text: string): JalaliDate | null {
  const parts = latinDigits(text.trim()).replace(/-/g, "/").split("/");
  if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  const [year, month, day] = parts.map(Number) as [number, number, number];
  if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1 || day > monthLength(year, month)) return null;
  return { year, month, day };
}

/** شکل متنی که فرم جنگو می‌گیرد: 1405/08/09 */
export function formatJalali({ year, month, day }: JalaliDate): string {
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

/** «چهارشنبه ۱۳ آبان ۱۴۰۵» */
export function describeJalali(date: JalaliDate): string {
  return `${WEEKDAYS[weekdayIndex(date)]} ${fa(date.day)} ${MONTH_NAMES[date.month - 1]} ${fa(date.year)}`;
}
