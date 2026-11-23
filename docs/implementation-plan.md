# برنامه‌ی پیاده‌سازی: شناسایی ریسک از پاسخنامه

این سند خروجی گام ۱ `docs/ERM-DEV-PROMPT.md` است. تصمیم‌های بخش ۱ را صاحب محصول در سشن ۱۴۰۵/۰۹/۰۲ گرفته است. اولویت مرجع‌ها همان است که در پرامپت آمده: دستور سشن، بعد `docs/design/`، بعد پرامپت، بعد قواعد پروژه، و آخر کد موجود.

## ۰. خط مبنا (۱۴۰۵/۰۹/۰۲)

| آزمون | نتیجه |
|---|---|
| pytest (`docker compose exec web pytest`) | ۸۱۳ قبول · ۰ رد |
| vitest (`npm test`) | ۴۳ فایل · ۳۱۷ تست · همه قبول |
| lint (`npm run lint`) | قبول |
| e2e (`npm run test:e2e`، ۴ پروژه) | ۸۴ قبول · ۱۲۴ رد · ۴ رد شده (skip). پروژه‌های تیره و روشن یکسان‌اند، پس ۶۲ شکست یکتا (۳۸ دسکتاپ، ۲۴ موبایل) |

اسکرین‌شات‌های ۱۴۴۰×۱۰۲۴ صفحه‌های فعلی در `docs/baseline/` هستند:
- `home`
- `questionnaire-answers`: مدیر سامانه
- `questionnaire-answers-unit-manager`: مدیر واحد
- `identification`
- `questionnaire-responses`
- `questionnaire-response-1`
- `questionnaires-answer-home`

داده‌ی DB توسعه:

| داده | تعداد |
|---|---|
| Response | ۱ (پیش‌نویس قدیمی) |
| Questionnaire | ۲ |
| PendingRisk و جدول‌های ساختاریافته | ۰ |
| IdentificationDraft | ۲ (همه با مقدار پیش‌فرض فیلدهای 0013) |
| Risk | ۳۲ |
| RiskCategory | T1 تا T8، فعال |

### ۰-۱. شکست‌های از قبل موجود
این آزمون‌ها روی اسنپ‌شات 8d6a640a پیش از هر تغییری رد شدند. نوع خطاها:

| نوع خطا | تعداد در گزارش (۴ پروژه) |
|---|---|
| تضاد رنگ (axe) | ۵۶ |
| عنصر پیدا نشد یا دیده نشد | ۳۶ |
| خطای کنسول | ۲۲ |
| پایان زمان کلیک یا پر کردن | ۱۸ |
| link-in-text-block | ۴ |
| target-size | ۲ |

دو شکست از توکن‌های قدیمی بود و در برش الف رفع می‌شود: نشان قرمز منو (`#ef4444` با تضاد ۳٫۷۶) و طلایی روی طلایی کم‌رنگ (۴٫۴۲). بقیه آزمون‌های کهنه‌ی صفحه‌هایی‌اند که پیش از این کار بازطراحی شده بودند. آزمون‌های جریان پرسشنامه‌ی قدیمی در برش ب۰ حذف می‌شوند. معیار هر برش: **هیچ شکست تازه‌ای نسبت به این فهرست.**

