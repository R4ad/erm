import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-md border border-line-strong bg-surface px-1 font-code text-[0.6875rem] text-muted",
        className,
      )}
      {...props}
    />
  );
}
