"""اعلان‌های شناسایی از پاسخنامه با سازوکار اعلان داخلی موجود (MonitoringNotice)، متن‌ها از جدول تأییدشده‌ی بخش ۱۰
docs/implementation-plan.md: پایان شناسایی هوشمند برای کارشناس ریسک، بازگرداندن برای پاسخ‌دهنده، ارسال دوباره برای
کارشناسی که بازگردانده بود و نتیجه‌ی بررسی برای پاسخ‌دهنده. موضوع این اعلان‌ها پاسخنامه است، نه ریسک؛ کلید رویداد
(recipient، event_key) یکتاست تا هیچ رویدادی دو بار اعلان نشود."""

from django.utils import timezone

from apps.actions.models import MonitoringNotice
from apps.core.jalali import to_jalali

from .answers import fa
from .models import AiRun, PendingRisk, Response
from .permissions import can_manage_questionnaires


def review_href(response):
    return response.get_absolute_url()


def answer_href(response):
    return f"/app{response.answer_route}"


def stamp():
    """بخش یکتای کلید رویدادهایی که برای یک پاسخنامه چند بار رخ می‌دهند (هر دور بازگرداندن و بررسی)."""
    return timezone.now().strftime("%Y%m%d%H%M%S%f")


def notify(recipient, response, key, message, href):
    if recipient is None or not recipient.is_active:
        return None
    notice, _ = MonitoringNotice.objects.get_or_create(
        recipient=recipient,
        event_key=key,
        defaults={"response": response, "message": message, "href": href},
    )
    return notice


def returner(response):
    """کارشناسی که پاسخنامه را آخرین بار برای تکمیل بازگردانده است: کاربر نخستین ردیف تاریخچه‌ی آخرین دور «بازگشت»،
    چون ذخیره‌های پاسخ‌دهنده در همان دور هم ردیف «بازگشت» با کاربر خودش می‌سازند."""
    user = None
    records = response.history.select_related("history_user").order_by("-history_date", "-history_id")
    for record in records.iterator():
        if record.status == Response.Status.RETURNED:
            user = record.history_user
        elif user is not None:
            break
    return user


def run_finished(run):
    """پایان اجرای شناسایی (موفق، خالی یا خطا) برای کارشناسی که آن را خواسته است. اجرای خودکار بعد از ارسال دوباره را
    پاسخ‌دهنده خواسته است، پس اعلانش به کارشناسی می‌رسد که پاسخنامه را بازگردانده بود. لغو اعلان ندارد."""
    response = run.response
    code = response.code
    if run.status == AiRun.Status.SUCCEEDED:
        message = f"شناسایی هوشمند پاسخنامه‌ی {code} انجام شد · {fa(run.drafts.count())} ریسک پیشنهاد شد"
    elif run.status == AiRun.Status.EMPTY:
        message = f"شناسایی هوشمند پاسخنامه‌ی {code} ریسکی نساخت"
    elif run.status == AiRun.Status.FAILED:
        message = f"شناسایی هوشمند پاسخنامه‌ی {code} انجام نشد · کد پیگیری {run.error_code}"
    else:
        return None
    requester = run.requested_by
    recipient = requester if requester and can_manage_questionnaires(requester) else returner(response)
    return notify(recipient, response, f"ai-run:{run.pk}:{run.status}", message, review_href(response))


def returned(response):
    due = fa(to_jalali(response.return_due)) if response.return_due else ""
    message = f"پاسخنامه‌ی {response.code} برای تکمیل اطلاعات بازگردانده شد · مهلت تا {due}"
    key = f"response:{response.pk}:returned:{stamp()}"
    return notify(response.respondent, response, key, message, answer_href(response))


def resubmitted(response):
    message = f"پاسخنامه‌ی {response.code} تکمیل و دوباره ارسال شد"
    key = f"response:{response.pk}:resubmitted:{stamp()}"
    return notify(returner(response), response, key, message, review_href(response))


def settled(response):
    """نتیجه‌ی بررسی برای پاسخ‌دهنده: شمار ریسک‌های تأییدشده یا «ریسکی از آن ثبت نشد»."""
    if response.status == Response.Status.IDENTIFIED:
        count = response.pending_risks.filter(status=PendingRisk.Status.CONVERTED).count()
        message = f"پاسخنامه‌ی {response.code} بررسی شد و {fa(count)} ریسک شناسایی شد"
    else:
        message = f"پاسخنامه‌ی {response.code} بررسی شد؛ ریسکی از آن ثبت نشد"
    key = f"response:{response.pk}:{response.status}:{stamp()}"
    return notify(response.respondent, response, key, message, review_href(response))
