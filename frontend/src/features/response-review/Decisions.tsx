import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Pencil, X, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { Button, buttonClasses } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { ApiError, get, post } from "@/lib/api";
import { fa } from "@/lib/format";
import type { ReviewRisk, RiskComparison, RiskComparisonSide } from "@/lib/types";

// اقدام‌های 12c روی ریسک انتخاب‌شده و پنل: «تأیید و ارسال به آنالیز»، «ویرایش»، «رد» با دلیل، «مقایسه با ریسک موجود»
// و «تحلیل دوباره». متن دیالوگ‌ها از جدول تأییدشده‌ی بخش ۱۰ docs/implementation-plan.md است.

export function DecisionBar({
  onApprove,
  onEdit,
  onReject,
}: {
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}) {
  // فریم 12c: «رد» کم‌رنگ در سمت شروع خط و دو دکمه‌ی ۳۲ پیکسلی در سمت پایان، با خط جداکننده‌ی بالا.
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
      <Button variant="ghost" size="sm" onClick={onReject}>
        رد
        <X aria-hidden className="text-ink-2" />
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          ویرایش
          <Pencil aria-hidden />
        </Button>
        <Button variant="primary" size="sm" onClick={onApprove}>
          تأیید و ارسال به آنالیز
          <Check aria-hidden />
        </Button>
      </div>
    </div>
  );
}

export function RejectDialog({
  risk,
  onOpenChange,
  onRejected,
}: {
  /** ریسکی که دیالوگ برایش باز است؛ null یعنی بسته. */
  risk: ReviewRisk | null;
  onOpenChange: (open: boolean) => void;
  onRejected: () => void;
}) {
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const reject = useMutation({
    mutationFn: (target: ReviewRisk) => post<ReviewRisk>(`pending-risks/${target.id}/reject/`, { reason }),
    onSuccess: () => {
      setReason("");
      onRejected();
    },
  });
  const serverError =
    reject.error instanceof ApiError ? (reject.error.errors.reason ?? [reject.error.message]) : undefined;

  function close(open: boolean) {
    if (!open) {
      setReason("");
      setMissing(false);
      reject.reset();
    }
    onOpenChange(open);
  }

  return (
    <ConfirmDialog
      open={risk !== null}
      onOpenChange={close}
      title="رد ریسک پیشنهادی"
      description={risk ? `«${risk.title}» وارد رجیستر نمی‌شود و با دلیل شما در تاریخچه‌ی پاسخنامه می‌ماند.` : ""}
      confirmLabel="رد ریسک"
      cancelLabel="انصراف"
      tone="danger"
      loading={reject.isPending}
      onConfirm={() => {
        if (!risk) return;
        if (!reason.trim()) {
          setMissing(true);
          field.current?.focus();
          return;
        }
        reject.mutate(risk);
      }}
    >
      <Field label="دلیل رد" required error={missing && !reason.trim() ? "دلیل رد را بنویسید." : serverError}>
        <Textarea ref={field} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
    </ConfirmDialog>
  );
}

const ROWS: { key: keyof RiskComparisonSide; label: string }[] = [
  { key: "title", label: "عنوان" },
  { key: "initiating_factor", label: "عامل آغازگر" },
  { key: "paths", label: "مسیر تحقق" },
  { key: "target_event", label: "رویداد هدف" },
  { key: "impact", label: "پیامد" },
  { key: "category", label: "دسته‌ی ریسک" },
];

function Value({ value }: { value: string | string[] }) {
  if (Array.isArray(value)) {
    if (!value.length) return <>—</>;
    return (
      <ul className="flex flex-col gap-1">
        {value.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  }
  return <>{value || "—"}</>;
}

export function CompareDialog({
  target,
  onOpenChange,
}: {
  /** ریسک پیشنهادی و شناسه‌ی ریسک مشابه؛ null یعنی بسته. */
  target: { risk: ReviewRisk; similarId: number } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const comparison = useQuery({
    queryKey: ["risk-comparison", target?.risk.id, target?.similarId],
    queryFn: ({ signal }) =>
      get<RiskComparison>(`pending-risks/${target?.risk.id}/similar/?risk=${target?.similarId}`, signal),
    enabled: target !== null,
  });
  const data = comparison.data;
  const percent = data?.percent ?? target?.risk.similar.find((item) => item.id === target.similarId)?.percent;
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      {target && (
        <DialogContent
          title="مقایسه با ریسک موجود"
          description={percent !== undefined ? `${fa(percent)}٪ شباهت · ادغام در این نسخه انجام نمی‌شود.` : undefined}
          className="w-[min(40rem,calc(100vw-2rem))]"
        >
          {data ? (
            <table className="w-full table-fixed border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-start text-xs text-ink-2">
                  <th scope="col" className="pb-2 pe-3 text-start font-medium">
                    ریسک پیشنهادی
                  </th>
                  <th scope="col" className="pb-2 text-start font-medium">
                    ریسک موجود · <bdi className="code">{data.existing.code}</bdi>
                  </th>
                </tr>
              </thead>
              {ROWS.map((row) => (
                <tbody key={row.key} className="border-b border-line last:border-b-0">
                  <tr>
                    <th scope="colgroup" colSpan={2} className="pt-3 pb-1 text-start text-xs font-normal text-ink-3">
                      {row.label}
                    </th>
                  </tr>
                  <tr className="align-top text-ink">
                    <td className="pe-3 pb-3">
                      <Value value={data.suggested[row.key]} />
                    </td>
                    <td className="pb-3">
                      <Value value={data.existing[row.key]} />
                    </td>
                  </tr>
                </tbody>
              ))}
            </table>
          ) : (
            <div aria-hidden className="flex flex-col gap-3">
              <div className="skeleton h-3 w-3/4 rounded-lg" />
              <div className="skeleton h-3 w-1/2 rounded-lg" />
              <div className="skeleton h-3 w-2/3 rounded-lg" />
            </div>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button variant="secondary">بستن</Button>
            </DialogClose>
            {data && (
              <Link to={data.existing.route} className={buttonClasses({ variant: "primary" })}>
                مشاهده‌ی ریسک
              </Link>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

export function ReanalyseButton({
  pending,
  starting,
  onConfirm,
}: {
  /** پیش‌نویس‌های بررسی‌نشده‌ای که بایگانی و دوباره ساخته می‌شوند. */
  pending: number;
  starting: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Zap aria-hidden />
        تحلیل دوباره
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="تحلیل دوباره‌ی پاسخنامه"
        description={`${fa(pending)} پیش‌نویس بررسی‌نشده بایگانی و دوباره ساخته می‌شود. ریسک‌های تأییدشده و ردشده تغییری نمی‌کنند.`}
        confirmLabel="تحلیل دوباره"
        cancelLabel="انصراف"
        loading={starting}
        onConfirm={() => void onConfirm().finally(() => setOpen(false))}
      />
    </>
  );
}
