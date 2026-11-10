import { cn } from "@/lib/cn";

/**
 * متن بلند روش ارزیابی، بند به بند؛ همان قاعده‌ی فیلتر paragraphs جنگو: بندها با یک خط خالی از هم جدا می‌شوند، بندی
 * که با «## » شروع شود عنوان است و خط‌های هر بند نگه داشته می‌شوند. متن از پنل مدیریت می‌آید و فقط به‌صورت متن
 * React رندر می‌شود، پس هیچ HTML یا اسکریپتی از آن به صفحه نمی‌رسد.
 */
export function Paragraphs({
  text,
  level = 3,
  className,
}: {
  text: string | null | undefined;
  /** سطح عنوان‌های متن، یکی پایین‌تر از عنوان بخشی که متن در آن است. */
  level?: 3 | 4;
  className?: string;
}) {
  const Heading = level === 3 ? "h3" : "h4";
  const blocks = (text ?? "")
    .split(/\r?\n\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (!blocks.length) return null;
  return (
    <div className={cn("flex max-w-prose flex-col gap-3 text-sm leading-8 text-fg/90", className)}>
      {blocks.map((block, index) =>
        block.startsWith("## ") ? (
          <Heading key={index} className="mt-2 text-sm font-semibold text-fg">
            {block.slice(3)}
          </Heading>
        ) : (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        ),
      )}
    </div>
  );
}
