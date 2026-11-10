import { cn } from "@/lib/cn";
import type { Level } from "@/lib/types";

// رنگ سطح از روش ارزیابی فعال می‌آید و برای هر سطح فرق دارد؛ برای این‌که متن روی هر رنگی خوانا بماند، رنگ فقط
// در نقطه و حاشیه می‌آید و متن رنگ اصلی رابط را دارد. نام سطح همیشه نوشته می‌شود، پس رنگ تنها نشانه نیست.

export function LevelBadge({ level, size = "md" }: { level: Level | null; size?: "md" | "lg" }) {
  if (!level) {
    return (
      <span className="inline-flex h-6 shrink-0 items-center rounded-full border border-dashed border-line-strong px-2.5 text-xs whitespace-nowrap text-muted">
        ارزیابی نشده
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full border font-medium whitespace-nowrap text-fg",
        size === "lg" ? "h-9 px-4 text-sm" : "h-6 px-2.5 text-xs",
      )}
      style={{
        borderColor: `color-mix(in oklab, ${level.color} 45%, transparent)`,
        backgroundColor: `color-mix(in oklab, ${level.color} 14%, transparent)`,
      }}
    >
      <span
        aria-hidden
        className={cn("rounded-full", size === "lg" ? "size-2.5" : "size-2")}
        style={{
          backgroundColor: level.color,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${level.color} 25%, transparent)`,
        }}
      />
      <span>
        <span className="sr-only">سطح ریسک: </span>
        {level.name}
      </span>
    </span>
  );
}
