import { SquareArrowOutUpLeft } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";

interface ClassicLinkProps extends ComponentProps<"a"> {
  href: string;
  /** با ظاهر دکمه؛ بدون آن پیوند متنی است. */
  button?: { variant?: ButtonVariant; size?: ButtonSize };
}

/** پیوند به صفحه‌ای که هنوز فقط در رابط جنگو هست؛ با بارگذاری کامل باز می‌شود و نشانه‌اش این را می‌گوید. */
export function ClassicLink({ href, button, className, children, ...props }: ClassicLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        button
          ? buttonClasses({ ...button, className })
          : cn(
              "inline-flex items-center gap-1.5 rounded-md text-accent-text underline-offset-4 hover:underline",
              className,
            ),
      )}
      {...props}
    >
      {children}
      <SquareArrowOutUpLeft aria-hidden className="size-3.5 opacity-70 ltr:-scale-x-100" />
      <span className="sr-only">({t("shell.classic")})</span>
    </a>
  );
}
