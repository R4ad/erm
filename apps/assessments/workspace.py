"""صف انتخاب ریسک و آغاز قابل تکرار ارزیابی کارگروه."""

from django.core.exceptions import PermissionDenied
from django.db import transaction

from apps.risks.models import Risk
from apps.workflow.models import StatusTransition

from .models import Assessment
from .permissions import can_start_submitted_assessment
from .services import AssessmentError, create_assessment, default_horizon


@transaction.atomic
def start_submitted_assessment(risk, user):
    if not can_start_submitted_assessment(user):
        raise PermissionDenied
    risk = Risk.objects.select_for_update().get(pk=risk.pk)
    if risk.status == Risk.Status.ASSESSMENT:
        existing = risk.assessments.filter(
            kind=Assessment.Kind.CURRENT, status=Assessment.Status.DRAFT
        ).first()
        if existing:
            return existing
    if risk.status != Risk.Status.SUBMITTED:
        raise AssessmentError(["این ریسک در صف ریسک‌های نیازمند ارزیابی نیست."])
    horizon = default_horizon()
    if not horizon:
        raise AssessmentError(["نسخه فعال روش یا افق پیش‌فرض ارزیابی در دسترس نیست."])
    previous = risk.status
    risk.status = Risk.Status.ASSESSMENT
    risk._history_user = user
    risk.save()
    StatusTransition.objects.create(
        risk=risk,
        from_status=previous,
        to_status=risk.status,
        created_by=user,
        reason="آغاز ارزیابی توسط کارگروه",
    )
    return create_assessment(
        risk, user, Assessment.Kind.CURRENT, horizon_months=horizon
    )
