# ساختار و اندازه‌های فریم‌ها

این فایل از لایه‌های فیگما خوانده شده، به‌جای `get_design_context` که روی سرور در دسترس نیست. فقط ظرف‌های اصلی آمده‌اند؛ جزئیات ریز را از `frames/*.png` بخوانید.

**راهنمای نگارش**

| نماد | معنی |
|---|---|
| `[W×H]` | اندازه به پیکسل در فریم ۱۴۴۰ |
| `row` / `col` | auto-layout افقی یا عمودی (در RTL، اولین فرزندِ row سمت **چپ** است) |
| `gapN` | فاصله‌ی بین فرزندها |
| `padT/R/B/L` | فاصله‌ی داخلی؛ دو عدد یعنی عمودی/افقی |
| `w:fill` | پر کردن عرض والد |
| `rN` | گردی گوشه |
| `bg:` / `bd:` | پس‌زمینه / حاشیه، با نام توکن در `tokens.json` (`/1.5` یعنی ضخامت حاشیه) |
| `shadow` | سایه‌ی کارت |
| `⧉ Comp {Prop=Value}` | نمونه‌ای از کامپوننت سیستم طراحی (`components.md`) |
| `… ×N` | N عنصر تکراری |

## پوسته

```
Frame 1440 = Sidebar 240 (سمت راست، bg:bg/sidebar) + Main 1200
Topbar [1200×56] bd-bottom:border/default bg:bg/surface
Content [1200×…] col gap24 pad32/32/40/32 bg:bg/canvas   (در ویزارد pad32/32/24/32)
PageHeader: عنوان Display/28 Bold، توضیح Body/Default 14 text/secondary، gap6
```

## الگوهای مشترک

### کارت ویزارد (30 تا 30f)
```
Wizard [1136] row — کارت ۸۴۰ پیکسل، وسط‌چین در ستون
Card [840×…] col r10 bg:bg/surface bd:border/default
  Header row pad20/24/14/24 — عنوان H3 + چیپ وضعیت (pad2/10 r999 bg:bg/subtle؛ «آماده‌ی ارسال» و «ارسال‌شده» bg:status/success-subtle)
  Progress row gap12 pad0/24 — متن «گام n از ۸» + Track [h4 r999 bg:bg/muted] با پرشدگی brand/primary
  Steps row gap8 pad16/24/24/24 — ۸ کارت گام [w:fill ×76] col gap6 pad10/6 r8
      گام فعلی: bg:brand/primary، متن سفید، Num bg:#FFFFFF@18
      گام انجام‌شده: bg:bg/surface bd:border/default، Num bg:status/success-subtle با تیک
      گام بعدی: bg:bg/surface bd:border/default، Num bg:bg/subtle
      Num [22×22] r999
  Question col gap16 pad28/24 bd-top:border/default
    Head col gap8 — عنوان H2 + ستاره‌ی قرمز، راهنما Body/Small text/secondary
    Input [h48] pad0/16 r8 bg:bg/surface bd:border/strong (فوکوس: bd:brand/primary/1.5 + حلقه)
  Footer row pad16/24 bd-top — سمت چپ: ⧉Button Primary md «بعدی» + ⧉Button Ghost md «ذخیره‌ی پیش‌نویس»؛
                                سمت راست: ⧉Button Secondary md «قبلی» + میان‌برها (کلیدها با فونت mono، pad و bg:bg/subtle)
```

### کارت «پاسخنامه‌های اخیر» / جدول (30، 11a)
```
Card [1136] col r10 bg:bg/surface bd:border/default
  Header row gap12 pad14/20 bd-bottom — عنوان H3 + زیرعنوان Caption؛ سمت چپ ⧉Button Ghost sm
  HeaderRow row pad10/8 bg:bg/subtle bd-bottom — سلول‌ها pad0/8، Caption/12 Medium text/secondary
  Row [h69] row pad12/8 bd-bottom — ستون کد ۱۱۰ (Mono 13)، پاسخنامه w:fill (نام Body/Strong + خلاصه Caption)
       ردیف تازه/برجسته: bg:brand/subtle + نوار ۳ پیکسلی brand/primary در لبه‌ی راست
  وضعیت: ⧉Status Badge (Tone طبق جدول وضعیت‌ها)
```

