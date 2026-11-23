import { cn } from "@/lib/cn";

/** دو حرف اول نام و نام خانوادگی با فاصله، مثل فیگما: «سارا محمدی» ← «س م». */
function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "؟";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join(" ");
}

/** «Avatar» فیگما: دایره‌ی ۳۲ با زمینه‌ی brand/subtle و حروف اول نام به رنگ برند. */
export function Avatar({ name, size = 32, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-brand-subtle text-xs font-medium whitespace-nowrap text-brand",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
