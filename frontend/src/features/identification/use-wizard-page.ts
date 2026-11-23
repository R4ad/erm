import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { get } from "@/lib/api";
import type { IdentificationPage } from "@/lib/types";

/**
 * داده‌ی صفحه‌ی ویزارد (و پیش‌نویس ?draft=) و کلید فرم. رفتن به پیش‌نویس دیگر فرم را از نو می‌سازد؛ پیش‌نویسی که همین
 * فرم ذخیره کرده نه، تا گام و فوکوس سر جایش بماند.
 */
export function useWizardPage() {
  const [params] = useSearchParams();
  const draft = params.get("draft") ?? "";
  const [saved, setSaved] = useState<string | null>(null);
  const [formKey, setFormKey] = useState({ draft, key: draft });
  if (formKey.draft !== draft) setFormKey({ draft, key: saved === draft ? formKey.key : draft });
  const query = useQuery({
    queryKey: ["identification", draft],
    queryFn: ({ signal }) => get<IdentificationPage>(`identification/${draft ? `?draft=${draft}` : ""}`, signal),
  });

  return { query, formKey: formKey.key, onDraftSaved: setSaved };
}
