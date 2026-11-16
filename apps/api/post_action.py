"""«ارزیابی پس از اقدام» (فیگما ۲۵، بخش ۲۰ روش): ارزیابی جاری تازه با شواهد واقعی کنار ارزیابی ذاتی، جاری قبلی و هدف
طرح؛ مسیرهای احتمال و پروفایل پیامد پنج‌بعدی ارزیابی تازه در برابر جاری قبلی؛ و تصمیم گام بعدی مالک ریسک (پایش
فعال، ادامه‌ی اصلاح یا پذیرش) که همان بازسنجی طرح است."""

from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework.response import Response

from apps.actions import reassessment as reassess
from apps.actions.models import Reassessment, RiskReview
from apps.actions.permissions import can_edit_plans, visible_plans
from apps.actions.services import PlanError, pending_reassessment
from apps.assessments.comparison import dimension_levels, profile, target_met
from apps.assessments.models import Assessment, AssessmentReview
from apps.assessments.services import decision_assessment, likelihood_summary
from apps.methodology.models import RiskLevel
from apps.methodology.services import MethodTables
from apps.risks.models import Evidence

from . import formatting as fmt
from .base import ApiView
from .evaluation import authority, period, review_text
from .monitoring_inbox import next_periodic
from .action_verification import jalali
from .treatment import fa

DECISION = Reassessment.Decision
CO = RiskLevel.CoApprover
APPROVALS = [AssessmentReview.Action.APPROVE, AssessmentReview.Action.WORKGROUP_APPROVE]

RULES = [
    "ریسک پس از کاهش بسته نمی‌شود و به پایش فعال می‌رود",
    "کنترل تازه تا رسیدن به شواهد E3 فقط E2 می‌گیرد",
    "ارزیابی جاری جدید با شواهد واقعی ثبت می‌شود، نه با برآورد طرح",
    "اقدام پس از تأیید خروجی بسته می‌شود",
    "ریسک فقط با حذف معتبر سناریو یا خروج از دامنه بازنشسته می‌شود",
]


def high(band):
    return band.high if band else None


def new_assessment(plan):
    """ارزیابی جاری تازه‌ی پس از اقدام: همانی که بازسنجی ثبت کرده، یا ارزیابی جاری تأییدشده‌ای که بعد از ارزیابی
    مبنای طرح تأیید شده و بازسنجی‌اش مانده است."""
    recorded = Reassessment.objects.filter(plan=plan).select_related("assessment").first()
    if recorded:
        return recorded.assessment
    if pending_reassessment(plan.risk) == plan:
        return decision_assessment(plan.risk)
    return None


def inherent_of(risk):
    return (
        risk.assessments.filter(kind=Assessment.Kind.INHERENT, status=Assessment.Status.APPROVED)
        .order_by("-approved_at", "-pk")
        .first()
    )


def card(key, assessment, title, hint, chip=None, current=False):
    item = profile(assessment)
    return {
        "key": key,
        "title": title,
        "hint": hint,
        "chip": chip,
        "current": current,
        "a": fa(assessment.a_high or assessment.a) if assessment.a_recorded and assessment.a is not None else "—",
        "b": fa(high(item.b)) if item.b else "—",
        "l": fa(high(item.likelihood)) if item.likelihood else "—",
        "i": fa(high(item.impact)) if item.impact else "—",
        "score": fa(high(item.score)) if item.score else "—",
        "level": fmt.level(item.decision_level),
    }


def control_e(assessment):
    """E هر کنترل در مسیرهای ارزیابی، همان‌طور که هنگام تأیید حساب شده است؛ کمترین E اگر کنترل در چند مسیر باشد."""
    values = {}
    for row in likelihood_summary(assessment).paths:
        for item in row.controls:
            control = item.control_assessment.control
            values[control.pk] = min(values.get(control.pk, item.e), item.e)
    return values


def e_tone(e):
    return "success" if e >= 3 else "warning" if e == 2 else "neutral"


