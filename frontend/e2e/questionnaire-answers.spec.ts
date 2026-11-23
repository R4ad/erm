import * as data from "../src/test/fixtures";
import { expect, expectAccessible, test } from "./fixtures";

const SERVICE = "موضوع بررسی کدام خدمت یا فرآیند است؟";

test.describe("questionnaire answers", () => {
  test("starts a response and moves between steps", async ({ page }) => {
    await page.goto("/app/questionnaire-answers");
    const wizard = page.getByRole("region", { name: "پرسش‌های جلسه‌ی شناسایی" });
    await expect(wizard.getByText("گام ۱ از ۸")).toBeVisible();
    await expect(page.getByRole("table", { name: "پاسخنامه‌های اخیر" })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: /بعدی/ }).click();
    await expect(page.getByText("این پرسش را پاسخ دهید.")).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel(SERVICE).fill("انتقال وجه ساتنا");
    await page.getByLabel(SERVICE).press("Enter");
    await expect(page.getByLabel("کدام هدف یا تعهد مختل می‌شود؟")).toBeFocused();
  });

  test("paths, shared events and impact types", async ({ page, api }) => {
    const values = data.answeredValues();
    api.on(
      "GET questionnaire-answers/",
      data.questionnaireAnswers({ values, response: data.answerResponse({ step: 5 }) }),
    );
    await page.goto("/app/questionnaire-answers?response=113");
    await expect(page.getByLabel("مسیر تحقق ۳", { exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: /بعدی/ }).click();
    const third = page.getByRole("listitem", { name: "مسیر تحقق ۳" });
    await expect(third.getByRole("button", { name: "انتخاب از رویدادهای قبلی" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expectAccessible(page);

    await page.getByRole("button", { name: /بعدی/ }).click();
    await expect(page.getByText("از مسیرهای")).toBeVisible();
    await page
      .getByRole("button", { name: /نوع پیامد/ })
      .first()
      .click();
    await expect(page.getByRole("checkbox", { name: "مالی" })).toBeChecked();
    await expectAccessible(page);
    await page.keyboard.press("Escape");
  });

  test("submits from the review step and highlights the new row", async ({ page, api }) => {
    api.on("POST questionnaire-answers/", {
      message: "پاسخنامه‌ی QR-1405-0113 برای کارشناس ریسک فرستاده شد.",
      response: data.answerResponse({
        step: 8,
        status: { value: "submitted", label: "در انتظار بررسی", tone: "info" },
      }),
      summary: { paths: 3, events: 2, impacts: 2 },
      recent: [
        data.responseRow({ id: 113, code: "QR-1405-0113", service: "انتقال وجه ساتنا", org_unit: "عملیات زیرساخت" }),
        ...data.questionnaireAnswers().recent,
      ],
    });
    await page.goto("/app/questionnaire-answers?response=113");
    await expect(page.getByText("پیش از ارسال، پاسخ‌ها را بازبینی کنید")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: /ارسال برای شناسایی/ }).click();
    await expect(page.getByRole("heading", { name: "پاسخنامه با موفقیت ارسال شد" })).toBeFocused();
    await expect(page).toHaveURL(/\/app\/questionnaire-answers$/);
    // جواب ارسال جدول را تازه کرده است؛ ویزارد خالی دوباره خوانده نمی‌شود.
    await expect(page.locator("tr[data-fresh]")).toContainText("QR-1405-0113");
    expect(api.callsTo("GET questionnaire-answers/").filter((call) => !call.query.get("response"))).toHaveLength(0);
    await expectAccessible(page);
  });

  test("shows the returned response note", async ({ page, api }) => {
    api.on(
      "GET questionnaire-answers/",
      data.questionnaireAnswers({
        values: data.answeredValues(),
        response: data.answerResponse({
          step: 5,
          status: { value: "returned", label: "بازگشت برای تکمیل اطلاعات", tone: "warning" },
          returned: {
            message: "مسیر دوم را دقیق‌تر بنویسید.",
            questions: [{ text: "صف پیام‌ها چه مدت متوقف می‌ماند؟", step: 5, about: "مسیر تحقق ۲" }],
            due: { iso: "2026-11-26", jalali: "1405/09/05", days_left: 3, overdue: false },
          },
        }),
      }),
    );
    await page.goto("/app/questionnaire-answers?response=113");
    await expect(page.getByText("این پاسخنامه برای تکمیل اطلاعات بازگردانده شده است")).toBeVisible();
    await expectAccessible(page);
  });
});
