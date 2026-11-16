"""«ریسک‌های نیازمند اقدام» در رابط React (فیگما ۱۴): ریسک‌های بالا و بحرانی «برنامه‌ی درمان» که طرح مواجهه‌ی مصوب
ندارند، اقدام‌هایی که آزمونشان ناموفق شده، و پذیرش‌هایی که تا ۳۰ روز دیگر تمام می‌شوند یا تمام شده‌اند. هر سطر
مهلت و وضعیتش را دارد و اقدام بعدی: ایجاد طرح، بازگشایی اقدام، بازبینی پذیرش یا تصعید به کمیته امنیت."""

import datetime
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from rest_framework.response import Response

from apps.accounts.roles import Role
from apps.actions.models import ActionUpdate, Reassessment, RiskAcceptance, TreatmentAction, TreatmentPlan
from apps.actions.monitoring import escalation_users, notify
from apps.actions.permissions import can_edit_plans
from apps.actions.services import (
    containment_due,
    current_plan,
    decision_due,
    last_reassessment,
    pending_reassessment,
    plan_creation_problems,
    plan_required,
)
from apps.assessments.services import decision_assessment
from apps.methodology.models import PeriodUnit
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks
from apps.workcalendar.workdays import add_working_days, working_days_between

from . import formatting as fmt
from .base import ApiView

OPTION = TreatmentPlan.Option
KIND_ORDER = {"plan": 0, "failed": 1, "acceptance": 2}
SOON = 30  # پذیرش‌هایی که تا ۳۰ روز دیگر تمام می‌شوند (یادآوری اول بخش ۱۹)


def fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def end_of(day):
    """پایان روز مهلت: مهلت تاریخی تا آخر همان روز باز است."""
    return timezone.make_aware(datetime.datetime.combine(day, datetime.time.max))


