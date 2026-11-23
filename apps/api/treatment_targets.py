"""«لیست ریسک‌های هدف» در رابط React (فیگما ۱۶): برای هر طرح مواجهه‌ی جاری، امتیاز جاری و هدف، پروفایل پیامد، سازوکار
تغییر (A، B یا L، و I)، معیار پذیرش اقدام‌ها، موعد و وضعیت هدف. هدف تا تأیید شاهد واقعی «محقق‌نشده» است."""

from django.db.models import Max
from django.urls import reverse
from rest_framework.response import Response

from apps.actions.models import TreatmentAction, TreatmentPlan
from apps.actions.services import current_plan, pending_reassessment
from apps.assessments.models import ImpactDetail
from apps.assessments.permissions import ASSESSMENT_EDIT_ROLES
from apps.assessments.services import creation_problems
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks
from apps.workflow.lifecycle import can_perform, get_transition

from . import formatting as fmt
from .base import ApiView
from .treatment import fa, scope_of

ST = TreatmentAction.Status
STATUSES = [Risk.Status.TREATMENT_PLAN, Risk.Status.TREATMENT, Risk.Status.REVIEW]
DIMENSIONS = ["S", "D", "F", "C", "R"]
APPETITE_RANK = 2  # جهت‌گیری داتین (فیگما ۱۳): پذیرش پایین و مدیریت فعال متوسط؛ بالا و بحرانی کاهش یا اجتناب


def profile(assessment):
    """بیشینه‌ی سطح هر بُعد پیامد، مثل «S4 D0 F3 C3 R2»؛ بی‌جزئیات پیامد None."""
    if assessment is None:
        return None
    levels = dict(
        ImpactDetail.objects.filter(assessment=assessment)
        .values("scale__code")
        .annotate(level=Max("level"))
        .values_list("scale__code", "level")
    )
    if not levels:
        return None
    return " ".join(f"{code}{levels.get(code) or 0}" for code in DIMENSIONS)


def b_value(assessment):
    if assessment is None:
        return None
    if assessment.b_high:
        return assessment.b_high
    b = (assessment.result_detail or {}).get("b")
    return b[-1] if b else None


def mechanisms(current, target):
    """سازوکار تغییر، مثل «B ۵→۱» و «I ۵→۴»؛ بی‌نتیجه‌ی B از L استفاده می‌شود."""
    chips = []
    if current.a and target.a and current.a != target.a:
        chips.append(f"A {fa(current.a)}→{fa(target.a)}")
    b_now, b_target = b_value(current), b_value(target)
    if b_now and b_target and b_now != b_target:
        chips.append(f"B {fa(b_now)}→{fa(b_target)}")
    elif not (b_now and b_target) and current.likelihood_high != target.likelihood_high:
        chips.append(f"L {fa(current.likelihood_high)}→{fa(target.likelihood_high)}")
    if current.impact_high and target.impact_high and current.impact_high != target.impact_high:
        chips.append(f"I {fa(current.impact_high)}→{fa(target.impact_high)}")
    return chips


def status_of(plan, actions, target):
    if plan.option == TreatmentPlan.Option.AVOID:
        return {"value": "proof", "label": "در انتظار اثبات", "tone": "neutral"}
    if target and target.decision_level and target.decision_level.rank > APPETITE_RANK:
        return {"value": "above", "label": "بالاتر از اشتها", "tone": "warning"}
    if actions and all(action.status == ST.VERIFIED for action in actions):
        return {"value": "verified", "label": "اقدام‌ها تأیید شد", "tone": "success"}
    if any(action.status == ST.READY for action in actions):
        return {"value": "ready", "label": "آماده‌ی آزمون", "tone": "info"}
    if any(action.status == ST.FAILED or action.is_overdue for action in actions):
        return {"value": "late", "label": "عقب از برنامه", "tone": "danger"}
    return {"value": "on_track", "label": "در مسیر", "tone": "info"}