### ستون‌های صفحه‌ی بررسی یک پاسخنامه (12a تا 12e)
```
PageHeader col gap12 — پیوند بازگشت (آیکون arrow-right، Label brand/primary)
  Title row — عنوان H1 22 + ⧉Status Badge؛ Meta: Caption با «·»؛ چپ: ⧉Button Ghost md «پاسخنامه‌ی بعدی» + ⧉Button Secondary md «بازگرداندن برای تکمیل»
Body row gap24
  ستون پاسخ‌ها [660, w:fill] (راست) — Card col pad20/24/8/24 r14 bd:border/default shadow
    Answer row gap16 pad14/0 bd-bottom — پرسش ۱۵۰ پیکسل (شماره در دایره + برچسب)، پاسخ w:fill
    Path card col pad14/16/6/16 r12 bd:border/default — خط زمانی عمودی با نقطه‌ها: مسیر (سبز) ← رویداد (نارنجی) ← پیامد (خاکستری)
        انتخاب‌شده به‌عنوان منبع ریسک: bg:brand/subtle bd:brand/primary/1.5
  ستون کناری [452] (چپ) col gap16 — کارت هوشمند + کارت تاریخچه (r14 shadow)
```

## فریم‌ها

### 30 · 30b · 30c · 30d · 30e · 30f — ویزارد
- **30b** مسیرها: `Context` چیپ پاسخ گام ۳ [pad6/10 r6 bg:bg/subtle] · `Paths` col gap20 — هر مسیر: برچسب (چیپ brand/subtle) + × + textarea با شمارنده · `Add path` [h48] r10 حاشیه‌ی خط‌چین border/strong
- **30c** رویدادها: `Path events` col gap16 — هر کارت col gap12 pad14/16/16/16 r10 bd:border/default: متن مسیر (Caption)، انتخاب دوحالته (segmented، bg:bg/subtle)، ورودی رویداد با چیپ «رویداد n» (accent/tangerine-subtle)؛ حالت «انتخاب از قبلی‌ها» = ⧉Choice Radio برای هر رویداد قبلی + یادداشت info
- **30d** پیامدها: `Summary` سه چیپ (brand/subtle، accent/tangerine-subtle، bg/subtle) با ← · `Event impacts` col gap16 — هر کارت col gap14 pad14/16/16/16 r10: سربرگ رویداد + چیپ‌های مسیر، ردیف دو فیلد: ⧉Form Field Select «نوع پیامد» [~240] + Text «دامنه» [w:fill]
- **30e** بازبینی: `Validation` row gap8 pad10/14 r8 bg:status/success-subtle · `پاسخ‌های پایه` جدول دوستونه r10 bd با دکمه‌ی ویرایش (مداد) در هر ردیف · `مسیرها، رویدادها و پیامدها`: سرستون‌ها + گروه‌ها (هر رویداد یکتا یک گروه r10 bd: مسیرها ← رویداد ← پیامد) · دکمه‌ی اصلی «ارسال برای شناسایی» [162]
- **30f** ارسال موفق: `Success` col gap14 pad44/24 وسط‌چین — نشان [72] r999 bg:status/success-subtle با دایره‌ی [44] bg:status/success؛ پیام؛ سه چیپ؛ دکمه‌ها (Primary + Secondary)

### 11 v2 — شناسایی ریسک
```
Content col gap28 pad32/32/40/32
Sources — bento row gap16
  Hero [569×692] (راست) col pad8 r20 bg:bg/surface bd:border/default shadow
    Illustration [551×452] r14 (گرادیان سبز روشن + وکتور)  ·  Body col gap6 pad20/16/0/16 (سرعنوان Caption، عنوان H1 22، متن)
    Stats row gap8 — سه چیپ [h32] pad6/12 r999 bg:bg/subtle با نقطه‌ی رنگی (info / warning-tangerine / success) و عدد Label/Strong
    Footer pad16/16/10/16 — ⧉Button Primary md «بررسی پاسخنامه‌ها»
  Grid [551] col gap16 — دو ردیف، هر ردیف دو کارت [268×338] col pad8 r16 shadow
    Illustration [250×150] r12 bg:#F3F8F5 · Body col gap4 pad16/8/0/8 · Footer pad16/8/8/8: چیپ آمار (r999 bg:bg/subtle، نقطه‌ی سبز) + دکمه‌ی دایره‌ای پیکان
```
تصویرسازی‌ها خطی‌اند (سبز `#006839`، نقطه‌ی نارنجی `#F68B1F`). از روی تصویر به SVG بازسازی کنید یا SVG ساده‌ی هم‌سبک بسازید.

