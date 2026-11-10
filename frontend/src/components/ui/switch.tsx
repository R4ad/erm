import { Switch as RadixSwitch } from "radix-ui";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** کلید روشن/خاموش با نقش switch؛ برای ترجیحی که فوراً اعمال می‌شود، نه برای فیلد فرمی که بعداً ارسال شود. */
export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="text-xs text-muted">
            {description}
          </span>
        )}
      </span>
      <RadixSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
        className="peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-line-strong bg-surface p-0.5 transition-colors duration-200 data-[state=checked]:border-accent data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RadixSwitch.Thumb className="block size-[1.125rem] rounded-full bg-fg shadow-sm transition-transform duration-200 ease-out data-[state=checked]:bg-accent-fg rtl:data-[state=checked]:-translate-x-4 ltr:data-[state=checked]:translate-x-4" />
      </RadixSwitch.Root>
    </div>
  );
}
