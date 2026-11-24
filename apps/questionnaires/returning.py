"""بازگرداندن پاسخنامه برای تکمیل (فریم 12e) و ارسال دوباره‌اش. کارشناس ریسک پرسش‌های تکمیلی را از پیشنهادهای AI
(follow_up_questions آخرین اجرای موفق) یا پرسش دلخواه برمی‌گزیند، پیامی می‌نویسد و مهلتی به روز کاری می‌دهد.
پیش‌نویس‌های بررسی‌نشده بایگانی می‌شوند و اجرای در صف لغو می‌شود؛ ریسک‌های تأییدشده و ردشده دست نمی‌خورند. با ارسال
دوباره، شناسایی هوشمند خودکار در صف می‌رود و فقط پیامدهای بی‌ریسک تأییدشده را می‌سنجد (grouping.build_input)."""

from django.db import transaction
from django.utils import timezone

from apps.workcalendar.workdays import add_working_days, holidays_after

from . import notices
from .ai.pipeline import request_identification
from .answers import FA_DIGITS
from .models import AiRun, PendingRisk, Response
from .services import DecisionError

# مهلت پیش‌فرض تکمیل (تصمیم ۴ برنامه) و گزینه‌های فهرست «مهلت تکمیل».
RETURN_WORKING_DAYS = 3
RETURN_DAY_CHOICES = range(1, 11)
# بیشتر از این پرسش فرستاده نمی‌شود؛ رابط «افزودن پرسش دلخواه» را بعد از دهمین پرسش غیرفعال می‌کند.
MAX_RETURN_QUESTIONS = 10
SOURCES = ("ai", "custom")
BASIC_COUNT = 4


def fa(value):
    return str(value).translate(FA_DIGITS)


def fa_list(numbers):
    """«۱»، «۱ و ۳»، «۱، ۲ و ۳»؛ همان numberList رابط."""
    items = [fa(n) for n in numbers]
    if len(items) < 2:
        return "".join(items)
    return f"{'، '.join(items[:-1])} و {items[-1]}"


def about_targets(response):
    """شناسه‌های ورودی LLM (P، E، I و Q) ← برچسب «درباره‌ی …» و گامی از ویزارد که چیپ پاسخ‌دهنده به آن می‌رود."""
    targets = {f"Q{n}": (f"پرسش {fa(n)}", n) for n in range(1, BASIC_COUNT + 1)}
    record = response.service_records.prefetch_related("risk_instances__paths").first()
    if record is None:
        return targets
    for instance in record.risk_instances.all():
        numbers = sorted(path.number for path in instance.paths.all())
        for number in numbers:
            targets[f"P{number}"] = (f"مسیر تحقق {fa(number)}", 5)
        targets[f"E{instance.number}"] = (f"رویداد {fa(instance.number)}", 6)
        if numbers:
            paths = f"مسیرهای {fa_list(numbers)}" if len(numbers) > 1 else f"مسیر {fa(numbers[0])}"
            targets[f"I{instance.number}"] = (f"پیامد {fa(instance.number)} · {paths}", 7)
        else:
            targets[f"I{instance.number}"] = (f"پیامد {fa(instance.number)}", 7)
    return targets


def suggested_questions(response, targets=None):
    """پرسش‌های تکمیلی پیشنهادی آخرین اجرای موفق؛ پرسشی که به بخش ناشناخته‌ای اشاره کند بی‌برچسب می‌آید."""
    run = response.ai_runs.filter(status=AiRun.Status.SUCCEEDED).order_by("-finished_at", "-pk").first()
    if run is None:
        return []
    targets = targets if targets is not None else about_targets(response)
    suggestions = []
    for item in run.follow_up_questions or []:
        text = str(item.get("question", "")).strip()
        if not text:
            continue
        about, step = targets.get(item.get("about"), ("", None))
        suggestions.append({"text": text, "ref": item.get("about") or "", "about": about, "step": step})
    return suggestions


def deadline_choices(today=None):
    today = today or timezone.localdate()
    holidays = holidays_after(today)
    return [(days, add_working_days(today, days, holidays)) for days in RETURN_DAY_CHOICES]


def valid_due(due, today=None):
    """مهلت یکی از گزینه‌های مودال است: ۱ تا ۱۰ روز کاری بعد از امروز."""
    return due in {day for _, day in deadline_choices(today)}


def stored_question(item, targets):
    about, step = targets.get(item.get("ref") or "", ("", None))
    return {
        "text": item["text"],
        "ref": item.get("ref") or "",
        "about": about,
        "step": step,
        "source": item.get("source") if item.get("source") in SOURCES else "custom",
    }


@transaction.atomic
def return_response(response, user, questions, message, due):
    """پاسخنامه‌ی در انتظار بررسی را با پرسش‌ها، پیام و مهلت به پاسخ‌دهنده برمی‌گرداند."""
    response = Response.objects.select_for_update().get(pk=response.pk)
    if response.status != Response.Status.SUBMITTED:
        raise DecisionError("فقط پاسخنامه‌ی در انتظار بررسی بازگردانده می‌شود.")
    now = timezone.now()
    for run in response.ai_runs.select_for_update().filter(status__in=AiRun.ACTIVE_STATUSES):
        run.status = AiRun.Status.CANCELLED
        run.finished_at = now
        run.save(update_fields=["status", "finished_at", "updated_at"])
    for draft in response.pending_risks.filter(status=PendingRisk.Status.PENDING):
        draft.status = PendingRisk.Status.ARCHIVED
        draft._history_user = user
        draft.save(update_fields=["status", "updated_at"])
    targets = about_targets(response)
    response.status = Response.Status.RETURNED
    response.return_questions = [stored_question(item, targets) for item in questions[:MAX_RETURN_QUESTIONS]]
    response.return_message = message
    response.return_due = due
    response.returned_at = now
    response._history_user = user
    response.save(
        update_fields=["status", "return_questions", "return_message", "return_due", "returned_at", "updated_at"]
    )
    notices.returned(response)
    return response


def identify_resubmitted(response, user):
    """بعد از ارسال دوباره‌ی پاسخنامه‌ی بازگشتی، کارشناسی که آن را بازگردانده بود اعلان می‌گیرد و شناسایی هوشمند
    خودکار در صف می‌رود."""
    notices.resubmitted(response)
    return request_identification(response, user)
