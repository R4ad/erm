import { response } from "../src/test/fixtures";
import { expect, test, type ApiCall } from "./fixtures";

test("records separate paths and a shared control", async ({ page, api }) => {
  const data = response({
    is_structured: true,
    structured_data: [],
    return_question: "",
    structured_questions: [
      { id: 1, stage: "service", text: "کدام خدمت؟", required: false, help: "" },
      { id: 2, stage: "event", text: "کدام اتفاق؟", required: false, help: "" },
      { id: 3, stage: "path", text: "چگونه مختل می‌شود؟", required: false, help: "" },
      { id: 4, stage: "control", text: "کدام تمهید؟", required: false, help: "" },
    ],
  });
  api.on("GET responses/1/", () => data);
  api.on("PUT responses/1/", (call: ApiCall) => ({
    response: { ...data, structured_data: (call.body as { structured_data: unknown[] }).structured_data },
  }));
  await page.goto("/app/responses/1");
  await page.getByRole("textbox", { name: "کدام خدمت؟" }).fill("شبکه");
  await page.getByRole("textbox", { name: "کدام اتفاق؟" }).fill("تنظیم اشتباه");
  await page.getByRole("textbox", { name: /درباره «تنظیم اشتباه»/ }).fill("قطع سوئیچ");
  await page.getByRole("button", { name: "افزودن راه دیگر" }).click();
  await page
    .getByRole("textbox", { name: /درباره «تنظیم اشتباه»/ })
    .nth(1)
    .fill("قطع کابل");
  await page.getByRole("textbox", { name: "کدام تمهید؟" }).fill("مسیر پشتیبان");
  await page.getByRole("checkbox", { name: /قطع سوئیچ/ }).check();
  await page.getByRole("checkbox", { name: /قطع کابل/ }).check();
  await page.getByRole("button", { name: "ذخیره پیش‌نویس" }).click();
  await expect.poll(() => api.callsTo("PUT responses/1/").length).toBe(1);
  const body = api.callsTo("PUT responses/1/")[0]!.body as {
    structured_data: { events: { paths: unknown[]; controls: { paths: string[] }[] }[] }[];
  };
  expect(body.structured_data[0]!.events[0]!.paths).toHaveLength(2);
  expect(body.structured_data[0]!.events[0]!.controls[0]!.paths).toHaveLength(2);
});
