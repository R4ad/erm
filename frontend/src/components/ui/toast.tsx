import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Toast } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { locale, t } from "@/lib/i18n";

type ToastTone = "success" | "danger" | "warning" | "info";

interface ToastAction {
  label: string;
  onClick: () => void;
  /** متن جایگزین برای صفحه‌خوان وقتی کار دیگری جای این دکمه هست (Radix، altText). */
  altText?: string;
}

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
  /** میلی‌ثانیه؛ پیش‌فرض ۶ ثانیه. */
  duration?: number;
}

type Notify = (message: Omit<ToastMessage, "id" | "tone"> & { tone?: ToastTone }) => void;

const ToastContext = createContext<Notify | null>(null);

const icons = { success: CircleCheck, danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
// رنگ آیکون روی زمینه‌ی تیره: سبز، قرمز و نارنجی روشن از توکن‌ها، تا تضاد غیرمتنی دست‌کم ۳ باشد.
const accents = {
  success: "text-risk-low",
  danger: "text-danger-solid",
  warning: "text-tangerine-bright",
  info: "text-info-subtle",
} as const;

let nextId = 1;

/**
 * پیام کوتاه پایین صفحه بعد از کاری که انجام شد (Toast فریم 12c): زمینه‌ی تیره‌ی text/primary، گوشه‌ی ۱۲، آیکون،
 * متن سفید و دکمه‌ی اختیاری مثل «بازگردانی» به رنگ accent/tangerine-bright. پیام خطا role=alert و پیام موفقیت
 * role=status دارد.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const notify: Notify = (message) => {
    setMessages((current) => [...current.slice(-2), { tone: "success", ...message, id: nextId++ }]);
  };

  function remove(id: number) {
    setMessages((current) => current.filter((message) => message.id !== id));
  }

  return (
    <ToastContext.Provider value={notify}>
      <Toast.Provider swipeDirection={locale.dir === "rtl" ? "left" : "right"} duration={6000} label={t("toast.label")}>
        {children}
        {messages.map((message) => {
          const Icon = icons[message.tone];
          return (
            <Toast.Root
              key={message.id}
              type={message.tone === "danger" ? "foreground" : "background"}
              duration={message.duration}
              onOpenChange={(open) => !open && remove(message.id)}
              className={cn(
                "group pointer-events-auto relative flex w-full items-center gap-3 rounded-item bg-ink py-3 ps-3 pe-3.5 text-on-dark shadow-pop",
                "data-[state=open]:animate-toast-in data-[state=closed]:animate-fade-out",
                "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:animate-fade-out",
              )}
            >
              <Icon aria-hidden className={cn("size-5 shrink-0", accents[message.tone])} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Toast.Title className="text-sm font-medium">{message.title}</Toast.Title>
                {message.description && (
                  <Toast.Description className="text-xs text-on-dark-muted">{message.description}</Toast.Description>
                )}
              </div>
              {message.action && (
                <>
                  <span aria-hidden className="h-5 w-px shrink-0 bg-on-dark/20" />
                  <Toast.Action
                    altText={message.action.altText ?? message.action.label}
                    onClick={message.action.onClick}
                    className="shrink-0 rounded-sm text-sm font-semibold text-tangerine-bright hover:underline"
                  >
                    {message.action.label}
                  </Toast.Action>
                </>
              )}
              <Toast.Close
                aria-label={t("action.close")}
                className="grid size-6 shrink-0 place-items-center rounded-md text-on-dark-muted transition-colors hover:bg-on-dark/10 hover:text-on-dark"
              >
                <X aria-hidden className="size-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
        <Toast.Viewport
          label={t("toast.region")}
          className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-[27rem] flex-col gap-2 p-4 outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        />
      </Toast.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast outside ToastProvider");
  return notify;
}
