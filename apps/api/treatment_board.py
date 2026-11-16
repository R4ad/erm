"""«ریسک‌های در حال درمان» در رابط React (فیگما ۱۵): تابلوی اقدام‌های طرح‌های مواجهه‌ی جاری، از برنامه‌ریزی تا تأیید
نتیجه، با کاشی‌ها و بازسنجی‌های پیش رو. اقدام تأییدشده فقط تا پایان همین فصل شمسی روی تابلو می‌ماند."""

from datetime import timedelta

import jdatetime
from django.utils import timezone
from rest_framework.response import Response

from apps.actions.models import ActionUpdate, MonitoringNotice, RiskReview, TreatmentAction
from apps.actions.permissions import can_edit_plans
from apps.actions.services import current_plan
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks
from apps.workcalendar.workdays import add_working_days

from . import formatting as fmt
from .base import ApiView
from .treatment import fa, required_rows

ST = TreatmentAction.Status
COLUMNS = [ST.PLANNED, ST.APPROVED, ST.IN_PROGRESS, ST.BLOCKED, ST.READY, ST.VERIFIED, ST.FAILED]
OPEN = [ST.PLANNED, ST.APPROVED, ST.IN_PROGRESS, ST.BLOCKED, ST.READY]
BOARD_STATUSES = [Risk.Status.TREATMENT_PLAN, Risk.Status.TREATMENT, Risk.Status.REVIEW]