| آزمون | عنوان | پروژه |
|---|---|---|
| `e2e/actions.spec.ts:12:3` | treatment › filters the actions with a checkbox kept in the URL | دسکتاپ |
| `e2e/actions.spec.ts:30:3` | treatment › approves a plan from the risk dossier after a confirmation | دسکتاپ، موبایل |
| `e2e/actions.spec.ts:55:3` | treatment › records an action as ready for testing with its evidence | دسکتاپ |
| `e2e/actions.spec.ts:71:3` | treatment › signs an acceptance as senior management with the letter file | دسکتاپ، موبایل |
| `e2e/actions.spec.ts:96:3` | treatment › shows the reassessment comparison next to the decision form | دسکتاپ، موبایل |
| `e2e/admin.spec.ts:11:3` | system administration › lists users and holidays, and deletes a holiday after asking | دسکتاپ، موبایل |
| `e2e/admin.spec.ts:37:3` | system administration › moves between the audit tabs and keeps the filters in the Excel export | دسکتاپ |
| `e2e/admin.spec.ts:55:3` | system administration › imports staff in two steps: a dry run, then confirm | دسکتاپ |
| `e2e/app.spec.ts:114:3` | risk register › opens a dossier and keeps the tab in the URL | دسکتاپ، موبایل |
| `e2e/app.spec.ts:41:3` | shell and my work › navigates from the mobile drawer | موبایل |
| `e2e/app.spec.ts:4:3` | shell and my work › opens on my work with the navigation for this user | دسکتاپ، موبایل |
| `e2e/app.spec.ts:60:3` | shell and my work › switches theme and keeps it after reload | دسکتاپ، موبایل |
| `e2e/app.spec.ts:83:3` | risk register › filters, searches and sorts with the URL | دسکتاپ، موبایل |
| `e2e/assessment-workspace.spec.ts:4:1` | opens assessment workspace, starts a submitted risk, and shows risk details | دسکتاپ، موبایل |
| `e2e/assessments.spec.ts:121:3` | assessments › puts the A table beside the initiator form on desktop and after it on mobile | دسکتاپ |
| `e2e/assessments.spec.ts:133:3` | assessments › compares two assessments column by column | دسکتاپ، موبایل |
| `e2e/assessments.spec.ts:13:3` | assessments › shows the approved scope and target deadline without requiring a meeting | دسکتاپ، موبایل |
| `e2e/assessments.spec.ts:31:3` | assessments › opens an assessment from its risk and sends it for quality control | دسکتاپ، موبایل |
| `e2e/assessments.spec.ts:73:5` | assessments › fills the impact profile row by row, with Django's errors next to the right cell | دسکتاپ، موبایل |
| `e2e/catalog.spec.ts:11:3` | service catalog › goes from the services to a service and adds a supplier dependency through the Django form | دسکتاپ |
| `e2e/catalog.spec.ts:50:3` | service catalog › opens a supplier from a dependency and lists the other catalogue pages | دسکتاپ، موبایل |
| `e2e/catalog.spec.ts:77:3` | assessment method › shows the method with the L table and the decision matrix in the method's colours | دسکتاپ، موبایل |
| `e2e/controls.spec.ts:11:3` | control library › goes from the library to a control and to a test sheet that no longer supports its E | دسکتاپ، موبایل |
| `e2e/controls.spec.ts:36:3` | control test sheet › records a control test in its sections and shows Django's E rule beside the field | دسکتاپ، موبایل |
| `e2e/controls.spec.ts:84:3` | statement of applicability › filters the statement to applicable rows without an organisation control | دسکتاپ |
| `e2e/forms.spec.ts:101:3` | Django read pages › approves a merge after confirming | دسکتاپ |
| `e2e/forms.spec.ts:46:3` | Django forms › uploads an attachment as multipart and returns to the attachments | دسکتاپ |
| `e2e/forms.spec.ts:66:3` | Django forms › shows a workflow step with its unmet conditions | دسکتاپ، موبایل |
| `e2e/forms.spec.ts:76:3` | Django read pages › filters evidence with the page address | دسکتاپ |
| `e2e/forms.spec.ts:7:3` | Django forms › edits a risk from its dossier, with checks, a Jalali calendar and the way back | دسکتاپ |
| `e2e/forms.spec.ts:92:3` | Django read pages › shows the risk universe grid without widening the page | دسکتاپ، موبایل |
| `e2e/login.spec.ts:7:3` | login › validates, explains a wrong password and signs in to the requested page | دسکتاپ، موبایل |
| `e2e/questionnaire-review.spec.ts:11:3` | questionnaire definitions and review › edits a question with its options in one form | دسکتاپ |
| `e2e/questionnaire-review.spec.ts:40:3` | questionnaire definitions and review › opens the review queue and registers a pending risk from a scenario | دسکتاپ |
| `e2e/questionnaire-review.spec.ts:70:3` | questionnaire definitions and review › marks a notice read and records a review result | دسکتاپ، موبایل |
| `e2e/questionnaires.spec.ts:26:3` | questionnaires › checks required answers, confirms and submits a response | دسکتاپ، موبایل |
| `e2e/questionnaires.spec.ts:69:3` | questionnaires › warns before leaving with unsaved answers | دسکتاپ، موبایل |
| `e2e/questionnaires.spec.ts:6:3` | questionnaires › lists questionnaires, my responses and starts a response | دسکتاپ |
| `e2e/questionnaires.spec.ts:80:3` | questionnaires › answers a risk question and removes it from the list | دسکتاپ |

### ۰-۲. نتیجه‌ی هر برش

| برش | lint | vitest | e2e (یکتا، دسکتاپ و موبایل) |
|---|---|---|---|
| الف | قبول | ۴۳ فایل، ۳۱۷ قبول | ۵۹ قبول، ۴۳ شکست، ۲ رد شده. **هیچ شکست تازه‌ای نیست**؛ ۱۹ مورد از فهرست بالا دیگر شکست نمی‌خورند، از جمله دو شکست تضاد توکن‌ها و آزمون حذف‌شده‌ی سوییچ تم |
| ب۰ | قبول | ۳۸ فایل، ۲۷۶ قبول (تست‌های جریان حذف‌شده رفتند)؛ pytest ۷۵۱ قبول | ۴۸ قبول، ۳۶ شکست، ۲ رد شده. **هیچ شکست تازه‌ای نیست**؛ ۶ شکست از آزمون‌های حذف‌شده‌ی پرسشنامه رفتند و «control test sheet» دسکتاپ دیگر شکست نمی‌خورد |

## ۱. تصمیم‌ها

