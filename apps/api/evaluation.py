"""«سنجش ریسک» در رابط React (فیگما ۱۳): صف ریسک‌های ارزیابی‌شده با سطح پایه و سطح تصمیم، علت ارتقا، مرجع مجاز و
مهلت طرح؛ ماتریس تصمیم L × I نسخه‌ی روش با شمار ریسک‌های هر خانه؛ قواعد تقدم؛ و جدول اشتهای ریسک از سطح‌های همان
نسخه. «ارسال به تصمیم» همان انتقال «تأیید و طراحی برنامه‌ی درمان» گردش کار است."""

from django.utils import timezone
from rest_framework.response import Response

from apps.actions.services import containment_due, current_plan, decision_due
from apps.assessments.services import decision_assessment
from apps.catalog.models import Customer
from apps.core.choices import Confidence
from apps.methodology.models import PeriodUnit, RiskLevel
from apps.methodology.services import MethodTables, active_version
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks
from apps.workcalendar.workdays import working_days_between
from apps.workflow.lifecycle import blocking_problems, can_perform, get_transition

from . import formatting as fmt
from .base import ApiView

S = Risk.Status
QUEUE = [S.ASSESSMENT, S.TREATMENT_PLAN, S.TREATMENT, S.REVIEW]
UNCERTAINTY = {Confidence.LOW: 0, Confidence.MEDIUM: 1, Confidence.HIGH: 2, "": 0}
CO = RiskLevel.CoApprover


def fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def period(value, unit):
    if not value:
        return ""
    return f"{fa(value)} {PeriodUnit(unit).label}"


def authority(level, assessment):
    if level.containment_value:
        text = "کمیته امنیت · ارجاع فوری"
    elif level.co_approver == CO.SECURITY_COMMITTEE:
        text = "مالک + کمیته امنیت"
    elif level.co_approver == CO.UPPER_MANAGER:
        text = "مالک + مدیر بالادست"
    else:
        text = "مالک ریسک"
    if assessment.binding_prohibition:
        text = "کمیته امنیت + حقوقی"
    return text


def level_note(level):
    """توضیح کوتاه کاشی هر سطح: مرجع و مهلت، مثل «ارجاع فوری به کمیته · مهار ≤ ۲۴ ساعت»."""
    if level.containment_value:
        who = "ارجاع فوری به کمیته"
        when = f"مهار ≤ {period(level.containment_value, level.containment_unit)}"
    elif level.co_approver == CO.SECURITY_COMMITTEE:
        who, when = "طرح مواجهه‌ی الزامی", period(level.plan_value, level.plan_unit)
    elif level.co_approver == CO.UPPER_MANAGER:
        who, when = "مالک و مدیر بالادست", period(level.plan_value, level.plan_unit)
    else:
        who, when = "پذیرش مستند با پایش", "مالک"
    return f"{who} · {when}"


REVIEW_NAMES = {
    (1, PeriodUnit.WEEK): "هفتگی",
    (1, PeriodUnit.MONTH): "ماهانه",
    (3, PeriodUnit.MONTH): "سه‌ماهه",
    (6, PeriodUnit.MONTH): "شش‌ماهه",
    (12, PeriodUnit.MONTH): "سالانه",
}


def review_text(level):
    return REVIEW_NAMES.get((level.review_value, level.review_unit)) or period(level.review_value, level.review_unit)


def plan_text(level):
    plan = period(level.plan_value, level.plan_unit)
    if level.containment_value:
        return f"مهار حداکثر {period(level.containment_value, level.containment_unit)}؛ طرح طی {plan}"
    if level.co_approver == CO.NONE:
        return f"ثبت تصمیم طی {plan}"
    return plan


