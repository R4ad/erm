import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// صفحه‌ها بخش جدای کدند و با import() باز می‌شوند. وقتی همه‌ی فایل‌های آزمون هم‌زمان اجرا می‌شوند، بار کردن
// اولین صفحه‌ی یک فایل گاهی از یک ثانیه‌ی پیش‌فرض findBy* بیشتر طول می‌کشد؛ سه ثانیه برای همان بارِ اول است.
configure({ asyncUtilTimeout: 3000 });

// jsdom این APIهای مرورگر را ندارد و Radix و هوک‌های رابط از آن‌ها استفاده می‌کنند.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= vi.fn();
Element.prototype.hasPointerCapture ??= vi.fn(() => false);
Element.prototype.releasePointerCapture ??= vi.fn();
// axe برای سنجش نمادهای فونتی canvas می‌خواهد که jsdom ندارد؛ بدون آن، آن بررسی رد می‌شود.
HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;

// رفتن به نشانی بیرونی (ورود، خروج) در jsdom پیاده نشده است؛ آزمون‌ها فقط نشانی خواسته‌شده را می‌سنجند.
vi.mock("@/lib/navigation", () => ({ leaveTo: vi.fn(), replaceWith: vi.fn() }));

afterEach(() => {
  cleanup();
  document.cookie = "csrftoken=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});