def paths(after, before, target):
    """مسیرهای ارزیابی تازه: B0، کنترل‌های مؤثر با E، Bc و B مسیر؛ و چرا هدف B محقق شد یا نشد. کنترلی که E آن نسبت
    به ارزیابی جاری قبلی افت کرده شکاف هدف است و اقدام اصلاحی برایش پیشنهاد می‌شود."""
    summary = likelihood_summary(after)
    previous = control_e(before)
    rows, drops = [], {}
    for row in summary.paths:
        result = row.result
        controls = []
        for item in row.controls:
            control = item.control_assessment.control
            controls.append(
                {"code": control.code, "e": item.e, "label": f"{control.code} · E{fa(item.e)}", "tone": e_tone(item.e)}
            )
            if control.pk in previous and item.e < previous[control.pk]:
                drops[control.pk] = (control, item.e, previous[control.pk])
        rows.append(
            {
                "id": row.path.pk,
                "name": row.path.name,
                "b0": fa(high(result.b0)) if result and result.b0 else "—",
                "controls": controls,
                "bc": fa(high(result.bc)) if result and result.bc else "—",
                "b": fa(high(result.b)) if result and result.b else "—",
                "high": high(result.b) if result else None,
            }
        )
    b, likelihood = high(summary.b), high(summary.likelihood)
    a = after.a_high or after.a if after.a_recorded else None
    total = f"{fa(b)} · با A{fa(a)} رتبه‌ی L برابر {fa(likelihood)}" if b and a and likelihood else fa(b) if b else "—"

    note, gaps = None, []
    goal = profile(target) if target else None
    if goal and goal.b and b and b > goal.b.high:
        names = " و ".join(fa(index) for index, row in enumerate(rows, 1) if row["high"] and row["high"] > goal.b.high)
        reason = "".join(
            f"، چون {control.code} در آزمون اخیر از E{fa(old)} به E{fa(new)} افت کرد"
            for control, new, old in drops.values()
        )
        note = f"هدف B{fa(goal.b.high)} محقق نشد{reason} و مسیرهای {names} روی {fa(b)} ماندند."
        if goal.likelihood and likelihood and goal.likelihood.high == likelihood:
            note += f" با A{fa(a)}، رتبه‌ی L برای B{fa(goal.b.high)} و B{fa(b)} یکسان است؛ پس امتیاز هدف از مسیر پیامد به دست آمد."
        gaps = [control for control, _, _ in drops.values()]
    return (
        {
            "subtitle": "در هر مسیر، B کمینه‌ی B0 و Bc است و B نهایی بیشینه‌ی مسیرهاست · کنترل دوباره در حاصل‌ضرب اعمال "
            "نمی‌شود",
            "rows": [{key: value for key, value in row.items() if key != "high"} for row in rows],
            "total": total,
            "note": note,
        },
        gaps,
    )


def impact_profile(after, before):
    """پنج بُعد پیامد: سطح بیشینه‌ی هر بُعد پیش و پس از اقدام. توضیح بُعدی که عوض شده دلیل خانه‌ی بیشینه‌ی ارزیابی
    تازه است."""
    tables = MethodTables(after.method_version)
    old, new = dimension_levels(before), dimension_levels(after)
    reasons = {}
    for detail in after.impacts.select_related("scale").order_by("-level", "pk"):
        if detail.level is not None and detail.rationale:
            reasons.setdefault(detail.scale.code, detail.rationale)
    rows = []
    for code in tables.impact_codes:
        name, level_after, _ = new.get(code) or old.get(code) or (code, None, False)
        level_before = (old.get(code) or (name, None, False))[1]
        changed = level_before is not None and level_after is not None and level_before != level_after
        rows.append(
            {
                "code": code,
                "name": name,
                "note": reasons.get(code, "") if changed else "بدون تغییر",
                "before": level_before,
                "after": level_after,
                "max": max(tables.scale_values.get(code) or [4]),
            }
        )
    first, last = profile(before).impact, profile(after).impact
    subtitle = "پیامد I برابر بیشینه‌ی ابعاد است"
    if first and last:
        subtitle += f" · از {fa(first.high)} به {fa(last.high)}" if first.high != last.high else " · بدون تغییر"
    return {"subtitle": subtitle, "rows": rows}


def summary(plan, after, before, target, recorded, today):
    new, old = profile(after), profile(before)
    met = target_met(after, target) if target and target.is_approved else None
    score, previous = high(new.score), high(old.score)
    goal = high(profile(target).score) if target else None
    if met:
        title = "ریسک هدف محقق شد"
        relation = "با هدف طرح برابر است" if score == goal else "از هدف طرح کمتر است"
        text = f"امتیاز جاری از {fa(previous)} به {fa(score)} رسید و {relation}"
    elif met is False:
        title = "ریسک هدف محقق نشد"
        text = f"امتیاز جاری از {fa(previous)} به {fa(score)} رسید ولی هدف طرح {fa(goal)} است"
    else:
        title = "ارزیابی پس از اقدام ثبت شد"
        text = f"امتیاز جاری از {fa(previous)} به {fa(score)} رسید"
    level = new.decision_level
    if level and old.decision_level and level.pk != old.decision_level.pk:
        level_text = f"از {old.decision_level.name} به {level.name}"
    else:
        level_text = f"{level.name} · بدون تغییر" if level else "—"
    if recorded:
        state = recorded.get_decision_display()
    else:
        state = DECISION.MONITOR.label if met else DECISION.CONTINUE.label
    rows = [
        {"label": "سطح", "value": level_text},
        {"label": "اطمینان ارزیابی", "value": f"{new.confidence or '—'} · کمترین مؤلفه‌ی تعیین‌کننده"},
    ]
    if level and after.approved_at:
        rows.append(
            {
                "label": "بازبینی بعدی",
                "value": f"{jalali(next_periodic(plan.risk, after, today))} · {review_text(level)}",
            }
        )
    rows.append({"label": "وضعیت ریسک", "value": f"{state} · بسته نمی‌شود"})
    return {"title": title, "text": text, "reached": bool(met), "rows": rows}, met


