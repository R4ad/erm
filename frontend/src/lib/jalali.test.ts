import { describe, expect, it } from "vitest";

import {
  addDays,
  addMonths,
  describeJalali,
  formatJalali,
  isLeapYear,
  latinDigits,
  monthLength,
  parseJalali,
  toGregorian,
  toJalali,
  weekdayIndex,
} from "./jalali";

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

describe("Jalali calendar", () => {
  it("converts known days both ways", () => {
    // نوروزها و روزهایی که با jdatetime سنجیده شده‌اند.
    const pairs: [string, [number, number, number]][] = [
      ["2026-03-21", [1405, 1, 1]],
      ["2025-03-21", [1404, 1, 1]],
      ["2024-03-20", [1403, 1, 1]],
      ["2026-11-04", [1405, 8, 13]],
      ["2025-03-20", [1403, 12, 30]],
      ["2000-01-01", [1378, 10, 11]],
    ];
    for (const [day, [year, month, date]] of pairs) {
      const [y, m, d] = day.split("-").map(Number) as [number, number, number];
      expect(toJalali(new Date(y, m - 1, d))).toEqual({ year, month, day: date });
      expect(iso(toGregorian({ year, month, day: date }))).toBe(day);
    }
  });

  it("knows leap years and month lengths", () => {
    expect(isLeapYear(1403)).toBe(true);
    expect(isLeapYear(1404)).toBe(false);
    expect(isLeapYear(1408)).toBe(true);
    expect(monthLength(1405, 1)).toBe(31);
    expect(monthLength(1405, 7)).toBe(30);
    expect(monthLength(1403, 12)).toBe(30);
    expect(monthLength(1404, 12)).toBe(29);
  });

  it("moves by days and months across year ends", () => {
    expect(addDays({ year: 1404, month: 12, day: 29 }, 1)).toEqual({ year: 1405, month: 1, day: 1 });
    expect(addDays({ year: 1405, month: 1, day: 1 }, -1)).toEqual({ year: 1404, month: 12, day: 29 });
    expect(addMonths({ year: 1405, month: 6, day: 31 }, 1)).toEqual({ year: 1405, month: 7, day: 30 });
    expect(addMonths({ year: 1405, month: 1, day: 15 }, -1)).toEqual({ year: 1404, month: 12, day: 15 });
    expect(addMonths({ year: 1403, month: 12, day: 30 }, 12)).toEqual({ year: 1404, month: 12, day: 29 });
  });

  it("starts the week on Saturday", () => {
    expect(weekdayIndex({ year: 1405, month: 8, day: 9 })).toBe(0); // شنبه
    expect(weekdayIndex({ year: 1405, month: 8, day: 13 })).toBe(4); // چهارشنبه
    expect(describeJalali({ year: 1405, month: 8, day: 13 })).toBe("چهارشنبه ۱۳ آبان ۱۴۰۵");
  });

  it("reads typed dates the way Django does, with Persian or Arabic digits", () => {
    expect(parseJalali("1405/8/9")).toEqual({ year: 1405, month: 8, day: 9 });
    expect(parseJalali("۱۴۰۵/۰۸/۰۹")).toEqual({ year: 1405, month: 8, day: 9 });
    expect(parseJalali("١٤٠٥-٠٨-٠٩")).toEqual({ year: 1405, month: 8, day: 9 });
    expect(parseJalali(" 1403/12/30 ")).toEqual({ year: 1403, month: 12, day: 30 });
    expect(latinDigits("۱۲۳٤٥")).toBe("12345");
    expect(formatJalali({ year: 1405, month: 8, day: 9 })).toBe("1405/08/09");
  });

  it("refuses dates that do not exist or are out of Django's range", () => {
    for (const text of ["1404/12/30", "1405/13/01", "1405/07/31", "1405/00/10", "1299/01/01", "1405/8", "abc", ""]) {
      expect(parseJalali(text), text).toBeNull();
    }
  });
});
