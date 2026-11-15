"""صفحه‌های طرح مواجهه، اقدام و پذیرش ریسک در رابط React (apps/actions/templates/actions/).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد؛ هر دکمه فقط وقتی نشانی دارد که view جنگو همان دکمه را
به همین کاربر نشان می‌دهد، و کارهای یک‌دکمه‌ای (تأیید طرح، تغییر وضعیت اقدام، ارسال، امضا و لغو پذیرش) با همان view
جنگو انجام می‌شوند (bridge_pages.POST_ONLY_PAGES).
"""

from datetime import timedelta

import jdatetime
from django.urls import reverse
from django.utils import timezone

from apps.actions.models import RiskAcceptance, TreatmentAction, TreatmentPlan
from apps.actions.services import can_remind_owner, has_valid_acceptance
from apps.assessments.services import rials
from apps.workcalendar.workdays import working_days_between

from . import formatting as fmt
from .assessments import comparison
from .forms import describe_field, describe_form
from .listing import listing
from .records import record_parts
from .risk_record import role_of

ST = TreatmentAction.Status
AS = RiskAcceptance.Status
OPTION = TreatmentPlan.Option
MECH = TreatmentAction.Mechanism
MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"]


def _risk(risk, visible=True):
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "href": risk.get_absolute_url() if visible else None,
    }


def _ref(item):
    return {"code": item.code, "href": item.get_absolute_url()}


def _status(action):
    return {**fmt.choice(action, "status"), "overdue": action.is_overdue}


def action_row(action, show_risk=False):
    """یک ردیف جدول اقدام‌ها (actions/includes/action_table.html)."""
    row = {
        "id": action.pk,
        "code": action.code,
        "title": action.title,
        "mechanism": action.get_mechanism_display(),
        "dimension": action.dimension.code if action.dimension_id else None,
        "owner": fmt.person(action.owner),
        "assignee": fmt.person(action.assignee),
        "due": fmt.deadline(action.due_date) if action.is_open else fmt.day(action.due_date),
        "status": _status(action),
        "href": action.get_absolute_url(),
    }
    if show_risk:
        row["risk"] = action.plan.risk.code
    return row


def acceptance_state(acceptance):
    """وضعیت پذیرش با «منقضی» که از تاریخ پایان حساب می‌شود (actions/includes/acceptance_status.html)."""
    return {"value": "expired" if acceptance.is_expired else acceptance.status, "label": acceptance.state_label}


def acceptance_row(acceptance, show_risk=False):
    """یک ردیف جدول پذیرش‌ها (actions/includes/acceptance_table.html)."""
    row = {
        "id": acceptance.pk,
        "code": acceptance.code,
        "assessment": acceptance.assessment.code,
        "level": fmt.level(acceptance.assessment.decision_level),
        "start": fmt.day(acceptance.start_date),
        "end": fmt.day(acceptance.end_date),
        "follow_up_by": fmt.person(acceptance.follow_up_by),
        "state": acceptance_state(acceptance),
        "href": acceptance.get_absolute_url(),
    }
    if show_risk:
        row["risk"] = _ref(acceptance.risk)
    return row


def action_list(context, request):
    return {
        "title": "اقدام‌ها",
        **listing(context, [action_row(action, show_risk=True) for action in context["actions"]]),
    }


def acceptance_list(context, request):
    return {
        "title": "پذیرش‌های ریسک",
        **listing(context, [acceptance_row(item, show_risk=True) for item in context["acceptances"]]),
    }


# --- طرح مواجهه ---


