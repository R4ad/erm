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

/** کمان‌های نازک ربع بالا-راست نشان داتین (از ۸۴- تا ۶- درجه، روی شعاع‌های ۹٫۸ تا ۱۲٫۹). */
const LOGO_ARCS = [9.8, 10.9, 12, 12.9].map((r) => {
  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return `${(16 + r * Math.cos(rad)).toFixed(2)} ${(16 + r * Math.sin(rad)).toFixed(2)}`;
  };
  return `M${point(-84)}A${r} ${r} 0 0 1 ${point(-6)}`;
});

/** نشان داتین: حلقه‌ی ضخیم سه‌چهارم و چهار کمان نازک در ربع باقی‌مانده؛ رنگ از currentColor. */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="M16 5.5A10.5 10.5 0 1 0 26.5 16" strokeWidth={5} />
      {LOGO_ARCS.map((d) => (
        <path key={d} d={d} strokeWidth={0.7} />
      ))}
    </svg>
  );
}
