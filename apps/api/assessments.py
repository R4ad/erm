"""صفحه‌های ارزیابی ریسک برای رابط React: پرونده‌ی ارزیابی، مقایسه، و چیزهای کنار فرم‌های ارزیابی، عامل آغازگر،
مسیر تحقق و پروفایل پیامد. همه از context همان view جنگو ساخته می‌شوند (bridge.py)، پس هر عدد همان است که موتور
محاسبه برای صفحه‌ی جنگو حساب کرده و هر دکمه فقط وقتی هست که صفحه‌ی جنگو هم آن را به همین کاربر نشان می‌دهد."""

from decimal import Decimal

from django.urls import reverse

from apps.assessments.forms import ReferralForm, ReviewForm
from apps.assessments.services import band_list

from . import formatting as fmt
from .forms import describe_field, describe_form

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


def _path(row, can_edit):
    path, result = row.path, row.result
    return {
        "id": path.pk,
        "name": path.name,
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
        "paths": [_path(row, can_edit) for row in likelihood.paths],
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


def assessment_detail(context, request):
    assessment = context["assessment"]
    can_edit = context["can_edit"]
    pk = assessment.pk
    return {
        "title": _title(assessment),
        "assessment": _header(assessment),
        "outcome": _outcome(context["outcome"], assessment),
        "review": _review(context, assessment),
        "likelihood": _likelihood(assessment, context["likelihood"], can_edit),
        "impacts": _impacts(context["summary"]),
        "actions": {
            "edit": reverse("assessments:assessment_update", args=[pk]) if can_edit else None,
            "impact_profile": reverse("assessments:impact_profile", args=[pk]) if can_edit else None,
            "initiator": reverse("assessments:initiator", args=[pk]) if can_edit else None,
            "add_path": reverse("assessments:path_create", args=[pk]) if can_edit else None,
        },
    }


def _compare_cell(cell):
    value = cell["value"]
    if hasattr(value, "rank"):  # سطح ریسک
        return {"text": value.name, "level": fmt.level(value), "trend": cell["trend"]}
    return {"text": "-" if value is None or value == "" else str(value), "level": None, "trend": cell["trend"]}


def compare(context, request):
    risk = context["risk"]
    profiles = context.get("profiles", [])
    return {
        "title": "مقایسه‌ی ارزیابی‌ها",
        "risk": _risk(risk),
        "error": context.get("error"),
        "profiles": [
            {
                "id": item.assessment.pk,
                "code": item.assessment.code,
                "kind": fmt.choice(item.assessment, "kind"),
                "method_version": item.assessment.method_version.number,
                "incomplete": item.incomplete,
                "href": item.assessment.get_absolute_url(),
            }
            for item in profiles
        ],
        "rows": [
            {"label": row["label"], "cells": [_compare_cell(cell) for cell in row["cells"]]}
            for row in context.get("rows", [])
        ],
        "method_changed": context.get("method_changed", False),
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
    return {
        "title": f"پروفایل پیامد ارزیابی {assessment.get_kind_display()} {assessment.code}",
        "cancel_url": assessment.get_absolute_url(),
        "intro": IMPACT_INTRO,
        "groups": groups,
    }