def _plan_checks(plan, actions, level, required):
    """فهرست کادر «تأیید مالک ریسک» در فیگما ۰۷: همان قاعده‌های plan_problems، به‌اضافه‌ی چیزهایی که مالک پیش از
    تأیید می‌بیند. fail تأیید را می‌بندد و warn فقط هشدار است."""
    checks = []

    def add(label, ok, warn=False):
        checks.append({"label": label, "state": "ok" if ok else "warn" if warn else "fail"})

    if required and plan.option == OPTION.ACCEPT:
        add(f"برای سطح «{level.name}» طرح الزامی است و گزینه‌ی پذیرش کافی نیست", False)
    if plan.needs_actions:
        add("هر گزینه جز پذیرش دست‌کم یک اقدام دارد", bool(actions))
    if plan.option == OPTION.REDUCE:
        target = plan.target_assessment
        if target is None:
            add("گزینه‌ی کاهش: ارزیابی هدف ثبت نشده است", False)
        else:
            add(
                f"گزینه‌ی کاهش: ارزیابی هدف {'تأییدشده' if target.is_approved else 'هنوز تأیید نشده'} دارد",
                target.is_approved,
            )
    if plan.option in (OPTION.TRANSFER, OPTION.AVOID):
        add(f"شرط‌های گزینه‌ی «{plan.get_option_display()}» نوشته شده", bool(plan.option_details.strip()))
    if plan.option == OPTION.ACCEPT and not required:
        add("پذیرش معتبر با امضای مالک ریسک و صاحبان اختیار", has_valid_acceptance(plan.assessment))
    if actions:
        add(
            "تأییدکننده‌ی نتیجه‌ی هر اقدام کسی جز مالک و مجری است",
            all(a.verifier_id not in (a.owner_id, a.assignee_id) for a in actions),
        )
        add("معیار قبولی برای همه‌ی اقدام‌ها نوشته شده", all(a.acceptance_criteria.strip() for a in actions))
        costed = sum(a.cost is not None and a.person_hours is not None for a in actions)
        add(f"هزینه و نفرساعت برای {costed} از {len(actions)} اقدام", costed == len(actions), warn=True)
    return checks


def _estimate(actions):
    cost = sum(a.cost for a in actions if a.cost is not None)
    hours = sum(a.person_hours for a in actions if a.person_hours is not None)
    if not cost and not hours:
        return None
    parts = [rials(cost) if cost else None, f"{hours} نفرساعت" if hours else None]
    return " · ".join(part for part in parts if part)


def _approval(context):
    """کادر تأیید طرح، با همان شرط‌های plan_detail.html و فهرست و برآورد فیگما ۰۷."""
    plan, pending, problems = context["plan"], context["pending"], context["problems"]
    actions = list(context["actions"])
    approvable = context["can_approve"] and (not plan.is_owner_approved or pending)
    message = ""
    if not problems and approvable:
        message = (
            "اقدام‌های تازه منتظر تأیید شما هستند."
            if plan.is_owner_approved
            else "شما مالک این ریسک هستید. با تأیید، طرح و همه‌ی اقدام‌هایش مصوب می‌شوند."
        )
    owner = plan.risk.owner
    if plan.is_owner_approved and not pending:
        owner_state = {"value": "approved", "label": "تأیید شد"}
    elif plan.is_owner_approved:
        owner_state = {"value": "pending", "label": f"{len(pending)} اقدام تازه منتظر"}
    else:
        owner_state = {"value": "pending", "label": "منتظر"}
    return {
        "problems": list(problems),
        "approve_url": reverse("actions:plan_approve", args=[plan.pk]) if not problems and approvable else None,
        "message": message,
        "waiting_for_owner": not problems and not approvable and bool(pending or not plan.is_owner_approved),
        "owner": {**fmt.person(owner), "job_title": owner.job_title} if owner else None,
        "owner_state": owner_state,
        "checks": _plan_checks(plan, actions, plan.level, context["plan_required"]),
        "estimate": _estimate(actions),
    }


def _reassessment(context):
    reassessment = context.get("reassessment")
    if reassessment is None:
        return None
    return {
        "performed_on": fmt.day(reassessment.performed_on),
        "responsible": fmt.person(reassessment.responsible),
        "assessment": _ref(reassessment.assessment),
        "target_met": reassessment.target_met,
        "method_changed": reassessment.method_changed,
        "decision": fmt.choice(reassessment, "decision"),
        "note": reassessment.note,
    }


def _acceptance_note(plan, required):
    if plan.option == "accept":
        return "گزینه‌ی پذیرش با یک پذیرش معتبر، با امضای مالک ریسک و صاحبان اختیار، تأیید می‌شود."
    if required:
        return "برای این سطح پذیرش فقط موقت و استثنایی است و کنار اقدام‌های طرح ثبت می‌شود."
    return "پذیرش ریسک باقیمانده، اگر لازم است، با امضای صاحبان اختیار ثبت می‌شود."


OPTION_HINTS = {
    OPTION.REDUCE: "یک ارزیابی هدف تأییدشده لازم است",
    OPTION.AVOID: "شرط‌های اجتناب نوشته می‌شود",
    OPTION.TRANSFER: "بیمه، قرارداد یا ارائه‌دهنده‌ی دیگر",
    OPTION.ACCEPT: "یک پذیرش معتبر با امضای صاحبان اختیار",
}


