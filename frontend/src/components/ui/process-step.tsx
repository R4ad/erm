import { cn } from "@/lib/cn";
import { fa } from "@/lib/format";

import { Icon } from "./icon";

export type StepState = "done" | "current" | "upcoming";

/** «Process Step» فیگما: نوار ۴ پیکسلی و زیرش برچسب با نشانگر عدد یا تیک. */
export function ProcessStep({ index, label, state }: { index: number; label: string; state: StepState }) {
  return (
    <li className="flex min-w-0 flex-1 flex-col gap-2" aria-current={state === "current" ? "step" : undefined}>
      <span
        aria-hidden
        className={cn(
          "h-1 rounded-full",
          state === "done" && "bg-brand",
          state === "current" && "bg-brand",
          state === "upcoming" && "bg-line",
        )}
      />
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem] font-semibold",
            state === "done" && "bg-brand text-on-brand",
            state === "current" && "border-[1.5px] border-brand bg-panel text-brand shadow-focus",
            state === "upcoming" && "border border-line-strong bg-subtle text-ink-3",
          )}
        >
          {state === "done" ? <Icon name="check" size={12} /> : fa(index)}
        </span>
        <span
          className={cn(
            "truncate",
            state === "current" ? "text-sm font-semibold text-ink" : "text-xs font-medium",
            state === "done" && "text-ink-2",
            state === "upcoming" && "text-ink-3",
          )}
        >
          {label}
          {state === "done" && <span className="sr-only"> (انجام‌شده)</span>}
        </span>
      </span>
    </li>
  );
}

export function ProcessSteps({
  steps,
  className,
}: {
  steps: { label: string; state: StepState }[];
  className?: string;
}) {
  return (
    <ol className={cn("flex gap-2", className)}>
      {steps.map((step, index) => (
        <ProcessStep key={step.label} index={index + 1} label={step.label} state={step.state} />
      ))}
    </ol>
  );
}
