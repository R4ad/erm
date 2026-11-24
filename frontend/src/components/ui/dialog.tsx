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

const sectioned =
  "fixed left-1/2 top-1/2 z-50 grid w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-modal border border-line bg-elevated shadow-pop " +
  "-translate-x-1/2 -translate-y-1/2 data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in";

interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** مودال فرم (مثل 12e): سربرگ با خط زیرین، بدنه‌ی پیمایش‌پذیر و این پانویس با زمینه‌ی subtle و خط بالایی. */
  footer?: ReactNode;
}

export function DialogContent({ title, description, footer, className, children, ...props }: DialogContentProps) {
  const focus = useReturnFocus();
  if (footer !== undefined) {
    return (
      <RadixDialog.Portal>
        <RadixDialog.Overlay className={overlay} />
        <RadixDialog.Content className={cn(sectioned, className)} {...focus} {...props}>
          <div className="flex items-start gap-4 border-b border-line px-6 pt-5 pb-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <RadixDialog.Title className="text-h2 font-bold text-ink">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="text-sm leading-[1.375rem] text-ink-2">
                  {description}
                </RadixDialog.Description>
              ) : null}
            </div>
            <RadixDialog.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("action.close")}>
                <X />
              </Button>
            </RadixDialog.Close>
          </div>
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-[1.125rem]">{children}</div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-subtle px-6 py-4">
            {footer}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    );
  }
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