def _options(plan, level, required):
    """چهار کاشی «گزینه‌ی مواجهه» (فیگما ۰۷). برای سطحی که طرح الزامی است، پذیرش گزینه‌ی طرح نیست (بخش ۱۹)."""
    rows = []
    for value, label in OPTION.choices:
        disabled = required and value == OPTION.ACCEPT
        rows.append(
            {
                "value": value,
                "label": label,
                "hint": f"برای سطح «{level.name}» گزینه‌ی طرح نیست" if disabled else OPTION_HINTS[value],
                "selected": plan.option == value,
                "disabled": disabled,
            }
        )
    if required:
        note = f"برای سطح «{level.name}» طرح الزامی است و گزینه‌ی «پذیرش» تأیید نمی‌شود"
    else:
        note = f"برای سطح «{level.name}» هر چهار گزینه ممکن است؛ پذیرش با امضای صاحبان اختیار تأیید می‌شود"
    return {"items": rows, "note": note}


def _point(assessment):
    return {**_ref(assessment), "score": assessment.score_high, "level": fmt.level(assessment.decision_level)}


def _compare(plan):
    """کارت «جاری ← هدف»: ارزیابی مبنا کنار ارزیابی هدف، با موعد تحقق و فرض‌های هدف."""
    target = plan.target_assessment
    return {
        "current": _point(plan.assessment),
        "target": {
            **_point(target),
            "status": fmt.choice(target, "status"),
            "is_approved": target.is_approved,
            "due": fmt.day(target.target_due),
            "assumptions": target.assumptions,
        }
        if target
        else None,
        "needs_target": plan.option == OPTION.REDUCE,
    }


def _month(day):
    value = jdatetime.date.fromgregorian(date=day)
    return jdatetime.date(value.year, value.month, 1)


def _next_month(month):
    return jdatetime.date(month.year + (month.month == 12), month.month % 12 + 1, 1)


def _timeline(actions):
    """ستون «زمان‌بندی» جدول اقدام‌ها (فیگما ۰۷): ماه‌های شمسی از آغاز نخستین اقدام تا سررسید آخرین، دست‌کم سه ماه.
    جای هر میله درصدی از کل بازه است تا رابط فقط آن را بکشد."""
    if not actions:
        return None
    today = timezone.localdate()
    first = min(a.start_date for a in actions)
    # طرحی که هنوز شروع نشده از ماه جاری کشیده می‌شود تا فاصله‌ی امروز تا آغاز اقدام‌ها پیدا باشد
    months = [_month(min(first, today))]
    last = _month(max(a.due_date for a in actions))
    while months[-1] < last or len(months) < 3:
        months.append(_next_month(months[-1]))
    start, end = months[0].togregorian(), _next_month(months[-1]).togregorian()
    total = (end - start).days

    def pct(day):
        return round((day - start).days / total * 100, 2)

    years = sorted({month.year for month in months})
    return {
        "label": f"{years[0]}" if len(years) == 1 else f"{years[0]}–{years[-1]}",
        "months": [
            {
                "label": MONTHS[month.month - 1],
                "start": pct(month.togregorian()),
                "width": round(pct(_next_month(month).togregorian()) - pct(month.togregorian()), 2),
            }
            for month in months
        ],
        "bars": {
            action.pk: {
                "start": pct(action.start_date),
                "width": round(pct(action.due_date + timedelta(days=1)) - pct(action.start_date), 2),
            }
            for action in actions
        },
    }


def _effect(action, path_numbers):
    """ستون «اثر روی»: مسیر و B، A، یا بُعد پیامد. نوع اثر رنگ میله‌ی زمان‌بندی را تعیین می‌کند."""
    if action.mechanism == MECH.IMPACT:
        code = action.dimension.code if action.dimension_id else "?"
        return {"label": f"پیامد {code}", "kind": "impact", "title": f"پیامد: {action.dimension}"}
    if action.mechanism == MECH.B and action.path_id:
        number = path_numbers.get(action.path_id)
        return {
            "label": f"مسیر {number} · B",
            "kind": "likelihood",
            "title": f"امکان تحقق مسیر {number}: {action.path.name}",
        }
    return {
        "label": "B" if action.mechanism == MECH.B else "A",
        "kind": "likelihood",
        "title": action.get_mechanism_display(),
    }


