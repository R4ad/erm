from .permissions import can_record_assessments, visible_assessments
from .services import creation_problems


def risk_assessments(risk, user):
    """بخش ارزیابی‌های صفحه‌ی ریسک."""
    return {
        "assessments": visible_assessments(user).filter(risk=risk).select_related("method_version", "created_by"),
        "can_add_assessment": can_record_assessments(user) and not creation_problems(risk),
    }
