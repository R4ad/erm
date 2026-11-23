import type { SVGProps } from "react";

import { cn } from "@/lib/cn";

import { ICON_PATHS, type IconName } from "./icon-paths";

export type { IconName };

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** اندازه به پیکسل؛ آیکون‌های فیگما ۱۲، ۱۴، ۱۶ و ۱۸ پیکسل‌اند. */
  size?: number;
  /** پیکان‌ها و شورون‌ها در رابط راست‌به‌چپ آینه نمی‌شوند؛ فیگما جهت هرکدام را خودش انتخاب کرده است. */
  label?: string;
}

/** آیکون خطی سیستم طراحی فیگما (خط ۱٫۵، سر گرد)؛ رنگ از color والد می‌آید. */
export function Icon({ name, size = 18, label, className, ...props }: IconProps) {
  const paths = ICON_PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      {typeof paths === "string" ? <path d={paths} /> : paths.map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

/** نشان سامانه (brand/logo-mark): ماتریس ۳×۳ سطح‌های ریسک. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const cells = ["#DC2626", "#EA580C", "#EAB308", "#EA580C", "#EAB308", "#16A34A", "#EAB308", "#16A34A", "#16A34A"];
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden focusable="false" className={className}>
      {cells.map((fill, index) => (
        <rect key={index} x={(index % 3) * 10} y={Math.floor(index / 3) * 10} width="8" height="8" rx="2" fill={fill} />
      ))}
    </svg>
  );
}
