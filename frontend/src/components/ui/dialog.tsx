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
// وسط صفحه با inset-0 و m-auto، که در راست‌به‌چپ و چپ‌به‌راست یکی است؛ h-fit تا inset ارتفاع را نکشد.
const base =
  "fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] rounded-modal border border-line bg-elevated shadow-pop " +
  "data-[state=closed]:animate-fade-out data-[state=open]:animate-pop-in";
const panel = cn(base, "w-[min(32rem,calc(100vw-2rem))] gap-4 overflow-y-auto p-6");
const sectioned = cn(base, "w-[min(40rem,calc(100vw-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden");

interface DialogContentProps extends Omit<ComponentProps<typeof RadixDialog.Content>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  /** مودال فرم (مثل 12e): سربرگ با خط زیرین، بدنه‌ی پیمایش‌پذیر و این پانویس با زمینه‌ی subtle و خط بالایی. */
  footer?: ReactNode;
}

export function DialogContent({ title, description, footer, className, children, ...props }: DialogContentProps) {
  const focus = useReturnFocus();
  const form = footer !== undefined;
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={overlay} />
      <RadixDialog.Content className={cn(form ? sectioned : panel, className)} {...focus} {...props}>
        <div className={cn("flex items-start gap-4", form && "border-b border-line px-6 pt-5 pb-4")}>
          <div className="flex flex-1 flex-col gap-1.5">
            <RadixDialog.Title className={form ? "text-h2 font-bold text-ink" : "text-title font-semibold"}>
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className={cn("text-sm text-ink-2", form && "leading-[1.375rem]")}>
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
        {form ? (
          <>
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-6 py-[1.125rem]">{children}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line bg-subtle px-6 py-4">
              {footer}
            </div>
          </>
        ) : (
          children
        )}
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
  /** جای فوکوس بعد از بستن وقتی دکمه‌ی بازکننده دیگر در صفحه نیست. */
  returnFocus?: () => HTMLElement | null;
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
  returnFocus,
  children,
}: ConfirmDialogProps) {
  const focus = useReturnFocus(returnFocus);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlay} />
        <AlertDialog.Content className={panel} {...focus}>
          <div className="flex flex-col gap-1.5">
            <AlertDialog.Title className="text-title font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="text-sm text-ink-2">{description}</AlertDialog.Description>
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
