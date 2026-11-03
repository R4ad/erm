from django.utils import timezone

from apps.methodology.models import MethodVersion, RiskLevel


def make_version(number, status=MethodVersion.Status.DRAFT, **fields):
    """نسخه‌ی آزمایشی خالی. نسخه‌ی فعال یا بایگانی زمان فعال شدن می‌خواهد و تصویب‌شده شماره و تاریخ نامه."""
    if status in (MethodVersion.Status.ACTIVE, MethodVersion.Status.ARCHIVED):
        fields.setdefault("activated_at", timezone.now())
    if status == MethodVersion.Status.APPROVED:
        fields.setdefault("approval_ref", "۱۲۳/۴۵")
        fields.setdefault("approved_on", timezone.localdate())
    return MethodVersion.objects.create(number=number, title=f"نسخه‌ی آزمایشی {number}", status=status, **fields)


def make_level(version, rank, min_score, max_score, **fields):
    """سطح ریسک آزمایشی با مهلت‌های ساده."""
    values = {
        "name": f"سطح {rank}",
        "color": "#198754",
        "decision_rule": "مالک ریسک",
        "co_approver": RiskLevel.CoApprover.NONE,
        "plan_value": 30,
        "plan_unit": "day",
        "acceptance_value": 6,
        "acceptance_unit": "month",
        "review_value": 3,
        "review_unit": "month",
        **fields,
    }
    return RiskLevel.objects.create(version=version, rank=rank, min_score=min_score, max_score=max_score, **values)
