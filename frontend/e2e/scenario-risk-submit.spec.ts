import { riskForm } from "../src/test/fixtures";
import type { FormField } from "../src/lib/types";
import { expect, test } from "./fixtures";

function field(name: string, label: string, kind: FormField["kind"] = "textarea"): FormField {
  return { name, label, kind, required: false, disabled: false, help: "", value: "", errors: [] };
}

test("registers a risk from its scenario", async ({ page, api }) => {
  const data = riskForm();
  data.view = "risks:risk_create";
  data.title = "ریسک جدید";
  data.facts = {
    title: "جزئیات سناریو",
    rows: [
      { label: "خدمت یا فرآیند", value: "پرداخت" },
      { label: "متن سناریو", value: "سناریوی قطع خدمت پرداخت" },
    ],
  };
  data.form = {
    multipart: false,
    errors: [],
    fields: [
      {
        ...field("scenario", "سناریوی مرجع", "select"),
        disabled: true,
        value: "2",
        choices: [{ value: "2", label: "سناریو" }],
      },
      { ...field("service", "خدمت", "select"), disabled: true, value: "3", choices: [{ value: "3", label: "پرداخت" }] },
      { ...field("initiator", "عامل آغازگر"), required: true },
      { ...field("realization_path", "مسیر مشخص تحقق"), required: true },
      {
        ...field("channel", "کانال ورود", "select"),
        required: true,
        value: "interview",
        choices: [{ value: "interview", label: "مصاحبه" }],
      },
      field("additional_notes", "توضیحات اضافه"),
    ],
  };
  api.on("GET forms/", () => data);
  api.on("POST forms/", () => ({ message: "ریسک ثبت شد", redirect: { href: "/risks/1/", route: "/risks/1" } }));
  await page.goto("/app/risks/new?scenario=2");
  await expect(page.getByText("سناریوی قطع خدمت پرداخت")).toBeVisible();
  await expect(page.getByLabel("خدمت", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("شرح", { exact: true })).toHaveCount(0);
  await page.getByLabel("عامل آغازگر").fill("قطع برق");
  await page.getByLabel("مسیر مشخص تحقق").fill("از کار افتادن سوئیچ");
  await page.getByLabel("توضیحات اضافه").fill("شرح تکمیلی");
  await page.getByRole("button", { name: "ذخیره" }).click();
  await expect.poll(() => api.callsTo("POST forms/").length).toBe(1);
  expect(api.callsTo("POST forms/")[0]?.body).toMatchObject({
    values: { initiator: "قطع برق", realization_path: "از کار افتادن سوئیچ", additional_notes: "شرح تکمیلی" },
  });
});