def accept_label(level, assessment):
    if level is None:
        return DECISION.ACCEPT.label
    return f"پذیرش {level.name} · حداکثر {period(level.acceptance_value, level.acceptance_unit)} · {authority(level, assessment)}"


def decision(plan, after, target, gaps, user, recorded, problems):
    risk = plan.risk
    level = after.decision_level
    goal = profile(target) if target else None
    continue_label = DECISION.CONTINUE.label
    if goal and goal.b:
        continue_label += f" تا B{fa(goal.b.high)}"
    if gaps:
        continue_label += " · رفع شکاف " + "، ".join(control.code for control in gaps)
    options = [
        (DECISION.MONITOR, f"پایش فعال با بازبینی {review_text(level)}" if level else DECISION.MONITOR.label),
        (DECISION.CONTINUE, continue_label),
        (DECISION.ACCEPT, accept_label(level, after)),
    ]
    can_decide = not recorded and not problems and reassess.can_record(user, plan)
    owner_other = risk.owner_id and risk.owner_id != user.pk
    last = None
    if recorded:
        last = {
            "label": recorded.get_decision_display(),
            "by": fmt.person(recorded.created_by)["name"],
            "on": jalali(recorded.performed_on),
            "note": recorded.note,
            # طرح دور تازه را عضو GRC می‌نویسد؛ گزینه‌اش را همین تصمیم تعیین می‌کند.
            "next": reverse("actions:plan_create", args=[risk.pk]) if can_edit_plans(user) else None,
        }
    return {
        "subtitle": f"تصمیم مالک ریسک · سطح {level.name}" if level else "تصمیم مالک ریسک",
        "can_decide": can_decide,
        "can_ask": bool(not recorded and not problems and can_edit_plans(user) and owner_other),
        "owner": fmt.person(risk.owner),
        "options": [
            {"value": value, "label": label, "problems": reassess.decision_problems(plan, value)}
            for value, label in options
        ],
        "corrective": (
            {"label": "ایجاد اقدام اصلاحی برای " + "، ".join(f"{c.code} ({c.title})" for c in gaps), "count": len(gaps)}
            if gaps and not recorded
            else None
        ),
        "problems": problems,
        "waiting": None
        if can_decide or recorded or problems
        else f"در انتظار تصمیم {fmt.person(risk.owner)['name']}"
        if risk.owner_id
        else None,
        "last": last,
    }


def evidence(after):
    items = (
        Evidence.objects.filter(assessments_for_a=after)
        | Evidence.objects.filter(paths__assessment=after)
        | Evidence.objects.filter(impact_details__assessment=after)
    )
    return [
        {
            "id": item.pk,
            "code": item.code,
            "title": item.title,
            "observed_on": jalali(item.observed_on),
            "href": item.get_absolute_url(),
        }
        for item in items.distinct().order_by("-observed_on", "-pk")[:6]
    ]


def trigger(plan, after):
    """محرک ارزیابی تازه: اقدام‌های تأییدشده‌ی طرح، و محرک‌های پایشی که از تأیید ارزیابی مبنای طرح باز شده‌اند."""
    parts = [f"تأیید اقدام‌های طرح {plan.get_option_display()}"]
    since = plan.assessment.approved_at
    reviews = RiskReview.objects.filter(risk=plan.risk).exclude(
        trigger__in=[RiskReview.Trigger.PERIODIC, RiskReview.Trigger.ANNUAL]
    )
    if since:
        reviews = reviews.filter(created_at__gte=since)
    if after.approved_at:
        reviews = reviews.filter(created_at__lte=after.approved_at)
    labels = list(dict.fromkeys(review.get_trigger_display() for review in reviews.order_by("created_at")))
    return " و ".join(parts + labels)


def subtitle(plan, after):
    risk = plan.risk
    review = after.reviews.filter(action__in=APPROVALS).select_related("created_by").order_by("-created_at").first()
    bits = [f"ارزیابی {after.code} برای {risk.code}", f"محرک: {trigger(plan, after)}"]
    if after.created_by_id:
        bits.append(f"ارزیاب: {fmt.person(after.created_by)['name']}")
    if review:
        bits.append(f"کنترل کیفیت: {fmt.person(review.created_by)['name']}")
    if after.approved_at:
        bits.append(jalali(after.approved_at))
    return " · ".join(bits)


