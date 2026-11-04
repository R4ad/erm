import { response } from "../src/test/fixtures";

import { expect, expectAccessible, test, type ApiCall } from "./fixtures";

test.describe("questionnaires", () => {
  test("lists questionnaires, my responses and starts a response", async ({ page, api }) => {
    api.on("POST questionnaires/1/start/", { id: 1 });
    await page.goto("/app/questionnaires");
    await expect(page.getByRole("heading", { name: "پاسخ به سؤال‌ها", level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page
      .getByRole("link", { name: /شروع پاسخ/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "شروع پاسخ" }).click();
    await expect(page.getByText("واحد را انتخاب کنید.")).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel(/واحد/).selectOption("1");
    await page.getByRole("button", { name: "شروع پاسخ" }).click();
    await expect(page).toHaveURL(/\/app\/responses\/1$/);
    expect(api.callsTo("POST questionnaires/1/start/")[0]?.body).toEqual({ org_unit: "1", service: "" });
  });

  test("checks required answers, confirms and submits a response", async ({ page, api }) => {
    api.on("PUT responses/1/", (call: ApiCall) => {
      const body = call.body as { answers: Record<string, unknown>; submit: boolean };
      const saved = response();
      saved.questions = saved.questions.map((question) => ({
        ...question,
        value: (body.answers[String(question.id)] ?? null) as never,
      }));
      if (body.submit) Object.assign(saved, { can_edit: false, status: { value: "submitted", label: "ارسال‌شده" } });
      return { message: body.submit ? "پاسخ برای بررسی فرستاده شد." : "پیش‌نویس ذخیره شد.", response: saved };
    });
    await page.goto("/app/responses/1");
    await expect(page.getByRole("heading", { name: "پرسشنامه‌ی آزمون", level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "ارسال برای بررسی" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "پیش از ارسال درست شود" });
    await expect(summary).toBeFocused();
    await expectAccessible(page);
    await summary.getByRole("link", { name: "سؤال ۱" }).click();
    const first = page.getByRole("textbox", { name: /سؤال ۱/ });
    await expect(first).toBeFocused();

    await first.fill("جواب آزمون");
    await page.getByText("گزینه‌ی دوم").click();
    await expect(page.getByText("تغییرات ذخیره نشده است")).toBeVisible();
    await page.keyboard.press("Control+s");
    await expect(page.getByText("پیش‌نویس ذخیره شد.").first()).toBeVisible();
    await expect(page.getByText("همه‌ی تغییرات ذخیره شده است")).toBeVisible();

    await page.getByRole("button", { name: "ارسال برای بررسی" }).click();
    const dialog = page.getByRole("alertdialog", { name: "پاسخ برای بررسی فرستاده شود؟" });
    await expect(dialog.getByRole("button", { name: "انصراف" })).toBeFocused();
    await expectAccessible(page, '[role="alertdialog"]');
    await dialog.getByRole("button", { name: "ارسال برای بررسی" }).click();
    await expect(page.getByText("پاسخ برای بررسی فرستاده شد.").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "ذخیره‌ی پیش‌نویس" })).toBeHidden();
    expect(api.callsTo("PUT responses/1/").at(-1)?.body).toMatchObject({
      answers: { "1": "جواب آزمون", "2": 12, "3": [] },
      submit: true,
    });
  });

  test("warns before leaving with unsaved answers", async ({ page }) => {
    await page.goto("/app/responses/1");
    await page.getByRole("textbox", { name: /سؤال ۱/ }).fill("نیمه‌کاره");
    await page.getByRole("navigation", { name: "مسیر" }).getByRole("link", { name: "پاسخ به سؤال‌ها" }).click();
    const dialog = page.getByRole("alertdialog", { name: "تغییرات ذخیره نشده است" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "ماندن در صفحه" }).click();
    await expect(page).toHaveURL(/\/app\/responses\/1$/);
    await expect(page.getByRole("textbox", { name: /سؤال ۱/ })).toHaveValue("نیمه‌کاره");
  });

  test("answers a risk question and removes it from the list", async ({ page, api }) => {
    api.on("POST risk-questions/4/answer/", { message: "جواب ثبت شد." });
    await page.goto("/app/questionnaires/risk-questions");
    await expect(page.getByRole("heading", { name: "پرسش‌های ریسک", level: 1 })).toBeVisible();
    await expectAccessible(page);
    const list = page.getByRole("list", { name: "پرسش‌های باز" });
    await expect(list.getByRole("listitem")).toHaveCount(2);

    await list.getByRole("button", { name: "ثبت جواب" }).first().click();
    await expect(page.getByText("جواب را بنویسید.")).toBeVisible();
    await page.getByLabel("پرسش آزمون اول؟").fill("تیم پایش");
    // سرور آزمون بعد از جواب فقط پرسش دوم را برمی‌گرداند.
    api.on("GET risk-questions/", { questions: [] });
    await list.getByRole("button", { name: "ثبت جواب" }).first().click();
    await expect(page.getByText("جواب ثبت شد.").first()).toBeVisible();
    await expect(page.getByText("پرسش بازی منتظر جواب شما نیست")).toBeVisible();
  });
});
