"""تفویض اختیار موقت (فیگما ۲۹): کدام تفویض امروز برقرار است، جانشین تا کدام سطح به جای مالک تصمیم می‌گیرد و
اعلان‌های پایش مالک به کدام جانشین هم می‌رسد."""

from django.utils import timezone

from apps.methodology.models import RiskLevel

from .models import Delegation


def delegable(level):
    """پذیرش سطحی که با کمیته‌ی امنیت است (بالا و بحرانی) تفویض نمی‌شود."""
    return level.co_approver != RiskLevel.CoApprover.SECURITY_COMMITTEE


def current(user, today=None):
    """تفویض برقرار امروز کاربر، اگر هست."""
    if user is None:
        return None
    today = today or timezone.localdate()
    return (
        Delegation.objects.filter(user=user, cancelled_at=None, starts_on__lte=today, ends_on__gte=today)
        .select_related("successor")
        .first()
    )


def upcoming(user, today=None):
    """تفویض برقرار یا آینده‌ی کاربر برای نمایش در پروفایل."""
    today = today or timezone.localdate()
    return (
        Delegation.objects.filter(user=user, cancelled_at=None, ends_on__gte=today)
        .select_related("successor", "created_by")
        .order_by("starts_on", "pk")
        .first()
    )


def acts_for(user, owner, level, today=None):
    """جانشین امروز به جای مالک تصمیم این سطح را ثبت می‌کند؟"""
    found = current(owner, today)
    return bool(
        found
        and found.successor_id == user.pk
        and found.successor.is_active
        and delegable(level)
        and level.rank <= found.max_rank
    )


def forwarded(recipients, today=None):
    """جانشین‌هایی که اعلان‌های پایش گیرندگان را هم می‌گیرند."""
    extra = []
    for person in recipients:
        found = current(person, today) if person is not None else None
        if found and found.notify_successor and found.successor.is_active:
            extra.append(found.successor)
    return extra
