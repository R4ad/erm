"""تصمیم کارشناس ریسک درباره‌ی ریسک‌های پیشنهادی یک پاسخنامه (فریم‌های 12c و 12d): ویرایش، تأیید و ثبت در رجیستر
با وضعیت «آنالیز ریسک»، و رد با دلیل. با تصمیم درباره‌ی همه‌ی پیش‌نویس‌ها پاسخنامه «شناسایی‌شده» می‌شود و اگر همه رد
شده باشند «بررسی‌شده». بازگردانی تأیید در رابط انجام می‌شود: درخواست تأیید تا پایان پیام ۱۰ ثانیه‌ای فرستاده نمی‌شود،
پس ریسکی که بازگردانده شده هیچ‌وقت ساخته نمی‌شود و کد RK هدر نمی‌رود."""

from django.db import transaction
from django.utils import timezone

from apps.risks.identification import narrative
from apps.risks.models import Risk

from . import notices
from .answers import EMPTY_PATH
from .models import AiRun, PendingRisk, Response

P = PendingRisk.Status
# فیلدهای متنی 12d که کارشناس ویرایش می‌کند، با مقدار پیشنهادی AI برای «بازگرداندن پیشنهاد AI».
TEXT_FIELDS = ("title", "initiating_factor", "target_event", "impact")
# پیام فیلد خالی فرم 12d؛ هم در «ذخیره‌ی پیش‌نویس» و هم در تأیید.
REQUIRED_MESSAGES = {
    "title": "عنوان ریسک را بنویسید.",
    "initiating_factor": "عامل آغازگر را بنویسید.",
    "target_event": "رویداد هدف را بنویسید.",
    "impact": "پیامد را بنویسید.",
}
OWNER_REQUIRED = "مالک ریسک را انتخاب کنید."


class DecisionError(Exception):
    """تصمیمی که شرطش برقرار نیست؛ errors پیام هر فیلد و message پیام کلی است."""

    def __init__(self, message="", errors=None):
        super().__init__(message)
        self.message = message
        self.errors = errors or {}


def ai_values(draft):
    """مقدارهای پیشنهادی AI برای همین پیش‌نویس، به شکل فیلدهای 12d."""
    original = draft.ai_original or {}
    paths = {item.get("path_id"): item.get("text", "") for item in original.get("realization_paths", [])}
    return {
        "title": original.get("title", ""),
        "initiating_factor": original.get("initiating_factor", ""),
        "target_event": original.get("target_event", {}).get("text", ""),
        "impact": original.get("impact", {}).get("text", ""),
        "paths": [{"number": item["number"], "text": paths.get(item.get("path_id"), "")} for item in draft.paths],
    }


def missing_fields(draft):
    errors = {}
    for name, message in REQUIRED_MESSAGES.items():
        if not getattr(draft, name).strip():
            errors[name] = [message]
    for item in draft.paths:
        if not item["text"].strip():
            errors[f"paths.{item['number']}"] = [EMPTY_PATH]
    if draft.owner_unit_id is None:
        errors["owner_unit"] = [OWNER_REQUIRED]
    return errors


def apply_changes(draft, changes):
    """مقدارهای فرم 12d را روی پیش‌نویس می‌گذارد. شماره‌ی مسیرها از پاسخنامه است و فقط متنشان عوض می‌شود. changes قبلاً
    اعتبارسنجی شده و دسته، واحد و شخص آن نمونه‌ی مدل‌اند."""
    for name in TEXT_FIELDS:
        if name in changes:
            setattr(draft, name, changes[name].strip())
    if "paths" in changes:
        texts = {item["number"]: item["text"].strip() for item in changes["paths"]}
        draft.paths = [{**item, "text": texts.get(item["number"], item["text"])} for item in draft.paths]
    for name in ("category", "owner_unit", "owner"):
        if name in changes:
            setattr(draft, name, changes[name])


def locked_pending(draft):
    locked = PendingRisk.objects.select_for_update().select_related("response").get(pk=draft.pk)
    if locked.status != P.PENDING:
        raise DecisionError("این ریسک پیشنهادی دیگر منتظر تصمیم نیست.")
    if locked.response.status != Response.Status.SUBMITTED:
        raise DecisionError("فقط ریسک‌های پاسخنامه‌ی در انتظار بررسی تصمیم می‌گیرند.")
    return locked


