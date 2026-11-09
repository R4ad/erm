import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { useToast } from "@/components/ui/toast";
import { useGoTo } from "@/features/session/links";
import { bridge, post } from "@/lib/api";
import { faText } from "@/lib/format";
import type { FormResult } from "@/lib/types";

export interface BridgeAction {
  /** نشانی جنگوی کار، مثل /assessments/12/submit/ */
  url: string;
  values: Record<string, string | boolean | string[]>;
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
    mutationFn: ({ url, values }: BridgeAction) => post<FormResult>(bridge("forms", url), { values }),
    onSuccess: (result) => {
      toast({ title: faText(result.message) });
      void queryClient.invalidateQueries();
      const route = result.redirect?.route;
      if (result.redirect && (!route || route.split(/[?#]/)[0] !== pathname)) goTo(result.redirect);
    },
  });
}