| # | موضوع | تصمیم |
|---|---|---|
| ۱ | «آنالیز ریسک» | وضعیت تازه‌ی `Risk.Status.ANALYSIS` («آنالیز ریسک»). جزئیات در ۱-۱ |
| ۲ | رد ریسک پیشنهادی | `ConfirmDialog` با دلیل الزامی. قاعده و قید `pending_risk_dismissed_needs_reason` می‌مانند |
| ۳ | بازگردانی تأیید | تأخیر ۱۰ ثانیه‌ای برای همه. جزئیات در ۱-۲ |
| ۴ | مهلت بازگرداندن | پیش‌فرض ۳ روز کاری، قابل تغییر در مودال 12e. جایگزین قاعده‌ی ۵ روز |
| ۵ | دسته‌ی ریسک | اختیاری. فیلد 12d بی‌ستاره است، ولی پیشنهاد AI می‌ماند |
| ۶ | مالک ریسک | واحد (`Risk.org_unit`) و شخص (`Risk.owner`)، هر دو در 12d قابل ویرایش. جزئیات در ۱-۳ |
| ۷ | پرسشنامه‌ی قدیمی | کامل حذف می‌شود، با داده‌اش (بخش ۴). ریست کامل DB لازم نیست |
| ۸ | مهلت بررسی | ۳ روز کاری از زمان ارسال، با `add_working_days`. ثابت `REVIEW_WORKING_DAYS = 3` |
| ۹ | تم | فقط داتین روشن. بقایای سوییچ تم و پروژه‌های `*-dark` در Playwright حذف می‌شوند. `CLAUDE.md` و `frontend/DESIGN.md` بازنویسی می‌شوند |
| ۱۰ | تعارض CLAUDE.md (بنفش، Inter، «هر دو تم») با طراحی | طراحی (اولویت ۲) اجرا و CLAUDE.md به‌روز می‌شود |
| — | نوع پیامد (گام ۷) | چندانتخابی از بُعدهای پیامد نسخه‌ی فعال روش. جزئیات در ۱-۴ |
| — | شرح پیامد (گام ۷) | فیلد سوم الزامی، حداکثر ۱۲۰ نویسه. جزئیات در ۱-۴ |
| — | متن گام ۲ تا ۴ | پرسش‌ها از `SCENARIO_PARTS` (`apps/risks/identification.py`) و راهنماها از `modes.ts`، بدون اشاره به انتخاب از کاتالوگ |
| — | مایگریشن 0013 | کامل حذف می‌شود (بخش ۴) |
| — | ۴ کارت دیگر 11 v2 | هر چهار کارت به صفحه‌ی «به‌زودی» می‌روند و چیپ آمار ندارند |

### ۱-۱. وضعیت «آنالیز ریسک»
- همه‌ی ریسک‌های تازه (پاسخنامه، شناسایی دستی و هر ثبت دیگر) با این وضعیت به دنیا می‌آیند. `Risk.status` پیش‌فرض تازه می‌گیرد.
- تنها انتقال خروجی «ارسال جهت ارزیابی» (ردیف ۳) به «در ارزیابی» است، با همان شرط‌ها و نقش‌ها.
- هر جای کد که `REGISTERED` را چک می‌کند، `ANALYSIS` را هم همان‌طور چک می‌کند.
- وضعیت ریسک‌های موجود عوض نمی‌شود.
- «برگشت به رجیستر» و قاعده‌ی تفکیک بی‌تغییر می‌مانند. این فرض است و اگر غلط است، اصلاح می‌شود.

### ۱-۲. بازگردانی تأیید
- تأیید در رابط فوری نمایش داده می‌شود و درخواست ثبت ۱۰ ثانیه بعد فرستاده می‌شود.
- اگر کاربر صفحه را ترک کند یا مسیر عوض شود، درخواست زودتر با `fetch keepalive` فرستاده می‌شود.
- در این ۱۰ ثانیه کد RK هنوز وجود ندارد، پس toast این است: «ریسک تأیید شد و به آنالیز ریسک رفت · بازگردانی» (متن copy.md بدون کد). کد بعد از ثبت روی کارت می‌آید.

### ۱-۳. مالک ریسک
- پیش‌فرض واحد، واحد پاسخ‌دهنده است.
- پیش‌فرض شخص `unit_owner(unit, user)` موجود است و این فیلد اختیاری است.

### ۱-۴. پیامد در گام ۷
- **نوع پیامد:** بُعدهای نسخه‌ی فعال روش، یعنی S خدمت و تداوم، D داده و تمامیت، F مالی، C تعهدات و انطباق و R اعتبار و رابطه مشتری.
- **شرح پیامد:** راهنمایش همان متن لایه‌ی پنهان 30d است: «شرح کوتاه و قابل فهم برای مالک ریسک؛ حداکثر ۱۲۰ نویسه».

## ۲. تفاوت صفحه‌ها با فریم‌ها