@transaction.atomic
def save_draft(draft, user, changes):
    locked = locked_pending(draft)
    apply_changes(locked, changes)
    locked._history_user = user
    locked.save()
    return locked


def intake_of(draft):
    """ورودی شناسایی ریسک ساخته‌شده: همان اجزای الگوی سناریوی فرم شناسایی دستی، به‌اضافه‌ی منبع پاسخنامه."""
    response = draft.response
    record = response.service_records.first()
    instance = draft.consequence.risk_instance if draft.consequence_id else None
    return {
        "subject": record.name_and_scope if record else "",
        "objective": "؛ ".join(item.description for item in record.objectives.all()) if record else "",
        "conditions": draft.initiating_factor,
        "customer": draft.impact_scope,
        "event": draft.target_event,
        "harm": draft.impact,
        "questionnaire": {
            "response": response.code,
            "response_id": response.pk,
            "pending_risk_id": draft.pk,
            "ai_run_id": draft.ai_run_id,
            "paths": [{"number": item["number"], "text": item["text"]} for item in draft.paths],
            "event_number": instance.number if instance else None,
            "impact_type": draft.impact_type,
            "impact_scope": draft.impact_scope,
            "responsibility": response.responsibility,
        },
    }


def risk_from(draft, user):
    intake = intake_of(draft)
    risk = Risk(
        title=draft.title,
        description=narrative(intake),
        org_unit=draft.owner_unit,
        owner=draft.owner,
        category=draft.category,
        channel=Risk.Channel.QUESTIONNAIRE,
        initiator=draft.initiating_factor,
        realization_path="\n".join(item["text"] for item in draft.paths),
        scope=draft.impact_scope,
        intake=intake,
        status=Risk.Status.ANALYSIS,
    )
    risk._history_user = user
    risk.save()
    return risk


@transaction.atomic
def approve(draft, user, changes=None):
    """«تأیید و ارسال به آنالیز» یا «ذخیره و تأیید»: ریسک رجیستر با وضعیت «آنالیز ریسک» ساخته و به پیش‌نویس وصل می‌شود."""
    locked = locked_pending(draft)
    if changes:
        apply_changes(locked, changes)
    errors = missing_fields(locked)
    if errors:
        raise DecisionError("ریسک پیشنهادی کامل نیست.", errors)
    locked.risk = risk_from(locked, user)
    locked.status = P.CONVERTED
    locked.decided_by = user
    locked.decided_at = timezone.now()
    locked._history_user = user
    locked.save()
    settle(locked.response, user)
    return locked


@transaction.atomic
def reject(draft, user, reason):
    reason = (reason or "").strip()
    if not reason:
        raise DecisionError(errors={"reason": ["دلیل رد را بنویسید."]})
    locked = locked_pending(draft)
    locked.status = P.DISMISSED
    locked.dismiss_reason = reason
    locked.decided_by = user
    locked.decided_at = timezone.now()
    locked._history_user = user
    locked.save()
    settle(locked.response, user)
    return locked


def settle(response, user):
    """با تصمیم درباره‌ی آخرین پیش‌نویس، پاسخنامه «شناسایی‌شده» (دست‌کم یک تأیید) یا «بررسی‌شده» (همه رد) می‌شود. تا
    وقتی اجرای شناسایی در صف یا در حال اجراست پیش‌نویس تازه می‌آید و پاسخنامه در انتظار بررسی می‌ماند."""
    response = Response.objects.select_for_update().get(pk=response.pk)
    drafts = response.pending_risks.exclude(status=P.ARCHIVED)
    if drafts.filter(status=P.PENDING).exists() or not drafts.exists():
        return
    if response.ai_runs.filter(status__in=AiRun.ACTIVE_STATUSES).exists():
        return
    converted = drafts.filter(status=P.CONVERTED).exists()
    response.status = Response.Status.IDENTIFIED if converted else Response.Status.REVIEWED
    response.reviewed_by = user
    response.reviewed_at = timezone.now()
    response._history_user = user
    response.save(update_fields=["status", "reviewed_by", "reviewed_at", "updated_at"])
    notices.settled(response)