def plan_action_row(action, path_numbers, timeline):
    return {
        **action_row(action),
        "acceptance": action.acceptance_criteria,
        "effect": _effect(action, path_numbers),
        "verifier": fmt.person(action.verifier),
        "start": fmt.day(action.start_date),
        "missing_cost": action.status == ST.PLANNED and (action.cost is None or action.person_hours is None),
        "bar": timeline["bars"][action.pk] if timeline else None,
    }


def _deadline(plan):
    """چیپ «مهلت طرح: N روز کاری» تا وقتی مالک تأیید نکرده است."""
    if plan.is_owner_approved:
        return None
    today = timezone.localdate()
    return {"working_days": working_days_between(today, plan.decision_due), "overdue": plan.decision_due < today}


def plan_detail(context, request):
    plan, risk = context["plan"], context["risk"]
    actions = sorted(context["actions"], key=lambda action: action.pk)  # به ترتیب کد، مثل فیگما
    target = plan.target_assessment
    reassessment = context.get("reassessment")
    if reassessment:
        state = {"value": "closed", "label": "بازسنجی‌شده و بسته"}
    elif plan.is_owner_approved:
        state = {"value": "approved", "label": "تأییدشده‌ی مالک ریسک"}
    else:
        state = {"value": "pending", "label": "منتظر تأیید مالک ریسک"}
    timeline = _timeline(actions)
    path_numbers = {
        pk: index for index, pk in enumerate(plan.assessment.paths.order_by("pk").values_list("pk", flat=True), 1)
    }
    return {
        "title": f"طرح مواجهه — {risk.title}",
        "plan": {
            "id": plan.pk,
            "option": fmt.choice(plan, "option"),
            "state": state,
            "risk": _risk(risk),
            "risk_owner": fmt.person(risk.owner),
            "assessment": {
                **_ref(plan.assessment),
                "score": plan.assessment.score_high,
                "kind": plan.assessment.get_kind_display(),
            },
            "level": fmt.level(plan.level),
            "plan_required": context["plan_required"],
            "decision_due": fmt.day(plan.decision_due),
            "deadline": _deadline(plan),
            "overdue": plan.is_overdue,
            "containment_due": fmt.moment(context["containment_due"]),
            "author": {**fmt.person(plan.created_by), "role": role_of(plan.created_by)},
            "created": fmt.day(plan.created_at),
            "rationale": plan.rationale,
            "option_details": plan.option_details,
            "target": {
                **_ref(target),
                "status": target.get_status_display(),
                "level": fmt.level(target.decision_level),
            }
            if target
            else None,
            "approved_by": fmt.person(plan.owner_approved_by) if plan.is_owner_approved else None,
            "approved_at": fmt.moment(plan.owner_approved_at) if plan.is_owner_approved else None,
        },
        "options": _options(plan, plan.level, context["plan_required"]),
        "compare": _compare(plan),
        "approval": _approval(context),
        "actions": [plan_action_row(action, path_numbers, timeline) for action in actions],
        "timeline": {key: value for key, value in timeline.items() if key != "bars"} if timeline else None,
        "add_action_url": reverse("actions:action_create", args=[plan.pk]) if context["can_add_action"] else None,
        "remind_url": reverse("actions:plan_remind", args=[plan.pk]) if can_remind_owner(request.user, plan) else None,
        "reassessment": _reassessment(context),
        "reassess_url": reverse("actions:reassessment_create", args=[plan.pk]) if context["can_reassess"] else None,
        "comparison": comparison(context["comparison"]) if "comparison" in context else None,
        "acceptances": [acceptance_row(item) for item in context["acceptances"]],
        "acceptance_note": _acceptance_note(plan, context["plan_required"]),
        "add_acceptance_url": reverse("actions:acceptance_create", args=[risk.pk])
        if context["can_add_acceptance"]
        else None,
        **record_parts(plan, request.user, context),
        "edit_url": reverse("actions:plan_update", args=[plan.pk]) if context["can_edit"] else None,
    }


# --- اقدام ---


