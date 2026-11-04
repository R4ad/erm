import { ChevronDown } from "lucide-react";
import { Accordion as RadixAccordion } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export const Accordion = RadixAccordion.Root;

export function AccordionItem({ className, ...props }: ComponentProps<typeof RadixAccordion.Item>) {
  return <RadixAccordion.Item className={cn("border-b border-line last:border-b-0", className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  meta,
  ...props
}: ComponentProps<typeof RadixAccordion.Trigger> & { meta?: ReactNode }) {
  return (
    <RadixAccordion.Header className="flex">
      <RadixAccordion.Trigger
        className={cn(
          "group flex flex-1 items-center gap-3 py-3.5 text-start text-sm font-medium text-fg transition-colors hover:text-accent-text",
          className,
        )}
        {...props}
      >
        <span className="flex-1">{children}</span>
        {meta}
        <ChevronDown
          aria-hidden
          className="size-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
        />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
}

export function AccordionContent({ className, children, ...props }: ComponentProps<typeof RadixAccordion.Content>) {
  return (
    <RadixAccordion.Content
      className="overflow-hidden data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in"
      {...props}
    >
      <div className={cn("pb-4 text-sm text-muted", className)}>{children}</div>
    </RadixAccordion.Content>
  );
}
