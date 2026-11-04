import { z } from "zod";

// Zod برای سرعت، اعتبارسنج‌ها را با new Function می‌سازد؛ CSP صفحه (بدون unsafe-eval و با Trusted Types) این را
// می‌بندد و مرورگر گزارش خطا می‌دهد. jitless همان اعتبارسنجی را بدون eval انجام می‌دهد. همه‌ی فرم‌ها z را از این‌جا
// می‌گیرند تا این تنظیم پیش از اولین schema اعمال شده باشد.
z.config({ jitless: true });

export { z };
