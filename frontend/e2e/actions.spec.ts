import type { Page } from "@playwright/test";

import { expect, expectAccessible, test } from "./fixtures";

// طرح مواجهه، اقدام و پذیرش در مرورگر واقعی، زیر CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو تم: فهرست
// اقدام‌ها با فیلتر تیک‌دار در نشانی، تأیید طرح با پرسش تأیید، ثبت پیشرفت اقدام با شاهد، و امضای مدیریت ارشد با
// فایل نامه که multipart فرستاده می‌شود.

const overflows = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test.describe("treatment", () => {
  test("filters the actions with a checkbox kept in the URL", async ({ page, api }) => {
    await page.goto("/app/actions");
    await expect(page.getByRole("heading", { name: "اقدام‌ها", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "اقدام آزمون پوشش دسترسی ممتاز" })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await page.getByRole("checkbox", { name: "فقط عقب‌افتاده" }).check();
    await expect(page).toHaveURL(/\/app\/actions\?overdue=on$/);
    await expect(page.getByRole("link", { name: "اقدام آزمون پوشش دسترسی ممتاز" })).toBeHidden();
    await expect(page.getByRole("link", { name: "اقدام آزمون عقب‌افتاده" })).toBeVisible();
    expect(api.callsTo("GET pages/").some((call) => call.query.get("path") === "/actions/?overdue=on")).toBe(true);

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "فقط عقب‌افتاده" })).toBeChecked();
    await expect(page.getByRole("link", { name: "اقدام آزمون عقب‌افتاده" })).toHaveAttribute("href", "/app/actions/2");
  });

  test("approves a plan from the risk dossier after a confirmation", async ({ page, api }) => {
    await page.goto("/app/actions/plans/1");
    await expect(page.getByRole("heading", { name: "طرح مواجهه: کاهش", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    const approval = page.getByRole("region", { name: "تأیید مالک ریسک" });
    await approval.getByRole("button", { name: "تأیید طرح" }).click();
    const dialog = page.getByRole("alertdialog", { name: /تأیید شود؟/ });
    await expect(dialog).toBeVisible();
    await expectAccessible(page, '[role="alertdialog"]');
    await dialog.getByRole("button", { name: "تأیید طرح" }).click();
    await expect(page.getByText("طرح تأیید شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/actions/plans/1/approve/");
    expect(call!.headers["x-csrftoken"]).toBeTruthy();
    expect(call!.body).toEqual({ values: {} });

    await page
      .getByRole("region", { name: "اقدام‌ها" })
      .getByRole("link", { name: /اقدام آزمون پوشش/ })
      .click();
    await expect(page).toHaveURL(/\/app\/actions\/1$/);
  });

  test("records an action as ready for testing with its evidence", async ({ page, api }) => {
    await page.goto("/app/actions/1#progress");
    const progress = page.getByRole("region", { name: "پیشرفت" });
    await expect(progress).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    await progress.getByRole("textbox", { name: "توضیح" }).fill("اجرا شد");
    await progress.getByRole("checkbox", { name: /EV-1405-0007/ }).check();
    await progress.getByRole("button", { name: "آماده‌ی آزمون" }).click();
    await expect(page.getByText("وضعیت اقدام ثبت شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/actions/1/move/");
    expect(call!.body).toEqual({ values: { move: "ready", note: "اجرا شد", evidence: ["7"] } });
  });

  test("signs an acceptance as senior management with the letter file", async ({ page, api }) => {
    await page.goto("/app/actions/acceptances/2");
    await expect(page.getByRole("heading", { name: "پذیرش AC-1405-0002", level: 1 })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);

    const box = page.getByRole("region", { name: "امضای شما به‌عنوان مدیریت ارشد" });
    await box.getByRole("textbox", { name: "شماره‌ی نامه" }).fill("۱۲/۳۴۵");
    await box.getByLabel("فایل نامه").setInputFiles({
      name: "letter.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });
    await box.getByRole("button", { name: "تأیید پذیرش" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "تأیید پذیرش" }).click();
    await expect(page.getByText("امضای شما ثبت شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/actions/acceptances/2/sign/");
    expect(call!.headers["content-type"]).toContain("multipart/form-data");
    const body = String(call!.body);
    expect(body).toContain('name="authority"\r\n\r\nsenior_management');
    expect(body).toContain('name="decision"\r\n\r\napprove');
    expect(body).toContain('filename="letter.pdf"');
  });

  test("shows the reassessment comparison next to the decision form", async ({ page }) => {
    await page.goto("/app/actions/plans/1/reassess");
    await expect(page.getByRole("heading", { name: /بازسنجی طرح مواجهه/, level: 1 })).toBeVisible();
    await expect(page.getByRole("table", { name: /مقایسه‌ی ارزیابی مبنا/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "ثبت بازسنجی" })).toBeVisible();
    await expectAccessible(page);
    expect(await overflows(page)).toBe(false);
  });
});
