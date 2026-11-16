import { X } from "lucide-react";
import { AlertDialog, Dialog as RadixDialog } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

import { Button, type ButtonVariant } from "./button";
import { useReturnFocus } from "./return-focus";

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

const overlay =
  "fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in";
const panel =
  "fixed left-1/2 top-1/2 z-50 grid w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto rounded-2xl border border-line bg-elevated p-6 shadow-pop " +
  "-translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in";

interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
}

export function DialogContent({ title, description, className, children, ...props }: DialogContentProps) {
  const focus = useReturnFocus();
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlay} />
      <RadixDialog.Content className={cn(panel, className)} {...focus} {...props}>
        <div className="flex items-start gap-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <RadixDialog.Title className="text-title font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-sm text-muted">{description}</RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("action.close")}>
              <X />
            </Button>
          </RadixDialog.Close>
        </div>
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ButtonVariant;
  loading?: boolean;
  /** دکمه‌ی تأیید غیرفعال، مثلاً وقتی شرط کار هنوز برقرار نیست و دلیلش در description آمده است. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
}

/** پرسش تأیید پیش از کاری که برگشت ساده ندارد. فوکوس اول روی «انصراف» است تا Enter اشتباهی کاری نکند. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = t("action.cancel"),
  tone = "primary",
  loading = false,
  confirmDisabled = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const focus = useReturnFocus();
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content className={panel} {...focus}>
          <div className="flex flex-col gap-1.5">
            <AlertDialog.Title className="text-title font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-muted">{description}</AlertDialog.Description>
          </div>
          {children}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone}
              loading={loading}
              disabled={confirmDisabled}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
