// رفتن به نشانی‌ای بیرون از مسیریاب React (ورود، خروج، صفحه‌های جنگو) با بار شدن کامل صفحه، تا هیچ داده‌ای از
// صفحه‌ی قبل در حافظه نماند. در یک جا جمع شده تا آزمون‌ها به‌جای عوض کردن صفحه‌ی jsdom، نشانی را بگیرند.

export function leaveTo(url: string) {
  window.location.assign(url);
}

export function replaceWith(url: string) {
  window.location.replace(url);
}
