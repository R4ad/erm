import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

// کامپوننت «Button» فیگما: Primary، Secondary، Ghost و Danger در دو اندازه‌ی md (۳۶؛ Secondary ۳۸) و sm (۳۲؛ Secondary
// ۳۴)، گوشه‌ی ۸، متن ۱۳.
// آیکون ۱۸ (md) یا ۱۶ (sm) بعد از متن در ترتیب راست‌به‌چپ می‌آید، یعنی سمت راست متن.

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 ease-out " +
  "focus-visible:outline-none focus-visible:shadow-focus " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0";

const variants = {
  primary: "bg-brand text-on-brand hover:bg-brand-hover",
  secondary: "border border-line-strong bg-panel text-ink hover:bg-subtle",
  outline: "border border-line-strong bg-panel text-ink hover:bg-subtle",
  ghost: "bg-transparent text-brand hover:bg-brand-subtle",
  /** دکمه‌ی آیکونی کم‌رنگ (بستن، منوی بیشتر). */
  quiet: "bg-transparent text-ink-2 hover:bg-subtle hover:text-ink",
  danger: "bg-danger-solid text-on-brand hover:bg-danger",
  link: "h-auto rounded-sm px-0 text-brand underline-offset-4 hover:underline",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm font-medium [&_svg]:size-4",
  md: "h-9 px-4 text-sm font-semibold [&_svg]:size-[1.125rem]",
  lg: "h-10 px-5 text-base font-semibold [&_svg]:size-[1.125rem]",
  icon: "size-9 [&_svg]:size-[1.125rem]",
  "icon-sm": "size-8 [&_svg]:size-4",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  // Secondary در فیگما ۲ پیکسل بلندتر از Primary است (۳۸ و ۳۴)، چون حاشیه‌اش بیرون از کادر ۳۶ و ۳۲ است.
  const bordered = variant === "secondary" || variant === "outline";
  return cn(
    base,
    variants[variant],
    variant !== "link" && sizes[size],
    bordered && size === "md" && "h-[2.375rem]",
    bordered && size === "sm" && "h-[2.125rem]",
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** دکمه را غیرفعال می‌کند، چرخنده نشان می‌دهد و به صفحه‌خوان «مشغول» می‌گوید. */
  loading?: boolean;
  /** فرزند (Link یا a) ظاهر دکمه را می‌گیرد. */
  asChild?: boolean;
}

export function Button({
  variant,
  size,
  loading = false,
  asChild = false,
  className,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, className });
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <LoaderCircle aria-hidden className="animate-spin" />}
      {children}
    </button>
  );
}
