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
  className?: string;
  children: ReactNode;
}

export function DrawerContent({
  title,
  hideTitle = false,
  description,
  side = "start",
  className,
  children,
}: DrawerContentProps) {
  const right = (side === "start") === (locale.dir === "rtl");
  const focus = useReturnFocus();
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
      <Dialog.Content
        {...focus}
        className={cn(
          "fixed inset-y-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col border-line bg-panel shadow-pop outline-none",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          right
            ? "right-0 border-l data-[state=closed]:animate-sheet-out-right data-[state=open]:animate-sheet-in-right"
            : "left-0 border-r data-[state=closed]:animate-sheet-out-left data-[state=open]:animate-sheet-in-left",
          className,
        )}
      >
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
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  );
}
