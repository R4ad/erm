import { expect, expectAccessible, reply, test } from "./fixtures";
import * as data from "../src/test/fixtures";

const empty = { risks: [], counts: { total: 0, approved: 0, dismissed: 0, pending: 0 }, analysed_at: null };

test.describe("response review", () => {
  test("starts identification and shows the suggested risks", async ({ page, api }) => {
    let finished = false;
    api.on("GET questionnaire-responses/109/risks/", () => (finished ? data.reviewRisks() : empty));
    api.on(
      "POST questionnaire-responses/109/ai-identification/",
      reply(202, { run_id: 31, run: data.aiRun({ stage: 2 }) }),
    );
    api.on("GET ai-runs/31/", () => {
      const calls = api.callsTo("GET ai-runs/31/").length;
      finished = calls > 1;
      return finished ? data.aiRun({ status: "succeeded", stage: 5, active: false }) : data.aiRun({ stage: 4 });
    });

    await page.goto("/app/identification/responses/109");
    await expect(page.getByRole("heading", { name: "پرداخت اینترنتی", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "پاسخ‌های پرسشنامه" })).toBeVisible();
    const start = page.getByRole("button", { name: "شناسایی هوشمند ریسک‌ها" });
    await expect(start).toBeVisible();
    await expectAccessible(page);

    await start.click();
    const running = page.getByRole("region", { name: "در حال شناسایی ریسک‌ها…" });
    await expect(running).toBeVisible();
    await expectAccessible(page);

    const results = page.getByRole("region", { name: "ریسک‌های پیشنهادی" });
    await expect(results).toBeVisible({ timeout: 10_000 });
    await expect(
      results.getByRole("article", { name: "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک" }),
    ).toBeVisible();
    await expect(page.getByText("منبع پیشنهاد انتخاب‌شده")).toHaveCount(2);
    await expectAccessible(page);
  });

  test("shows the error state with its tracking code", async ({ page, api }) => {
    api.on("GET questionnaire-responses/109/risks/", empty);
    api.on(
      "GET questionnaire-responses/109/",
      data.responseReview({ run: data.aiRun({ status: "failed", active: false, error_code: "AI-504-7F2A" }) }),
    );
    await page.goto("/app/identification/responses/109");
    const error = page.getByRole("region", { name: "شناسایی هوشمند انجام نشد" });
    await expect(error.getByText("AI-504-7F2A")).toBeVisible();
    await expectAccessible(page);
  });
});
