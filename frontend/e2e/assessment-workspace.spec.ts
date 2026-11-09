import { assessmentDetail, levels } from "../src/test/fixtures";
import { expect, expectAccessible, test } from "./fixtures";

test("opens assessment workspace, starts a submitted risk, and shows risk details", async ({ page, api, isMobile }) => {
  api.on("GET assessments/", () => ({
    can_start: true,
    count: 1,
    page: 1,
    pages: 1,
    results: [
      {
        id: 2,
        code: "AS-1405-0002",
        risk: { id: 2, code: "RK-1405-0002", title: "قطع شبکه" },
        service: "شبکه",
        kind: { value: "current", label: "جاری" },
        status: { value: "approved", label: "تأییدشده" },
        likelihood: [2, 2],
        impact: [3, 3],
        score: [6, 6],
        level: levels.medium,
        provisional: false,
        incomplete: false,
        href: "/assessments/2/",
      },
    ],
  }));
  api.on("GET assessments/candidates/", () => ({
    count: 1,
    page: 1,
    pages: 1,
    results: [
      {
        id: 1,
        code: "RK-1405-0001",
        title: "قطع خدمت",
        service: "پرداخت",
        unit: "عملیات",
        category: "فناوری",
        owner: null,
        status: { value: "submitted", label: "ارسال‌شده" },
      },
    ],
  }));
  api.on("POST assessments/risks/1/start/", () => ({ id: 1, href: "/assessments/1/" }));
  const detail = assessmentDetail();
  detail.risk_details = [
    { label: "سناریو", value: "سناریوی خدمت پرداخت" },
    { label: "مسیر ثبت‌شده", value: "قطع سوئیچ" },
  ];
  api.on("GET pages/", () => detail);
  await page.goto("/app/");
  if (isMobile) await page.getByRole("button", { name: "منو" }).click();
  await page.getByRole("link", { name: "ارزیابی ریسک", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/assessments$/);
  await expect(page.getByRole("table", { name: "ارزیابی ریسک‌ها" })).toContainText("متوسط");
  await expect(page.getByRole("table", { name: "ارزیابی ریسک‌ها" })).toContainText("۶");
  await expectAccessible(page);
  await page.getByRole("link", { name: "ارزیابی جدید ریسک" }).click();
  await expect(page.getByRole("heading", { name: "ریسک‌های نیازمند ارزیابی" })).toBeVisible();
  await page.getByRole("button", { name: /RK-1405-0001.*قطع خدمت/ }).click();
  await expect(page).toHaveURL(/\/app\/assessments\/1$/);
  await expect(page.getByText("سناریوی خدمت پرداخت")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ثبت پارامترهای ارزیابی" })).toBeVisible();
  expect(api.callsTo("POST assessments/risks/1/start/")).toHaveLength(1);
});