| صفحه‌ی فعلی ← فریم | مورد | تصمیم |
|---|---|---|
| پوسته | سایدبار سرمه‌ای با گرادیان، کاشی‌های ماژول با سایه‌ی رنگی، کارت چرخه با گرادیان بنفش | **تغییر:** سبز داتین (`bg/sidebar`)، عرض ۲۴۰، نوار فعال نارنجی، کاشی سفید نیمه‌شفاف |
| پوسته | ترتیب «میز کار» و ماژول‌ها | **نگه‌داشتن** (با copy.md یکی است) |
| پوسته | تاپ‌بار، چیپ روش ارزیابی، جستجو با Ctrl K | **نگه‌داشتن**: ارتفاع ۵۶ و متن‌ها با copy.md چک می‌شوند |
| پوسته | رنگ‌های خام `nav.tsx` (rgb سایه‌ها، گرادیان `#f0abfc…#818cf8`، `#ef4444`) | **تغییر** به توکن |
| پوسته | منوی پرسشنامه‌ی جنگو در `templates/base.html` | **حذف** «پاسخ به سؤال‌ها»، «پاسخ‌ها و بررسی» و «تعریف پرسشنامه‌ها». «پرسش‌های ریسک» می‌ماند |
| `/questionnaire-answers` ← 30 | الگوی جمله‌ی چسبان | **حذف از صفحه** |
| همان | ویزارد ۷ گامی روی `IdentificationDraft` | **تغییر:** ۸ گام روی `Response`. Ctrl+S، Enter و LeaveGuard می‌مانند |
| همان | پیشنهاد خدمت از کاتالوگ، شاهد، پیوست، پیامد برای شرکت و وابستگی | **حذف از صفحه** (در فرم دستی GRC می‌مانند) |
| همان | جدول «ورودی‌های اخیر شناسایی» | **تغییر:** «پاسخنامه‌های اخیر» با ستون‌های کد، پاسخنامه، واحد، وضعیت، پاسخ‌دهنده و آخرین تغییر |
| همان ← 30b تا 30f | گام‌های مسیر، رویداد، پیامد، بازبینی و ارسال موفق | **جدید** |
| `/identification` ← 11 v2 | عنوان، توضیح و کارت گام‌های فرایند | **تغییر** عنوان و توضیح به متن copy.md. **حذف** کارت گام‌ها از صفحه |
| همان | ویزارد شناسایی GRC و جدول ورودی‌های اخیر | **انتقال** به `/identification/manual` (مقصد «ثبت دستی ریسک» در 12b) |
| همان | bento با ۵ کارت منبع | **جدید** |
| — ← 11a | `/identification/responses` | **جدید** |
| — ← 12a تا 12e | `/identification/responses/:id` | **جدید** |
| `/questionnaires`، `/questionnaires/:id/start`، `/responses/:id`، `/questionnaires/responses*`، `/questionnaires/manage*`، `/questionnaires/pending/:pk/convert` | — | **حذف** (تصمیم ۷) |
| `/questionnaires/risk-questions` | — | **نگه‌داشتن** |
| کامپوننت Button و Badge | — | **نگه‌داشتن**: اندازه‌ها با components.md یکی‌اند. لحن gold به tangerine تبدیل می‌شود |
| کامپوننت Card | — | **تغییر:** گردی ۱۴ |
| کامپوننت Tabs | — | **تغییر:** ارتفاع ۴۰، زیرخط ۲ پیکسلی و چیپ شمار |
| کامپوننت Pagination | — | **تغییر:** دکمه‌ی ۳۲×۳۲ با گردی ۸ |
| کامپوننت Drawer | — | **گسترش:** اندازه‌ی ۵۲۰ از سمت پایان خط |
| کامپوننت Dialog | — | **گسترش:** اندازه‌ی ۶۴۰ با گردی ۱۶ |
| کامپوننت Toast | — | **تغییر:** تیره (`text/primary`)، با action («بازگردانی») و مدت قابل تنظیم |
| کامپوننت MultiSelect و Switch | — | **نگه‌داشتن**: MultiSelect برای نوع پیامد استفاده می‌شود |

## ۳. نگاشت داده

| مفهوم طراحی | ذخیره |
|---|---|
| پاسخنامه `QR-1405-0109` | `Response.code`، با `next_code(f"QR-{jalali_year(today)}")` |
| واحد و پاسخ‌دهنده | `Response.org_unit` از `answer_unit(user)` و `Response.respondent` |
| ۱ خدمت | `ServiceRecord.name_and_scope` (یکی برای هر پاسخنامه) |
| ۲ هدف یا تعهد | `ServiceObjective.description` |
| ۳ عامل و وضعیت | `Response.conditions` |
| ۴ داتین یا مشتری | `Response.responsibility` (تازه) |
| ۶ رویداد مشخص | `RiskInstance.event` و `number` (تازه، رویداد ۱..k) |
| ۵ مسیر تحقق | `RiskPath.description` و `number` (تازه، سراسری ۱..n در پاسخنامه) |
| ۷ پیامد | `PathConsequence` (یکی برای هر `RiskInstance`، با `path=NULL`) |
| ۷ پیامد: شرح | `PathConsequence.description` (حداکثر ۱۲۰ نویسه) |
| ۷ پیامد: نوع | `PathConsequence.impact_types` (تازه، فهرست کد بُعد) |
| ۷ پیامد: دامنه | `RiskInstance.scope` |
| گام پیش‌نویس | `Response.wizard_step` (تازه) |
| وضعیت پاسخنامه | `draft` پیش‌نویس · `submitted` در انتظار بررسی · `returned` بازگشت برای تکمیل اطلاعات · `identified` شناسایی‌شده (تازه) · `reviewed` بررسی‌شده |
| مهلت بررسی | `Response.review_due` (تازه) |
| بازگرداندن | `Response.return_questions` (تازه، `[{text, about, source}]`)، `return_message` (تازه)، `returned_at` و `return_due` |
| پیش‌نویس AI | `PendingRisk`. فیلدها در ۳-۱ |
| تأیید | `Risk` با `channel=questionnaire` و `status=analysis`. پیوند از `PendingRisk.risk` و snapshot منبع در `Risk.intake` |
| اجرای شناسایی هوشمند | `AiRun` (تازه). فیلدها در ۳-۲ |
| اعلان | `MonitoringNotice`، با `risk` nullable، FK تازه‌ی `response` و قید «یکی از دو» |

### ۳-۱. فیلدهای `PendingRisk`
- `response`
- `ai_run`
- `consequence` (SET_NULL)
- `title` (۱۲۰ نویسه)
- `initiating_factor`
- `paths` (`[{path_id, number, text}]`)
- `target_event`
- `impact`
- `category`
- `owner_unit` و `owner`
- `confidence`، `confidence_reason` و `gaps`
- `ai_original`
- `similar_risks`
- `status`: pending، converted، dismissed یا archived
- `risk`
- `dismiss_reason`، `decided_by` و `decided_at`

