import { Popover as RadixPopover } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverClose = RadixPopover.Close;

// کارت شناور فیگما (مثل جزئیات خانه‌ی جهان ریسک): پهنای ۳۰۰، گوشه‌ی ۱۲، سایه‌ی pop؛ فوکوس داخلش می‌رود و Esc می‌بندد.
export function PopoverContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-[18.75rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-elevated p-4 text-sm text-ink shadow-pop",
          "origin-(--radix-popover-content-transform-origin) data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          "focus-visible:outline-none",
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}
