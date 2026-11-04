import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Count } from "./badge";

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    />
  );
}

interface TabsTriggerProps extends ComponentProps<typeof RadixTabs.Trigger> {
  count?: string;
  icon?: ReactNode;
}

export function TabsTrigger({ className, children, count, icon, ...props }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        "relative -mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm text-muted transition-colors duration-150",
        "hover:text-fg data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-fg",
        "focus-visible:outline-offset-[-2px] [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count && <Count value={count} />}
    </RadixTabs.Trigger>
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return (
    <RadixTabs.Content
      className={cn("pt-5 focus-visible:outline-none data-[state=active]:animate-fade-in", className)}
      {...props}
    />
  );
}
