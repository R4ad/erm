import type { Page } from "@playwright/test";

import { expect, expectAccessible, reply, test } from "./fixtures";

// کتابخانه‌ی کنترل، برگه‌ی آزمون کنترل و بیانیه‌ی کاربردپذیری در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در
// دسکتاپ و موبایل و هر دو تم.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("control library", () => {
  test("goes from the library to a control and to a test sheet that no longer supports its E", async ({ page }) => {
    await page.goto("/app/controls");
    await expect(page.getByRole("heading", { name: "کتابخانه‌ی کنترل", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: "احراز هویت چندعاملی برای حساب‌های ممتاز" }).click();
    await expect(page).toHaveURL(/\/app\/controls\/1$/);
    const effect = page.getByRole("table", { name: /ارزیابی‌های اثربخشی/ });
    await expect(effect.getByRole("row", { name: /CA-1405-0002/ })).toContainText("در Bc فقط E۱ حساب می‌شود");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await effect.getByRole("link", { name: "CA-1405-0003" }).click();
    await expect(page).toHaveURL(/\/app\/controls\/effectiveness\/3$/);
    await expect(page.getByText("داده‌های فعلی این برگه دیگر E۳ را پشتیبانی نمی‌کنند")).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
  });
});

test.describe("control test sheet", () => {
  // جواب ۴۰۰ جنگو برای E پذیرفته‌نشده در کنسول مرورگر خطای شبکه است.
  test.use({ allowConsoleErrors: [/status of 400/] });

  test("records a control test in its sections and shows Django's E rule beside the field", async ({ page, api }) => {
    let attempts = 0;
    api.on("POST forms/", () =>
      ++attempts === 1
        ? reply(400, {
            message: "فرم خطا دارد.",
            errors: {
              e: [
                "E3 پذیرفته نمی‌شود؛ داده‌های این برگه تا E2 را پشتیبانی می‌کنند.",
                "E3 و بالاتر تأییدکننده می‌خواهد (بخش ۲۳).",
              ],
            },
          })
        : {
            message: "ارزیابی اثربخشی CA-1405-0003 با E3 ثبت شد.",
            redirect: { href: "/controls/effectiveness/3/", route: "/controls/effectiveness/3" },
          },
    );
    await page.goto("/app/controls/1/effectiveness/new");
    await expect(page.getByRole("heading", { name: /ارزیابی اثربخشی تازه/, level: 1 })).toBeVisible();
    const scope = page.getByRole("group", { name: "دامنه، طراحی و پوشش" });
    await expect(scope).toBeVisible();
    await expect(page.getByRole("complementary", { name: "راهنمای روش" })).toContainText("اثربخشی فعلی تأییدشده");
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await scope.getByRole("textbox", { name: /دامنه/ }).fill("همه‌ی حساب‌های ممتاز");
    const result = page.getByRole("group", { name: "نتیجه" });
    await result.getByRole("combobox", { name: /^E/ }).selectOption("3");
    await result.getByRole("textbox", { name: /دلیل انتخاب E/ }).fill("پوشش و نمونه کافی است.");
    await page.getByRole("button", { name: "ذخیره" }).click();
    await expect(page.getByText("E3 و بالاتر تأییدکننده می‌خواهد (بخش ۲۳).").first()).toBeVisible();
    expect(attempts).toBe(1);

    await page.getByRole("button", { name: "ذخیره" }).click();
    await expect(page.getByText("ارزیابی اثربخشی CA-1405-0003 با E3 ثبت شد.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/controls\/effectiveness\/3$/);
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/controls/1/effectiveness/new/");
    expect((call!.body as { values: Record<string, unknown> }).values).toMatchObject({
      scope: "همه‌ی حساب‌های ممتاز",
      e: "3",
      exists: false,
    });
  });
});

test.describe("statement of applicability", () => {
  test("filters the statement to applicable rows without an organisation control", async ({ page, api }) => {
    await page.goto("/app/controls/soa");
    await expect(page.getByRole("heading", { name: "بیانیه‌ی کاربردپذیری (SoA)", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page
      .getByRole("navigation", { name: "خلاصه‌ی بیانیه" })
      .getByRole("link", { name: /بدون کنترل سازمان/ })
      .click();
    await expect(page).toHaveURL(/\/app\/controls\/soa\?state=gap$/);
    await expect(page.getByRole("link", { name: "کنترل دسترسی" })).toHaveCount(0);
    expect(api.callsTo("GET pages/").some((call) => call.query.get("path") === "/controls/soa/?state=gap")).toBe(true);

    await page.getByRole("link", { name: "خط‌مشی‌های امنیت اطلاعات" }).click();
    await expect(page).toHaveURL(/\/app\/controls\/soa\/1$/);
    await expect(page.getByText(/هیچ کنترل فعال سازمان به آن نگاشت نشده است/)).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
  });
});
