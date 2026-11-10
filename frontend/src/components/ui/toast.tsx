import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Toast } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { locale, t } from "@/lib/i18n";

type ToastTone = "success" | "danger" | "warning" | "info";

interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

type Notify = (message: Omit<ToastMessage, "id" | "tone"> & { tone?: ToastTone }) => void;

const ToastContext = createContext<Notify | null>(null);

const icons = { success: CircleCheck, danger: CircleAlert, warning: TriangleAlert, info: Info } as const;
const accents = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  info: "text-info",
} as const;

let nextId = 1;

/** پیام کوتاه پایین صفحه بعد از کاری که انجام شد. پیام خطا role=alert و پیام موفقیت role=status دارد. */
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
              onOpenChange={(open) => !open && remove(message.id)}
              className={cn(
                "group pointer-events-auto relative flex w-full items-start gap-3 rounded-xl border border-line bg-elevated p-4 pe-10 shadow-pop",
                "data-[state=open]:animate-toast-in data-[state=closed]:animate-fade-out",
                "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform data-[swipe=end]:animate-fade-out",
              )}
            >
              <Icon aria-hidden className={cn("mt-0.5 size-5 shrink-0", accents[message.tone])} />
              <div className="flex flex-col gap-0.5">
                <Toast.Title className="text-sm font-medium text-fg">{message.title}</Toast.Title>
                {message.description && (
                  <Toast.Description className="text-xs text-muted">{message.description}</Toast.Description>
                )}
              </div>
              <Toast.Close
                aria-label={t("action.close")}
                className="absolute end-2 top-2 grid size-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface hover:text-fg"
              >
                <X aria-hidden className="size-4" />
              </Toast.Close>
            </Toast.Root>
          );
        })}
        <Toast.Viewport
          label={t("toast.region")}
          className="fixed bottom-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none end-0 max-sm:max-w-none pb-[max(1rem,env(safe-area-inset-bottom))]"
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