def span(delta):
    """فاصله‌ی زمانی کوتاه: «۶ ساعت»، «۱ روز و ۴ ساعت»."""
    hours = max(int(delta.total_seconds() // 3600), 0)
    days, hours = divmod(hours, 24)
    if not days:
        return f"{fa(max(hours, 1))} ساعت"
    return f"{fa(days)} روز و {fa(hours)} ساعت" if hours else f"{fa(days)} روز"


def scope_of(risk):
    customers = [customer.name for customer in risk.customers.all()]
    if len(customers) > 2:
        return f"{fa(len(customers))} مشتری"
    if customers:
        return " و ".join(customers)
    return risk.service.name if risk.service_id else "داخلی"


def risk_info(risk, note=None):
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "href": risk.get_absolute_url(),
        "note": f"{risk.category.code} · {note or scope_of(risk)}",
    }


def option(value, suggested=False):
    return {"value": value, "label": OPTION(value).label, "suggested": suggested}


def suggested_option(risk, base):
    """گزینه‌ی پیشنهادی ریسکی که هنوز طرح ندارد: منع الزام‌آور یعنی اجتناب، تصمیم بازسنجی «پذیرش» یعنی پذیرش، و
    بقیه کاهش؛ برای بالا و بحرانی پذیرش فقط موقت است (بخش ۱۹)."""
    if base.binding_prohibition:
        return OPTION.AVOID
    previous = last_reassessment(risk)
    if previous and previous.decision == Reassessment.Decision.ACCEPT:
        return OPTION.ACCEPT
    return OPTION.REDUCE


def plan_row(risk, base, user, now):
    level = base.decision_level
    plan = current_plan(risk)
    containment = containment_due(risk, level) if plan is None else None
    due = plan.decision_due if plan else decision_due(risk, level)
    remaining = end_of(due) - now
    if base.binding_prohibition:
        reason = "خارج از اختیار پذیرش · منع الزام‌آور"
    elif pending_reassessment(risk) is not None:
        reason = "منتظر بازسنجی طرح قبلی"
    elif plan is not None:
        reason = "طرح منتظر تأیید مالک"
    elif base.base_level_id and base.base_level_id != base.decision_level_id:
        reason = "بدون طرح · ارتقا با قاعده‌ی تقدم"
    else:
        reason = "بدون طرح مواجهه"
    status = {"label": "منتظر تأیید مالک", "tone": "warning"} if plan else {"label": "در تصمیم", "tone": "info"}
    overdue = False
    if containment is not None and containment <= now:
        overdue = True
        deadline = {"text": f"{span(now - containment)} از مهلت گذشته", "tone": "danger"}
        if reason == "بدون طرح مواجهه":
            reason = "بدون طرح · مهلت مهار گذشته"
    elif remaining.total_seconds() < 0:
        overdue = True
        deadline = {"text": f"{span(-remaining)} از مهلت گذشته", "tone": "danger"}
    elif containment is not None:
        deadline = {"text": f"{span(containment - now)} تا مهار", "tone": "danger"}
    elif level.plan_unit == PeriodUnit.WORKING_DAY:
        days = working_days_between(timezone.localdate(now), due)
        deadline = {"text": f"{fa(days)} روز کاری", "tone": "warning" if days <= 2 else "info"}
    else:
        deadline = {"text": span(remaining), "tone": "info"}
    if overdue:
        status = {"label": "عبور از مهلت", "tone": "danger"}
    soon = containment if containment is not None and containment > now else end_of(due)
    if overdue:
        action = {"kind": "escalate", "label": "تصعید", "href": None}
    elif plan is None and can_edit_plans(user) and not plan_creation_problems(risk):
        action = {"kind": "create", "label": "ایجاد طرح", "href": reverse("actions:plan_create", args=[risk.pk])}
    elif plan is not None:
        action = {"kind": "open", "label": "مشاهده‌ی طرح", "href": plan.get_absolute_url()}
    else:
        action = {"kind": "open", "label": "مشاهده", "href": risk.get_absolute_url()}
    return {
        "key": f"plan-{risk.pk}",
        "kind": "plan",
        "risk": risk_info(risk),
        "level": fmt.level(level),
        "score": base.score_high,
        "owner": fmt.person(risk.owner),
        "option": option(plan.option) if plan else option(suggested_option(risk, base), suggested=True),
        "reason": reason,
        "deadline": {**deadline, "due": fmt.day(due)},
        "status": status,
        "action": action,
        "overdue": overdue,
        "within_48h": not overdue and soon - now <= timedelta(hours=48),
        "containment_overdue": containment is not None and containment <= now,
        "_sort": (not overdue, -level.rank, KIND_ORDER["plan"], remaining.total_seconds()),
    }


def failed_row(action, user, today):
    plan, risk = action.plan, action.plan.risk
    failed = (
        ActionUpdate.objects.filter(action=action, to_status=TreatmentAction.Status.FAILED)
        .order_by("-created_at")
        .values_list("created_at", flat=True)
        .first()
    ) or action.updated_at
    # شکست اقدام اعتبار کاهش را معلق می‌کند و بازسنجی ≤ ۱ روز کاری است (قواعد کسب‌وکار فیگما ۱۴).
    due = add_working_days(timezone.localdate(failed), 1)
    overdue = due < today
    if overdue:
        deadline = {"text": f"بازسنجی {fa((today - due).days)} روز گذشته", "tone": "danger"}
    else:
        deadline = {"text": f"بازسنجی {fa(max(working_days_between(today, due), 1))} روز کاری", "tone": "warning"}
    assessment = plan.assessment
    return {
        "key": f"action-{action.pk}",
        "kind": "failed",
        "risk": risk_info(risk, "بازسنجی پس از اقدام"),
        "level": fmt.level(assessment.decision_level),
        "score": assessment.score_high,
        "owner": fmt.person(risk.owner),
        "option": option(plan.option),
        "reason": f"آزمون اقدام ناموفق · {action.title}",
        "deadline": {**deadline, "due": fmt.day(due)},
        "status": {"label": "ناموفق", "tone": "danger"},
        "action": {"kind": "open", "label": "بازگشایی", "href": action.get_absolute_url()},
        "overdue": overdue,
        "within_48h": not overdue and (due - today).days <= 2,
        "containment_overdue": False,
        "_sort": (not overdue, -assessment.decision_level.rank, KIND_ORDER["failed"], (due - today).days * 86400),
    }


def acceptance_row(acceptance, today):
    risk, assessment = acceptance.risk, acceptance.assessment
    days = (acceptance.end_date - today).days
    expired = acceptance.status == RiskAcceptance.Status.EXPIRED or days < 0
    months = round((acceptance.end_date - acceptance.start_date).days / 30)
    length = f"{fa(months)} ماهه" if months else f"{fa((acceptance.end_date - acceptance.start_date).days)} روزه"
    if days >= 0:
        deadline = {"text": f"{fa(days)} روز تا انقضا", "tone": "danger" if days <= 7 else "warning"}
    else:
        deadline = {"text": f"{fa(-days)} روز پس از انقضا", "tone": "danger"}
    return {
        "key": f"acceptance-{acceptance.pk}",
        "kind": "acceptance",
        "risk": risk_info(risk, f"پذیرش {acceptance.code}"),
        "level": fmt.level(assessment.decision_level),
        "score": assessment.score_high,
        "owner": fmt.person(risk.owner),
        "option": option(OPTION.ACCEPT),
        "reason": f"انقضای پذیرش {length}",
        "deadline": {**deadline, "due": fmt.day(acceptance.end_date)},
        "status": {"label": "منقضی", "tone": "danger"} if expired else {"label": "پذیرفته‌شده", "tone": "success"},
        "action": {"kind": "open", "label": "بازبینی", "href": acceptance.get_absolute_url()},
        "overdue": expired,
        "within_48h": not expired and days <= 2,
        "containment_overdue": False,
        "_sort": (not expired, -assessment.decision_level.rank, KIND_ORDER["acceptance"], days * 86400),
    }


def required_rows(user):
    visible = visible_risks(user).filter(merged_into__isnull=True)
    now, today = timezone.now(), timezone.localdate()
    rows = []
    waiting = (
        visible.filter(status=Risk.Status.TREATMENT_PLAN)
        .select_related("owner", "category", "service")
        .prefetch_related("customers")
    )
    for risk in waiting:
        base = decision_assessment(risk)
        if base is None or not plan_required(base.decision_level):
            continue
        plan = current_plan(risk)
        if plan is not None and plan.is_owner_approved:
            continue
        rows.append(plan_row(risk, base, user, now))
    failed = TreatmentAction.objects.filter(
        status=TreatmentAction.Status.FAILED, plan__risk__in=visible
    ).select_related("plan__assessment__decision_level", "plan__risk__owner", "plan__risk__category")
    rows += [failed_row(action, user, today) for action in failed]
    acceptances = RiskAcceptance.objects.filter(
        status__in=[RiskAcceptance.Status.ACTIVE, RiskAcceptance.Status.EXPIRED],
        end_date__lte=today + timedelta(days=SOON),
        risk__in=visible,
    ).select_related("risk__owner", "risk__category", "assessment__decision_level")
    rows += [acceptance_row(acceptance, today) for acceptance in acceptances]
    rows.sort(key=lambda row: row.pop("_sort"))
    return rows


def committee_users(risk):
    """اعضای کمیته امنیت در کنار متولی روش و مرجع مجاز سطح ریسک."""
    committee = (
        get_user_model()
        .objects.filter(is_active=True)
        .filter(Q(groups__name=Role.SECURITY_COMMITTEE) | Q(is_superuser=True))
    )
    return [*escalation_users(risk), *committee]


class ActionRequiredView(ApiView):
    def get(self, request):
        rows = required_rows(request.user)
        owners = {row["owner"]["id"]: row["owner"] for row in rows if row["owner"]}
        critical = [row for row in rows if row["containment_overdue"]]
        return Response(
            {
                "rows": rows,
                "counts": {
                    "no_plan": sum(1 for row in rows if row["kind"] == "plan"),
                    "overdue": sum(1 for row in rows if row["overdue"]),
                    "within_48h": sum(1 for row in rows if row["within_48h"]),
                    "failed": sum(1 for row in rows if row["kind"] == "failed"),
                    "acceptance": sum(1 for row in rows if row["kind"] == "acceptance"),
                },
                "owners": sorted(owners.values(), key=lambda owner: owner["name"]),
                "containment_overdue": [
                    {key: row["risk"][key] for key in ("id", "code", "title", "href")} for row in critical
                ],
                "can_escalate": can_edit_plans(request.user),
            }
        )


class EscalateView(ApiView):
    """«تصعید به کمیته امنیت»: اعلان پایش برای کمیته، متولی روش و مرجع مجاز سطح ریسک‌هایی که از مهلت گذشته‌اند. کلید
    اعلان روزانه است، پس تصعید دوباره در همان روز اعلان تکراری نمی‌سازد."""

    def post(self, request):
        ids = {int(pk) for pk in request.data.get("ids", []) if str(pk).isdigit()}
        rows = [row for row in required_rows(request.user) if row["risk"]["id"] in ids and row["overdue"]]
        risks = {risk.pk: risk for risk in Risk.objects.filter(pk__in=[row["risk"]["id"] for row in rows])}
        done, notified = [], 0
        for row in rows:
            risk = risks[row["risk"]["id"]]
            if not (can_edit_plans(request.user) or risk.owner_id == request.user.pk):
                continue
            message = f"تصعید {risk.code}: {row['reason']} · {row['deadline']['text']}؛ تصمیم کمیته امنیت لازم است."
            notified += notify(
                risk,
                f"escalate:{row['key']}:{timezone.localdate().isoformat()}",
                message,
                risk.get_absolute_url(),
                [risk.owner, *committee_users(risk)],
            )
            done.append(risk.code)
        if not done:
            return Response({"message": "ریسکی برای تصعید نبود یا اجازه‌ی تصعیدش را ندارید."}, status=400)
        return Response(
            {"message": f"{fa(len(done))} ریسک به کمیته امنیت تصعید شد.", "done": done, "notified": notified}
        )