def season_start(today):
    """روز اول فصل شمسی امروز."""
    day = jdatetime.date.fromgregorian(date=today)
    return jdatetime.date(day.year, (day.month - 1) // 3 * 3 + 1, 1).togregorian()


def month_day(day):
    """ماه و روز شمسی کارت‌های تابلو، مثل «۰۹/۰۵»."""
    return fa(jdatetime.date.fromgregorian(date=day).strftime("%m/%d"))


def last_update(action, status):
    return (
        ActionUpdate.objects.filter(action=action, to_status=status)
        .order_by("-created_at")
        .values_list("created_at", "note")
        .first()
    )


def progress(action, today):
    """درصد زمان سپری‌شده از برنامه‌ی اقدام؛ تأییدشده و ناموفق کامل‌اند."""
    if action.status in (ST.VERIFIED, ST.FAILED):
        return 100
    total = (action.due_date - action.start_date).days or 1
    return max(0, min(100, round((today - action.start_date).days * 100 / total)))


def card(action, today):
    plan, risk = action.plan, action.plan.risk
    current = plan.assessment.score_high
    target = plan.target_assessment.score_high if plan.target_assessment_id else None
    note = (
        f"{fa(current)} ← {fa(target)}"
        if current and target
        else f"اثر بر {action.get_mechanism_display().split(':')[0]}"
    )
    footer = {"text": month_day(action.due_date), "tone": "neutral", "icon": "clock"}
    if action.status == ST.VERIFIED:
        verified = last_update(action, ST.VERIFIED)
        day = timezone.localdate(verified[0]) if verified else action.due_date
        footer = {"text": f"تأیید {month_day(day)}", "tone": "success", "icon": "check-circle"}
    elif action.status == ST.FAILED:
        failed = last_update(action, ST.FAILED)
        note = (failed[1] if failed and failed[1] else "بازسنجی لازم")[:40]
        footer = {"text": "بازسنجی", "tone": "danger", "icon": "clock"}
    elif action.status == ST.BLOCKED:
        blocked = last_update(action, ST.BLOCKED)
        if blocked and blocked[1]:
            note = blocked[1][:40]
    if action.is_overdue and action.status != ST.FAILED:
        footer = {"text": "معوق", "tone": "danger", "icon": "warning"}
    level = plan.assessment.decision_level
    return {
        "id": action.pk,
        "code": action.code,
        "title": action.title,
        "href": action.get_absolute_url(),
        "status": fmt.choice(action, "status"),
        "level": fmt.level(level),
        "risk": {"id": risk.pk, "code": risk.code, "title": risk.title, "href": risk.get_absolute_url()},
        "note": note,
        "assignee": fmt.person(action.assignee),
        "owner_id": action.owner_id,
        "verifier_id": action.verifier_id,
        "due": fmt.day(action.due_date),
        "overdue": action.is_overdue,
        "progress": progress(action, today),
        "footer": footer,
        "alert": action.status == ST.FAILED or (action.status == ST.BLOCKED and action.is_overdue),
    }


def board_actions(user, today):
    risks = visible_risks(user).filter(status__in=BOARD_STATUSES, merged_into__isnull=True)
    plans = [plan for plan in (current_plan(risk) for risk in risks) if plan is not None]
    since = season_start(today)
    actions = (
        TreatmentAction.objects.filter(plan__in=plans)
        .select_related(
            "plan__risk", "plan__assessment__decision_level", "plan__target_assessment", "assignee", "owner"
        )
        .order_by("due_date", "code")
    )
    cards = []
    for action in actions:
        if action.status == ST.VERIFIED:
            verified = last_update(action, ST.VERIFIED)
            if (timezone.localdate(verified[0]) if verified else action.updated_at.date()) < since:
                continue
        cards.append(card(action, today))
    return cards


def reviews(user, today):
    """بازسنجی‌های پیش رو: بازبینی‌های باز ریسک و اقدام‌های ناموفقی که بازسنجی ≤ ۱ روز کاری می‌خواهند."""
    rows = []
    visible = visible_risks(user)
    for review in (
        RiskReview.objects.filter(completed_at__isnull=True, risk__in=visible, due__lte=today + timedelta(days=30))
        .select_related("risk", "assessment", "responsible")
        .order_by("due")
    ):
        plan = current_plan(review.risk)
        current = review.assessment.score_high if review.assessment_id else None
        target = plan.target_assessment.score_high if plan and plan.target_assessment_id else None
        sent = MonitoringNotice.objects.filter(risk=review.risk, event_key__startswith=f"review:{review.pk}:").exists()
        days = (review.due - today).days
        if review.trigger == RiskReview.Trigger.CONTROL:
            notice = {"text": "فوری · ۱ روز کاری", "tone": "danger"}
        elif sent or days <= 7:
            notice = {"text": "ارسال شد · ۷ روز", "tone": "success"}
        else:
            notice = {"text": "اعلان ۷ روز پیش از موعد", "tone": "neutral"}
        rows.append(
            {
                "key": f"review-{review.pk}",
                "risk": {"code": review.risk.code, "title": review.risk.title, "href": review.risk.get_absolute_url()},
                "note": f"{review.get_trigger_display()} · {review.reason[:50]}",
                "current": current,
                "target": target,
                "due": fmt.day(review.due),
                "responsible": fmt.person(review.responsible),
                "notice": notice,
                "href": review.get_absolute_url(),
            }
        )
    failed = TreatmentAction.objects.filter(status=ST.FAILED, plan__risk__in=visible).select_related(
        "plan__risk", "plan__assessment", "plan__target_assessment", "owner"
    )
    for action in failed:
        update = last_update(action, ST.FAILED)
        due = add_working_days(timezone.localdate(update[0]) if update else action.updated_at.date(), 1)
        plan = action.plan
        rows.append(
            {
                "key": f"action-{action.pk}",
                "risk": {"code": plan.risk.code, "title": plan.risk.title, "href": plan.risk.get_absolute_url()},
                "note": f"{action.code} · ناموفق؛ بازگشت به اقدام",
                "current": plan.assessment.score_high,
                "target": plan.target_assessment.score_high if plan.target_assessment_id else None,
                "due": fmt.day(due),
                "responsible": fmt.person(action.owner),
                "notice": {"text": "فوری · ۱ روز کاری", "tone": "danger"},
                "href": action.get_absolute_url(),
            }
        )
    rows.sort(key=lambda row: row["due"]["iso"])
    return rows


class TreatmentBoardView(ApiView):
    def get(self, request):
        today = timezone.localdate()
        cards = board_actions(request.user, today)
        upcoming = reviews(request.user, today)
        blocked_notes = [item["note"] for item in cards if item["status"]["value"] == ST.BLOCKED and item["note"]]
        soon = sum(1 for row in upcoming if row["due"]["iso"] <= (today + timedelta(days=7)).isoformat())
        return Response(
            {
                "columns": [{"value": status.value, "label": status.label} for status in COLUMNS],
                "cards": cards,
                "counts": {
                    "active": sum(1 for item in cards if item["status"]["value"] in OPEN),
                    "blocked": sum(1 for item in cards if item["status"]["value"] == ST.BLOCKED),
                    "ready": sum(1 for item in cards if item["status"]["value"] == ST.READY),
                    "verified": sum(1 for item in cards if item["status"]["value"] == ST.VERIFIED),
                    "reviews": soon,
                },
                "blocked_note": " و ".join(dict.fromkeys(note for note in blocked_notes))[:60],
                "reviews": upcoming,
                "creatable": [
                    {"code": row["risk"]["code"], "title": row["risk"]["title"], "href": row["action"]["href"]}
                    for row in required_rows(request.user)
                    if row["action"]["kind"] == "create"
                ],
                "can_create": can_edit_plans(request.user),
                "me": request.user.pk,
            }
        )
