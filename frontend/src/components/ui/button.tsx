import { LoaderCircle } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const base =
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap select-none " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out " +
  "active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0";

const variants = {
  primary:
    "bg-accent text-accent-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(0_0_0/0.3)] hover:bg-accent-hover",
  secondary: "border border-line bg-surface text-fg shadow-card hover:border-line-strong hover:bg-elevated",
  outline: "border border-line-strong bg-transparent text-fg hover:bg-surface",
  ghost: "bg-transparent text-muted hover:bg-surface hover:text-fg",
  danger: "bg-danger-soft text-danger border border-danger/30 hover:bg-danger/20",
  link: "h-auto rounded-md px-0 text-accent-text underline-offset-4 hover:underline active:translate-y-0",
} as const;

const sizes = {
  sm: "h-8 px-3 text-xs [&_svg]:size-3.5",
  md: "h-10 px-4 text-sm [&_svg]:size-4",
  lg: "h-12 px-5 text-base [&_svg]:size-[1.125rem]",
  icon: "size-10 [&_svg]:size-[1.125rem]",
  "icon-sm": "size-8 rounded-lg [&_svg]:size-4",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClasses({
  variant = "secondary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], variant !== "link" && sizes[size], className);
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
