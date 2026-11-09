import type { Page } from "@playwright/test";

import { expect, expectAccessible, test } from "./fixtures";

// تعریف پرسشنامه، بررسی پاسخ و پایش در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو تم:
// ویرایش سؤال با گزینه‌هایش (formset جنگو)، صف بررسی و ثبت ریسک در انتظار از سناریو، و اعلان و بازبینی پایش.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("questionnaire definitions and review", () => {
  test("edits a question with its options in one form", async ({ page, api }) => {
    await page.goto("/app/questionnaires/manage/1");
    await expect(page.getByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: "ویرایش سؤال ۱" }).click();
    await expect(page).toHaveURL(/\/app\/questionnaires\/questions\/1\/edit$/);
    const options = page.getByRole("region", { name: "گزینه‌ها" });
    await expect(options.getByRole("group")).toHaveCount(3);
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await options
      .getByRole("group", { name: "گزینه‌ی ۳" })
      .getByRole("textbox", { name: "متن گزینه" })
      .fill("نمی‌دانم");
    await page.getByRole("button", { name: "ذخیره" }).click();
    await expect(page.getByText("سؤال «پشتیبان آزمون روزانه آزموده می‌شود؟» ذخیره شد.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app\/questionnaires\/manage\/1$/);
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/questionnaires/questions/1/edit/");
    expect((call!.body as { values: Record<string, unknown> }).values).toMatchObject({
      "options-TOTAL_FORMS": "3",
      "options-1-id": "2",
      "options-2-text": "نمی‌دانم",
    });
  });

  test("opens the review queue and registers a pending risk from a scenario", async ({ page, api }) => {
    await page.goto("/app/questionnaires/responses");
    await expect(page.getByRole("heading", { name: "پاسخ‌های پرسشنامه", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: /صف بررسی/ }).click();
    await expect(page).toHaveURL(/\/app\/questionnaires\/responses\?status=submitted$/);
    await expect(page.getByRole("link", { name: "پرسشنامه‌ی آزمون" })).toHaveCount(1);
    expect(
      api
        .callsTo("GET pages/")
        .some((call) => call.query.get("path") === "/questionnaires/responses/?status=submitted"),
    ).toBe(true);

    await page.getByRole("link", { name: "پرسشنامه‌ی آزمون" }).click();
    await expect(page).toHaveURL(/\/app\/questionnaires\/responses\/1$/);
    await expect(page.getByRole("button", { name: "بررسی تمام شد" })).toBeDisabled();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("link", { name: "ثبت در رجیستر" }).click();
    await expect(page.getByRole("heading", { name: "انتخاب سناریو برای ثبت ریسک", level: 1 })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("link", { name: /SC-0001 سناریوی آزمون/ }).click();
    await expect(page).toHaveURL(/\/app\/questionnaires\/pending\/1\/convert\?scenario=1$/);
    await expect(page.getByRole("heading", { name: "ثبت ریسک در انتظار در رجیستر", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "ثبت در رجیستر" })).toBeVisible();
  });

  test("marks a notice read and records a review result", async ({ page, api }) => {
    await page.goto("/app/actions/notices");
    await expect(page.getByRole("heading", { name: "اعلان‌های پایش", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
    await page.getByRole("button", { name: /^خواندم/ }).click();
    await expect(page.getByText("اعلان خوانده شد.", { exact: true })).toBeVisible();
    expect(api.callsTo("POST forms/")[0]!.query.get("path")).toBe("/actions/notices/1/read/");

    await page.getByRole("link", { name: /بازبینی آزمون/ }).click();
    await expect(page).toHaveURL(/\/app\/actions\/reviews\/1$/);
    await expect(page.getByRole("heading", { name: /RK-1405-0001/, level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
    await page.getByRole("textbox", { name: /نتیجه و اقدام بعدی/ }).fill("ارجاع به مدیریت رخداد");
    await page.getByRole("button", { name: "ثبت نتیجه بررسی" }).click();
    await expect(page.getByText("نتیجه بازبینی ثبت شد.", { exact: true })).toBeVisible();
    expect(api.callsTo("POST forms/")[1]!.body).toEqual({ values: { result: "ارجاع به مدیریت رخداد" } });
  });
});
