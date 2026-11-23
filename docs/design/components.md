# کامپوننت‌های سیستم طراحی (صفحه‌ی DS فایل فیگما)

اندازه‌ها از نمونه‌ی هر variant در فیگما خوانده شده است. `pad` به ترتیب بالا/راست/پایین/چپ است و رنگ‌ها نام توکن‌اند (`tokens.json`). این‌ها را با کامپوننت‌های موجود پروژه تطبیق بدهید و کامپوننت تکراری نسازید.

## Button
| Variant | ارتفاع | pad | gap | گردی | پس‌زمینه | حاشیه | متن |
|---|---|---|---|---|---|---|---|
| Primary md | 36 | 8/16 | 8 | 8 | brand/primary (hover: brand/primary-hover) | — | text/on-brand · Label/Strong 13 |
| Primary sm | 32 | 6/12 | 8 | 8 | brand/primary | — | text/on-brand · Label/Default 13 |
| Secondary md | 38 | 8/16 | 8 | 8 | bg/surface | border/strong | text/primary · Label/Strong 13 |
| Secondary sm | 34 | 6/12 | 8 | 8 | bg/surface | border/strong | text/primary · Label/Default 13 |
| Ghost md / sm | 36 / 32 | 8/16 · 6/12 | 8 | 8 | — | — | brand/primary |
| Danger md / sm | 36 / 32 | 8/16 · 6/12 | 8 | 8 | status/danger-solid | — | text/on-brand |

آیکون ۱۶ پیکسل، اختیاری، در سمت شروع یا پایان متن (طبق فریم).

## Status Badge
ارتفاع ۲۲ · pad2/8 · گردی ۴ · Caption/12 Medium

| Tone | پس‌زمینه | متن | کاربرد در این ماژول |
|---|---|---|---|
| Neutral | bg/subtle | text/secondary | پیش‌نویس |
| Info | status/info-subtle | status/info | در انتظار بررسی |
| Warning | status/warning-subtle | status/warning | بازگشت برای تکمیل اطلاعات |
| Success | status/success-subtle | status/success | شناسایی‌شده |
| Brand | brand/subtle | brand/primary | بررسی‌شده |
| Danger | status/danger-subtle | status/danger | — |
| Gold | accent/tangerine-subtle | accent/tangerine | — |

## Chip (درون‌خطی، کامپوننت جدا در فیگما ندارد)
ارتفاع ۲۲ تا ۲۴ · pad2/8 یا 3/10 · گردی ۹۹۹ · Caption/12 Medium · gap4 با آیکون ۱۲

| نوع | پس‌زمینه / متن |
|---|---|
| مسیر | brand/subtle / brand/primary |
| رویداد | accent/tangerine-subtle / accent/tangerine |
| پیامد و خنثی | bg/subtle / text/secondary |
| «پیش‌نویس AI» و «پیشنهاد AI» | accent/tangerine-subtle / accent/tangerine + آیکون sparkle |
| دیرکرد | status/danger-subtle / status/danger + آیکون warning |
| مهلت امروز | status/warning-subtle / status/warning + آیکون ساعت |

## Tab
ارتفاع ۴۰ · pad10/4 · gap6 · Caption/12 Medium · حاشیه‌ی پایین border/default
- Default: متن text/secondary، شمار در چیپ bg/subtle
- Active: متن و زیرخط ۲ پیکسلی brand/primary، شمار در چیپ brand/subtle

## Form Field
عرض پیش‌فرض ۳۲۰ · col gap6
- برچسب: Label/Default 13 text/primary + ستاره‌ی status/danger
- کادر: ارتفاع ۴۶ تا ۴۸ · pad10/12 · گردی ۸ · bg/surface · حاشیه border/strong
- Focus: حاشیه brand/primary با ضخامت ۱٫۵ + حلقه‌ی نرم
- Error: حاشیه status/danger + متن راهنمای status/danger
- Select: آیکون chevron-down ۱۶ در سمت پایان
- راهنما: Caption/12 text/tertiary

## Choice (رادیو و چک‌باکس کارتی)
ارتفاع ۴۴ · pad10/14 · gap10 · گردی ۱۰ · Body/Default 14
- انتخاب‌نشده: bg/surface، حاشیه border/default
- انتخاب‌شده: brand/subtle، حاشیه brand/primary

## Toggle
۳۶×۲۰ · pad3 · گردی ۹۹۹ · On: brand/primary · Off: border/strong

## Stat Tile
۲۶۸×۱۴۴ · pad16/18 · gap10 · گردی ۱۶ · bg/surface · حاشیه border/default · برچسب Label/Default 13 text/secondary · عدد Numeric/KPI 32 · Tone: Brand / Danger / Warning / Success / Neutral

## Process Step
ارتفاع ۳۲ · gap8 — Done: Caption/12 Medium text/secondary + تیک · Current: Label/Strong 13 text/primary · Upcoming: Caption text/tertiary

## Nav (سایدبار سبز)
| کامپوننت | ابعاد | pad | gap | گردی | فعال |
|---|---|---|---|---|---|
| Nav Item | ۲۱۶×۳۶ | 8/12 | 10 | 10 | bg/sidebar-active + حاشیه‌ی سفید کم‌رنگ + نوار نارنجی کوچک |
| Nav/Sub Item | ۲۰۴×۳۴ | 7/5/7/8 | 8 | 10 | bg/sidebar-active · شماره‌ی مرحله در دایره |
| Nav/Module Tile | ۳۰×۳۰ | — | — | 9 | سفید نیمه‌شفاف |

hover: bg/sidebar-hover · متن‌ها: text/on-dark و text/on-dark-muted · نشان‌های عددی: پس‌زمینه‌ی accent/tangerine-bright یا status/danger-solid

## Risk Level Badge / Score Chip (برای صفحه‌های دیگر؛ در این ماژول لازم نیست)
- Level Badge: ارتفاع ۲۲ · pad2/10 · گردی ۹۹۹ · `risk/<level>-bg` / `risk/<level>-fg`
- Score Chip: ۳۶×۲۸ · گردی ۸ · حاشیه `risk/<level>`

## آیکون‌ها
خطی، ضخامت ۱٫۵، سر گرد (سبک Phosphor). پروژه `lucide-react` دارد: معادل lucide را بردارید، مثل `Sparkles` برای sparkle، `Lock`، `Link`، `TriangleAlert`، `Clock`، `Pencil`، `X`، `Check`، `Info`، `Search`، `Filter`، `ArrowLeft` / `ArrowRight`، `ChevronDown`، `Zap` برای «تحلیل دوباره» و «تلاش دوباره»، و `MessageSquareText` برای «بازگرداندن برای تکمیل».
