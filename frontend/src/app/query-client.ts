import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "@/lib/api";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: true,
        // ۴۰۳ و ۴۰۴ با تکرار درست نمی‌شوند؛ فقط خطای شبکه و سرور یک بار دیگر امتحان می‌شود.
        retry: (failures, error) =>
          failures < 1 && !(error instanceof ApiError && error.status > 0 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}
