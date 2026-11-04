import { fa, fileSize } from "@/lib/format";
import { parseJalali } from "@/lib/jalali";
import type { FieldValue, FormField } from "@/lib/types";
import { z } from "@/lib/zod";

// مقدار اولیه، قاعده‌های سمت رابط و داده‌ی فرستادنی یک فرم جنگو از روی توصیف همان فرم (apps/api/forms.py).
// قاعده‌های این‌جا فقط بازخورد زودتر است (اجباری، طول، تاریخ شمسی، نوع و اندازه‌ی فایل)؛ تصمیم نهایی با خود فرم
// جنگوست و هر خطای آن کنار همان فیلد می‌آید.

export type FormValues = Record<string, FieldValue>;

export const REQUIRED = "این فیلد لازم است.";

/** فیلدهایی که کاربر پر می‌کند؛ فیلد غیرفعال را جنگو از داده‌ی فرستاده نمی‌خواند. */
export const editable = (field: FormField) => field.kind !== "hidden" && !field.disabled;

export function initialValues(fields: FormField[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (field.kind === "file") values[field.name] = null;
    else if (field.kind === "checkbox") values[field.name] = Boolean(field.value);
    else if (field.kind === "multiselect") values[field.name] = Array.isArray(field.value) ? field.value : [];
    else values[field.name] = typeof field.value === "string" ? field.value : "";
  }
  return values;
}

function extensions(accept: string | undefined) {
  return (accept ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.startsWith("."));
}

function fileRule(field: FormField) {
  const allowed = extensions(field.accept);
  return z
    .custom<File | null>((value) => value === null || value instanceof File)
    .superRefine((file, context) => {
      if (!file) {
        if (field.required) context.addIssue({ code: "custom", message: "فایلی انتخاب نشده است." });
        return;
      }
      const name = file.name.toLowerCase();
      if (allowed.length && !allowed.some((ext) => name.endsWith(ext))) {
        context.addIssue({ code: "custom", message: `این نوع فایل پذیرفته نمی‌شود؛ فقط ${allowed.join("، ")}.` });
      }
      if (field.max_size && file.size > field.max_size) {
        context.addIssue({ code: "custom", message: `حجم فایل بیشتر از ${fileSize(field.max_size)} است.` });
      }
    });
}

function textRule(field: FormField) {
  let rule = z.string();
  if (field.max_length) rule = rule.max(field.max_length, `حداکثر ${fa(field.max_length)} نویسه.`);
  return rule.superRefine((value, context) => {
    const text = value.trim();
    if (!text) {
      if (field.required) context.addIssue({ code: "custom", message: REQUIRED });
      return;
    }
    if (field.kind === "date" && !parseJalali(text)) {
      context.addIssue({ code: "custom", message: "تاریخ شمسی درست نیست؛ مثل ۱۴۰۵/۰۸/۰۹ بنویسید." });
    }
    if (field.kind === "number" && !Number.isFinite(Number(text))) {
      context.addIssue({ code: "custom", message: "یک عدد بنویسید." });
    }
  });
}

function rule(field: FormField) {
  if (!editable(field)) return z.any();
  switch (field.kind) {
    case "file":
      return fileRule(field);
    case "checkbox":
      return field.required ? z.boolean().refine(Boolean, REQUIRED) : z.boolean();
    case "multiselect":
      return field.required ? z.array(z.string()).min(1, "دست‌کم یک گزینه را انتخاب کنید.") : z.array(z.string());
    default:
      return textRule(field);
  }
}

export function formSchema(fields: FormField[]) {
  return z.object(Object.fromEntries(fields.map((field) => [field.name, rule(field)])));
}

export function needsMultipart(fields: FormField[], multipart: boolean) {
  return multipart || fields.some((field) => field.kind === "file");
}

/** داده‌ی فرم با فایل، به همان شکل فرم HTML جنگو: تیک‌خورده «on»، تیک‌نخورده نبودن، چندتایی چند مقدار. */
export function toFormData(fields: FormField[], values: FormValues): FormData {
  const data = new FormData();
  for (const field of fields) {
    const value = values[field.name];
    if (value instanceof File) data.append(field.name, value);
    else if (Array.isArray(value)) value.forEach((item) => data.append(field.name, item));
    else if (typeof value === "boolean") {
      if (value) data.append(field.name, "on");
    } else if (typeof value === "string") data.append(field.name, value);
  }
  return data;
}

/** داده‌ی فرم بی‌فایل برای /api/forms/؛ apps/api/forms.form_data همین را به داده‌ی POST جنگو برمی‌گرداند. */
export function toJson(fields: FormField[], values: FormValues) {
  const data: Record<string, string | boolean | string[]> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (typeof value === "string" || typeof value === "boolean" || Array.isArray(value)) data[field.name] = value;
  }
  return { values: data };
}
