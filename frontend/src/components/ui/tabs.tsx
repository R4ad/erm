import { Tabs as RadixTabs } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Count } from "./badge";

export const Tabs = RadixTabs.Root;

// «Tab» فیگما: ارتفاع ۴۰، متن ۱۳، شمارنده‌ی اختیاری؛ زبانه‌ی فعال متن برند SemiBold و خط زیرین ۲ پیکسل برند.
export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        "flex gap-4 overflow-x-auto border-b border-line px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
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
        "group relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-1 text-sm font-medium text-ink-2 transition-colors duration-150",
        "hover:text-ink data-[state=active]:border-brand data-[state=active]:font-semibold data-[state=active]:text-brand",
        "focus-visible:outline-offset-[-2px] [&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {icon}
      {children}
      {count && (
        <Count
          value={count}
          className="group-data-[state=active]:bg-brand-subtle group-data-[state=active]:text-brand"
        />
      )}
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
