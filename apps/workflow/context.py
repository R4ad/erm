from apps.risks.permissions import visible_risks

from .models import ChangeRequest
from .permissions import available_transitions, can_propose_change
from .services import can_decide


def risk_workflow(risk, user):
    """بخش «گردش کار» صفحه‌ی ریسک: انتقال‌های مجاز این کاربر، پرسش‌ها، درخواست باز ادغام یا تفکیک، پیوندهای
    ادغام و تفکیک و خط زمانی انتقال‌ها."""
    pending = risk.change_requests.filter(status=ChangeRequest.Status.PENDING).select_related("merge_into").first()
    visible = visible_risks(user)
    return {
        "transitions": available_transitions(user, risk),
        "timeline": risk.transitions.select_related("created_by"),
        "risk_questions": risk.questions.select_related("asked_by", "answered_by"),
        "pending_change": pending,
        "can_decide_change": bool(pending and can_decide(user, pending)),
        "can_propose_change": bool(can_propose_change(user) and risk.is_active and risk.owner_id and not pending),
        "merged_risks": visible.filter(merged_into=risk),
        "split_parts": visible.filter(split_from=risk),
        "merged_into_visible": bool(risk.merged_into_id and visible.filter(pk=risk.merged_into_id).exists()),
        "split_from_visible": bool(risk.split_from_id and visible.filter(pk=risk.split_from_id).exists()),
    }
