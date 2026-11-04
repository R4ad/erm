import { useMutation } from "@tanstack/react-query";
import { createContext, useContext } from "react";

import { get, post } from "@/lib/api";
import { leaveTo } from "@/lib/navigation";
import type { Session } from "@/lib/types";

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

/** کاربر واردشده، منو و تاریخ امروز؛ فقط درون پوسته‌ی برنامه (بعد از خواندن /api/session/) در دسترس است. */
export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession outside the app shell");
  return session;
}

export const sessionQuery = {
  queryKey: ["session"],
  queryFn: ({ signal }: { signal: AbortSignal }) => get<Session>("session/", signal),
  staleTime: 5 * 60_000,
} as const;

/** خروج: نشست در جنگو بسته می‌شود و صفحه از نو بار می‌شود تا هیچ داده‌ای از کاربر قبلی در حافظه نماند. */
export function useLogout() {
  return useMutation({
    mutationFn: () => post<{ login_url: string }>("auth/logout/", {}),
    onSuccess: (result) => leaveTo(result.login_url),
  });
}
