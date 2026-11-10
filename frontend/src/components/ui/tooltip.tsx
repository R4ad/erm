import { Tooltip as RadixTooltip } from "radix-ui";
import type { ReactNode } from "react";

export const TooltipProvider = RadixTooltip.Provider;

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** وقتی برچسب همیشه دیده می‌شود (منوی باز)، راهنما لازم نیست. */
  disabled?: boolean;
}

/** راهنمای کوتاه روی hover و focus. جای برچسب دسترس‌پذیر نیست: دکمه‌ی آیکونی خودش aria-label دارد. */
export function Tooltip({ content, children, side = "top", disabled = false }: TooltipProps) {
  if (disabled) return <>{children}</>;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          collisionPadding={12}
          className="z-50 max-w-64 rounded-lg border border-line bg-elevated px-2.5 py-1.5 text-xs text-fg shadow-pop data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-pop-in data-[state=instant-open]:animate-fade-in"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
