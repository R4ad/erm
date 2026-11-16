"""«آزمون و تأیید نتیجه» یک اقدام در رابط React (فیگما ۲۴): گام‌های وضعیت اقدام، معیارهای قبولی با نتیجه‌ی
اندازه‌گیری، اجراهای آزمون، تأییدکننده‌ی مستقل و تفکیک وظایف، تصمیم تأییدکننده، شواهد و اثر بر ریسک (جاری قبلی در
برابر هدف طرح)."""

from django.shortcuts import get_object_or_404
from rest_framework.response import Response

from apps.actions.models import ActionCriterion, TreatmentAction
from apps.actions.permissions import visible_actions
from apps.actions.services import PlanError
from apps.actions.verification import can_decide, record_verification, scope, separation, verify_problems
from apps.assessments.results import outcome
from apps.catalog.models import ServiceCustomer
from apps.risks.permissions import visible_evidence, visible_risks

from . import formatting as fmt
from .base import ApiView
from .treatment import fa

ST = TreatmentAction.Status
CS = ActionCriterion.Status
STEPS = [ST.PLANNED, ST.APPROVED, ST.IN_PROGRESS, ST.READY, ST.VERIFIED]
# جای وضعیت‌های جانبی روی گام‌ها: مسدود در «در اجرا» و ناموفق در «آماده‌ی آزمون».
SIDE = {ST.BLOCKED: ST.IN_PROGRESS, ST.FAILED: ST.READY}
CRITERION_TONE = {CS.PASSED: "success", CS.FAILED: "danger", CS.PENDING: "neutral", CS.OUT_OF_SCOPE: "neutral"}


def jalali(value):
    return fa(fmt.day(value)["jalali"]) if value else None


def name_of(user):
    return (user.get_full_name() or user.username) if user else None


def mechanism_text(action):
    if action.mechanism == TreatmentAction.Mechanism.IMPACT and action.dimension_id:
        return f"کاهش {action.dimension.name} (بُعد {action.dimension.code} پیامد)"
    if action.mechanism == TreatmentAction.Mechanism.B:
        return f"کاهش امکان تحقق (B) · {action.path.name}" if action.path_id else "کاهش امکان تحقق (B)"
    return "کاهش عامل آغازگر (A)"


def steps(action):
    current = SIDE.get(action.status, action.status)
    index = STEPS.index(current)
    rows = []
    for number, status in enumerate(STEPS):
        if number < index or (status == ST.VERIFIED and action.status == ST.VERIFIED):
            state = "done"
        elif number == index:
            state = "current"
        else:
            state = "upcoming"
        rows.append({"value": status, "label": ST(status).label, "state": state})
    return rows


def side(action, runs):
    """وضعیت‌های جانبی مسدود و ناموفق، و اگر اجرای ناموفقی بوده، این‌که اقدام به «در اجرا» برگشت."""
    note = None
    failed = next(((number, run) for number, run in runs if not run.passed), None)
    if failed:
        number, run = failed
        back = action.updates.filter(from_status=ST.FAILED, to_status=ST.IN_PROGRESS).exists()
        note = f"اجرای {fa(number)} در {jalali(run.performed_on)} ناموفق بود" + (
            " و اقدام به «در اجرا» برگشت" if back else ""
        )
    return {
        "items": [
            {"value": status, "label": ST(status).label, "active": action.status == status}
            for status in (ST.BLOCKED, ST.FAILED)
        ],
        "note": note,
    }


def criteria(action):
    parts = scope(action)
    inside = len(parts["inside"])
    return {
        "summary": f"{fa(len(parts['passed']))} از {fa(inside)} معیار دامنه" if inside else "معیاری ثبت نشده",
        "met": bool(inside) and len(parts["passed"]) == inside,
        "rows": [
            {
                "id": row.pk,
                "title": row.title,
                "target": row.target or "—",
                "result": row.result or ("آزموده نشد" if not row.in_scope else "—"),
                "status": {"value": row.status, "label": row.get_status_display(), "tone": CRITERION_TONE[row.status]},
            }
            for row in parts["all"]
        ],
        "notes": [row.note for row in parts["outside"] if row.note],
        "text": action.acceptance_criteria,
    }


def runs_of(action, user):
    evidence = set(visible_evidence(user).values_list("pk", flat=True))
    runs = list(enumerate(action.test_runs.select_related("evidence"), 1))
    return runs, [
        {
            "id": run.pk,
            "number": number,
            "title": f"اجرای {fa(number)} · {jalali(run.performed_on)}",
            "passed": run.passed,
            "outcome": " · ".join(part for part in ("موفق" if run.passed else "ناموفق", run.outcome) if part),
            "description": run.description,
            "evidence": {"code": run.evidence.code, "href": run.evidence.get_absolute_url()}
            if run.evidence_id and run.evidence_id in evidence
            else None,
        }
        for number, run in reversed(runs)
    ]


