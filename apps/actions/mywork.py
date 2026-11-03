"""صفحه‌ی «کارهای من»: فهرست شخصی هر کاربر از کارهایی که منتظر خود اوست."""

from dataclasses import dataclass
from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.assessments.models import Assessment
from apps.assessments.review import can_decide_referral, can_review
from apps.assessments.services import decision_assessment
from apps.risks.models import Risk
from apps.workflow.models import ChangeRequest, RiskQuestion

from .acceptance import acceptances_to_sign
from .models import RiskAcceptance, TreatmentAction, TreatmentPlan
from .permissions import EXECUTION_STATUSES, can_edit_plans
from .services import current_plan, decision_due

ST = TreatmentAction.Status


@dataclass
class WaitingRisk:
    """ریسکی که در «برنامه‌ی درمان» منتظر طرح، تأیید مالک یا شروع اجراست."""

    risk: Risk
    assessment: Assessment
    plan: TreatmentPlan | None
    due: object
    state: str

    @property
    def level(self):
        return self.assessment.decision_level

    @property
    def sort_key(self):
        # به ترتیب اولویت و سطح ریسک: اول سطح تصمیم بالاتر، بعد امتیاز بیشتر، بعد مهلت نزدیک‌تر (مرحله‌ی ۴ گردش کار).
        return (-self.level.rank, -(self.assessment.score_high or 0), self.due)


def waiting_risks():
    rows = []
    risks = Risk.objects.filter(status=Risk.Status.TREATMENT_PLAN).select_related("owner")
    for risk in risks:
        base = decision_assessment(risk)
        if base is None:
            continue
        plan = current_plan(risk)
        if plan is None:
            state, due = "بدون طرح", decision_due(risk, base.decision_level)
        elif not plan.is_owner_approved or plan.actions.filter(status=ST.PLANNED).exists():
            state, due = "منتظر تأیید مالک", plan.decision_due
        else:
            state, due = "آماده‌ی شروع اجرا", plan.decision_due
        rows.append(WaitingRisk(risk, base, plan, due, state))
    return sorted(rows, key=lambda row: row.sort_key)


def expiring_acceptances(user):
    """پذیرش‌های معتبری که تا ۳۰ روز دیگر تمام می‌شوند یا تمام شده‌اند: برای مسئول پیگیری، و برای عضو GRC همه.
    یادآوری و تصعید خودکار با قدم ۲۳ می‌آید."""
    soon = timezone.localdate() + timedelta(days=30)
    acceptances = RiskAcceptance.objects.filter(status=RiskAcceptance.Status.ACTIVE, end_date__lte=soon)
    if not can_edit_plans(user):
        acceptances = acceptances.filter(follow_up_by=user)
    return acceptances.select_related("risk", "assessment__decision_level", "follow_up_by").order_by("end_date")


def my_work(user):
    """هر بخش فقط وقتی پر است که چیزی منتظر همین کاربر باشد."""
    people = Q(owner=user) | Q(assignee=user)
    plans = TreatmentPlan.objects.filter(
        risk__owner=user, risk__status__in=[Risk.Status.TREATMENT_PLAN, *EXECUTION_STATUSES]
    ).filter(Q(owner_approved_at__isnull=True) | Q(actions__status=ST.PLANNED))
    work = {
        "my_actions": TreatmentAction.objects.filter(people)
        .exclude(status=ST.VERIFIED)
        .select_related("plan__risk", "owner", "assignee"),
        "to_verify": TreatmentAction.objects.filter(
            verifier=user, status=ST.READY, plan__risk__status__in=EXECUTION_STATUSES
        ).select_related("plan__risk", "assignee"),
        "plans_to_approve": TreatmentPlan.objects.filter(pk__in=plans.values("pk")).select_related(
            "risk", "assessment__decision_level"
        ),
        "change_requests": ChangeRequest.objects.filter(
            status=ChangeRequest.Status.PENDING, risk__owner=user
        ).select_related("risk"),
        # پرسش‌های ریسک واحدهایی که کاربر مدیرشان است؛ عضو GRC فقط به نام مدیر جواب ثبت می‌کند و این کار او نیست.
        "questions": RiskQuestion.objects.filter(
            answered_at__isnull=True, risk__status=Risk.Status.QUESTIONS, risk__org_unit__in=user.managed_unit_ids()
        ).select_related("risk"),
        "waiting_risks": waiting_risks() if can_edit_plans(user) else [],
        "acceptances_to_sign": acceptances_to_sign(user),
        "expiring_acceptances": expiring_acceptances(user),
        "qc": [
            item
            for item in Assessment.objects.filter(status=Assessment.Status.IN_QC).select_related("risk")
            if can_review(user, item)
        ],
        "referrals": [
            item
            for item in Assessment.objects.filter(status=Assessment.Status.REFERRED).select_related("risk")
            if can_decide_referral(user, item)
        ],
    }
    work["has_work"] = any(bool(value) for value in work.values())
    return work