### ۳-۲. فیلدهای `AiRun`
- `response` و `requested_by`
- `status`: queued، running، succeeded، empty، failed یا cancelled
- `stage`: ۱ تا ۵
- `prompt_version`، `provider` و `model`
- `input_hash` و `input`
- `raw_output`، `validation_errors` و `attempts`
- `error_code`
- `follow_up_questions`
- `started_at`، `finished_at` و `duration_ms`

### ۳-۳. ماشین‌های وضعیت
طبق ERM-DEV-PROMPT، بخش «قاعده‌ی اصلی و مدل داده‌ی ماژول».
- گروه یعنی رویداد یکتا با دست‌کم یک مسیر و پیامد کامل.
- اگر هیچ گروه کاملی نباشد، LLM صدا زده نمی‌شود و AiRun وضعیت `empty` می‌گیرد.
- بازگرداندن پاسخنامه و «تحلیل دوباره» فقط پیش‌نویس‌های `pending` را `archived` می‌کنند.
- ارسال دوباره و «تحلیل دوباره» فقط پیامدهایی را تحلیل می‌کنند که ریسک تأییدشده ندارند.

## ۴. حذف‌ها، مایگریشن‌ها و تبدیل داده

مایگریشن‌ها افزایشی‌اند و تاریخچه‌ی مایگریشن بازنویسی نمی‌شود، تا نسخه‌ی دیگر سرور نشکند. پیش از هر `migrate` پشتیبان گرفته می‌شود:

```
mkdir -p /opt/erm-dev-backups && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > /opt/erm-dev-backups/erm-dev-$(date +%Y%m%d-%H%M).dump
# بازگردانی:
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < <فایل>
```

### ۴-۱. حذف جریان پرسشنامه‌ی قدیمی

**بک‌اند:**
- `apps/questionnaires/views.py`، `forms.py`، `urls.py`، `templates/questionnaires/*` و `include` آن در `config/urls.py`.
- `apps/api/questionnaires.py`: بخش پرسشنامه. `RiskQuestionListView` و `RiskQuestionAnswerView` به `apps/api/risk_questions.py` منتقل می‌شوند.
- `apps/api/questionnaire_pages.py`.
- کلیدهای `questionnaires:*` در `apps/api/bridge_pages.py` و `apps/api/routes.py`.
- بخش `questionnaires:pending_convert` در `apps/risks/views.py` و `templates/risks/pending_scenario_select.html`.
- بخش پرسشنامه در `seed_demo`.

**فرانت:**
- `features/questionnaires/*`، جز `RiskQuestionsPage`.
- مسیرهای مربوط در `app/routes.tsx` و نوع‌های مربوط در `lib/types.ts`.

**مدل‌ها:**
- `Questionnaire`، `Question`، گزینه‌ها، `Answer`، `PathControl` و `InitialEvidence`.
- فیلدهای قدیمی `Response`:
  - FK `questionnaire`، `channel` و `recorded_by`
  - `functions`، `mission`، `commitments`، `disruptive_event`، `consequence`، `dependencies`، `evidence`، `current_controls` و `new_item`
  - `structured_data` و `return_question`
- `RiskPath.recovery` و `ServiceRecord.purpose`.
- فیلدهای قدیمی `PendingRisk`: `option`، `description`، `scenario` و منبع‌های option، new_item و manual.

**تست‌ها:** تست‌های همین جریان حذف شدند:
- pytest: `apps/api/tests/test_questionnaire_answers.py`، `test_questionnaire_bridge.py`، `apps/questionnaires/tests/test_questionnaires.py`، `test_repair_migration.py` و `test_structured.py`، و ۵ تست پاسخ در `apps/api/tests/test_api.py`. pytest از ۸۱۳ به ۷۵۱ رسید، بی شکست.
- vitest: `QuestionnaireAnswersPage.test.tsx`، `ResponseFormPage.test.tsx`، `ResponseStartPage.test.tsx`، `manage.test.tsx`، `response-form.test.ts` و چهار تست حالت پاسخ و «در حال شناسایی» در `IdentificationPage.test.tsx`.
- e2e: `questionnaires.spec.ts` (آزمون «پرسش‌های ریسک» به `risk-questions.spec.ts` رفت)، `questionnaire-answers.spec.ts`، `questionnaire-review.spec.ts` و `questionnaire-structured.spec.ts`.

**داده:**
- ردیف‌های مدل‌های حذف‌شده و جدول تاریخچه‌ی آن‌ها، به تصمیم صاحب محصول. تاریخچه‌ی `Response` و `PendingRisk` و `AuditEvent` می‌مانند.
- `clean_old_history` اجرا نمی‌شود.
- ریسک‌های رجیستر دست نمی‌خورند.
- این حذف فقط با پشتیبان برمی‌گردد.

### ۴-۲. حذف 0013
1. پشتیبان.
2. `manage.py migrate risks 0012`.
3. حذف این‌ها:
   - فایل `0013_identification_status.py`
   - `IdentificationDraft.Status`، `Origin` و `submitted_at`
   - `apps/api/questionnaire_answers.py` (بازنویسی می‌شود)
   - `mode="answer"` و حالت «در حال شناسایی»

اگر نسخه‌ی دیگر سرور 0013 را اجرا کرده است، پیش از pull همان‌جا `migrate risks 0012` لازم است.

