import { expect, expectAccessible, reply, test } from "./fixtures";

import * as data from "../src/test/fixtures";

// «پاسخ به پرسشنامه‌ها»: مدیر واحد شش پرسش و بازبینی را بی انتخاب خدمت با صفحه‌کلید پاسخ می‌دهد و می‌فرستد؛ ورودی
// «در حال شناسایی» بی‌پیوند در جدول همین صفحه می‌آید. در دسکتاپ و موبایل و هر دو تم؛ axe فقط #main را می‌سنجد.

test.describe("questionnaire answers", () => {
  test("answers the six questions from the keyboard and sends them for identification", async ({
    page,
    api,
    isMobile,
  }) => {
    api.on("GET questionnaire-answers/", data.questionnaireAnswers());
    api.on("POST questionnaire-answers/", reply(201, data.questionnaireAnswersSent()));
    await page.goto("/app/questionnaire-answers");
    await expect(page.getByRole("heading", { name: "پاسخ به پرسشنامه‌ها", level: 1 })).toBeVisible();
    if (!isMobile) {
      const menu = page.getByRole("navigation", { name: "منوی اصلی" });
      await expect(menu.getByRole("link", { name: "پاسخ به پرسشنامه‌ها" })).toHaveAttribute("aria-current", "page");
    }
    await expect(page.getByRole("region", { name: "گام‌های فرایند مدیریت ریسک" })).toHaveCount(0);
    await expect(page.getByText("گام ۱ از ۷")).toBeVisible();
    await expectAccessible(page, "#main");

    const subject = page.getByRole("textbox", { name: /موضوع بررسی کدام خدمت/ });
    await subject.focus();
    await page.keyboard.press("Enter"); // پرسش اول اینجا اجباری است
    await expect(subject).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("گام ۱ از ۷")).toBeVisible();
    await page.keyboard.type("سامانه‌ی آزمون در محیط تولید");
    await expect(page.getByRole("list", { name: /پیشنهاد از فهرست خدمت‌ها/ })).toHaveCount(0);
    for (const answer of [
      "پردازش دستورها در پنجره‌ی SLA",
      "ثبت اشتباه تنظیمات در بسته‌ی انتشار",
      "بانک آزمون و داتین",
      "توقف سامانه‌ی آزمون پس از انتشار",
      "توقف پردازش حدود ۹۰ دقیقه",
    ]) {
      await page.keyboard.press("Enter");
      await page.keyboard.type(answer);
    }
    await page.keyboard.press("Enter");

    const review = page.getByRole("region", { name: "بازبینی" });
    await expect(page.getByText("گام ۷ از ۷")).toBeVisible();
    const evidence = review.getByRole("textbox", { name: /شاهد، تجربه و تغییر اخیر/ });
    await expect(evidence).toBeFocused();
    await page.keyboard.type("دو توقف مشابه در شش ماه گذشته");
    await expect(review.getByText("مالک: کاربر آزمون")).toBeVisible();
    await expect(review.getByText("پاسخ برای واحد «واحد آزمون» ثبت می‌شود.")).toBeVisible();
    await expectAccessible(page, "#main");
    // هیچ عرضی پیمایش افقی صفحه نمی‌سازد.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.getByRole("button", { name: "ارسال برای شناسایی" }).click();
    const dialog = page.getByRole("alertdialog", { name: "پاسخ‌ها برای شناسایی فرستاده شود؟" });
    await expect(dialog).toContainText("دیگر نمی‌توانید آن‌ها را ویرایش یا حذف کنید");
    await expectAccessible(page, "[role=alertdialog]");
    // گفت‌وگوی هشدار با فوکوس روی «انصراف» باز می‌شود تا Enter عجولانه چیزی نفرستد؛ ارسال یک Tab جلوتر است.
    const confirm = dialog.getByRole("button", { name: "ارسال برای شناسایی" });
    await expect(confirm).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(confirm).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(page.getByText("پاسخ‌ها ثبت شد و برای شناسایی به کارشناس ریسک رسید.", { exact: true })).toBeVisible();
    expect(api.callsTo("POST questionnaire-answers/")[0]?.body).toMatchObject({
      submit: true,
      values: { subject: "سامانه‌ی آزمون در محیط تولید", target: "", evidence: "دو توقف مشابه در شش ماه گذشته" },
    });
    await expect(subject).toBeFocused();
    await expect(subject).toHaveValue("");
    const first = page.getByRole("region", { name: "ورودی‌های اخیر شناسایی" }).getByRole("row").nth(1);
    await expect(first).toContainText("در حال شناسایی");
    await expect(first.getByRole("link")).toHaveCount(0);
    await expectAccessible(page, "#main");
  });

  test.describe("for someone who is not a unit manager", () => {
    test.use({ allowConsoleErrors: [/status of 403/] });

    test("explains the page and points to risk identification", async ({ page, api }) => {
      api.on("GET questionnaire-answers/", reply(403, { detail: "«پاسخ به پرسشنامه‌ها» برای مدیر واحد است." }));
      await page.goto("/app/questionnaire-answers");
      await expect(page.getByText("«پاسخ به پرسشنامه‌ها» برای مدیر واحد است", { exact: true })).toBeVisible();
      await expect(page.locator("#main").getByRole("link", { name: /شناسایی ریسک/ })).toHaveAttribute(
        "href",
        "/app/identification",
      );
      await expectAccessible(page, "#main");
    });
  });
});