def page(plan, user):
    risk = plan.risk
    today = timezone.localdate()
    before, target = plan.assessment, plan.target_assessment
    after = new_assessment(plan)
    recorded = Reassessment.objects.filter(plan=plan).select_related("created_by").first()
    data = {
        "plan": {"id": plan.pk, "label": str(plan), "href": plan.get_absolute_url()},
        "risk": {"code": risk.code, "title": risk.title, "href": risk.get_absolute_url()},
        "title": f"ارزیابی پس از اقدام · {risk.title}",
        "rules": RULES,
    }
    cards = []
    inherent = inherent_of(risk)
    if inherent:
        hint = "بدون کنترل · " + ("فرض محیط ثبت شد" if inherent.assumptions else inherent.code)
        cards.append(card("inherent", inherent, "ذاتی", hint))
    cards.append(card("before", before, "جاری قبلی", f"{before.code} · ارزیابی {jalali(before.approved_at)}"))
    if target:
        approved = "مصوب مالک" if plan.owner_approved_at else target.code
        cards.append(
            card("target", target, "هدف طرح", f"{target.code} · {approved}", {"label": "هدف", "tone": "warning"})
        )
    if after is None:
        data.update(
            status=None,
            subtitle=f"طرح {plan.get_option_display()} ریسک {risk.code}",
            cards=cards,
            compare_href=None,
            waiting="ارزیابی جاری تازه‌ی پس از اقدام هنوز تأیید نشده است؛ پس از تأیید آن، این صفحه نتیجه و تصمیم گام بعدی "
            "را نشان می‌دهد.",
            summary=None,
            paths=None,
            profile=None,
            decision=None,
            evidence=[],
        )
        return data
    met_info, met = summary(plan, after, before, target, recorded, today)
    chip = None
    if met is not None:
        chip = {"label": "محقق", "tone": "success"} if met else {"label": "محقق نشد", "tone": "warning"}
    cards.append(card("after", after, "جاری جدید", f"شواهد واقعی · {after.code}", chip, current=True))
    path_data, gaps = paths(after, before, target)
    problems = [] if recorded else reassess.reassessment_problems(plan)
    ids = ",".join(str(item.pk) for item in [inherent, before, target, after] if item)
    data.update(
        status=None
        if met is None
        else {"label": "هدف محقق شد", "tone": "success"}
        if met
        else {"label": "هدف محقق نشد", "tone": "warning"},
        subtitle=subtitle(plan, after),
        cards=cards,
        compare_href=f"{reverse('assessments:compare')}?ids={ids}",
        waiting=None,
        summary=met_info,
        paths=path_data,
        profile=impact_profile(after, before),
        decision=decision(plan, after, target, gaps, user, recorded, problems),
        evidence=evidence(after),
    )
    return data


def visible_plan(request, pk):
    return get_object_or_404(
        visible_plans(request.user).select_related(
            "risk__owner", "assessment__decision_level", "target_assessment__decision_level"
        ),
        pk=pk,
    )


class PostActionView(ApiView):
    """GET صفحه؛ POST {decision, corrective} تصمیم مالک را با بازسنجی طرح ثبت می‌کند و POST {ask: true} تصمیم را
    از مالک می‌خواهد."""

    def get(self, request, pk):
        return Response(page(visible_plan(request, pk), request.user))

    def post(self, request, pk):
        plan = visible_plan(request, pk)
        data = request.data
        result = {}
        try:
            if data.get("ask"):
                result["asked"] = reassess.ask_owner(plan, request.user)
            else:
                result.update(record(plan, request.user, data))
        except PlanError as error:
            return Response({"detail": " ".join(error.problems)}, status=400)
        plan.refresh_from_db()
        response = page(plan, request.user)
        response["result"] = result
        return Response(response)


def record(plan, user, data):
    value = data.get("decision")
    if value not in DECISION.values:
        raise PlanError(["تصمیم گام بعدی را انتخاب کنید."])
    after = new_assessment(plan)
    target = plan.target_assessment
    gaps = paths(after, plan.assessment, target)[1] if after else []
    labels = (
        {option["value"]: option["label"] for option in decision(plan, after, target, gaps, user, None, [])["options"]}
        if after
        else {}
    )
    note = (data.get("note") or "").strip() or labels.get(value, "")
    reassessment = Reassessment(performed_on=timezone.localdate(), responsible=user, decision=value, note=note)
    reassess.record_reassessment(plan, reassessment, user)
    created = reassess.create_corrective(plan, user, gaps) if data.get("corrective") and gaps else []
    return {"corrective": len(created)}
