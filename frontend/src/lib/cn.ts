import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge باید اندازه‌ها و سایه‌های تعریف‌شده در styles/index.css را بشناسد؛ وگرنه text-title را رنگ می‌پندارد
// و با text-muted یکی را حذف می‌کند.
const merge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["heading", "title", "display", "h1", "h2", "h3", "stat", "kpi"],
      shadow: ["card", "pop", "focus"],
    },
  },
});

/** کلاس‌ها را کنار هم می‌گذارد و از کلاس‌های هم‌کار Tailwind فقط آخری را نگه می‌دارد. */
export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