def _progress(context):
    """بخش پیشرفت action_detail.html: تغییر وضعیت‌های مجاز همین کاربر، یا چرا هنوز چیزی ثبت نمی‌شود."""
    action, moves, can_note = context["action"], context["moves"], context["can_note"]
    if action.status == ST.PLANNED:
        return {"state": "planned"}
    if action.status == ST.VERIFIED:
        return {"state": "verified"}
    if not (moves or can_note):
        return {"state": "waiting" if action.is_open else "closed"}
    form = context["move_form"]
    return {
        "state": "open",
        "url": reverse("actions:action_move", args=[action.pk]),
        "moves": [
            {"name": move.name, "label": move.label, "style": move.style, "note_required": move.note_required}
            for move in moves
        ],
        "can_note": can_note,
        "note": describe_field(form["note"]),
        "evidence": describe_field(form["evidence"]) if action.status == ST.IN_PROGRESS else None,
    }


def action_detail(context, request):
    action, plan, risk = context["action"], context["plan"], context["risk"]
    visible = context["risk_visible"]
    return {
        "title": f"اقدام {action.code}",
        "action": {
            "id": action.pk,
            "code": action.code,
            "title": action.title,
            "status": _status(action),
            "is_open": action.is_open,
            "deliverable": action.deliverable,
            "mechanism": action.get_mechanism_display(),
            "dimension": str(action.dimension) if action.dimension_id else None,
            "owner": fmt.person(action.owner),
            "assignee": fmt.person(action.assignee),
            "verifier": fmt.person(action.verifier),
            "start": fmt.day(action.start_date),
            "due": fmt.deadline(action.due_date) if action.is_open else fmt.day(action.due_date),
            "cost": action.cost,
            "person_hours": action.person_hours,
            "description": action.description,
            "acceptance_criteria": action.acceptance_criteria,
        },
        "risk": _risk(risk, visible),
        "plan": {"option": plan.get_option_display(), "href": plan.get_absolute_url() if visible else None},
        "depends_on": [{**_ref(item), "status": _status(item)} for item in action.depends_on.all()],
        "waiting_for_dependencies": bool(context["waiting_for"]) and action.is_open,
        "controls": [{**_ref(control), "title": control.title} for control in action.controls.all()],
        "evidence": [_ref(item) for item in context["evidence"]],
        "progress": _progress(context),
        "updates": [
            {
                "id": item.pk,
                "label": item.get_to_status_display() if item.changes_status else "یادداشت پیشرفت",
                "changes_status": item.changes_status,
                "by": fmt.person(item.created_by),
                "at": fmt.moment(item.created_at),
                "note": item.note,
            }
            for item in context["updates"]
        ],
        **record_parts(action, request.user, context),
        "edit_url": reverse("actions:action_update", args=[action.pk]) if context["can_edit"] else None,
    }


# --- پذیرش ---


SIGN_INTRO = {
    "senior_management": "تصمیم مدیریت ارشد را از روی نامه‌ی رسمی ثبت می‌کنید.",
    "committee": "تصمیم کمیته امنیت را از روی صورت‌جلسه ثبت می‌کنید.",
}


def _signature(row, acceptance):
    signature = row["signature"]
    authority = row["authority"]
    item = {"authority": authority, "label": row["label"], "reason": row["reason"], "signature": None}
    if signature:
        item["signature"] = {
            "approved": signature.is_approval,
            "by": fmt.person(signature.created_by),
            "at": fmt.moment(signature.created_at),
            "reference_kind": "صورت‌جلسه" if authority == "committee" else "نامه",
            "reference": signature.reference,
            "reference_date": fmt.day(signature.reference_date),
            "letter": signature.letter.get_absolute_url() if signature.letter_id else None,
            "note": signature.note,
        }
    item["waiting"] = signature is None and acceptance.status == AS.PENDING
    return item


