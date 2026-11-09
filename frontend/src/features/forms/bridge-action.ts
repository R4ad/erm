import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useToast } from "@/components/ui/toast";
import { useGoTo } from "@/features/session/links";
import { bridge, post } from "@/lib/api";
import { faText } from "@/lib/format";
import type { FormResult } from "@/lib/types";

export type ActionValue = string | boolean | string[] | File | null;

export interface BridgeAction {
  /** نشانی جنگوی کار، مثل /assessments/12/submit/ */
  url: string;
  values: Record<string, ActionValue>;
}

/**
 * داده‌ی کار برای /api/forms/: با فایل (مثل نامه‌ی مدیریت ارشد) همان multipart فرم HTML جنگو، وگرنه JSON. تیک‌خورده
 * «on» است و تیک‌نخورده و فایل انتخاب‌نشده فرستاده نمی‌شوند.
 */
export function actionBody(values: BridgeAction["values"]) {
  const entries = Object.entries(values);
  if (!entries.some(([, value]) => value instanceof File)) {
    return {
      values: Object.fromEntries(
        entries.filter((entry): entry is [string, string | boolean | string[]] => {
          const value = entry[1];
          return value !== null && !(value instanceof File);
        }),
      ),
    };
  }
  const data = new FormData();
  for (const [name, value] of entries) {
    if (value instanceof File) data.append(name, value);
    else if (Array.isArray(value)) value.forEach((item) => data.append(name, item));
    else if (typeof value === "boolean") {
      if (value) data.append(name, "on");
    } else if (typeof value === "string") data.append(name, value);
  }
  return data;
}

/**
 * کاری که فقط فرستاده می‌شود (ارسال برای کنترل کیفیت، تأیید، حذف مسیر و...) با همان view جنگو. بعد از موفقیت پیام
 * جنگو نشان داده می‌شود و داده‌ی صفحه‌ها دوباره خوانده می‌شود؛ اگر جنگو به صفحه‌ی دیگری فرستاده باشد، همان‌جا می‌رود.
 * خطای جنگو (پیام خطا یا خطای فرم) در error همین mutation است.
 */
export function useBridgeAction() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const goTo = useGoTo();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: ({ url, values }: BridgeAction) => post<FormResult>(bridge("forms", url), actionBody(values)),
    onSuccess: (result) => {
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries();
      const route = result.redirect?.route;
      if (result.redirect && (!route || route.split(/[?#]/)[0] !== pathname)) goTo(result.redirect);
    },
  });
}
