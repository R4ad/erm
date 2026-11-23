"""صفحه‌های ارزیابی ریسک برای رابط React: پرونده‌ی ارزیابی، مقایسه، و چیزهای کنار فرم‌های ارزیابی، عامل آغازگر،
مسیر تحقق و پروفایل پیامد. همه از context همان view جنگو ساخته می‌شوند (bridge.py)، پس هر عدد همان است که موتور
محاسبه برای صفحه‌ی جنگو حساب کرده و هر دکمه فقط وقتی هست که صفحه‌ی جنگو هم آن را به همین کاربر نشان می‌دهد."""

from decimal import Decimal

from django.db.models import Max
from django.urls import reverse

from apps.assessments.forms import ReferralForm, ReviewForm
from apps.assessments.models import AssessmentReview
from apps.assessments.results import submission_checks
from apps.assessments.services import band_list, impact_summary
from apps.methodology.services import MethodTables
from apps.risks.permissions import can_add_evidence, visible_evidence

from . import formatting as fmt
from .forms import describe_field, describe_form
from .risk_record import fa, floor_for, level_reason

DATIN = "داتین"


def _text(value):
    return "" if value is None else str(value)


def _number(value):
    """عدد اعشاری بدون صفرهای اضافه و بدون نماد علمی (1E+3)."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        value = value.normalize()
        return format(value, "f")
    return str(value)


def _evidence(items):
    return [{"code": item.code, "href": item.get_absolute_url()} for item in items]


def _risk(risk):
    return {"id": risk.pk, "code": risk.code, "title": risk.title, "href": risk.get_absolute_url()}


def _title(assessment):
    return f"ارزیابی {assessment.get_kind_display()} {assessment.code}"


def _header(assessment):
    escalation = None
    if assessment.has_escalation_flag:
        flags = [
            {"label": label, "tone": tone}
            for on, label, tone in (
                (assessment.ongoing_incident, "رویداد در حال وقوع", "danger"),
                (assessment.binding_prohibition, "منع الزام‌آور", "danger"),
                (assessment.customer_tolerance_exceeded, "عبور از حد تحمل مشتری", "warning"),
            )
            if on
        ]
        escalation = {
            "flags": flags,
            "rationale": assessment.escalation_rationale,
            "evidence": _evidence(assessment.escalation_evidence.all()),
        }
    return {
        "id": assessment.pk,
        "code": assessment.code,
        "kind": fmt.choice(assessment, "kind"),
        "status": fmt.choice(assessment, "status"),
        "is_approved": assessment.is_approved,
        "risk": _risk(assessment.risk),
        "method_version": {
            "label": str(assessment.method_version),
            "number": assessment.method_version.number,
            "href": assessment.method_version.get_absolute_url(),
        },
        "horizon_months": assessment.horizon_months,
        "horizon_rationale": assessment.horizon_rationale,
        "target_due": fmt.day(assessment.target_due),
        "scope_snapshot": assessment.scope_snapshot,
        "meeting_date": fmt.day(assessment.meeting_date),
        "assumptions": assessment.assumptions,
        "created_by": fmt.person(assessment.created_by),
        "created_at": fmt.moment(assessment.created_at),
        "approved_at": fmt.moment(assessment.approved_at),
        "escalation": escalation,
        "href": assessment.get_absolute_url(),
    }


def _outcome(result, assessment):
    return {
        "provisional": not assessment.is_approved,
        "problems": [str(problem) for problem in result.problems],
        "likelihood": band_list(result.likelihood),
        "impact": band_list(result.impact),
        "score": band_list(result.score),
        "decision_score": result.decision_score,
        "base_level": fmt.level(result.base_level),
        "decision_level": fmt.level(result.decision_level),
        "confidence": result.confidence_label,
        "incomplete_reasons": [str(reason) for reason in result.incomplete_reasons],
        "escalation_reasons": [str(reason) for reason in result.escalation_reasons],
        "out_of_acceptance_authority": result.out_of_acceptance_authority,
        "acceptance_restricted": result.acceptance_restricted,
    }


def _review(context, assessment):
    pk = assessment.pk
    return {
        "can_submit": context["can_submit"],
        "submission_problems": [str(problem) for problem in context["submission_problems"]],
        "submit_url": reverse("assessments:submit", args=[pk]) if context["can_submit"] else None,
        "can_review": context["can_review"],
        "review_url": reverse("assessments:review", args=[pk]) if context["can_review"] else None,
        "review_notes": describe_field(ReviewForm()["notes"]),
        "can_decide_referral": context["can_decide_referral"],
        "referral_url": reverse("assessments:referral", args=[pk]) if context["can_decide_referral"] else None,
        "referral_form": describe_form(ReferralForm()),
        "history": [
            {
                "id": item.pk,
                "action": fmt.choice(item, "action"),
                "by": fmt.person(item.created_by),
                "at": fmt.moment(item.created_at),
                "meeting_date": fmt.day(item.meeting_date),
                "notes": item.notes,
            }
            for item in context["reviews"]
        ],
    }


def _initiator(assessment, likelihood):
    if not assessment.a_recorded:
        return None
    rate = None
    if assessment.a_basis == "rate":
        rate = {
            "count": assessment.a_count,
            "months": assessment.a_period_months,
            "denominator": assessment.a_denominator,
            "coverage": _number(assessment.a_coverage),
            "suggestion": (
                {"level": likelihood.rate.suggestion.level, "note": likelihood.rate.suggestion.note}
                if likelihood.rate
                else None
            ),
            "insufficient": list(likelihood.rate.insufficient) if likelihood.rate else [],
        }
    return {
        "basis": fmt.choice(assessment, "a_basis"),
        "rate": rate,
        "confidence": assessment.get_a_confidence_display() if assessment.a_confidence else "",
        "rationale": assessment.a_rationale,
        "evidence": _evidence(assessment.a_evidence.all()),
    }


def _path(row, can_edit, scenario_b=None):
    path, result = row.path, row.result
    return {
        "id": path.pk,
        "name": path.name,
        "evidence": _evidence(path.evidence.all()),
        # مسیری که B سناریو از آن آمده (بیشترین B مسیرها)؛ فیگما ۰۵ آن را برجسته می‌کند.
        "determining": bool(result and result.b and scenario_b is not None and result.b.high == scenario_b),
        "description": path.description,
        "independent": path.independent,
        "independence_rationale": path.independence_rationale,
        "exceptions": path.exceptions,
        "notes": [str(note) for note in row.notes],
        "b0": path.b0_display,
        "b0_confidence": path.get_b0_confidence_display() if path.b0_confidence else "",
        "b0_rationale": path.b0_rationale,
        "controls": [
            {
                "code": item.control_assessment.control.code,
                "href": item.control_assessment.get_absolute_url(),
                "e": item.e,
                "recorded_e": item.control_assessment.e,
                "note": item.note,
            }
            for item in row.controls
        ],
        "bc": band_list(result.bc) if result else None,
        "b": band_list(result.b) if result and result.b else None,
        "edit_url": reverse("assessments:path_update", args=[path.pk]) if can_edit else None,
        "delete_url": reverse("assessments:path_delete", args=[path.pk]) if can_edit else None,
    }


def _likelihood(assessment, likelihood, can_edit):
    return {
        "a": assessment.a_display,
        "b": band_list(likelihood.b),
        "likelihood": band_list(likelihood.likelihood),
        "problems": [str(problem) for problem in likelihood.problems],
        "incomplete": [str(reason) for reason in likelihood.incomplete],
        "blockers": [str(blocker) for blocker in likelihood.blockers],
        "initiator": _initiator(assessment, likelihood),
        "paths": [
            _path(row, can_edit, likelihood.b.high if likelihood.b else None) for row in likelihood.paths
        ],
    }


def _impact_cell(detail):
    if detail is None:
        return None
    return {
        "level": detail.level_display,
        "unknown": detail.is_unknown,
        "value": _number(detail.actual_value),
        "unit": detail.unit,
        "confidence": detail.get_confidence_display() if detail.confidence else "",
        "rationale": detail.rationale,
    }


def _impacts(summary):
    return {
        "impact": band_list(summary.impact),
        "problems": [str(problem) for problem in summary.problems],
        "incomplete": [str(reason) for reason in summary.incomplete],
        "unknown": list(summary.unknown),
        "missing": list(summary.missing),
        "stakeholders": [customer.name if customer else DATIN for customer in summary.stakeholders],
        "rows": [
            {"code": scale.code, "name": scale.name, "cells": [_impact_cell(detail) for detail in cells]}
            for scale, cells in summary.rows
        ],
    }


CHECKS = [
    ("owner", "مالک فعال، خدمت و دست‌کم یک بانک"),
    ("scope", "افق، فرض‌ها و موعد هدف"),
    ("initiator", "A با دلیل و شاهد"),
    ("paths", "دست‌کم یک مسیر تحقق با B0 و اطمینان"),
    ("impacts", "دلیل و اطمینان برای همه‌ی خانه‌های پیامد"),
    ("impact_evidence", "شاهد برای سطح‌های مثبت پیامد"),
    ("escalation", "دلیل و شاهد قاعده‌ی تقدم"),
    ("engine", "ورودی‌های موتور معتبرند؛ نتیجه ناقص نیست"),
]


def _checks(assessment, outcome):
    """«بررسی‌های پیش از تأیید» فیگما: هر گروه از قاعده‌های مسدودکننده با برقرار بودن یا نبودنش. ارزیابی
    تأییدشده قفل است و بررسی‌هایش هنگام تأیید برقرار بوده، پس None."""
    if assessment.is_approved:
        return None
    found = {}
    for group, problem in submission_checks(assessment):
        found.setdefault(group, []).append(str(problem))
    found.setdefault("engine", []).extend(str(reason) for reason in outcome.incomplete_reasons)
    rows = []
    for key, label in CHECKS:
        if key == "escalation" and not assessment.has_escalation_flag:
            continue
        if key == "initiator":
            codes = [item.code for item in assessment.a_evidence.all()]
            label = f"A با شاهد ({'، '.join(codes)})" if codes else label
        problems = list(dict.fromkeys(found.get(key, [])))
        rows.append({"key": key, "label": label, "ok": not problems, "problems": problems})
    return rows


def _steps(assessment, outcome, likelihood, summary, checks):
    """شش گام بالای پرونده‌ی ارزیابی فیگما: دامنه، پیامد، A، مسیرها، نتیجه و کنترل کیفیت."""
    risk = assessment.risk
    impact = summary.impact.high if summary.impact else None
    b = likelihood.b.high if likelihood.b else None
    warnings = sum(len(row["problems"]) for row in checks or [] if not row["ok"])
    scope_ok = bool(risk.initiator.strip() and (risk.realization_path.strip() or risk.scope.strip()))
    rows = [
        ("scope", "دامنه و سناریو", scope_ok, "مرز آغازگر روشن" if scope_ok else "مرز آغازگر نیازمند تکمیل"),
        (
            "impacts", "پروفایل پیامد", impact is not None,
            f"ذی‌نفع {fa(len(summary.stakeholders))} · I = {fa(impact)}" if impact is not None else "ناقص",
        ),
        (
            "initiator", "عامل آغازگر (A)", assessment.a_recorded,
            f"{fa(assessment.a_evidence.count())} شاهد · A = {fa(assessment.a_display)}"
            if assessment.a_recorded else "ثبت نشده",
        ),
        (
            "paths", "مسیرهای تحقق", b is not None,
            f"{fa(len(likelihood.paths))} مسیر · B = {fa(b)}" if b is not None else f"{fa(len(likelihood.paths))} مسیر",
        ),
        (
            "result", "نتیجه و تصمیم", assessment.is_approved,
            outcome.decision_level.name if assessment.is_approved and outcome.decision_level else "موقت تا تأیید",
        ),
        (
            "review", "کنترل کیفیت", assessment.is_approved,
            "تأییدشده" if assessment.is_approved else (f"{fa(warnings)} هشدار" if warnings else "بدون هشدار"),
        ),
    ]
    current = next((index for index, row in enumerate(rows) if not row[2]), None)
    return [
        {
            "key": key,
            "label": label,
            "sub": sub,
            "state": "done" if ok else ("current" if index == current else "todo"),
            "warning": key == "review" and bool(warnings) and not ok,
        }
        for index, (key, label, ok, sub) in enumerate(rows)
    ]


def _chain(assessment, outcome, likelihood, summary):
    """«زنجیره‌ی محاسبه»: A و B ⇒ L از جدول A×B، × I = امتیاز ⇒ سطح تصمیم، با جدول احتمال نسخه‌ی روش."""
    version = assessment.method_version
    tables = MethodTables(version)
    a = assessment.a_high or assessment.a
    b = likelihood.b.high if likelihood.b else None
    level_l = outcome.likelihood.high if outcome.likelihood else None
    impact = outcome.impact.high if outcome.impact else None
    score = outcome.decision_score
    l_scale = next((scale for scale in version.scales.all() if scale.code == "L"), None)
    l_name = ""
    if l_scale and level_l is not None:
        found = next((level for level in l_scale.levels.all() if level.value == level_l), None)
        l_name = found.name if found and found.name else ""
    source = ""
    if impact is not None:
        for cell, detail in summary.cells:
            if detail is not None and detail.engine_level is not None and (detail.level_high or detail.level) == impact:
                source = f"{cell.dimension} · {cell.stakeholder}"
                break
    floor = floor_for(version, impact) if impact is not None else None
    notes = []
    determining = [row.path.name for row in likelihood.paths if row.result and row.result.b and row.result.b.high == b]
    if determining:
        notes.append({"icon": "check", "text": (
            "هر مسیر: B = کمتر از B0 و Bc؛ سناریو: B = بیشترین B مسیرها ⇒ "
            f"{'، '.join(f'«{name}»' for name in determining)} با B = {fa(b)} تعیین‌کننده است."
        )})
    elif not likelihood.paths:
        notes.append({"icon": "info", "text": "هنوز مسیر تحققی ثبت نشده است؛ B از مسیرها می‌آید."})
    if a is not None and b is not None and level_l is not None:
        named = f" ({l_name})" if l_name else ""
        notes.append({"icon": "check", "text": (
            f"جدول احتمال نسخه‌ی {fa(version.number)} برای A{fa(a)} و B{fa(b)} مقدار L = {fa(level_l)}{named} می‌دهد."
        )})
    reason = level_reason(version, impact, score, outcome.base_level, outcome.decision_level, outcome.escalation_reasons)
    if reason:
        notes.append({"icon": "info", "text": reason})
    notes.append({"icon": "info", "text": "امتیاز در خروجی ویرایش نمی‌شود و کنترل دوباره در حاصل‌ضرب اعمال نمی‌شود."})
    return {
        "a": assessment.a_display if assessment.a_recorded else None,
        "a_basis": assessment.get_a_basis_display() if assessment.a_recorded else "",
        "b": band_list(likelihood.b),
        "likelihood": band_list(outcome.likelihood),
        "likelihood_name": l_name,
        "impact": band_list(outcome.impact),
        "impact_source": source,
        "score": band_list(outcome.score),
        "base_level": fmt.level(outcome.base_level),
        "decision_level": fmt.level(outcome.decision_level),
        "floor": f"کف I={fa(impact)}: {floor.min_level.name}" if floor else "",
        "grid": {
            "a": a,
            "b": b,
            "rows": [{"a": row_a, "cells": cells} for row_a, cells in tables.likelihood_grid()],
        },
        "notes": notes,
    }


CONFIDENCE_KEYS = {"کم": "low", "متوسط": "medium", "زیاد": "high"}


def _flags(assessment, outcome):
    return {
        "items": [
            {"label": "رویداد در حال وقوع", "on": assessment.ongoing_incident},
            {"label": "منع الزام‌آور (خارج از اختیار پذیرش)", "on": assessment.binding_prohibition},
            {"label": "عبور از حد تحمل مشتری", "on": assessment.customer_tolerance_exceeded},
        ],
        "confidence": outcome.confidence_label,
        "confidence_key": CONFIDENCE_KEYS.get(outcome.confidence_label, ""),
    }


def _people(reviews):
    """ارسال‌کننده و کنترل‌کننده‌ی سرپرونده از سابقه‌ی کنترل کیفیت: آخرین ارسال و آخرین تصمیم."""
    reviews = list(reviews)  # تازه‌ترین اول، طبق Meta.ordering
    submitted = next((item for item in reviews if item.action == AssessmentReview.Action.SUBMIT), None)
    decided = next((item for item in reviews if item.action != AssessmentReview.Action.SUBMIT), None)
    return {
        "submitted_at": fmt.moment(submitted.created_at) if submitted else None,
        "reviewer": fmt.person(decided.created_by) if decided else None,
    }


def assessment_detail(context, request):
    assessment = context["assessment"]
    can_edit = context["can_edit"]
    pk = assessment.pk
    risk = assessment.risk
    from apps.controls.permissions import visible_controls

    controls = visible_controls(request.user).filter(risks=risk).order_by("code")
    risk_rows = [
        ("کد ریسک", risk.code), ("عنوان", risk.title), ("سناریو", risk.description),
        ("خدمت", str(risk.service) if risk.service_id else ""), ("واحد", str(risk.org_unit)),
        ("کانال ورود", risk.get_channel_display()), ("دسته", str(risk.category) if risk.category_id else fmt.NO_CATEGORY),
        ("مالک", (risk.owner.get_full_name() or risk.owner.username) if risk.owner_id else ""),
        ("بانک‌های متأثر", "، ".join(risk.customers.values_list("name", flat=True))),
        ("عامل آغازگر", risk.initiator), ("مسیر ثبت‌شده", risk.realization_path),
        ("کنترل‌های فعلی", "، ".join(f"{item.code} {item.title}" for item in controls)),
        ("برچسب‌ها", "، ".join(risk.tags.values_list("name", flat=True))),
        ("توضیحات اضافه", risk.additional_notes),
        ("شواهد", "، ".join(f"{item.code} {item.title}" for item in visible_evidence(request.user).filter(risks=risk))),
        ("پیوندهای بیرونی", "، ".join(f"{item.get_kind_display()}: {item.ref}" for item in risk.links.all())),
        ("وضعیت ریسک", risk.get_status_display()),
        ("دامنه", risk.scope), ("واحد شمارش", risk.count_unit), ("موارد خارج از شمارش", risk.count_exclusions),
        ("طبقه اطلاعات", risk.get_data_class_display()), ("برچسب CIA", risk.cia_labels),
    ]
    snapshot = risk.scenario_snapshot or {}
    if snapshot:
        risk_rows.extend([
            ("کد سناریو", str(snapshot.get("code", ""))),
            ("نسخه سناریو", str(snapshot.get("version", ""))),
            ("عامل و وضعیت سناریو", str(snapshot.get("conditions", ""))),
            ("رویداد سناریو", str(snapshot.get("event", ""))),
            ("هدف یا تعهد", str(snapshot.get("objective", ""))),
            ("مشتری سناریو", str(snapshot.get("customer", ""))),
            ("نوع و دامنه پیامد", str(snapshot.get("consequence", ""))),
        ])
    checks = _checks(assessment, context["outcome"])
    return {
        "title": _title(assessment),
        "assessment": {**_header(assessment), **_people(context["reviews"])},
        "steps": _steps(assessment, context["outcome"], context["likelihood"], context["summary"], checks),
        "chain": _chain(assessment, context["outcome"], context["likelihood"], context["summary"]),
        "checks": checks,
        "flags": _flags(assessment, context["outcome"]),
        "risk_details": [{"label": label, "value": value} for label, value in risk_rows],
        "outcome": _outcome(context["outcome"], assessment),
        "review": _review(context, assessment),
        "likelihood": _likelihood(assessment, context["likelihood"], can_edit),
        "impacts": _impacts(context["summary"]),
        "actions": {
            "edit": reverse("assessments:assessment_update", args=[pk]) if can_edit else None,
            "impact_profile": reverse("assessments:impact_profile", args=[pk]) if can_edit else None,
            "initiator": reverse("assessments:initiator", args=[pk]) if can_edit else None,
            "add_path": reverse("assessments:path_create", args=[pk]) if can_edit else None,
            "add_evidence": f"{reverse('risks:evidence_create')}?risk={risk.pk}" if can_add_evidence(request.user, risk) else None,
        },
    }


def _compare_cell(cell):
    value = cell["value"]
    if hasattr(value, "rank"):  # سطح ریسک
        return {"text": value.name, "level": fmt.level(value), "trend": cell["trend"]}
    return {"text": "-" if value is None or value == "" else str(value), "level": None, "trend": cell["trend"]}


def comparison(data):
    """جدول مقایسه‌ی assessments.comparison.compare (ستون‌ها، سطرها و جهت تغییر نسبت به ستون اول) به شکل JSON."""
    return {
        "profiles": [
            {
                "id": item.assessment.pk,
                "code": item.assessment.code,
                "kind": fmt.choice(item.assessment, "kind"),
                "method_version": item.assessment.method_version.number,
                "incomplete": item.incomplete,
                "href": item.assessment.get_absolute_url(),
            }
            for item in data.get("profiles", [])
        ],
        "rows": [
            {"label": row["label"], "cells": [_compare_cell(cell) for cell in row["cells"]]}
            for row in data.get("rows", [])
        ],
        "method_changed": data.get("method_changed", False),
    }


def compare(context, request):
    return {
        "title": "مقایسه‌ی ارزیابی‌ها",
        "risk": _risk(context["risk"]),
        "error": context.get("error"),
        **comparison(context),
    }


ASSESSMENT_PAGES = {
    "assessments:assessment_detail": assessment_detail,
    "assessments:compare": compare,
}


# --- چیزهای کنار فرم‌ها (bridge_pages.FORM_PAGES) ---


def initiator_form(context, request):
    """مرز آغازگر از خود ریسک، پیشنهاد نرخ و جدول A کنار فرم عامل آغازگر (initiator_form.html)."""
    assessment, risk, scale, form = context["assessment"], context["risk"], context["scale"], context["form"]
    alerts = []
    if risk.needs_completion:
        alerts.append(
            {
                "tone": "warning",
                "text": "تعریف آغازگر، واحد شمارش یا دامنه‌ی ریسک کامل نیست؛ A ذخیره می‌شود ولی نهایی تأیید نمی‌شود "
                "(بخش ۱۳).",
                "link": {"label": "تکمیل ریسک", "href": reverse("risks:risk_update", args=[risk.pk])},
            }
        )
    if form.rate:
        suggestion = form.rate.suggestion
        lead = f"سامانه از روی نرخ سطح {suggestion.level} را پیشنهاد می‌دهد: " if suggestion.level else ""
        alerts.append(
            {
                "tone": "warning" if form.rate.insufficient else "info",
                "text": lead + suggestion.note,
                "items": list(form.rate.insufficient),
            }
        )
    return {
        "title": f"عامل آغازگر (A) در ارزیابی {assessment.get_kind_display()} {assessment.code}",
        "cancel_url": f"{assessment.get_absolute_url()}#likelihood",
        "alerts": alerts,
        "facts": {
            "title": f"مرز آغازگر از ریسک {risk.code}",
            "rows": [
                {"label": "عامل آغازگر", "value": risk.initiator},
                {"label": "واحد شمارش", "value": risk.count_unit},
                {"label": "دامنه", "value": risk.scope},
                {"label": "خارج از شمارش", "value": risk.count_exclusions},
            ],
        },
        "guides": [
            {
                "title": "جدول A (بخش ۱۴)",
                "items": [
                    {"term": str(level.value), "label": level.bounds_display(), "text": level.criteria}
                    for level in scale.levels.all()
                ],
                "notes": [
                    (
                        "مسیر انتخابی و دلیلش الزامی است و دو ستون جمع یا میانگین نمی‌شوند. صفر رخداد در یک سال نرخ "
                        "کمتر از ۰٫۱ را ثابت نمی‌کند. وقتی داده کافی نیست، A بازه یا «نامعلوم» است."
                    )
                ],
            }
        ],
    }


def path_form(context, request):
    """جدول B0 و قاعده‌های Bc کنار فرم مسیر تحقق (path_form.html)."""
    return {
        "guides": [
            {
                "title": "B0: قابلیت پایه‌ی مسیر (بخش ۱۵)",
                "items": [
                    {"term": str(level.value), "label": level.name, "text": level.criteria}
                    for level in context["b0_scale"].levels.all()
                ],
                "notes": [],
            },
            {
                "title": "Bc از E کنترل‌های مسیر",
                "items": [{"term": "", "label": "", "text": str(rule)} for rule in context["bc_rules"]],
                "notes": [
                    "در غیر این صورت Bc برابر ۵ است. کنترل معلق یا با شاهد کهنه E1 حساب می‌شود. B مسیر کمترِ B0 و Bc است.",
                    (
                        "فقط کنترل پیشگیرانه‌ای که به همین ریسک وصل است و ارزیابی اثربخشی دارد انتخاب می‌شود. راه "
                        "دورزدن یا حساب استثنایی که از همه‌ی موانع عبور می‌کند، مسیر جداست."
                    ),
                ],
            },
        ],
    }


IMPACT_INTRO = (
    "برای داتین و هر بانک متأثر، سطح هر بُعد را با دلیل و شاهد ثبت کنید. صفر یعنی «اثر ندارد» و دلیل می‌خواهد؛ اگر "
    "داده نیست «نامعلوم» را با دلیل انتخاب کنید و صفر نگذارید. اگر داده کافی نیست، سطح را بازه بگیرید (مثلاً ۳ تا ۴). "
    "با مدت اختلال و مبلغ زیان، سامانه سطح S و F را پیشنهاد می‌دهد؛ سطح دیگر دلیل می‌خواهد. خانه‌ای که «ثبت‌نشده» "
    "بماند ذخیره نمی‌شود."
)


IMPACT_NOTE = (
    "سطح S از مدت اختلال و RTO/MTPD همان بانک پیشنهاد می‌شود؛ همزمانی اثر چند بانک فقط با علت یا وابستگی مشترک "
    "مستند پذیرفته است."
)


def _impact_overview(assessment):
    """کارت بالای پروفایل پیامد فیگما ۰۶: I و خانه‌ای که از آن آمده، توضیح خانه‌های نامعلوم و سه بررسی؛ همه از
    موتور محاسبه روی آنچه ذخیره شده است."""
    summary = impact_summary(assessment)
    names = {scale.code: scale.name for scale, _ in summary.rows}
    top_level = max((level.value for scale, _ in summary.rows for level in scale.levels.all()), default=None)
    high = summary.impact.high if summary.impact else None
    top = None
    if high is not None:
        for cell, detail in summary.cells:
            if detail is not None and detail.engine_level is not None and (detail.level_high or detail.level) == high:
                top = {"code": cell.dimension, "name": names.get(cell.dimension, ""), "stakeholder": cell.stakeholder}
                break
    details = [detail for _, detail in summary.cells if detail is not None]
    unknown = [f"{cell.dimension} · {cell.stakeholder}" for cell, detail in summary.cells if detail and detail.is_unknown]
    open_cells = len(unknown) + len(summary.missing)
    if summary.problems:
        text = " ".join(str(problem) for problem in summary.problems)
    elif not details:
        text = "هنوز خانه‌ای از پروفایل پیامد ثبت نشده است؛ I بیشترین سطح معتبر خانه‌هاست."
    elif high is None:
        text = (
            f"{fa(open_cells)} خانه‌ی نامعلوم یا ثبت‌نشده می‌تواند I را بالاتر ببرد؛ تا روشن شدنشان I کران بالای "
            "قابل دفاعی ندارد."
        )
    elif open_cells and top and high == top_level:
        parts = [f"خانه‌ی نامعلوم {'، '.join(unknown)}"] if unknown else []
        if summary.missing:
            parts.append(f"{fa(len(summary.missing))} خانه‌ی ثبت‌نشده")
        text = (
            f"{' و '.join(parts)} نمی‌تواند I را بالاتر ببرد، چون سطح معلوم دیگری همین حالا {fa(high)} است؛ "
            "دلیلش همچنان لازم است."
        )
    elif open_cells:
        text = (
            f"I فعلاً بازه است، چون {fa(open_cells)} خانه‌ی نامعلوم یا ثبت‌نشده می‌تواند آن را بالاتر ببرد."
        )
    else:
        text = "I بیشترین سطح معتبر بین ابعاد و ذی‌نفعان است و خانه‌ی دیگری آن را بالاتر نمی‌برد."
    unexplained = [
        detail for detail in details
        if not detail.rationale.strip() or (detail.level is not None and not detail.confidence)
    ]
    missing = len(summary.missing)
    return {
        "impact": band_list(summary.impact),
        "top": top,
        "text": text,
        "checks": [
            {"label": "پروفایل تمام‌صفر نیست", "ok": not summary.problems},
            {
                "label": "دلیل و اطمینان برای همه‌ی خانه‌های ثبت‌شده"
                if not unexplained
                else f"{fa(len(unexplained))} خانه دلیل یا اطمینان ندارد",
                "ok": not unexplained,
            },
            {"label": f"{fa(missing)} خانه هنوز ثبت نشده" if missing else "همه‌ی خانه‌ها ثبت شده", "ok": not missing},
        ],
    }


def impact_forms(context):
    """همه‌ی فرم‌های پروفایل پیامد، برای خواندن خطاهای فرستادن ناموفق."""
    return [form for group in context["groups"] for form in group["forms"]]


def impact_profile(context, request):
    """پروفایل پیامد: برای هر ذی‌نفع یک گروه و برای هر بُعد یک ردیف با فیلدهای همان فرم (نام‌ها با پیشوند فرم)."""
    assessment = context["assessment"]
    provisional = context["provisional_level"]
    groups = []
    for group in context["groups"]:
        customer, facts = group["customer"], group["facts"]
        rows = []
        for form in group["forms"]:
            suggestion = form.suggestion
            rows.append(
                {
                    "prefix": form.prefix,
                    "scale": {"code": form.scale.code, "name": form.scale.name},
                    "suggestion": {"level": suggestion.level, "note": suggestion.note} if suggestion else None,
                    "provisional_note": (
                        f"بدون RTO یا MTPD مصوب، سطح موقت کمتر از {int(provisional)} ثبت نشود مگر با دلیل و تأیید "
                        "متولی روش."
                        if form.scale.code == "S" and facts.critical and customer and not facts.mtpd
                        else ""
                    ),
                    **describe_form(form),
                }
            )
        groups.append(
            {
                "name": customer.name if customer else DATIN,
                "is_datin": customer is None,
                "facts": {
                    "critical": facts.critical,
                    "rto": facts.rto,
                    "mtpd": facts.mtpd,
                    "basis": facts.basis,
                },
                "rows": rows,
            }
        )
    saved = assessment.impacts.aggregate(at=Max("updated_at"))["at"]
    return {
        "title": f"پروفایل پیامد ارزیابی {assessment.get_kind_display()} {assessment.code}",
        "cancel_url": assessment.get_absolute_url(),
        "intro": IMPACT_INTRO,
        "groups": groups,
        "assessment": {
            **_header(assessment),
            "stakeholders": [group["name"] for group in groups],
            "saved_at": fmt.moment(saved) if saved else None,
        },
        "overview": _impact_overview(assessment),
        "note": IMPACT_NOTE,
    }
