import { expect, expectAccessible, test } from "./fixtures";

// فرم‌ها و صفحه‌های خواندنی جنگو که رابط از راه پل (/api/forms/ و /api/pages/) نشان می‌دهد، در مرورگر واقعی با
// CSP و Trusted Types واقعی، در دسکتاپ و موبایل و هر دو تم.

test.describe("Django forms", () => {
  test("edits a risk from its dossier, with checks, a Jalali calendar and the way back", async ({ page, api }) => {
    await page.goto("/app/risks/1");
    await page.getByRole("button", { name: /کارهای دیگر/ }).click();
    await page.getByRole("menuitem", { name: "ویرایش ریسک" }).click();
    await expect(page).toHaveURL(/\/app\/risks\/1\/edit$/);
    await expect(page.getByRole("heading", { name: "ویرایش ریسک", level: 1 })).toBeVisible();
    await expectAccessible(page);

    const title = page.getByRole("textbox", { name: /عنوان/ });
    await title.fill("");
    await page.getByRole("button", { name: "ذخیره" }).click();
    const summary = page.getByRole("alert");
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("عنوان: این فیلد لازم است.");
    await expectAccessible(page);
    await summary.getByRole("link", { name: /عنوان/ }).click();
    await expect(title).toBeFocused();
    await title.fill("عنوان تازه‌ی آزمون");

    // تقویم: روز انتخاب‌شده فوکوس می‌گیرد، در راست‌به‌چپ چپ روز بعد است و Enter انتخاب می‌کند.
    await page.getByRole("button", { name: "انتخاب تاریخ از تقویم" }).click();
    const calendar = page.getByRole("dialog", { name: "تقویم" });
    await expect(calendar.getByRole("button", { name: "یکشنبه ۱۰ آبان ۱۴۰۵" })).toBeFocused();
    await expectAccessible(page, '[role="dialog"]');
    await page.keyboard.press("ArrowLeft");
    await expect(calendar.getByRole("button", { name: "دوشنبه ۱۱ آبان ۱۴۰۵" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(calendar).toBeHidden();
    await expect(page.getByRole("textbox", { name: /تاریخ شناسایی/ })).toHaveValue("1405/08/11");

    await page.getByRole("button", { name: "ذخیره" }).click();
    await expect(page).toHaveURL(/\/app\/risks\/1$/);
    await expect(page.getByText("ریسک ذخیره شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.query.get("path")).toBe("/risks/1/edit/");
    expect(call!.headers["x-csrftoken"]).toBeTruthy();
    expect(call!.body).toMatchObject({ values: { title: "عنوان تازه‌ی آزمون", identified_on: "1405/08/11" } });
  });

  test("uploads an attachment as multipart and returns to the attachments", async ({ page, api }) => {
    await page.goto("/app/risks/1#attachments");
    await page.getByRole("link", { name: "افزودن پیوست" }).click();
    await expect(page.getByRole("heading", { name: /پیوست تازه/, level: 1 })).toBeVisible();
    await page.getByLabel(/^فایل/).setInputFiles({
      name: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test"),
    });
    await expect(page.getByText("report.pdf")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "بارگذاری پیوست" }).click();

    await expect(page).toHaveURL(/\/app\/risks\/1#attachments$/);
    await expect(page.getByText("پیوست بارگذاری شد.", { exact: true })).toBeVisible();
    const [call] = api.callsTo("POST forms/");
    expect(call!.headers["content-type"]).toMatch(/^multipart\/form-data; boundary=/);
    expect(String(call!.body)).toContain('filename="report.pdf"');
  });

  test("shows a workflow step with its unmet conditions", async ({ page }) => {
    await page.goto("/app/risks/1");
    await page.getByRole("link", { name: "شروع اجرا" }).click();
    await expect(page.getByRole("heading", { name: "شروع اجرا", level: 1 })).toBeVisible();
    await expect(page.getByText("مالک ریسک هنوز طرح مواجهه را تأیید نکرده است.")).toBeVisible();
    await expectAccessible(page);
  });
});

test.describe("Django read pages", () => {
  test("filters evidence with the page address", async ({ page }) => {
    await page.goto("/app/risks/evidence");
    await expect(page.getByRole("heading", { name: "شواهد", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: /شاهد آزمون/ })).toHaveCount(2);
    await expectAccessible(page);
    await page.getByLabel("نوع").selectOption("test");
    await expect(page).toHaveURL(/kind=test/);
    await expect(page.getByRole("link", { name: /شاهد آزمون/ })).toHaveCount(1);
    await page.goBack();
    await expect(page.getByRole("link", { name: /شاهد آزمون/ })).toHaveCount(2);

    await page.getByRole("link", { name: "شاهد آزمون 1" }).click();
    await expect(page.getByRole("heading", { name: /شاهد آزمون 1/, level: 1 })).toBeVisible();
    await expectAccessible(page);
  });

  test("shows the risk universe grid without widening the page", async ({ page }) => {
    await page.goto("/app/risks/coverage");
    await expect(page.getByRole("table", { name: "پوشش خدمت‌ها در دسته‌های ریسک" })).toBeVisible();
    await expect(page.getByRole("rowheader", { name: /خدمت آزمون/ })).toBeVisible();
    await expectAccessible(page);
    const wider = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wider).toBe(false);
  });

  test("approves a merge after confirming", async ({ page, api }) => {
    await page.goto("/app/workflow/requests/7");
    await expect(page.getByText("دلیل آزمونی ادغام.")).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "تأیید", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expectAccessible(page, '[role="alertdialog"]');
    await dialog.getByRole("button", { name: "تأیید", exact: true }).click();
    await expect(page.getByText("پیشنهاد تأیید شد.", { exact: true })).toBeVisible();
    expect(api.callsTo("POST forms/")[0]!.body).toEqual({ values: { decision: "approve", note: "" } });
  });
});
