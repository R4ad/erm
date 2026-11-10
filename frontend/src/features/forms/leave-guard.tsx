import { useEffect, type RefObject } from "react";
import { useBlocker } from "react-router-dom";

import { ConfirmDialog } from "@/components/ui/dialog";

interface LeaveGuardProps {
  /** تغییر ذخیره‌نشده هست و رفتن باید پرسیده شود. */
  when: boolean;
  /**
   * true یعنی رفتن خواسته‌ی خود فرم است (مثلاً بعد از ذخیره). ref است، نه prop، چون رفتن ممکن است پیش از رندر
   * بعدی پیش بیاید و `when` هنوز مقدار رندر قبلی را داشته باشد.
   */
  released?: RefObject<boolean>;
  description?: string;
}

/** پیش از بستن برگه یا رفتن به صفحه‌ی دیگر با تغییر ذخیره‌نشده می‌پرسد. */
export function LeaveGuard({ when, released, description }: LeaveGuardProps) {
  useEffect(() => {
    if (!when) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!released?.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [when, released]);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && !released?.current && currentLocation.pathname !== nextLocation.pathname,
  );
  return (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onOpenChange={(open) => !open && blocker.reset?.()}
      title="تغییرات ذخیره نشده است"
      description={description ?? "اگر از این صفحه بروید، چیزهایی که در این فرم نوشته‌اید از دست می‌رود."}
      cancelLabel="ماندن در صفحه"
      confirmLabel="رفتن بدون ذخیره"
      tone="danger"
      onConfirm={() => blocker.proceed?.()}
    />
  );
}
