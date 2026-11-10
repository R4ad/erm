import { Badge } from "@/components/ui/badge";
import type { ResponseRow } from "@/lib/types";

/** وضعیت پاسخ: برگشت‌خورده و مهلت‌گذشته هشدارند، ارسال‌شده و بررسی‌شده آرام. */
export function ResponseStatus({ row }: { row: Pick<ResponseRow, "status" | "is_overdue"> }) {
  if (row.is_overdue) {
    return (
      <Badge tone="danger" dot>
        {row.status.label}، مهلت گذشته
      </Badge>
    );
  }
  const tone =
    row.status.value === "returned"
      ? "warning"
      : row.status.value === "draft"
        ? "neutral"
        : row.status.value === "reviewed"
          ? "success"
          : "accent";
  return (
    <Badge tone={tone} dot>
      {row.status.label}
    </Badge>
  );
}
