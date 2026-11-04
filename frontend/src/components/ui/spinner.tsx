import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <LoaderCircle aria-hidden className={cn("size-4 animate-spin text-muted", className)} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