**انجام شد (۱۴۰۵/۰۹/۰۲، با تأیید صاحب محصول):** پشتیبان `/opt/erm-dev-backups/erm-dev-20261123-1923.dump`، بعد
`migrate risks 0012` و `migrate questionnaires` (0007 حذف داده، 0008 حذف جدول‌ها و ستون‌ها). داده‌ی جریان قدیمی در DB
توسعه پاک شد؛ ۳۲ ریسک، ۲ پیش‌نویس شناسایی، ۸۸ رخداد ممیزی و ۱ ردیف تاریخچه‌ی `Response` ماندند.

### ۴-۳. مایگریشن‌های تازه

| اپ | تغییر | برگشت |
|---|---|---|
| questionnaires | حذف مدل‌ها و فیلدهای قدیمی (۴-۱) | فقط ساختار؛ داده با پشتیبان |
| questionnaires | فیلدهای تازه‌ی `Response` و وضعیت `identified` | دارد |
| questionnaires | `number`، `impact_types` و قید یکتای پیامد | دارد |
| questionnaires | بازسازی `PendingRisk` و `AiRun` | دارد |
| questionnaires | `TrigramExtension` (+ `django.contrib.postgres`) | دارد |
| risks | وضعیت `analysis` و پیش‌فرض `status` | دارد |
| actions | `MonitoringNotice.response` و `risk` nullable | دارد، به شرط نبود اعلان بی‌ریسک |

## ۵. API

**تغییر می‌کند:**
- `questionnaire-answers/`: داده‌ی ویزارد و پاسخنامه‌های اخیر روی `Response`.
- `identification/`: فقط فرم دستی.
- `session/`: منو.
- `my-work`: کارهای پاسخنامه و اعلان بی‌ریسک.
- `risk-questions/`: منتقل می‌شود، رفتارش ثابت می‌ماند.

**حذف می‌شود:** `questionnaires/`، `questionnaires/<pk>/start/` و `responses/<pk>/`.

**جدید**، در `apps/api/questionnaire_responses.py`:

| متد و مسیر | کار |
|---|---|
| `GET questionnaire-responses/?status&unit&q&page` | فهرست با شمار هر وضعیت |
| `POST questionnaire-responses/` | پیش‌نویس تازه |
| `GET questionnaire-responses/review-queue/` | صف «در انتظار بررسی»، قدیمی‌ترین اول، با مهلت |
| `GET, PUT questionnaire-responses/<pk>/` | خواندن و ذخیره‌ی پیش‌نویس |
| `POST questionnaire-responses/<pk>/submit/` | ارسال |
| `GET questionnaire-responses/<pk>/history/` | تاریخچه |
| `GET questionnaire-responses/<pk>/risks/` | ریسک‌های پیشنهادی |
| `POST questionnaire-responses/<pk>/return/` | `{questions[], message, due_date}` |
| `POST questionnaire-responses/<pk>/ai-identification/` | `202 {run_id}` |
| `GET ai-runs/<pk>/` · `POST ai-runs/<pk>/cancel/` | وضعیت و مرحله، و «لغو» |
| `PATCH pending-risks/<pk>/` | ذخیره‌ی پیش‌نویس |
| `POST pending-risks/<pk>/approve/` | تأیید (با بدنه‌ی اختیاری ویرایش) |
| `POST pending-risks/<pk>/reject/` | `{reason}` |
| `GET pending-risks/<pk>/similar/` | ریسک‌های مشابه |
| `GET identification/sources/` | اعداد کارت‌های 11 v2 |

**دسترسی‌ها:**

| کار | چه کسی |
|---|---|
| پاسخ‌دادن | `can_answer` |
| ویرایش | `can_edit_response`: پاسخ‌دهنده، در draft یا returned |
| بررسی | `can_manage_questionnaires`: عضو GRC و مدیر سامانه |
| دیدن | `visible_responses` |

## ۶. شناسایی هوشمند

**ساختار `apps/questionnaires/ai/`:**
- `prompts/risk_identification/v3/`: `system.md`، `user.md`، `retry.md` و `schema.json`، عیناً از بخش ۳ پرامپت.
- `grouping.py`: گروه‌بندی بر اساس پیامد.
- `providers.py`:
  - `mock`: پیش‌فرض.
  - `openai_compatible`: با `urllib.request`. اول `response_format: json_schema` را امتحان می‌کند و اگر پشتیبانی نشود به `json_object` برمی‌گردد.
- `validation.py`: کد دستی، بدون کتابخانه‌ی تازه.
- `pipeline.py`.

**اجرا:**
- فرمان `run_ai_identification --watch --interval 2`.
- سرویس `ai` در `docker-compose.dev.yml` و در `docker-compose.yml` (پروفایل prod).

**متغیرهای `.env.example`:** `LLM_PROVIDER=mock`، `LLM_BASE_URL`، `LLM_MODEL`، `LLM_API_KEY`، `LLM_TIMEOUT_MS=60000` و `RISK_SIMILARITY_THRESHOLD=0.3`.

**کد پیگیری:** `AI-<وضعیت HTTP یا 500>-<۴ رقم هگز>`.

**حریم خصوصی:** نام پاسخ‌دهنده، واحد و شناسه‌ی کاربر به LLM فرستاده نمی‌شود.

## ۷. اسنپ‌شات 8d6a640a

