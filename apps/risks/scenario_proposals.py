"""پیشنهاد ادغام یا تفکیک سناریوی مرجع (بخش ۶ روش، فیگما ۲۱).

ادغام و تفکیک با دلیل پیشنهاد و با دلیل تصمیم ثبت می‌شوند و فقط عضو GRC (متولی روش) تصمیم می‌گیرد. ادغام پذیرفته
سناریوی مبدأ را غیرفعال می‌کند و به سناریوی مقصد پیوند می‌دهد؛ نمونه‌های ریسک قبلی همان سناریو و نسخه‌ی خود را نگه
می‌دارند و چیزی حذف نمی‌شود. ریسک تازه از این پس از سناریوی مقصد ساخته می‌شود."""

import re
from difflib import SequenceMatcher

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from .models import RiskScenario, ScenarioProposal
from .permissions import REGISTER_EDIT_ROLES


def can_decide(user):
    return user.is_superuser or user.has_role(*REGISTER_EDIT_ROLES)


def _text(scenario):
    words = re.sub(r"[^\w\s]", " ", f"{scenario.conditions} {scenario.event}")
    return " ".join(words.split())


def similarity(first, second):
    """درصد شباهت متن عامل آغازگر و رویداد اصلی دو سناریو؛ فقط راهنمای بررسی است، نه تصمیم."""
    return round(SequenceMatcher(None, _text(first), _text(second)).ratio() * 100)


@transaction.atomic
def propose(scenario, user, kind, reason, target=None):
    if not can_decide(user):
        raise ValidationError("پیشنهاد ادغام یا تفکیک را عضو GRC ثبت می‌کند.")
    reason = (reason or "").strip()
    problems = []
    if not reason:
        problems.append("دلیل پیشنهاد را بنویسید.")
    if not scenario.is_active:
        problems.append("سناریوی غیرفعال یا ادغام‌شده پیشنهاد تازه نمی‌گیرد.")
    if kind == ScenarioProposal.Kind.MERGE:
        if target is None or target.pk == scenario.pk:
            problems.append("سناریوی مقصد ادغام را انتخاب کنید؛ سناریو با خودش ادغام نمی‌شود.")
        elif not target.is_active:
            problems.append("سناریوی مقصد باید فعال باشد.")
    elif kind == ScenarioProposal.Kind.SPLIT:
        target = None
    else:
        problems.append("نوع پیشنهاد شناخته نشد.")
    pending = ScenarioProposal.objects.filter(scenario=scenario, status=ScenarioProposal.Status.PENDING)
    if pending.exists():
        problems.append("برای این سناریو پیشنهاد بازی هست؛ اول درباره‌ی آن تصمیم بگیرید.")
    if problems:
        raise ValidationError(problems)
    proposal = ScenarioProposal(
        kind=kind,
        scenario=scenario,
        target=target,
        similarity=similarity(scenario, target) if target else None,
        reason=reason,
        created_by=user,
    )
    proposal._history_user = user
    proposal.save()
    return proposal


@transaction.atomic
def decide(proposal, user, accept, reason):
    proposal = ScenarioProposal.objects.select_for_update().get(pk=proposal.pk)
    if not can_decide(user):
        raise ValidationError("درباره‌ی ادغام یا تفکیک متولی روش (عضو GRC) تصمیم می‌گیرد.")
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("دلیل تصمیم را بنویسید.")
    if proposal.status != ScenarioProposal.Status.PENDING:
        raise ValidationError("درباره‌ی این پیشنهاد قبلاً تصمیم گرفته شده است.")
    if accept and proposal.kind == ScenarioProposal.Kind.MERGE:
        source = RiskScenario.objects.select_for_update().get(pk=proposal.scenario_id)
        if not source.is_active or not proposal.target.is_active:
            raise ValidationError("یکی از دو سناریو دیگر فعال نیست.")
        source.is_active = False
        source.merged_into = proposal.target
        source._history_user = user
        source._change_reason = f"ادغام در {proposal.target.code}: {reason}"
        source.save()
    proposal.status = ScenarioProposal.Status.ACCEPTED if accept else ScenarioProposal.Status.REJECTED
    proposal.decided_by = user
    proposal.decided_at = timezone.now()
    proposal.decision_reason = reason
    proposal._history_user = user
    proposal.save()
    return proposal
