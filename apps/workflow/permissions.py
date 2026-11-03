from apps.risks.models import Risk
from apps.risks.permissions import can_edit_register, visible_risks

from .lifecycle import can_perform, transitions_from
from .models import ChangeRequest, RiskQuestion


def available_transitions(user, risk):
    """انتقال‌هایی از وضعیت فعلی ریسک که نقش این کاربر اجازه‌ی انجامشان را دارد."""
    return [transition for transition in transitions_from(risk.status) if can_perform(user, transition)]


def can_propose_change(user):
    """پیشنهاد ادغام و تفکیک با عضو GRC است (جواب س۵۳). مدیر سامانه همیشه می‌تواند."""
    return can_edit_register(user)


def answerable_questions(user):
    """پرسش‌های بازی که این کاربر جواب می‌دهد: مدیر واحد برای ریسک‌های واحدهای تحت مدیریتش و زیرمجموعه‌هایشان،
    و عضو GRC و مدیر سامانه برای همه، تا جواب جلسه را به نام مدیر ثبت کنند (مثل مصاحبه در س۴۶)."""
    questions = RiskQuestion.objects.filter(answered_at__isnull=True, risk__status=Risk.Status.QUESTIONS)
    if can_edit_register(user):
        return questions
    return questions.filter(risk__org_unit__in=user.managed_unit_ids())


def visible_change_requests(user):
    return ChangeRequest.objects.filter(risk__in=visible_risks(user))
