import { describe, expect, it } from "vitest";

import { count, dateTime, daysLeft, fa, faText, fileSize, longDate, shortDate } from "./format";

const deadline = (days_left: number) => ({ iso: "", jalali: "1405/08/13", days_left, overdue: days_left < 0 });

describe("format", () => {
  it("writes digits in Persian", () => {
    expect(fa("R-1405-012")).toBe("R-۱۴۰۵-۰۱۲");
    expect(fa(0)).toBe("۰");
    expect(fa(null)).toBe("");
  });

  it("keeps record codes Latin inside server text", () => {
    expect(faText("جواب پرسش ریسک RK-1405-0012 ثبت شد.")).toBe("جواب پرسش ریسک RK-1405-0012 ثبت شد.");
    expect(faText("پاسخ ارسال شد. ریسک در انتظار: 2")).toBe("پاسخ ارسال شد. ریسک در انتظار: ۲");
    expect(faText("CT-0001 و دسته‌ی T1، امتیاز 12")).toBe("CT-0001 و دسته‌ی T1، امتیاز ۱۲");
  });

  it("shows Jalali dates from the server string", () => {
    const day = { iso: "2026-11-04", jalali: "1405/08/13" };
    expect(shortDate(day)).toBe("۱۴۰۵/۰۸/۱۳");
    expect(longDate(day)).toBe("۱۳ آبان ۱۴۰۵");
    expect(longDate({ iso: "", jalali: "1405/01/01" })).toBe("۱ فروردین ۱۴۰۵");
    expect(longDate({ iso: "", jalali: "1405/12/29" })).toBe("۲۹ اسفند ۱۴۰۵");
    expect(dateTime({ iso: "", jalali: "1405/08/13 09:05" })).toBe("۱۳ آبان ۱۴۰۵، ساعت ۰۹:۰۵");
  });

  it("says how far a deadline is", () => {
    expect(daysLeft(deadline(0))).toBe("مهلت امروز");
    expect(daysLeft(deadline(1))).toBe("تا فردا");
    expect(daysLeft(deadline(12))).toBe("۱۲ روز مانده");
    expect(daysLeft(deadline(-3))).toBe("۳ روز گذشته");
  });

  it("writes sizes and counts in Persian", () => {
    expect(fileSize(2048)).toBe("۲ کیلوبایت");
    expect(fileSize(3 * 1024 * 1024)).toBe("۳٫۰ مگابایت");
    expect(count(0, "ریسک")).toBe("هیچ ریسکی");
    expect(count(4, "ریسک")).toBe("۴ ریسک");
  });
});
