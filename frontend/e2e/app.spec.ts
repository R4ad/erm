import { expect, expectAccessible, test } from "./fixtures";

test.describe("shell and my work", () => {
  test("opens on my work with the navigation for this user", async ({ page, isMobile }) => {
    await page.goto("/app/");
    await expect(page.getByRole("heading", { name: "کارهای من", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "صف کارها" })).toBeVisible();
    if (isMobile) {
      await expect(page.getByRole("button", { name: "منو" })).toBeVisible();
    } else {
      await expect(page.getByRole("navigation", { name: "منوی اصلی" })).toBeVisible();
    }
    await expectAccessible(page);
  });

  test("moves keyboard focus to the content first", async ({ page }) => {
    await page.goto("/app/");
    await expect(page.getByRole("heading", { name: "کارهای من", level: 1 })).toBeVisible();
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "رفتن به محتوای صفحه" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("collapses the sidebar and remembers it", async ({ page, isMobile }) => {
    test.skip(isMobile, "منوی کناری فقط در دسکتاپ است");
    await page.goto("/app/");
    const sidebar = page.getByRole("navigation", { name: "منوی اصلی" });
    await page.getByRole("button", { name: "جمع کردن منو" }).click();
    await expect(page.getByRole("button", { name: "باز کردن منو" })).toHaveAttribute("aria-expanded", "false");
    // برچسب‌ها برای صفحه‌خوان می‌مانند و با نگه داشتن نشانگر، راهنما نشان داده می‌شود.
    await expect(sidebar.getByRole("link", { name: "رجیستر ریسک" })).toBeVisible();
    await sidebar.getByRole("link", { name: "رجیستر ریسک" }).hover();
    await expect(page.getByRole("tooltip")).toHaveText("رجیستر ریسک");
    await page.reload();
    await expect(page.getByRole("button", { name: "باز کردن منو" })).toBeVisible();
  });

  test("navigates from the mobile drawer", async ({ page, isMobile }) => {
    test.skip(!isMobile, "منوی کشویی فقط در موبایل است");
    await page.goto("/app/");
    const menu = page.getByRole("button", { name: "منو" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "منوی اصلی" });
    await expect(drawer).toBeVisible();
    await expectAccessible(page, '[role="dialog"]');
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();

    await menu.click();
    await drawer.getByRole("link", { name: "رجیستر ریسک" }).click();
    await expect(page).toHaveURL(/\/app\/risks$/);
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("heading", { name: "رجیستر ریسک", level: 1 })).toBeVisible();
  });

  test("tells the user when the connection drops", async ({ page, context }) => {
    await page.goto("/app/");
    await expect(page.getByRole("heading", { name: "کارهای من", level: 1 })).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText("اتصال اینترنت قطع است")).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText("اتصال اینترنت قطع است")).toBeHidden();
  });
});

test.describe("risk register", () => {
  test("filters, searches and sorts with the URL", async ({ page, api }) => {
    await page.goto("/app/risks");
    await expect(page.getByRole("heading", { name: "رجیستر ریسک", level: 1 })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expectAccessible(page);

    // نوار وضعیت‌های گردش کار فیلتر وضعیت است.
    const pipeline = page.getByRole("navigation", { name: "وضعیت‌های گردش کار" });
    await pipeline.getByRole("button", { name: /^برنامه‌ی درمان/ }).click();
    await expect(page).toHaveURL(/status=treatment_plan/);
    await expect(pipeline.getByRole("button", { name: /^برنامه‌ی درمان/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "برداشتن فیلتر وضعیت: برنامه‌ی درمان" })).toBeVisible();
    await expect(page.getByRole("link", { name: /ریسک آزمون/ })).toHaveCount(1);

    await page.getByRole("button", { name: "پاک کردن همه", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/risks$/);

    await page.getByRole("searchbox", { name: "جست‌وجو", exact: true }).fill("RK-1405-0004");
    await expect(page).toHaveURL(/q=RK-1405-0004/);
    await expect(page.getByRole("link", { name: /ریسک آزمون/ })).toHaveCount(1);
    expect(api.callsTo("GET risks/").filter((call) => call.query.get("q")?.startsWith("RK"))).toHaveLength(1);

    await page.getByRole("searchbox", { name: "جست‌وجو", exact: true }).fill("");
    await expect(page).not.toHaveURL(/q=/);
    await page.getByRole("columnheader", { name: /کد/ }).getByRole("button").click();
    await expect(page).toHaveURL(/ordering=code/);
    await expect(page.getByRole("columnheader", { name: /کد/ })).toHaveAttribute("aria-sort", "ascending");
    await page.goBack();
    await expect(page).not.toHaveURL(/ordering=code/);
  });

  test("opens a dossier and keeps the tab in the URL", async ({ page }) => {
    await page.goto("/app/risks");
    await page.getByRole("link", { name: "ریسک آزمون شماره‌ی ۱", exact: true }).click();
    await expect(page.getByRole("heading", { name: "ریسک آزمون شماره‌ی ۱", level: 1 })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("tab", { name: /ارزیابی‌ها/ }).click();
    await expect(page).toHaveURL(/tab=assessments/);
    await expect(page.getByRole("tabpanel")).toContainText("AS-1405-0001");
    await expectAccessible(page);

    await page.reload();
    await expect(page.getByRole("tab", { name: /ارزیابی‌ها/ })).toHaveAttribute("aria-selected", "true");
  });
});
