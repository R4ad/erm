// زبان و جهت رابط. متن‌های مشترک پوسته، حالت‌ها و دکمه‌ها این‌جا با کلید آمده‌اند تا زبان دوم فقط یک فایل
// پیام تازه باشد؛ متن خود صفحه‌ها فعلاً کنار همان صفحه است. قالب‌بندی عدد و تاریخ از lib/format.ts با همین locale.

export const locale = {
  tag: "fa-IR",
  lang: "fa",
  dir: "rtl",
} as const;

export type Direction = "rtl" | "ltr";

const fa = {
  "app.name": "مدیریت ریسک سازمانی",
  "app.tagline": "ERM · داتین",
  "shell.skip": "رفتن به محتوای صفحه",
  "shell.menu": "منو",
  "shell.closeMenu": "بستن منو",
  "shell.mainNav": "منوی اصلی",
  "shell.collapse": "جمع کردن منو",
  "shell.expand": "باز کردن منو",
  "shell.search": "جست‌وجوی ریسک",
  "shell.searchPlaceholder": "جستجوی کد، عنوان ریسک یا خدمت…",
  "shell.classic": "در صفحه‌های فعلی سامانه باز می‌شود",
  "shell.classicHome": "صفحه‌های فعلی سامانه",
  "shell.account": "حساب کاربری",
  "shell.logout": "خروج",
  "shell.loggingOut": "در حال خروج",
  "shell.footer": "نسخه‌ی تازه‌ی رابط؛ صفحه‌هایی که هنوز نیامده‌اند در صفحه‌های فعلی باز می‌شوند.",
  "toast.label": "اعلان",
  // Radix جای {hotkey} را با کلید میان‌بر (F8) پر می‌کند.
  "toast.region": "اعلان‌ها ({hotkey})",
  "state.loading": "در حال خواندن",
  "state.retry": "دوباره امتحان کنید",
  "state.unknownError": "خطای ناشناخته.",
  "state.offline": "اتصال اینترنت قطع است. تغییرها تا وصل شدن دوباره فرستاده نمی‌شوند.",
  "state.backOnline": "اتصال برگشت.",
  "state.newVersion": "نسخه‌ی تازه‌ای از رابط منتشر شده است. صفحه را دوباره باز کنید.",
  "state.reload": "بارگذاری دوباره",
  "action.cancel": "انصراف",
  "action.close": "بستن",
  "action.confirm": "تأیید",
  "action.clear": "پاک کردن",
  "pager.label": "صفحه‌ها",
  "pager.previous": "صفحه‌ی قبل",
  "pager.next": "صفحه‌ی بعد",
  "pager.page": "صفحه‌ی {page}",
  "pager.status": "صفحه‌ی {page} از {pages}",
  "breadcrumb.label": "مسیر",
  "error.forbidden": "اجازه‌ی این کار را ندارید.",
  "error.notFound": "پیدا نشد؛ یا وجود ندارد یا اجازه‌ی دیدنش را ندارید.",
  "error.noServer":
    "سرور جنگو جواب نداد. در اجرای محلی، اول در ریشه‌ی پروژه pipenv run python manage.py runserver را اجرا کنید؛ روی سرور به مدیر سامانه خبر دهید.",
  "error.server": "سرور خطا داد. چند دقیقه‌ی دیگر دوباره امتحان کنید و اگر تکرار شد به مدیر سامانه خبر دهید.",
  "error.network": "به سرور وصل نشد. اتصال شبکه را بررسی کنید.",
  "error.status": "درخواست انجام نشد (کد {status}).",
} as const;

export type MessageKey = keyof typeof fa;

/** متن مشترک رابط با کلید؛ {name} در متن با مقدار همان نام عوض می‌شود. */
export function t(key: MessageKey, values?: Record<string, string | number>): string {
  const text: string = fa[key];
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match));
}
