import { ArrowDown, ArrowUp } from "lucide-react";

import { AppLink } from "@/components/ui/app-link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LevelBadge } from "@/components/ui/level-badge";
import { Alert } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { fa, faText } from "@/lib/format";
import type { Comparison } from "@/lib/types";

// جدول مقایسه‌ی ارزیابی‌ها (assessments/includes/comparison_table.html): در صفحه‌ی مقایسه، پرونده‌ی طرح مواجهه و فرم
// بازسنجی. ستون‌ها، ترتیبشان و جهت تغییر هر خانه نسبت به ستون اول را جنگو حساب می‌کند (assessments/comparison.py).

function Trend({ trend }: { trend: "" | "up" | "down" }) {
  if (trend === "down") {
    return (
      <span className="inline-flex items-center text-success" title="کمتر از ستون اول">
        <ArrowDown aria-hidden className="size-4" />
        <span className="sr-only">کمتر از ستون اول</span>
      </span>
    );
  }
  if (trend === "up") {
    return (
      <span className="inline-flex items-center text-danger" title="بیشتر از ستون اول">
        <ArrowUp aria-hidden className="size-4" />
        <span className="sr-only">بیشتر از ستون اول</span>
      </span>
    );
  }
  return null;
}

/** `bare` وقتی است که جدول خودش داخل یک بخش پرونده نشسته و کارت خودش را لازم ندارد. */
export function ComparisonTable({
  data,
  caption,
  bare = false,
}: {
  data: Comparison;
  caption: string;
  bare?: boolean;
}) {
  const Box = bare ? "div" : Card;
  return (
    <div className={cn("flex flex-col", bare ? "gap-0" : "gap-4")}>
      {data.method_changed && (
        <Alert tone="warning" className={cn(bare && "m-5 mb-0")}>
          نسخه‌ی روش این ارزیابی‌ها یکی نیست؛ بخشی از تغییر سطح ممکن است از تغییر روش آمده باشد و جدا از اثر اقدام‌ها
          گزارش می‌شود (بخش ۲۱).
        </Alert>
      )}
      <Box className={cn(!bare && "table-shell overflow-clip")}>
        <div className="table-scroll">
          <table className="data-table data-matrix">
            <caption className="sr-only">{caption}؛ جهت تغییر هر خانه نسبت به ستون اول است.</caption>
            <thead>
              <tr>
                <th scope="col">مؤلفه</th>
                {data.profiles.map((profile, index) => (
                  <th key={profile.id} scope="col" className="text-center">
                    <span className="flex flex-col items-center gap-1">
                      <AppLink href={profile.href} className="code">
                        {profile.code}
                      </AppLink>
                      {/* سرستون جدول یک‌خطی است؛ نوع و نسخه در ستون باریک موبایل به خط بعد می‌روند. */}
                      <span className="text-xs font-normal whitespace-normal text-muted">
                        {profile.kind.label}،{" "}
                        <span className="whitespace-nowrap">روش نسخه‌ی {fa(profile.method_version)}</span>
                      </span>
                      <span className="flex flex-wrap justify-center gap-1">
                        {index === 0 && <Badge tone="info">مبنای مقایسه</Badge>}
                        {profile.incomplete && <Badge tone="danger">ناقص</Badge>}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="min-w-32 text-start font-normal text-fg sm:min-w-48">
                    {faText(row.label)}
                  </th>
                  {row.cells.map((cell, index) => (
                    <td key={data.profiles[index]?.id ?? index} className="text-center whitespace-nowrap">
                      <span className="inline-flex items-center justify-center gap-1.5 tabular">
                        {cell.level ? <LevelBadge level={cell.level} /> : faText(cell.text)}
                        <Trend trend={cell.trend} />
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>
      <p className={cn("text-xs leading-6 text-muted", bare && "px-5 py-4")}>
        پیامد هر بُعد بیشترین سطح آن در ستون‌های داتین و بانک‌هاست؛ «؟» یعنی خانه‌ای نامعلوم یا ثبت‌نشده است.{" "}
        <ArrowDown aria-hidden className="inline size-3.5 text-success" />
        <span className="sr-only">پیکان رو به پایین</span> یعنی کمتر از ستون اول و{" "}
        <ArrowUp aria-hidden className="inline size-3.5 text-danger" />
        <span className="sr-only">پیکان رو به بالا</span> یعنی بیشتر.
      </p>
    </div>
  );
}
