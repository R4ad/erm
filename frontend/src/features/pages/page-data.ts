import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

import { bridge, get } from "@/lib/api";
import { djangoPath } from "@/lib/routes";
import type { FormSchema } from "@/lib/types";

// داده‌ی صفحه‌های خواندنی جنگو از راه /api/pages/؛ جدا از کامپوننت‌های فهرست تا HMR آن‌ها را کامل عوض کند.

const pathname = (path: string) => path.split("?")[0];

/** داده‌ی صفحه‌ی جنگوی همین نشانی. با عوض شدن فیلتر یا صفحه، نتیجه‌ی قبلی تا رسیدن نتیجه‌ی تازه می‌ماند. */
export function usePageData<T>() {
  const location = useLocation();
  const path = djangoPath(location);
  const query = useQuery({
    queryKey: ["page", path],
    queryFn: ({ signal }) => get<T>(bridge("pages", path), signal),
    placeholderData: (previous, previousQuery) =>
      previousQuery && pathname(String(previousQuery.queryKey[1])) === pathname(path) ? previous : undefined,
  });
  return { path, ...query };
}

/** نام فیلترهایی که فرم فیلتر جنگو دارد و در نشانی صفحه مقدار گرفته‌اند. */
export function activeFilters(schema: FormSchema | null | undefined, params: URLSearchParams) {
  return (schema?.fields ?? []).filter((field) => field.kind !== "hidden" && params.get(field.name));
}
