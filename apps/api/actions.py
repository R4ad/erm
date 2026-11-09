"""صفحه‌های طرح مواجهه، اقدام و پذیرش ریسک در رابط React (apps/actions/templates/actions/).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد؛ هر دکمه فقط وقتی نشانی دارد که view جنگو همان دکمه را
به همین کاربر نشان می‌دهد، و کارهای یک‌دکمه‌ای (تأیید طرح، تغییر وضعیت اقدام، ارسال، امضا و لغو پذیرش) با همان view
جنگو انجام می‌شوند (bridge_pages.POST_ONLY_PAGES).
"""

from django.urls import reverse

from apps.actions.models import RiskAcceptance, TreatmentAction

from . import formatting as fmt
from .assessments import comparison
from .forms import describe_field, describe_form
from .listing import listing
from .records import record_parts

ST = TreatmentAction.Status
AS = RiskAcceptance.Status


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


def _approval(context):
    """کادر تأیید طرح، با همان شرط‌های plan_detail.html."""
    plan, pending, problems = context["plan"], context["pending"], context["problems"]
    approvable = context["can_approve"] and (not plan.is_owner_approved or pending)
    message = ""
    if not problems and approvable:
        message = (
            "اقدام‌های تازه منتظر تأیید شما هستند."
            if plan.is_owner_approved
            else "شما مالک این ریسک هستید. با تأیید، طرح و همه‌ی اقدام‌هایش مصوب می‌شوند."
        )
    return {
        "problems": list(problems),
        "approve_url": reverse("actions:plan_approve", args=[plan.pk]) if not problems and approvable else None,
        "message": message,
        "waiting_for_owner": not problems and not approvable and bool(pending or not plan.is_owner_approved),
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


def plan_detail(context, request):
    plan, risk = context["plan"], context["risk"]
    target = plan.target_assessment
    reassessment = context.get("reassessment")
    if reassessment:
        state = {"value": "closed", "label": "بازسنجی‌شده و بسته"}
    elif plan.is_owner_approved:
        state = {"value": "approved", "label": "تأییدشده‌ی مالک"}
    else:
        state = {"value": "pending", "label": "منتظر تأیید مالک"}
    return {
        "title": f"طرح مواجهه: {plan.get_option_display()}",
        "plan": {
            "id": plan.pk,
            "option": fmt.choice(plan, "option"),
            "state": state,
            "risk": _risk(risk),
            "risk_owner": fmt.person(risk.owner),
            "assessment": {**_ref(plan.assessment), "score": plan.assessment.score_high},
            "level": fmt.level(plan.level),
            "plan_required": context["plan_required"],
            "decision_due": fmt.day(plan.decision_due),
            "overdue": plan.is_overdue,
            "containment_due": fmt.moment(context["containment_due"]),
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
        "approval": _approval(context),
        "actions": [action_row(action) for action in context["actions"]],
        "add_action_url": reverse("actions:action_create", args=[plan.pk]) if context["can_add_action"] else None,
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