| بخش | تصمیم |
|---|---|
| `spa_link("پاسخ به پرسشنامه‌ها", …)` با `can_answer` | نگه‌داشتن |
| `managed_units`، `answer_unit` و `can_answer` | نگه‌داشتن |
| `IdentificationWizard` (کلیدها، LeaveGuard، Ctrl+S و گام‌نما) | نگه‌داشتن سازوکار. ویزارد تازه از الگوی آن ساخته می‌شود |
| `IdentificationWizard mode="identify"` | نگه‌داشتن، در `/identification/manual` |
| `RecentEntries` | الگوی جدول نگه‌داشته می‌شود |
| `QuestionnaireAnswersView`، `mode="answer"` و `QuestionnaireAnswersPage` | جایگزین می‌شوند |
| 0013 و حالت «در حال شناسایی» | حذف |

## ۸. برش‌ها

| برش | محتوا |
|---|---|
| الف | تم داتین، پوسته، کامپوننت‌ها، حذف تم تیره، و بازنویسی DESIGN.md و CLAUDE.md |
| ب۰ | حذف جریان قدیمی و 0013 |
| ب | مدل، مایگریشن، ویزارد ۸ گامی، 30f، جدول اخیر، نمای بازگشتی و seed `QR-1405-0109` |
| ج | 11 v2، صفحه‌ی «به‌زودی» و `/identification/manual` |
| د | 11a |
| هـ | 12a، 12b و 12c، به‌اضافه‌ی AiRun، pipeline با mock و سرویس `ai` |
| و | تأیید، ویرایش (12d)، رد، بازگردانی، مقایسه، «تحلیل دوباره» و وضعیت ANALYSIS |
| ز | 12e، بازگرداندن و ارسال دوباره |
| ح | تاریخچه، اعلان‌ها، کارهای من و مهلت‌ها |

بعد از هر برش: pytest، lint، vitest و e2e، اسکرین‌شات ۱۴۴۰×۱۰۲۴ و مقایسه با فریم، و کامیت بدون push.

## ۹. نمای پاسخ‌دهنده برای پاسخنامه‌ی بازگشتی
همان ویزارد، در `/questionnaire-answers/:id`. بالای کارت ویزارد یک `Alert` با لحن warning می‌آید که این‌ها را دارد:
- پیام کارشناس
- پرسش‌های تکمیلی، هر کدام با چیپ «درباره‌ی …». چیپ به گام مربوط می‌رود: مسیر به گام ۵، پیامد به گام ۷، پرسش n به گام n.
- چیپ مهلت

متن‌ها در جدول ۱۰ آمده‌اند.

## ۱۰. متن‌هایی که در copy.md نیستند (تأییدشده‌ی صاحب محصول، ۱۴۰۵/۰۹/۰۲)

لحن و واژه‌ها از copy.md گرفته شده است: «پاسخنامه»، «کارشناس ریسک»، «ریسک پیشنهادی»، «شناسایی هوشمند»، «بازگرداندن برای تکمیل». `{…}` جای مقدار است.

