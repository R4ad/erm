import type { Page } from "@playwright/test";

import { assessmentDetail } from "../src/test/fixtures";

import { expect, expectAccessible, reply, test, type ApiCall } from "./fixtures";

// ارزیابی‌ها در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو تم: پرونده‌ی ارزیابی با
// نتیجه‌ی موتور محاسبه و کنترل کیفیت، فرم پروفایل پیامد با چند فرم پیشونددار، فرم عامل آغازگر با جدول راهنما، و مقایسه.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("assessments", () => {
  test("shows the approved scope and target deadline without requiring a meeting", async ({ page, api }) => {
    const data = assessmentDetail();
    data.assessment.meeting_date = null;
    data.assessment.target_due = { iso: "2026-12-01", jalali: "1405/09/10" };
    data.assessment.scope_snapshot = {
      service: "خدمت در زمان تأیید",
      customers: [{ id: 7, name: "بانک در زمان تأیید" }],
      description: "دامنه ثابت",
    };
    api.on("GET pages/", () => data);
    await page.goto("/app/assessments/1");
    await expect(page.getByText("بدون جلسه (ارزیابی عادی)")).toBeVisible();
    await expect(page.getByText("موعد تحقق هدف", { exact: true })).toBeVisible();
    await expect(page.getByText("خدمت در زمان تأیید؛ بانک در زمان تأیید")).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
  });

  test("opens an assessment from its risk and sends it for quality control", async ({ page, api }) => {
    await page.goto("/app/risks/1?tab=assessments");
    await page.getByRole("tabpanel").getByRole("link", { name: "AS-1405-0001" }).click();
    await expect(page).toHaveURL(/\/app\/assessments\/1$/);
    await expect(page.getByRole("heading", { name: "ارزیابی جاری AS-1405-0001", level: 1 })).toBeVisible();
    const result = page.getByRole("region", { name: "نتیجه" });
    await expect(result.getByText("امتیاز (L × I)")).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    // پیوند بخش‌ها همان #بخشی است که جنگو بعد از هر کار به آن برمی‌گرداند.
    await page.getByRole("navigation", { name: "بخش‌های ارزیابی" }).getByRole("link", { name: "احتمال" }).click();
    await expect(page).toHaveURL(/#likelihood$/);
    await expect(page.getByRole("heading", { name: "احتمال", level: 2 })).toBeInViewport();

    const review = page.getByRole("region", { name: "کنترل کیفیت" });
    await review.getByRole("textbox", { name: /توضیح برای کنترل‌کننده/ }).fill("آماده‌ی کنترل است");
    await review.getByRole("button", { name: "ارسال برای کنترل کیفیت" }).click();
    await expect(page.getByText("ارزیابی AS-1405-0001 برای کنترل کیفیت فرستاده شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/assessments/1/submit/");
    expect(call!.headers["x-csrftoken"]).toBeTruthy();
    expect(call!.body).toEqual({ values: { notes: "آماده‌ی کنترل است" } });
    await expect(page).toHaveURL(/\/app\/assessments\/1(#likelihood)?$/);
  });

  test("asks before deleting a path, in a dialog that keeps focus", async ({ page, api }) => {
    await page.goto("/app/assessments/1#likelihood");
    await page.getByRole("button", { name: "حذف مسیر مسیر آزمون" }).click();
    const dialog = page.getByRole("alertdialog", { name: "مسیر «مسیر آزمون» حذف شود؟" });
    await expect(dialog).toBeVisible();
    await expectAccessible(page, '[role="alertdialog"]');
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "حذف مسیر مسیر آزمون" })).toBeFocused();
    expect(api.callsTo("POST forms/")).toHaveLength(0);
  });

  test.describe(() => {
    // جواب ۴۰۰ جنگو همان خطای فرم است که مرورگر در کنسول هم گزارشش می‌کند.
    test.use({ allowConsoleErrors: [/status of 400/] });

    test("fills the impact profile row by row, with Django's errors next to the right cell", async ({ page, api }) => {
      api.on("POST forms/", (call: ApiCall) => {
        const values = (call.body as { values: Record<string, string> }).values;
        return values["7-F-level"] === "0" && !values["7-F-rationale"]
          ? reply(400, {
              message: "بعضی خانه‌ها ایراد دارند؛ پیام زیر هر خانه را ببینید.",
              errors: { "7-F-rationale": ["صفر یعنی «اثر ندارد» و دلیل می‌خواهد."] },
            })
          : {
              message: "پروفایل پیامد ارزیابی AS-1405-0001 ذخیره شد.",
              redirect: { href: "/assessments/1/", route: "/assessments/1" },
            };
      });
      await page.goto("/app/assessments/1/impacts");
      await expect(page.getByRole("heading", { name: /پروفایل پیامد ارزیابی جاری/, level: 1 })).toBeVisible();
      await expectAccessible(page);
      expect(await overflows(page)).toBe(false);

      const bank = page.getByRole("region", { name: "بانک آزمون" });
      await expect(bank.getByText(/پیشنهاد سامانه: سطح ۳/)).toBeVisible();
      const financial = bank.getByRole("group", { name: "F مالی، بانک آزمون" });
      await financial.getByRole("combobox", { name: "سطح" }).selectOption("0");
      await financial.getByRole("combobox", { name: "اطمینان" }).selectOption("high");
      // دکمه‌ی ذخیره در فرم بلند پایین صفحه می‌ماند.
      const save = page.getByRole("button", { name: "ذخیره" });
      await expect(save).toBeInViewport();
      await save.click();

      const summary = page.getByRole("alert");
      await expect(summary).toBeFocused();
      await expect(summary).toContainText("بانک آزمون، F مالی، دلیل: صفر یعنی «اثر ندارد» و دلیل می‌خواهد.");
      await expectAccessible(page);
      await summary.getByRole("link", { name: /بانک آزمون، F مالی، دلیل/ }).click();
      const rationale = financial.getByRole("textbox", { name: "دلیل" });
      await expect(rationale).toBeFocused();
      await rationale.fill("زیان قابل انتساب ندارد");
      await save.click();

      await expect(page).toHaveURL(/\/app\/assessments\/1$/);
      await expect(page.getByText("پروفایل پیامد ارزیابی AS-1405-0001 ذخیره شد.", { exact: true })).toBeVisible();
      const last = api.callsTo("POST forms/").at(-1)!;
      expect(last.query.get("path")).toBe("/assessments/1/impacts/");
      expect(last.body).toMatchObject({
        values: { "datin-S-level": "0", "7-F-level": "0", "7-F-rationale": "زیان قابل انتساب ندارد" },
      });
    });
  });

  test("puts the A table beside the initiator form on desktop and after it on mobile", async ({ page, isMobile }) => {
    await page.goto("/app/assessments/1/initiator");
    await expect(page.getByRole("heading", { name: /عامل آغازگر \(A\)/, level: 1 })).toBeVisible();
    await expectAccessible(page);
    const form = await page.getByRole("main").locator("form").boundingBox();
    const guide = await page.getByRole("complementary", { name: "راهنمای روش" }).boundingBox();
    if (isMobile) expect(guide!.y).toBeGreaterThan(form!.y + form!.height - 1);
    // راست‌به‌چپ: فرم سمت راست و راهنما سمت چپ آن.
    else expect(guide!.x + guide!.width).toBeLessThanOrEqual(form!.x);
    expect(await overflows(page)).toBe(false);
  });

  test("compares two assessments column by column", async ({ page }) => {
    await page.goto("/app/assessments/compare?id=1&id=2");
    await expect(page.getByRole("heading", { name: "مقایسه‌ی ارزیابی‌ها", level: 1 })).toBeVisible();
    await expect(page.getByText(/نسخه‌ی روش این ارزیابی‌ها یکی نیست/)).toBeVisible();
    const table = page.getByRole("table", { name: /مقایسه‌ی ارزیابی‌های ریسک/ });
    await expect(table.getByRole("rowheader", { name: "سطح تصمیم" })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
    await table.getByRole("link", { name: "AS-1405-0001" }).first().click();
    await expect(page).toHaveURL(/\/app\/assessments\/1$/);
  });
});