def people(action):
    risk = action.plan.risk
    verifier, assignee = action.verifier, action.assignee
    control = action.controls.select_related("owner").first() or risk.controls.filter(is_key=True).first()
    rows = [
        {"label": "تأییدکننده‌ی نتیجه", "value": " · ".join(p for p in (name_of(verifier), verifier.job_title) if p)},
        {
            "label": "مجری",
            "value": " · ".join(
                p for p in (assignee.org_unit.name if assignee.org_unit_id else "", name_of(assignee)) if p
            ),
        },
        {"label": "مالک اقدام", "value": name_of(action.owner)},
    ]
    if risk.owner_id and risk.owner_id != action.owner_id:
        rows.append({"label": "مالک ریسک", "value": name_of(risk.owner)})
    if control and control.owner_id:
        rows.append({"label": "مسئول کنترل", "value": name_of(control.owner)})
    return {"sod": separation(action), "rows": rows}


def dimensions(assessment):
    levels = {}
    for impact in assessment.impacts.select_related("scale"):
        value = impact.level_high if impact.level_high is not None else impact.level
        if value is not None:
            levels[impact.scale.code] = max(levels.get(impact.scale.code, 0), value)
    return levels


def card(assessment, title, hint):
    result = outcome(assessment)
    return {
        "title": title,
        "hint": hint,
        "l": result.likelihood.high if result.likelihood else None,
        "i": result.impact.high if result.impact else None,
        "score": result.score.high if result.score else None,
        "level": fmt.level(result.decision_level) if result.decision_level else None,
        "dims": dimensions(assessment),
    }


def effect(action, others):
    """جاری قبلی (ارزیابی مبنای طرح) در برابر هدف طرح؛ هدف وقتی «جاری جدید» خوانده می‌شود که این آخرین اقدام باز طرح
    باشد. عدد واقعی فقط از ارزیابی پس از اقدام می‌آید."""
    plan = action.plan
    if not plan.assessment_id:
        return None
    risk = plan.risk
    before = card(plan.assessment, "جاری قبلی", plan.assessment.code)
    after = None
    if plan.target_assessment_id:
        title = "جاری جدید (پس از تأیید)" if not others else "هدف طرح"
        hint = (
            f"برآورد طرح · {plan.target_assessment.code}"
            if not others
            else f"پس از تأیید {fa(others)} اقدام دیگر · {plan.target_assessment.code}"
        )
        after = card(plan.target_assessment, title, hint)
    metric = action.criteria.filter(measures_effect=True).first()
    code = (
        action.dimension.code if action.mechanism == TreatmentAction.Mechanism.IMPACT and action.dimension_id else None
    )
    rows = []
    if metric:
        rows.append({"label": metric.title, "before": metric.baseline or "—", "after": metric.result or "—"})
    if code:
        rows.append(
            {
                "label": f"بُعد {code}",
                "before": f"{code}{before['dims'].get(code, '—')}",
                "after": f"{code}{after['dims'].get(code, '—')}" if after else "—",
            }
        )
    for label, key in (("پیامد I", "i"), ("احتمال L", "l")):
        old = before[key]
        new = after[key] if after else None
        text = fa(new) if new is not None else "—"
        if new is not None and new == old:
            text += " · بدون تغییر"
        rows.append({"label": label, "before": fa(old) if old is not None else "—", "after": text})
    profile = []
    changed = None
    if after and code:
        for scale, level in sorted(after["dims"].items()):
            old = before["dims"].get(scale)
            if old is not None and old != level:
                changed = f"بُعد {scale} از {fa(old)} به {fa(level)}"
            else:
                profile.append(f"{scale} {fa(level)}")
    links = ServiceCustomer.objects.filter(service=risk.service_id, rto_minutes__isnull=False).order_by("rto_minutes")
    link = links.first() if risk.service_id else None
    context = [risk.title]
    if link:
        context.append(f"RTO مصوب {hours(link.rto_minutes)}")
        if link.mtpd_minutes:
            context.append(f"MTPD {hours(link.mtpd_minutes)}")
    note = None
    reached = False
    if after and after["score"] is not None:
        reached = not others and (
            before["score"] is not None
            and after["score"] < before["score"]
            and (after["level"] or {}).get("rank", 0) <= (before["level"] or {}).get("rank", 0)
        )
        note = (
            f"ریسک هدف طرح (L{after['l']} و I{after['i']}، امتیاز {fa(after['score'])}) "
            + ("با تأیید این اقدام محقق می‌شود" if reached else "هنوز محقق نشده است")
            + "؛ عدد قطعی را ارزیابی پس از اقدام با شواهد واقعی ثبت می‌کند."
        )
    for side_card in (before, after):
        if side_card:
            side_card["score"] = fa(side_card["score"]) if side_card["score"] is not None else None
            side_card.pop("dims")
    return {
        "title": f"اثر بر ریسک {risk.code}",
        "subtitle": " · ".join(context),
        "before": before,
        "after": after,
        "rows": rows,
        "profile": profile,
        "changed": changed,
        "note": note,
        "reached": reached,
    }