| جا | متن پیشنهادی |
|---|---|
| گام ۷ · برچسب فیلد سوم | شرح پیامد * |
| گام ۷ · راهنمای فیلد سوم (لایه‌ی پنهان 30d) | شرح کوتاه و قابل فهم برای مالک ریسک؛ حداکثر ۱۲۰ نویسه. |
| گام ۷ · جای‌نگهدار نوع پیامد | انتخاب نوع پیامد |
| 12d · فیلد مالک شخص | مالک ریسک (شخص) · راهنما: اختیاری · پیش‌فرض: مدیر واحد مالک |
| ویزارد · پرسش بی‌پاسخ | این پرسش را پاسخ دهید. |
| ویزارد · مسیر خالی | شرح این مسیر تحقق را بنویسید. |
| ویزارد · نبود مسیر | دست‌کم یک مسیر تحقق اضافه کنید. |
| ویزارد · رویداد خالی | برای این مسیر یک رویداد بنویسید یا از رویدادهای قبلی انتخاب کنید. |
| ویزارد · نوع پیامد | دست‌کم یک نوع پیامد انتخاب کنید. |
| ویزارد · دامنه | دامنه‌ی پیامد را بنویسید. |
| ویزارد · شرح پیامد | شرح پیامد را بنویسید. |
| ویزارد · طول | حداکثر {n} نویسه. |
| ویزارد · حذف مسیری که رویدادش مشترک است | رویداد این مسیر در مسیر {n} هم انتخاب شده است؛ اول آن مسیر را تغییر دهید. |
| گام ۸ · ناقص | {n} پرسش اجباری بی‌پاسخ مانده است؛ پیش از ارسال آن‌ها را کامل کنید. |
| ذخیره‌ی پیش‌نویس · موفق | پیش‌نویس ذخیره شد. |
| ذخیره‌ی پیش‌نویس · خطا | پیش‌نویس ذخیره نشد. اتصال را بررسی کنید و دوباره ذخیره کنید. |
| صفحه‌ی ویزارد · کاربر غیر مدیر واحد | «پاسخ به پرسشنامه‌ها» برای مدیر واحد است (همان متن موجود اسنپ‌شات) |
| پاسخنامه‌های اخیر · خالی | هنوز پاسخنامه‌ای نفرستاده‌اید. با پاسخ به پرسش‌های بالا اولین پاسخنامه را بسازید. |
| 11a · صف خالی | پاسخنامه‌ای در انتظار بررسی نیست. |
| 11a · جدول بدون نتیجه | پاسخنامه‌ای با این جستجو یا فیلتر پیدا نشد. |
| صفحه‌ی «به‌زودی» · عنوان | همان عنوان کارت، مثلاً «شناسایی ریسک از نتایج جلسات ممیزی»، با نشان «به‌زودی» |
| صفحه‌ی «به‌زودی» · متن | این منبع شناسایی هنوز آماده نیست و به‌زودی اضافه می‌شود. تا آن زمان ریسک‌ها را از پاسخنامه‌ها یا «ثبت دستی ریسک» شناسایی کنید. |
| صفحه‌ی «به‌زودی» · دکمه | بازگشت به شناسایی ریسک |
| 12a · «پاسخنامه‌ی بعدی» بدون مورد | پاسخنامه‌ی دیگری در صف نیست. |
| 12b · بعد از «لغو» | شناسایی هوشمند لغو شد. |
| رد · عنوان دیالوگ | رد ریسک پیشنهادی |
| رد · متن | «{عنوان}» وارد رجیستر نمی‌شود و با دلیل شما در تاریخچه‌ی پاسخنامه می‌ماند. |
| رد · فیلد | دلیل رد * |
| رد · خطا | دلیل رد را بنویسید. |
| رد · دکمه‌ها | رد ریسک · انصراف |
| رد · toast | ریسک پیشنهادی رد شد. |
| تحلیل دوباره · عنوان | تحلیل دوباره‌ی پاسخنامه |
| تحلیل دوباره · متن | {n} پیش‌نویس بررسی‌نشده بایگانی و دوباره ساخته می‌شود. ریسک‌های تأییدشده و ردشده تغییری نمی‌کنند. |
| تحلیل دوباره · دکمه‌ها | تحلیل دوباره · انصراف |
| تأیید · toast در ۱۰ ثانیه | ریسک تأیید شد و به آنالیز ریسک رفت · بازگردانی |
| تأیید · بعد از «بازگردانی» | تأیید ریسک بازگردانده شد. |
| تأیید · خطای ثبت | ثبت ریسک انجام نشد؛ ریسک دوباره منتظر تصمیم شماست. |
| 12d · ذخیره‌ی پیش‌نویس | تغییرات ریسک پیشنهادی ذخیره شد. |
| مقایسه · عنوان | مقایسه با ریسک موجود |
| مقایسه · سرستون‌ها | ریسک پیشنهادی · ریسک موجود |
| مقایسه · ردیف‌ها | همان برچسب‌های 12c: عنوان، عامل آغازگر، مسیر تحقق، رویداد هدف، پیامد، دسته‌ی ریسک |
| مقایسه · زیرعنوان | {n}٪ شباهت · ادغام در این نسخه انجام نمی‌شود. |
| مقایسه · دکمه‌ها | مشاهده‌ی ریسک · بستن |
| 12e · هیچ پرسش انتخاب‌نشده | دست‌کم یک پرسش انتخاب کنید. |
| 12e · پرسش دلخواه | پرسش خود را بنویسید |
| 12e · مهلت نادرست | مهلت باید روز کاری بعد از امروز باشد. |
| 12e · toast | پاسخنامه برای تکمیل به {پاسخ‌دهنده} بازگردانده شد. |
| نمای بازگشتی · عنوان Alert | این پاسخنامه برای تکمیل اطلاعات بازگردانده شده است |
| نمای بازگشتی · برچسب‌ها | پیام کارشناس ریسک · پرسش‌های تکمیلی · مهلت تکمیل: تا {تاریخ} |
| تاریخچه · رد | ریسک پیشنهادی «{عنوان}» رد شد |
| تاریخچه · ویرایش | ریسک پیشنهادی «{عنوان}» ویرایش شد |
| تاریخچه · بازگرداندن | برای تکمیل بازگردانده شد · {n} پرسش |
| تاریخچه · ارسال دوباره | دوباره برای بررسی ارسال شد |
| تاریخچه · خطای AI | شناسایی هوشمند انجام نشد |
| تاریخچه · نتیجه‌ی خالی | شناسایی هوشمند · ریسکی ساخته نشد |
| اعلان · AI موفق | شناسایی هوشمند پاسخنامه‌ی {کد} انجام شد · {n} ریسک پیشنهاد شد |
| اعلان · AI خالی | شناسایی هوشمند پاسخنامه‌ی {کد} ریسکی نساخت |
| اعلان · AI خطا | شناسایی هوشمند پاسخنامه‌ی {کد} انجام نشد · کد پیگیری {کد خطا} |
| اعلان · بازگرداندن (به پاسخ‌دهنده) | پاسخنامه‌ی {کد} برای تکمیل اطلاعات بازگردانده شد · مهلت تا {تاریخ} |
| اعلان · ارسال دوباره (به کارشناس) | پاسخنامه‌ی {کد} تکمیل و دوباره ارسال شد |
| اعلان · شناسایی‌شده | پاسخنامه‌ی {کد} بررسی شد و {n} ریسک شناسایی شد |
| اعلان · بررسی‌شده | پاسخنامه‌ی {کد} بررسی شد؛ ریسکی از آن ثبت نشد |
| کارهای من · پاسخ‌دهنده | تکمیل پاسخنامه‌ی {کد} |
| کارهای من · کارشناس | بررسی پاسخنامه‌ی {کد} |

## ۱۱. کمبودهای دیگر
- پیوند «همه‌ی پاسخنامه‌ها» برای پاسخ‌دهنده به 11a می‌رود، بدون بخش صف و فیلترشده با `visible_responses`.
- اسکیل `andrej-karpathy-skills:karpathy-guidelines` در این محیط نیست.
