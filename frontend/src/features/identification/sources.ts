// منبع‌های شناسایی صفحه‌ی «شناسایی ریسک» (11 v2). متن‌ها عیناً از copy.md است. فقط پاسخنامه‌ها آماده است؛ چهار منبع
// دیگر به صفحه‌ی «به‌زودی» می‌روند و آمار ندارند (تصمیم صاحب محصول).

export type SourceSlug = "audit" | "changes" | "monitoring" | "dependencies";

export interface Source {
  slug: SourceSlug;
  title: string;
  description: string;
}

/** به ترتیب فریم: ردیف اول ممیزی و تغییرات، ردیف دوم وابستگی‌ها و پایش (در RTL اولی سمت راست). */
export const SOURCES: Source[] = [
  {
    slug: "changes",
    title: "فرآیند مدیریت تغییرات",
    description: "تغییرات ثبت‌شده در سامانه‌ی جیرا را از نظر ریسک‌های تازه ارزیابی کنید.",
  },
  {
    slug: "audit",
    title: "نتایج جلسات ممیزی",
    description: "یافته‌ها و عدم انطباق‌های ممیزی را به ریسک‌های قابل پیگیری تبدیل کنید.",
  },
  {
    slug: "monitoring",
    title: "نتایج پایش و نظارت",
    description: "گزارش های پایش و نظارت را برای یافتن ریسک‌های نوظهور بررسی کنید.",
  },
  {
    slug: "dependencies",
    title: "وابستگی‌ها و تأمین‌کنندگان",
    description: "وابستگی خدمت‌ها به تأمین‌کنندگان و سامانه‌های بیرونی را از نظر ریسک بسنجید.",
  },
];

export const sourceRoute = (slug: SourceSlug) => `/identification/sources/${slug}`;
