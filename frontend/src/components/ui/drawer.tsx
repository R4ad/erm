import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { locale, t } from "@/lib/i18n";

import { useReturnFocus } from "./return-focus";

export const Drawer = Dialog.Root;
export const DrawerTrigger = Dialog.Trigger;
export const DrawerClose = Dialog.Close;

interface DrawerContentProps {
  title: ReactNode;
  /** عنوان فقط برای صفحه‌خوان، وقتی محتوای کشو عنوان دیداری خودش را دارد. */
  hideTitle?: boolean;
  description?: ReactNode;
  /** start یعنی سمت شروع خط: در رابط فارسی راست. */
  side?: "start" | "end";
  /** panel کشوی ۵۲۰ پیکسلی فرم (فریم 12d): سربرگ با خط زیر، عنوان H2 و چیپ کنار عنوان. */
  size?: "menu" | "panel";
  /** چیپ کنار عنوان، مثل «پیش‌نویس AI». */
  chip?: ReactNode;
  /** جای فوکوس بعد از بستن وقتی دکمه‌ی بازکننده دیگر در صفحه نیست. */
  returnFocus?: () => HTMLElement | null;
  className?: string;
  children: ReactNode;
}

export function DrawerContent({
  title,
  hideTitle = false,
  description,
  side = "start",
  size = "menu",
  chip,
  returnFocus,
  className,
  children,
}: DrawerContentProps) {
  const right = (side === "start") === (locale.dir === "rtl");
  const focus = useReturnFocus(returnFocus);
  const panel = size === "panel";
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        {...focus}
        className={cn(
          "fixed inset-y-0 z-50 flex flex-col border-line bg-panel shadow-pop outline-none",
          panel ? "w-[min(32.5rem,100vw)]" : "w-[min(20rem,calc(100vw-3rem))]",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          right
            ? "right-0 border-l data-[state=closed]:animate-sheet-out-right data-[state=open]:animate-sheet-in-right"
            : "left-0 border-r data-[state=closed]:animate-sheet-out-left data-[state=open]:animate-sheet-in-left",
          className,
        )}
      >
        {panel ? (
          <div className="flex flex-col gap-1.5 border-b border-line px-6 pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Dialog.Title className="text-h2 font-bold text-ink">{title}</Dialog.Title>
                {chip}
              </div>
              <Dialog.Close
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                aria-label={t("action.close")}
              >
                <X aria-hidden className="size-4.5" />
              </Dialog.Close>
            </div>
            {description ? (
              <Dialog.Description className="text-xs text-ink-3">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </div>
        ) : (
          <>
            <div className={cn("flex items-center gap-3 px-4 pt-4", hideTitle && "absolute end-0 top-0 z-10")}>
              <Dialog.Title className={cn("flex-1 text-heading font-semibold", hideTitle && "sr-only")}>
                {title}
              </Dialog.Title>
              <Dialog.Close
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-fg"
                aria-label={t("action.close")}
              >
                <X aria-hidden className="size-4.5" />
              </Dialog.Close>
            </div>
            {description ? (
              <Dialog.Description className="px-4 text-xs text-muted">{description}</Dialog.Description>
            ) : (
              <Dialog.Description className="sr-only">{title}</Dialog.Description>
            )}
          </>
        )}
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
