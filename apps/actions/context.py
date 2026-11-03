from django.utils import timezone

from apps.assessments.services import decision_assessment
from apps.risks.models import Risk

from .acceptance import creation_problems as acceptance_creation_problems
from .permissions import can_edit_plans
from .services import containment_due, current_plan, decision_due, plan_creation_problems


def risk_treatment(risk, user):
    """بخش طرح مواجهه‌ی صفحه‌ی ریسک. طرح را هر کس که ریسک را می‌بیند می‌بیند."""
    plan = current_plan(risk)
    context = {
        "treatment_plans": risk.treatment_plans.select_related("assessment__decision_level").prefetch_related(
            "actions"
        ),
        "current_plan": plan,
        "can_add_plan": can_edit_plans(user) and not plan_creation_problems(risk),
        "plan_due": None,
        "containment_due": None,
        "acceptances": risk.acceptances.select_related("assessment__decision_level", "follow_up_by"),
        "can_add_acceptance": can_edit_plans(user) and not acceptance_creation_problems(risk),
    }
    base = decision_assessment(risk)
    context["out_of_authority"] = bool(base and base.binding_prohibition)
    if risk.status == Risk.Status.TREATMENT_PLAN and base and plan is None:
        level = base.decision_level
        context["plan_level"] = level
        context["plan_due"] = decision_due(risk, level)
        context["plan_due_passed"] = context["plan_due"] < timezone.localdate()
        context["containment_due"] = containment_due(risk, level)
    return context
