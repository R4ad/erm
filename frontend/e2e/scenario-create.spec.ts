import { riskForm } from "../src/test/fixtures";
import type { FormField } from "../src/lib/types";
import { expect, test } from "./fixtures";

function field(name: string, label: string, kind: FormField["kind"] = "textarea"): FormField {
  return { name, label, kind, required: false, disabled: false, help: "", value: "", errors: [] };
}

test("previews the generated scenario for an existing or new service", async ({ page, api }) => {
  const data = riskForm();
  data.view = "risks:scenario_create";
  data.title = "سناریوی تازه";
  data.form = {
    multipart: false,
    errors: [],
    fields: [
      { ...field("new_service", "ثبت خدمت جدید", "checkbox"), value: false },
      {
        ...field("service", "خدمت یا فرآیند", "select"),
        empty_label: "انتخاب کنید",
        choices: [{ value: "1", label: "شبکه شعب (SRV-1)" }],
      },
      field("new_service_name", "خدمت جدید: نام", "text"),
      field("conditions", "عامل و وضعیت"),
      field("event", "رویداد مشخص"),
      field("objective", "هدف یا تعهد"),
      field("customer_text", "داتین یا مشتری"),
      field("consequence", "نوع و دامنه پیامد"),
      field("category", "دسته", "text"),
    ],
  };
  api.on("GET forms/", () => data);
  await page.goto("/app/risks/scenarios/new");
  await page.getByLabel("خدمت یا فرآیند").selectOption("1");
  await page.getByLabel("عامل و وضعیت").fill("خرابی سوئیچ");
  await page.getByLabel("رویداد مشخص").fill("قطع شبکه");
  await page.getByLabel("هدف یا تعهد").fill("ارائه خدمت");
  await page.getByLabel("داتین یا مشتری").fill("بانک الف");
  await page.getByLabel("نوع و دامنه پیامد").fill("توقف تراکنش‌ها");
  const preview = page.getByRole("region", { name: "پیش‌نمایش سناریو" });
  await expect(preview).toContainText(
    "در خدمت یا فرآیند شبکه شعب، به علت یا در شرایط خرابی سوئیچ، ممکن است قطع شبکه رخ دهد و انجام ارائه خدمت برای بانک الف را مختل کند. پیامد قابل مشاهده آن توقف تراکنش‌ها است.",
  );
  await page.getByLabel("ثبت خدمت جدید").check();
  await page.getByLabel("خدمت جدید: نام").fill("خدمت تازه");
  await expect(preview).toContainText("در خدمت یا فرآیند خدمت تازه");
});
