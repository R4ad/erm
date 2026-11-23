import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { get } from "@/lib/api";
import type { IdentificationPage } from "@/lib/types";

import type { WizardMode } from "./identification";
import { MODES } from "./modes";

/**
 * داده‌ی صفحه‌ی ویزارد (و ورودی ?draft=) و کلید فرم. رفتن به پیش‌نویس دیگر فرم را از نو می‌سازد؛ پیش‌نویسی که همین
 * فرم ذخیره کرده نه، تا گام و فوکوس سر جایش بماند. ارسالی که به ریسک نمی‌رود (پاسخ مدیر واحد) فرم را خالی از نو
 * می‌سازد و پیش‌نویس را از نشانی برمی‌دارد.
 */
export function useWizardPage(mode: WizardMode) {
  const { endpoint } = MODES[mode];
  const [params, setParams] = useSearchParams();
  const draft = params.get("draft") ?? "";
  const [saved, setSaved] = useState<string | null>(null);
  const [sent, setSent] = useState(0);
  const [formKey, setFormKey] = useState({ draft, key: draft });
  if (formKey.draft !== draft) setFormKey({ draft, key: saved === draft ? formKey.key : draft });
  const query = useQuery({
    queryKey: [endpoint, draft],
    queryFn: ({ signal }) => get<IdentificationPage>(`${endpoint}/${draft ? `?draft=${draft}` : ""}`, signal),
  });

  function onSubmitted() {
    setSaved(null);
    setSent((count) => count + 1);
    if (params.has("draft")) {
      const next = new URLSearchParams(params);
      next.delete("draft");
      setParams(next, { replace: true });
    }
  }

  return {
    query,
    formKey: `${formKey.key}-${sent}`,
    onDraftSaved: setSaved,
    onSubmitted,
    // فقط فرم خالی‌ای که بعد از ارسال ساخته شده فوکوس را به پرسش اول می‌برد، نه باز شدن صفحه یا پیش‌نویس.
    focusFirst: sent > 0 && !draft,
  };
}