def deadline(risk, level):
    """مهلت طرح یا مهار برای ریسکی که «برنامه‌ی درمان» شده و هنوز طرح ندارد؛ بقیه فقط وضعیتشان را می‌گویند."""
    if risk.status == S.ASSESSMENT:
        # مهلت از «ارسال به تصمیم» شمرده می‌شود؛ تا آن وقت فقط اندازه‌اش را نشان می‌دهیم.
        if level.containment_value:
            text = f"مهار ≤ {period(level.containment_value, level.containment_unit)}"
        else:
            text = period(level.plan_value, level.plan_unit)
            if level.co_approver == CO.NONE:
                text = f"ثبت تصمیم {text}"
        return {"kind": "awaiting", "text": text, "due": None, "overdue": False}
    if risk.status in (S.TREATMENT, S.REVIEW):
        return {"kind": "done", "text": risk.get_status_display(), "due": None, "overdue": False}
    if current_plan(risk) is not None:
        return {"kind": "done", "text": "طرح ثبت شده است", "due": None, "overdue": False}
    now = timezone.now()
    containment = containment_due(risk, level)
    if containment is not None and hasattr(containment, "hour") and containment > now:
        hours = max(int((containment - now).total_seconds() // 3600), 1)
        return {
            "kind": "containment",
            "text": f"{fa(hours)} ساعت تا مهار",
            "due": fmt.moment(containment),
            "overdue": False,
        }
    due = decision_due(risk, level)
    today = timezone.localdate()
    if due < today:
        return {"kind": "plan", "text": f"{fa((today - due).days)} روز تأخیر", "due": fmt.day(due), "overdue": True}
    if level.plan_unit == PeriodUnit.WORKING_DAY:
        text = f"{fa(working_days_between(today, due))} روز کاری"
    else:
        text = f"{fa((due - today).days)} روز"
    if level.co_approver == CO.NONE:
        text = f"ثبت تصمیم {text}"
    return {"kind": "plan", "text": text, "due": fmt.day(due), "overdue": False}


def scope_text(risk, customers, total):
    """دامنه‌ی کوتاه سطر صف، مثل فیگما: «بانک الف و ب»، «همه‌ی مشتریان»؛ بدون مشتری، نام خدمت یا «داخلی»."""
    if not customers:
        return risk.service.name if risk.service_id else "داخلی"
    if len(customers) > 2 and len(customers) >= total:
        return "همه‌ی مشتریان"
    if len(customers) > 2:
        return f"{fa(len(customers))} مشتری"
    return " و ".join(customers)


def queue(user):
    rows = []
    total = Customer.objects.filter(is_active=True).count()
    approve = get_transition("approve")
    may_approve = can_perform(user, approve)
    risks = (
        visible_risks(user)
        .filter(status__in=QUEUE, merged_into__isnull=True)
        .select_related("category", "service")
        .prefetch_related("customers")
    )
    for risk in risks:
        assessment = decision_assessment(risk)
        if assessment is None or assessment.score_high is None:
            continue
        level, base = assessment.decision_level, assessment.base_level or assessment.decision_level
        customers = [customer.name for customer in risk.customers.all()]
        sendable = risk.status == S.ASSESSMENT and may_approve and not blocking_problems(approve, risk)
        rows.append(
            {
                "id": risk.pk,
                "code": risk.code,
                "title": risk.title,
                "href": risk.get_absolute_url(),
                "category": risk.category.code,
                "scope": scope_text(risk, customers, total),
                "status": fmt.choice(risk, "status"),
                "l": assessment.likelihood_high,
                "i": assessment.impact_high,
                "score": assessment.score_high,
                "base_level": fmt.level(base),
                "decision_level": fmt.level(level),
                "raised": base.rank != level.rank,
                "reasons": [str(reason) for reason in assessment.escalation_reasons],
                "authority": authority(level, assessment),
                "deadline": deadline(risk, level),
                "sendable": sendable,
                "assessment_href": assessment.get_absolute_url(),
                "_sort": (
                    -level.rank,
                    -assessment.score_high,
                    -(assessment.impact_high or 0),
                    -len(customers),
                    UNCERTAINTY.get(assessment.confidence, 0),
                    risk.code,
                ),
            }
        )
    rows.sort(key=lambda row: row.pop("_sort"))
    return rows


def matrix(version, rows):
    tables = MethodTables(version)
    counts = {}
    for row in rows:
        counts[(row["l"], row["i"])] = counts.get((row["l"], row["i"]), 0) + 1
    return [
        {
            "l": likelihood,
            "cells": [
                {
                    "i": impact,
                    "score": cell["score"],
                    "level": fmt.level(cell["level"]),
                    "raised": cell["raised"],
                    "count": counts.get((likelihood, impact), 0),
                }
                for impact, cell in enumerate(cells, start=1)
            ],
        }
        for likelihood, cells in reversed(tables.decision_matrix())
    ]


class EvaluationView(ApiView):
    def get(self, request):
        version = active_version()
        rows = queue(request.user)
        levels = list(version.risk_levels.order_by("rank")) if version else []
        floors = list(version.impact_floors.select_related("min_level").order_by("-min_impact")) if version else []
        raised = [row for row in rows if row["raised"]]
        example = next((row for row in raised if any("کف" in reason for reason in row["reasons"])), None)
        reasons = []
        for row in raised:
            for reason in row["reasons"]:
                short = reason.split(":")[0].split("؛")[0].strip()
                if short not in reasons:
                    reasons.append(short)
        return Response(
            {
                "method": {
                    "number": version.number if version else None,
                    "status": fmt.choice(version, "status") if version else None,
                    "href": version.get_absolute_url() if version else None,
                },
                "levels": [
                    {
                        **fmt.level(level),
                        "min_score": level.min_score,
                        "max_score": level.max_score,
                        "note": level_note(level),
                        "decision_rule": level.decision_rule,
                        "plan": plan_text(level),
                        "acceptance": period(level.acceptance_value, level.acceptance_unit),
                        "review": review_text(level),
                        "count": sum(1 for row in rows if row["decision_level"]["rank"] == level.rank),
                    }
                    for level in levels
                ],
                "raised": {"count": len(raised), "reasons": reasons},
                "floors": [{"impact": floor.min_impact, "level": floor.min_level.name} for floor in floors],
                "example": {
                    "code": example["code"],
                    "score": example["score"],
                    "level": example["decision_level"]["name"],
                }
                if example
                else None,
                "rows": rows,
                "matrix": matrix(version, rows) if version else [],
                "sendable": [row["id"] for row in rows if row["sendable"]],
            }
        )
