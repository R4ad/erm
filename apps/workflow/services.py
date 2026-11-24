from django.db import transaction
from django.utils import timezone

from apps.risks.models import Risk
from apps.workcalendar.workdays import add_working_days

from .lifecycle import blocking_problems, can_perform
from .models import ChangeRequest, RiskQuestion, StatusTransition

QUESTION_WORKING_DAYS = 5  # مهلت جواب پرسش، مثل برگشت پرسشنامه (بخش ۴ سند v5)

# فیلدهایی که بخش تازه‌ی تفکیک از ریسک مبدأ می‌گیرد؛ عنوانش را پیشنهاد می‌دهد و بقیه را GRC بعداً اصلاح می‌کند.
SPLIT_COPIED_FIELDS = [
    "scenario",
    "scenario_version",
    "description",
    "service",
    "scope",
    "owner",
    "org_unit",
    "category",
    "data_class",
    "cia_c",
    "cia_i",
    "cia_a",
    "initiator",
    "count_unit",
    "count_exclusions",
    "channel",
]


class WorkflowError(Exception):
    """کاری که شرطش برقرار نیست. problems همان پیام‌هایی است که به کاربر نشان داده می‌شود."""

    def __init__(self, problems):
        super().__init__("؛ ".join(problems))
        self.problems = problems


def _locked(risk):
    """ریسک را قفل می‌کند و تازه از پایگاه داده می‌خواند تا دو انتقال هم‌زمان روی هم ننویسند."""
    return Risk.objects.select_for_update().get(pk=risk.pk)


def _set_status(risk, status, user, reason="", meeting_date=None):
    previous = risk.status
    risk.status = status
    risk._history_user = user
    risk.save()
    return StatusTransition.objects.create(
        risk=risk, from_status=previous, to_status=status, reason=reason, meeting_date=meeting_date, created_by=user
    )


@transaction.atomic
def perform_transition(risk, transition, user, reason="", meeting_date=None, questions=None):
    """یک انتقال جدول س۱۵ را با چک انجام‌دهنده و شرط‌ها انجام می‌دهد و در تاریخچه‌ی انتقال ثبت می‌کند.
    برای «طرح پرسش‌های جدید»، questions فهرست متن پرسش‌هاست."""
    locked = _locked(risk)
    if not transition.starts_from(locked.status):
        raise WorkflowError(["وضعیت ریسک در این فاصله عوض شده است؛ صفحه را دوباره باز کنید."])
    if not can_perform(user, transition):
        raise WorkflowError(["این انتقال با نقش شما انجام نمی‌شود."])
    problems = blocking_problems(transition, locked, {"reason": reason})
    if transition.reason_required and not reason.strip():
        problems.append(f"«{transition.reason_label}» را بنویسید.")
    if transition.meeting_date and not meeting_date:
        problems.append("تاریخ جلسه‌ی کارگروه را بنویسید.")
    if transition.asks_questions and not questions:
        problems.append("دست‌کم یک پرسش بنویسید.")
    if problems:
        raise WorkflowError(problems)
    if transition.asks_questions:
        due = add_working_days(timezone.localdate(), QUESTION_WORKING_DAYS)
        for text in questions:
            RiskQuestion.objects.create(risk=locked, text=text, asked_by=user, due=due)
    record = _set_status(locked, transition.target, user, reason.strip(), meeting_date)
    risk.status = locked.status
    return record


def answer_question(question, user, text):
    question.answer = text
    question.answered_by = user
    question.answered_at = timezone.now()
    question._history_user = user
    question.save()


def change_problems(risk, kind, merge_into=None):
    """چرا این ریسک الان ادغام یا تفکیک نمی‌شود."""
    problems = []
    if not risk.is_active:
        problems.append("ریسک ردشده یا بسته‌شده ادغام یا تفکیک نمی‌شود.")
    if not risk.owner_id:
        problems.append("ریسک مالک ندارد؛ اول مالک را تعیین کنید، چون ادغام و تفکیک تأیید مالک را می‌خواهد.")
    if risk.change_requests.filter(status=ChangeRequest.Status.PENDING).exists():
        problems.append("برای این ریسک درخواست بازی منتظر تأیید مالک است.")
    if kind == ChangeRequest.Kind.MERGE and merge_into is not None:
        if merge_into.pk == risk.pk:
            problems.append("ریسک در خودش ادغام نمی‌شود.")
        elif not merge_into.is_active:
            problems.append(f"ریسک {merge_into.code} فعال نیست و ریسکی در آن ادغام نمی‌شود.")
    return problems


def propose_change(risk, kind, user, reason, merge_into=None, parts=""):
    problems = change_problems(risk, kind, merge_into)
    if problems:
        raise WorkflowError(problems)
    request = ChangeRequest(kind=kind, risk=risk, merge_into=merge_into, parts=parts, reason=reason, proposed_by=user)
    request._history_user = user
    request.save()
    return request


def can_decide(user, request):
    """فقط مالک ریسک درخواست را تأیید یا رد می‌کند (جواب س۵۳)."""
    return request.is_pending and request.risk.owner_id == user.pk


@transaction.atomic
def decide_change(request, user, approve, note=""):
    """تأیید یا رد مالک. با تأیید، ادغام یا تفکیک همان لحظه انجام می‌شود. خروجی برای تفکیک ریسک‌های تازه است."""
    request = ChangeRequest.objects.select_for_update().get(pk=request.pk)
    if not can_decide(user, request):
        raise WorkflowError(["این درخواست منتظر تأیید شما نیست."])
    created = []
    if approve:
        risk = _locked(request.risk)
        problems = [] if risk.is_active else ["ریسک دیگر فعال نیست."]
        if request.kind == ChangeRequest.Kind.MERGE:
            target = _locked(request.merge_into)
            if not target.is_active:
                problems.append(f"ریسک {target.code} دیگر فعال نیست و ریسکی در آن ادغام نمی‌شود.")
            if problems:
                raise WorkflowError(problems)
            risk.merged_into = target
            proposer = request.proposed_by.get_full_name() or request.proposed_by.username
            _set_status(
                risk, Risk.Status.CLOSED, user, f"ادغام در {target.code} با پیشنهاد {proposer}: {request.reason}"
            )
        else:
            if problems:
                raise WorkflowError(problems)
            created = [_split_part(risk, title, user) for title in request.part_titles()]
    request.status = ChangeRequest.Status.APPROVED if approve else ChangeRequest.Status.REJECTED
    request.decided_by = user
    request.decided_at = timezone.now()
    request.decision_note = note
    request._history_user = user
    request.save()
    return created


def _split_part(source, title, user):
    # بخش تفکیک‌شده مثل قبل «ثبت‌شده در رجیستر» است، نه «آنالیز ریسک» ریسک‌های تازه.
    part = Risk(
        title=title,
        split_from=source,
        status=Risk.Status.REGISTERED,
        **{name: getattr(source, name) for name in SPLIT_COPIED_FIELDS},
    )
    part._history_user = user
    part.save()
    part.customers.set(source.customers.all())
    part.tags.set(source.tags.all())
    return part
