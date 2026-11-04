import type { ComponentProps } from "react";
import { Link } from "react-router-dom";

import { useRouteOf } from "@/features/session/links";
import { cn } from "@/lib/cn";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import { ClassicLink } from "./classic-link";

interface AppLinkProps extends Omit<ComponentProps<"a">, "href"> {
  /** نشانی صفحه‌ی جنگو، همان‌طور که API داده است. */
  href: string;
  button?: { variant?: ButtonVariant; size?: ButtonSize };
}

/**
 * پیوند به یک صفحه‌ی سامانه با نشانی جنگو. اگر آن صفحه در این رابط هست با مسیریاب باز می‌شود، وگرنه همان
 * ClassicLink است که صفحه‌ی جنگو را با بارگذاری کامل باز می‌کند و نشانه‌اش را دارد.
 */
export function AppLink({ href, button, className, children, ...props }: AppLinkProps) {
  const route = useRouteOf()(href);
  if (!route) {
    return (
      <ClassicLink href={href} button={button} className={className} {...props}>
        {children}
      </ClassicLink>
    );
  }
  return (
    <Link
      to={route}
      viewTransition
      className={
        button
          ? buttonClasses({ ...button, className })
          : cn("rounded-md text-accent-text underline-offset-4 hover:underline", className)
      }
      {...props}
    >
      {children}
    </Link>
  );
}
