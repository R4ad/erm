import type { Validity } from "@/lib/types";

/** آیا رکورد بازه‌ی اعتبار یا نشان «منقضی» دارد؛ خانه‌ی بی‌بازه در کارت موبایل پنهان می‌شود. */
export function hasValidity(validity: Validity) {
  return Boolean(validity.from || validity.until || validity.expired);
}