### 11a — بررسی پاسخنامه‌ها
```
Content col gap32
Section «در انتظار بررسی» col gap14
  Header row — عنوان H2 + چیپ شمار [bg:brand/primary متن سفید] + چیپ دیرکرد [bg:status/danger-subtle، آیکون warning] ؛ زیرعنوان Caption ؛ چپ: پیوند «مشاهده‌ی هر ۸ پاسخنامه»
  Queue row gap16 — ۴ کارت [w:fill ×203] col gap12 pad16/16/14/16 r14 bd:border/default shadow
     کارت دیرکرد: bd:status/danger ؛ Top: کد Mono + چیپ مهلت (bg/subtle | warning-subtle «مهلت امروز» | danger-subtle «… · دیرکرد»)
     Title block: خدمت H3 + «واحد · پاسخ‌دهنده» Caption ؛ Summary: سه چیپ [h22] pad2/8
     Footer: «ارسال تاریخ» Caption + ⧉Button sm (فقط فوری‌ترین Primary، بقیه Secondary)
Card «همه‌ی پاسخنامه‌ها» (الگوی جدول)
  Header pad14/20 — Toolbar: ⧉Button Secondary sm «همه‌ی واحدها» (آیکون فیلتر) + Search [280×34] pad0/12 r8 bd:border/default
  Tabs row gap4 pad0/12 bd-bottom — ⧉Tab با شمارش (Active: زیرخط brand/primary)
  ستون اقدام [84]: پیوند متنی brand/primary («بررسی» / «مشاهده» / «—»)
  Pagination: «نمایش …» Caption + دکمه‌های صفحه [32×32] r8 (فعال bg:brand/primary)
```

### 12a — پیش از شناسایی هوشمند
```
AI column [452] col gap16
  Card «شناسایی هوشمند» [452×532] col r14 bd:brand/subtle-strong shadow
    Tile [450×148] bg:brand/subtle — تصویرسازی (فهرست → sparkle → سند)
    Body col gap12 pad20 — سرعنوان (sparkle نارنجی + Label accent/tangerine)، عنوان H3، متن Body/Small،
      Points col gap8 — هر نکته: آیکون در مربع [22] r6 bg:brand/subtle + متن Body/Small
      ⧉Button Primary md [w:fill] «شناسایی هوشمند ریسک‌ها» با آیکون sparkle ؛ Footnote Caption وسط‌چین با آیکون ساعت
  Card «تاریخچه» col gap12 pad16/20 r14 — Timeline: Event row gap10 (نقطه‌ی رنگی + خط عمودی، متن Body/Small + زمان Caption)
```

### 12b — حالت‌های پنل (هر کارت ۴۵۲ پیکسل، جایگزین کارت هوشمند)
- **در حال شناسایی:** col gap16 pad20 r14 — Header: آیکون [44] r999 bg:accent/tangerine-subtle + عنوان/زمان · Progress [h6] r999 · Steps col gap12 (هر مرحله row gap10: تیک سبز / اسپینر / دایره‌ی خالی؛ مرحله‌ی جاری Label/Strong) · Skeleton col gap8 pad12 r12 bg:bg/subtle · Footer: متن Caption + ⧉Button Ghost sm «لغو»
- **ریسکی ساخته نشد:** col gap12 pad28/24/24/24 وسط‌چین — آیکون [48] r999 bg:bg/subtle (search) · دکمه‌ها: Secondary sm + Ghost sm
- **خطا:** همان قالب — آیکون [48] r999 bg:status/danger-subtle (warning) · ⧉Button Primary md «تلاش دوباره» · «کد پیگیری:» Caption + کد Mono