def acceptance_detail(context, request):
    acceptance, risk, assessment, level = (
        context["acceptance"],
        context["risk"],
        context["assessment"],
        context["level"],
    )
    closed = acceptance.status in (AS.REJECTED, AS.REVOKED)
    managers = [fmt.person(user)["name"] for user in context["unit_managers"]]
    signatures = [_signature(row, acceptance) for row in context["rows"]]
    for item in signatures:
        if item["authority"] == "unit_manager" and item["signature"] is None:
            item["candidates"] = {"unit": str(risk.org_unit), "names": managers}
    problems = list(context["problems"])
    return {
        "title": f"پذیرش {acceptance.code}",
        "acceptance": {
            "id": acceptance.pk,
            "code": acceptance.code,
            "state": acceptance_state(acceptance),
            "days_left": acceptance.days_left if acceptance.status == AS.ACTIVE else None,
            "decision_text": acceptance.decision_text,
            "closed": {
                "label": acceptance.get_status_display(),
                "by": fmt.person(acceptance.closed_by),
                "at": fmt.moment(acceptance.closed_at),
                "reason": acceptance.closed_reason,
            }
            if closed
            else None,
            "start": fmt.day(acceptance.start_date),
            "end": fmt.day(acceptance.end_date),
            "evidence_due": fmt.day(acceptance.evidence_due),
            "scope": acceptance.scope,
            "reason": acceptance.reason,
            "alternatives": acceptance.alternatives,
            "compensating_controls": acceptance.compensating_controls,
            "controls": [_ref(control) for control in acceptance.controls.all()],
            "conditions": acceptance.conditions,
            "customer_constraints": acceptance.customer_constraints,
            "monitoring": acceptance.monitoring,
            "revocation_triggers": acceptance.revocation_triggers,
            "follow_up_by": fmt.person(acceptance.follow_up_by),
        },
        "risk": {**_risk(risk), "owner": fmt.person(risk.owner)},
        "assessment": {
            **_ref(assessment),
            "method_version": assessment.method_version.number,
            "score": assessment.score_high,
            "confidence": assessment.get_confidence_display() or None,
            "tolerance_exceeded": assessment.customer_tolerance_exceeded,
        },
        "level": fmt.level(level),
        "temporary": context["temporary"],
        "non_normal": context["non_normal"],
        "plan": {"option": acceptance.plan.get_option_display(), "href": acceptance.plan.get_absolute_url()}
        if acceptance.plan_id
        else None,
        "renews": _ref(acceptance.renews) if acceptance.renews_id else None,
        "renewals": [{**_ref(item), "state": acceptance_state(item)} for item in context["renewals"]],
        "cap": {
            "value": level.acceptance_value,
            "unit": level.get_acceptance_unit_display(),
            "until": fmt.day(context["cap"]),
        },
        "decision_due": fmt.day(context["decision_due"]) if context.get("decision_due") else None,
        "decision_due_passed": bool(context.get("decision_due_passed")),
        "problems": problems,
        "problems_title": "پیش از ارسال برای امضا لازم است:"
        if acceptance.status == AS.DRAFT
        else "تا این‌ها درست نشوند امضای تأیید ثبت نمی‌شود:",
        "submit_url": reverse("actions:acceptance_submit", args=[acceptance.pk])
        if context["can_submit"] and not problems
        else None,
        "signatures": signatures,
        "sign_url": reverse("actions:acceptance_sign", args=[acceptance.pk]),
        "sign_forms": [
            {
                "authority": form.initial["authority"],
                "label": form.authority_label,
                "intro": SIGN_INTRO.get(form.initial["authority"], ""),
                **describe_form(form),
            }
            for form in context["sign_forms"]
        ],
        "revoke": {
            "url": reverse("actions:acceptance_revoke", args=[acceptance.pk]),
            **describe_form(context["revoke_form"]),
        }
        if context["can_revoke"]
        else None,
        **record_parts(acceptance, request.user, context),
        "edit_url": reverse("actions:acceptance_update", args=[acceptance.pk]) if context["can_edit"] else None,
    }


ACTION_PAGES = {
    "actions:action_list": action_list,
    "actions:acceptance_list": acceptance_list,
    "actions:plan_detail": plan_detail,
    "actions:action_detail": action_detail,
    "actions:acceptance_detail": acceptance_detail,
}


# --- چیزهای کنار فرم بازسنجی (bridge_pages.FORM_PAGES) ---


def reassessment_form(context, request):
    """جدول مقایسه‌ی ارزیابی مبنا، هدف و تازه و اقدام‌های هنوز تأییدنشده کنار فرم بازسنجی (reassessment_form.html)."""
    return {
        "intro": (
            "ارزیابی جاری تازه بعد از اقدام‌ها را با ارزیابی مبنای طرح و ارزیابی هدف مقایسه کنید و تصمیم را ثبت "
            "کنید. تصمیم، گزینه‌ی طرح دور تازه را تعیین می‌کند (بخش ۲۰)."
        ),
        "risk": _risk(context["risk"]),
        "comparison": comparison(context),
        "open_actions": [{**_ref(action), "status": _status(action)} for action in context["open_actions"]],
        "submit": "ثبت بازسنجی",
    }
