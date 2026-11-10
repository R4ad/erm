from .models import Assessment
from .permissions import can_record_assessments, visible_assessments
from .services import creation_problems


def risk_assessments(risk, user):
    """بخش ارزیابی‌های صفحه‌ی ریسک. سطح فعلی ریسک سطح تصمیم آخرین ارزیابی جاری تأییدشده است."""
    assessments = (
        visible_assessments(user).filter(risk=risk).select_related("method_version", "created_by", "decision_level")
    )
    current = (
        assessments.filter(kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED)
        .order_by("-approved_at", "-pk")
        .first()
    )
    return {
        "assessments": assessments,
        "current_assessment": current,
        "can_add_assessment": can_record_assessments(user) and not creation_problems(risk),
    }
