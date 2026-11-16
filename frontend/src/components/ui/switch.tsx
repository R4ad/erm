import { Switch as RadixSwitch } from "radix-ui";
import { useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/** «Toggle» فیگما (۳۶×۲۰، دستگیره‌ی ۱۴): روشن برند، خاموش border/strong. */
export function Toggle({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <RadixSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-line-strong p-[3px] transition-colors duration-200",
        "focus-visible:shadow-focus focus-visible:outline-none data-[state=checked]:bg-brand disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...aria}
    >
      <RadixSwitch.Thumb className="block size-3.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.18)] transition-transform duration-200 ease-out rtl:data-[state=checked]:-translate-x-4 ltr:data-[state=checked]:translate-x-4" />
    </RadixSwitch.Root>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** کلید روشن/خاموش با برچسب؛ برای ترجیحی که فوراً اعمال می‌شود، نه برای فیلد فرمی که بعداً ارسال شود. */
export function Switch({ checked, onCheckedChange, label, description, disabled, className }: SwitchProps) {
  const id = useId();
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <span className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && (
          <span id={`${id}-description`} className="text-xs text-ink-3">
            {description}
          </span>
        )}
      </span>
      <Toggle
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-description` : undefined}
      />
    </div>
  );
}