def post_action_step(user, risk):
    """گام بعدی ثبت ارزیابی پس از اقدام: اگر ارزیابی تازه ثبت‌شدنی است فرم آن، وگرنه انتقال گردش کار ریسک
    (درمان → بازبینی → ارزیابی دوباره) در صفحه‌ی ریسک. کاربری که هیچ‌کدام را نمی‌تواند، گامی نمی‌بیند."""
    if not creation_problems(risk):
        if user.is_system_admin or user.has_role(*ASSESSMENT_EDIT_ROLES):
            return "ارزیابی جاری تازه", reverse("assessments:assessment_create", args=[risk.pk])
        return None
    name = {Risk.Status.TREATMENT: "start_review", Risk.Status.REVIEW: "reassess"}.get(risk.status)
    transition = get_transition(name) if name else None
    if transition and can_perform(user, transition):
        return f"{transition.label}، سپس ارزیابی جاری تازه", risk.get_absolute_url()
    return None


def target_row(risk, plan):
    current, target = plan.assessment, plan.target_assessment
    actions = list(plan.actions.order_by("due_date", "code"))
    lead = next((action for action in actions if action.is_open), actions[-1] if actions else None)
    retire = plan.option == TreatmentPlan.Option.AVOID
    criteria = "؛ ".join(dict.fromkeys(action.acceptance_criteria for action in actions if action.acceptance_criteria))
    return {
        "id": plan.pk,
        "risk": {
            "id": risk.pk,
            "code": risk.code,
            "title": risk.title,
            "href": risk.get_absolute_url(),
            "category": fmt.category_code(risk),
            "scope": scope_of(risk),
        },
        "current": {
            "score": current.score_high,
            "level": fmt.level(current.decision_level),
            "profile": profile(current),
        },
        "target": None
        if retire or target is None
        else {"score": target.score_high, "level": fmt.level(target.decision_level), "profile": profile(target)},
        "retire": retire,
        "mechanisms": ["حذف مسیر"] if retire else (mechanisms(current, target) if target else []),
        "criteria": criteria[:160],
        "plan": {
            "href": plan.get_absolute_url(),
            "action": lead.code if lead else None,
            "due": fmt.day(lead.due_date) if lead else None,
        },
        "status": status_of(plan, actions, target)
        if (target or retire)
        else {"value": "missing", "label": "بی‌هدف", "tone": "danger"},
    }


class TargetRisksView(ApiView):
    def get(self, request):
        risks = (
            visible_risks(request.user)
            .filter(status__in=STATUSES, merged_into__isnull=True)
            .select_related("category", "service")
            .prefetch_related("customers")
        )
        rows, reassess = [], []
        for risk in risks:
            plan = current_plan(risk)
            if plan is not None:
                plan = TreatmentPlan.objects.select_related(
                    "assessment__decision_level", "target_assessment__decision_level"
                ).get(pk=plan.pk)
                row = target_row(risk, plan)
                rows.append(row)
                # پس از تأیید خروجی همه‌ی اقدام‌ها، ارزیابی جاری تازه با شواهد واقعی ثبت می‌شود
                step = post_action_step(request.user, risk) if row["status"]["value"] == "verified" else None
                if step:
                    reassess.append({"code": risk.code, "title": risk.title, "step": step[0], "href": step[1]})
            pending = pending_reassessment(risk)
            if pending is not None:
                reassess.append(
                    {
                        "code": risk.code,
                        "title": risk.title,
                        "step": "بازسنجی طرح",
                        "href": reverse("actions:reassessment_create", args=[pending.pk]),
                    }
                )
        rows.sort(key=lambda row: (-row["current"]["score"], row["risk"]["code"]))
        with_target = [row for row in rows if row["target"] or row["retire"]]
        return Response(
            {
                "rows": rows,
                "counts": {
                    "with_target": len(with_target),
                    "within": sum(1 for row in with_target if row["status"]["value"] not in ("above", "proof")),
                    "above": sum(1 for row in with_target if row["status"]["value"] == "above"),
                    "retire": sum(1 for row in rows if row["retire"]),
                },
                "reassess": reassess,
            }
        )