def hours(minutes):
    return f"{fa(minutes // 60)} ساعت" if minutes % 60 == 0 else f"{fa(minutes)} دقیقه"


def decision(action, user, others):
    last = (
        action.updates.filter(to_status__in=[ST.VERIFIED, ST.FAILED], from_status=ST.READY)
        .select_related("created_by")
        .first()
    )
    allowed = can_decide(user, action)
    problems = verify_problems(action) if allowed else []
    outside = scope(action)["outside"]
    closing = (
        "اقدام پس از تأیید خروجی بسته می‌شود؛ ریسک بسته نمی‌شود و به پایش فعال می‌رود. ارزیابی جاری جدید با شواهد "
        "واقعی ثبت شود."
    )
    if others:
        closing += f" {fa(others)} اقدام دیگر طرح هنوز باز است و ارزیابی پس از اقدام بعد از تأیید آن‌ها آغاز می‌شود."
    return {
        "can_decide": allowed,
        "options": [
            {"value": "verify", "label": "تأییدشده — معیارهای دامنه‌ی اقدام محقق شد", "problems": problems},
            {"value": "fail", "label": "ناموفق — بازگشت به «در اجرا» با اقدام اصلاحی", "problems": []},
        ],
        "follow_up": "ایجاد اقدام پیگیری برای " + "، ".join(criterion.title for criterion in outside)
        if outside
        else None,
        "closing": closing,
        "submit": "ثبت تأیید و آغاز ارزیابی پس از اقدام" if not others else "ثبت تأیید نتیجه",
        "waiting": None
        if allowed or action.status != ST.READY
        else f"در انتظار تصمیم {name_of(action.verifier)} به عنوان تأییدکننده‌ی مستقل",
        "last": {
            "label": last.get_to_status_display(),
            "tone": "success" if last.to_status == ST.VERIFIED else "danger",
            "by": name_of(last.created_by),
            "at": fmt.moment(last.created_at),
            "note": last.note,
        }
        if last
        else None,
    }


def page(action, user):
    plan, risk = action.plan, action.plan.risk
    runs, run_rows = runs_of(action, user)
    others = plan.actions.exclude(pk=action.pk).exclude(status=ST.VERIFIED).count()
    report = next((row["evidence"] for row in run_rows if row["evidence"]), None)
    risk_visible = visible_risks(user).filter(pk=risk.pk).exists()
    evidence = visible_evidence(user).filter(treatment_actions=action).order_by("-observed_on", "-pk")
    return {
        "id": action.pk,
        "code": action.code,
        "title": f"آزمون و تأیید نتیجه · {action.title}",
        "status": {"value": action.status, "label": action.get_status_display()},
        "subtitle": " · ".join(
            [
                f"اقدام {action.code}",
                f"ریسک {risk.code}",
                f"مالک اقدام: {name_of(action.owner)}",
                f"سازوکار اثر: {mechanism_text(action)}",
            ]
        ),
        "risk": {"code": risk.code, "href": risk.get_absolute_url() if risk_visible else None},
        "action_href": action.get_absolute_url(),
        "steps": steps(action),
        "side": side(action, runs),
        "report": report,
        "criteria": criteria(action),
        "runs": {"setting": action.test_setting, "rows": run_rows},
        "people": people(action),
        "decision": decision(action, user, others),
        "evidence": [
            {
                "id": item.pk,
                "code": item.code,
                "title": item.title,
                "observed_on": jalali(item.observed_on),
                "href": item.get_absolute_url(),
            }
            for item in evidence
        ],
        "effect": effect(action, others),
    }


def visible_action(request, pk):
    return get_object_or_404(
        visible_actions(request.user).select_related(
            "plan__risk__owner",
            "plan__assessment",
            "plan__target_assessment",
            "owner",
            "assignee__org_unit",
            "verifier",
            "dimension",
            "path",
        ),
        pk=pk,
    )


class ActionVerificationView(ApiView):
    """GET صفحه؛ POST {decision: verify|fail, note, follow_up} تصمیم تأییدکننده را ثبت می‌کند."""

    def get(self, request, pk):
        return Response(page(visible_action(request, pk), request.user))

    def post(self, request, pk):
        action = visible_action(request, pk)
        data = request.data
        try:
            follow_ups, notified = record_verification(
                action, request.user, data.get("decision"), data.get("note") or "", bool(data.get("follow_up"))
            )
        except PlanError as error:
            return Response({"detail": " ".join(error.problems)}, status=400)
        action.refresh_from_db()
        result = page(action, request.user)
        result["result"] = {
            "follow_ups": [{"code": item.code, "href": item.get_absolute_url()} for item in follow_ups],
            "notified": len(notified),
        }
        return Response(result)
