// فقط ترجیح‌های ظاهری (تم، جمع بودن منو) در localStorage می‌ماند؛ هیچ داده‌ی کاری یا حساسی این‌جا نوشته نمی‌شود.
// در پنجره‌ی خصوصی یا با کوکی‌های بسته، خواندن و نوشتن ممکن است خطا بدهد و رابط باید بی‌آن هم درست کار کند.

const PREFIX = "erm:";

export function readPreference<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(PREFIX + name);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writePreference(name: string, value: string) {
  try {
    window.localStorage.setItem(PREFIX + name, value);
  } catch {
    // ترجیح ذخیره نشد؛ تا بستن صفحه همان مقدار در حافظه می‌ماند.
  }
}