### 12c — نتایج
```
Card «ریسک‌های پیشنهادی» [452] col r14
  Header col gap10 pad16/20/14/20 — عنوان H3 + چیپ شمار + خلاصه Caption ؛ چپ: ⧉Button Ghost sm «تحلیل دوباره»
    Rule row gap6 pad6/10 r8 bg:brand/subtle (Label brand/primary) ؛ Progress [h4] بخش‌بندی‌شده (یک بخش برای هر ریسک؛ تصمیم‌گرفته = brand/primary)
  List col gap10 pad12 bg:bg/subtle bd-top/bottom
    Risk (selected) col gap12 pad14/16 r12 bg:bg/surface bd:brand/primary/1.5 shadow
      Top: چیپ «پیش‌نویس AI» (accent/tangerine-subtle + sparkle) و «اطمینان بالا» (آیکون میله‌ای سبز)
      عنوان H3 ؛ فهرست تعریف (dl): برچسب ۹۰ پیکسل Caption text/tertiary + مقدار Body/Small ؛ مسیرها با شماره در دایره
      دسته: چیپ bg/subtle + «پیشنهاد AI» نارنجی ؛ روش شناسایی: آیکون قفل + کد Mono + «· خودکار»
      منبع: آیکون لینک + Caption brand/primary
      هشدار مشابه: pad12 r10 bg:status/warning-subtle، آیکون warning، پیوند «مقایسه با ریسک موجود»
      Actions row: ⧉Button Primary sm «تأیید و ارسال به آنالیز» (آیکون تیک) + Secondary sm «ویرایش» (مداد) ؛ راست: Ghost sm «رد» (×)
    Risk (approved) col gap6 pad12/14 r12 bd:border/default — چیپ موفق «تأیید شد · آنالیز ریسک»، عنوان، اطلاعات Caption، پیوند «مشاهده‌ی ریسک»
  Footer row gap8 pad12/20/14/20 — آیکون info + Caption
Toast [433×46] row gap12 pad12/14/12/12 r12 bg:text/primary (تیره) shadow — تیک سبز + متن سفید + جداکننده + «بازگردانی» (accent/tangerine-bright) + ×
  جای toast: پایین وسط ستون پاسخ‌ها
```

### 12d — پنل ویرایش (drawer)
```
Scrim روی کل صفحه (text/primary با شفافیت)
Drawer [520×100vh] سمت چپ col bg:bg/surface shadow
  Header col gap6 pad20/24/16/24 bd-bottom — عنوان H2 + چیپ «پیش‌نویس AI» ؛ Close [32] r8 ؛ توضیح Caption
  Body col gap16 pad20/24 (پیمایش‌پذیر)
    Field col gap6 — LabelRow (برچسب Label/Default + ستاره ؛ چپ: پیوند یا شمار Caption)
      Box pad10/12 r8 bd:border/strong (فوکوس: bd:brand/primary/1.5 + shadow) ؛ Helper Caption (ویرایش‌شده: accent/tangerine با مداد)
    مسیرها: هر مسیر یک Box [h46] با چیپ «مسیر n» (brand/subtle)
    ردیف دو ستون: «دسته‌ی ریسک» (select) | «مالک ریسک» (select، راهنما «پیش‌فرض: واحد پاسخ‌دهنده»)
    روش شناسایی: Box قفل bg:bg/subtle، متن text/secondary، آیکون قفل
  Footer row pad16/24 bd-top — ⧉Button Primary md «ذخیره و تأیید» + Secondary md «ذخیره‌ی پیش‌نویس» ؛ راست: Ghost md «انصراف»
```

### 12e — مودال بازگرداندن
```
Modal [640] col r16 bg:bg/surface shadow، وسط صفحه با Scrim
  Header col gap6 pad20/24/16/24 bd-bottom — عنوان H2 + Close ؛ توضیح Body/Small
  Body col gap16 pad18/24 (پیمایش‌پذیر)
    Section title col gap2 — «پرسش‌های تکمیلی» Label/Strong + Hint Caption با sparkle
    Questions col gap8
      Question row gap12 pad12 r10 — انتخاب‌شده: bg:brand/subtle bd:brand/subtle-strong ؛ انتخاب‌نشده: bg:bg/surface bd:border/default
        Checkbox [18] r5 (فعال bg:brand/primary + تیک) ؛ Content col gap6: متن Body/Default + Tags (چیپ «پیشنهاد AI» نارنجی + «درباره‌ی …» bg/subtle) ؛ Edit [28] r6 مداد
      Add custom row gap8 pad10/12 r10 حاشیه‌ی خط‌چین border/strong، متن brand/primary
    Field پیام (textarea [h64]) ؛ Field مهلت (select [h46])
    Note row gap8 pad10/12 r10 bg:status/info-subtle آیکون info
  Footer row pad16/24 bd-top — ⧉Button Primary md «بازگرداندن با n پرسش» (آیکون پیکان) + Secondary md «انصراف» ؛ راست: شمارش Caption
```
