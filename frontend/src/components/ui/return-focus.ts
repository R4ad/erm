import { useRef } from "react";

// Radix فوکوس را بعد از بستن پنجره فقط به Trigger خودش برمی‌گرداند. پنجره‌هایی که با state باز می‌شوند (تأیید ارسال،
// هشدار تغییرات ذخیره‌نشده، منوی کشویی موبایل) Trigger ندارند و فوکوس روی body می‌افتاد. این هوک عنصری را که پیش از
// باز شدن فوکوس داشت نگه می‌دارد و بعد از بستن به آن برمی‌گرداند؛ مگر این‌که فوکوس خودش جای دیگری رفته باشد (مثلاً
// صفحه عوض شده و پوسته فوکوس را به main داده است). اگر آن عنصر دیگر در صفحه نیست (مثلاً کارتی که با همین پنجره
// تصمیمش گرفته شد)، فوکوس به fallback صفحه می‌رود.
export function useReturnFocus(fallback?: () => HTMLElement | null) {
  const previous = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: () => {
      previous.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    },
    onCloseAutoFocus: (event: Event) => {
      event.preventDefault();
      const target = previous.current;
      previous.current = null;
      const active = document.activeElement;
      if (active && active !== document.body && active.isConnected) return;
      if (target?.isConnected) target.focus({ preventScroll: true });
      else fallback?.()?.focus();
    },
  };
}
