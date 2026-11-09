"""کتابخانه‌ی کنترل، ارزیابی اثربخشی (E) و بیانیه‌ی کاربردپذیری در رابط React (apps/controls/templates/controls/).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد. دیدن کنترل‌ها، ریسک‌ها و شواهد همان فیلتر view است و
هر دکمه فقط وقتی نشانی دارد که صفحه‌ی جنگو همان دکمه را به همین کاربر نشان می‌دهد.
"""

from django.urls import reverse

from apps.controls.permissions import can_view_soa
from apps.methodology.models import plain_number

from . import formatting as fmt
from .listing import listing
from .records import record_parts
from .rows import risk_brief


def control_row(control):
    """یک ردیف controls/includes/control_table.html."""
    return {
        "id": control.pk,
        "code": control.code,
        "title": control.title,
        "kind": fmt.choice(control, "kind"),
        "owner": fmt.person(control.owner),
        "operated_by": fmt.choice(control, "operated_by"),
        "is_key": control.is_key,
        "is_active": control.is_active,
        "iso_controls": [iso.code for iso in control.iso_controls.all()],
        "href": control.get_absolute_url(),
    }


def applicability(item):
    """controls/includes/applicability_badge.html: ردیفی که نیست «تعیین‌نشده» است."""
    if item is None:
        return {"value": "undetermined", "label": "تعیین‌نشده", "implementation": None}
    if item.applicable:
        return {"value": "applicable", "label": "کاربرد دارد", "implementation": fmt.choice(item, "implementation")}
    return {"value": "not_applicable", "label": "کاربرد ندارد", "implementation": None}


def _applicability_of(iso):
    return getattr(iso, "applicability", None)


def effectiveness(assessment):
    """controls/includes/effectiveness_badge.html: E ثبت‌شده و اگر الان اعتبار کاهش ندارد، چرا."""
    return {"e": assessment.e, "problem": assessment.credit_problem(), "suspended": assessment.suspended}


def control_list(context, request):
    user = request.user
    return {
        "title": "کتابخانه‌ی کنترل",
        **listing(context, [control_row(control) for control in context["controls"]]),
        "create_url": reverse("controls:control_create") if context["can_edit"] else None,
        "soa_url": reverse("controls:soa_list") if can_view_soa(user) else None,
    }


def control_detail(context, request):
    control = context["control"]
    can_edit = context["can_edit"]
    soa = can_view_soa(request.user)
    return {
        "title": str(control),
        "control": {**control_row(control), "objective": control.objective},
        "effectiveness": [
            {
                "id": item.pk,
                "code": item.code,
                "scope": item.scope,
                **effectiveness(item),
                "test_to": fmt.day(item.test_to),
                "valid_until": fmt.day(item.valid_until),
                "verified_by": fmt.person(item.verified_by),
                "href": item.get_absolute_url(),
            }
            for item in context["effectiveness"]
        ],
        "iso_controls": [
            {
                "id": iso.pk,
                "code": iso.code,
                "title": iso.title,
                "applicability": applicability(_applicability_of(iso)),
                # صفحه‌ی پیوست A فقط برای کسی که بیانیه‌ی کاربردپذیری را می‌بیند پیوند دارد.
                "href": iso.get_absolute_url() if soa else None,
            }
            for iso in context["iso_controls"]
        ],
        "risks": [risk_brief(risk) for risk in context["risks"]],
        **record_parts(control, request.user, context),
        "edit_url": reverse("controls:control_update", args=[control.pk]) if can_edit else None,
        "add_assessment_url": reverse("controls:control_assessment_create", args=[control.pk])
        if can_edit and control.is_active
        else None,
        "list_url": reverse("controls:control_list"),
    }


def _yes(value, yes="بله", no="خیر"):
    return yes if value else no


def control_assessment_detail(context, request):
    assessment, control, thresholds = context["assessment"], context["control"], context["thresholds"]
    version = assessment.method_version
    level = version.scales.get(code="E").levels.filter(value=assessment.e).first()
    age = thresholds.evidence_age(control.is_key)
    return {
        "title": f"ارزیابی اثربخشی {assessment.code}",
        "assessment": {
            "id": assessment.pk,
            "code": assessment.code,
            **effectiveness(assessment),
            "level_name": level.name if level else None,
            "control": {
                "id": control.pk,
                "code": control.code,
                "title": control.title,
                "kind": fmt.choice(control, "kind"),
                "is_key": control.is_key,
                "owner": fmt.person(control.owner),
                "href": control.get_absolute_url(),
            },
            "scope": assessment.scope,
            "exists": assessment.exists,
            "design_ok": assessment.design_ok,
            "population": assessment.population,
            "coverage_pct": plain_number(assessment.coverage_pct) if assessment.coverage_pct is not None else None,
            "critical_points": assessment.critical_points,
            "critical_points_covered": assessment.critical_points_covered,
            "exceptions": assessment.exceptions,
            "known_gap": assessment.known_gap,
            "test_method": assessment.test_method,
            "test_from": fmt.day(assessment.test_from),
            "test_to": fmt.day(assessment.test_to),
            "sample_size": assessment.sample_size,
            "sample_rationale": assessment.sample_rationale,
            "test_result": assessment.test_result,
            "operating_ok": assessment.operating_ok,
            "limited_effect_proven": assessment.limited_effect_proven,
            "failures": assessment.failures,
            "conditions": [
                {"label": "عملکرد مستمر", "value": _yes(assessment.sustained)},
                {"label": "آزمون خرابی و دورزدن", "value": _yes(assessment.failure_bypass_tested)},
                {"label": "پایش مستمر", "value": _yes(assessment.monitored)},
            ],
            "rationale": assessment.rationale,
            "confidence": fmt.choice(assessment, "confidence"),
            "verified_by": fmt.person(assessment.verified_by),
            "valid_until": fmt.deadline(assessment.valid_until),
            "evidence_age": age,
            "method_version": {"name": str(version), "href": version.get_absolute_url()},
            "created_by": fmt.person(assessment.created_by),
            "created_at": fmt.day(assessment.created_at),
        },
        # اگر بعد از ثبت چیزی عوض شده باشد، مثلاً تأییدکننده مسئول کنترل شده باشد.
        "unmet": list(context["unmet"]),
        "evidence": [
            {
                "id": item.pk,
                "code": item.code,
                "title": item.title,
                "kind": fmt.choice(item, "kind"),
                "observed_on": fmt.day(item.observed_on),
                "expired": item.is_expired,
                "href": item.get_absolute_url(),
            }
            for item in context["evidence"]
        ],
        "paths": [
            {
                "id": path.pk,
                "name": path.name,
                "assessment": {"code": path.assessment.code, "href": path.assessment.get_absolute_url()},
                "risk": {"code": path.assessment.risk.code, "title": path.assessment.risk.title},
                "href": path.get_absolute_url(),
            }
            for path in context["paths"]
        ],
        **record_parts(assessment, request.user, context),
        "edit_url": reverse("controls:control_assessment_update", args=[assessment.pk])
        if context["can_edit"]
        else None,
    }


def soa_list(context, request):
    rows = []
    for iso in context["iso_controls"]:
        item = _applicability_of(iso)
        rows.append(
            {
                "id": iso.pk,
                "code": iso.code,
                "title": iso.title,
                "title_en": iso.title_en,
                "theme": fmt.choice(iso, "theme"),
                "applicability": applicability(item),
                "control_count": iso.control_count,
                "risk_count": iso.risk_count,
                # کاربرد دارد ولی هیچ کنترل فعال سازمان به آن نگاشت نشده است.
                "gap": bool(item and item.applicable and not iso.control_count),
                "href": iso.get_absolute_url(),
            }
        )
    return {
        "title": "بیانیه‌ی کاربردپذیری",
        **listing(context, rows),
        "summary": context["summary"],
        "controls_url": reverse("controls:control_list"),
    }


def soa_detail(context, request):
    iso = context["iso_control"]
    item = context["applicability"]
    has_active = context["has_active_controls"]
    warning = None
    if item and item.applicable and not has_active:
        warning = "این کنترل کاربرد دارد ولی هیچ کنترل فعال سازمان به آن نگاشت نشده است."
    elif item and not item.applicable and has_active:
        warning = (
            "این کنترل «کاربرد ندارد» ثبت شده ولی کنترل‌های سازمانی به آن نگاشت شده‌اند؛ یکی از این دو را اصلاح کنید."
        )
    return {
        "title": str(iso),
        "iso_control": {
            "id": iso.pk,
            "code": iso.code,
            "title": iso.title,
            "title_en": iso.title_en,
            "theme": fmt.choice(iso, "theme"),
            "applicability": applicability(item),
            "justification": item.justification if item else None,
            "updated_at": fmt.day(item.updated_at) if item else None,
        },
        "warning": warning,
        "controls": [control_row(control) for control in context["controls"]],
        "risks": [risk_brief(risk) for risk in context["risks"]],
        "edit_url": reverse("controls:soa_update", args=[iso.pk]) if context["can_edit"] else None,
        "edit_label": "ویرایش" if item else "تعیین کاربرد",
        "list_url": reverse("controls:soa_list"),
    }


CONTROL_PAGES = {
    "controls:control_list": control_list,
    "controls:control_detail": control_detail,
    "controls:control_assessment_detail": control_assessment_detail,
    "controls:soa_list": soa_list,
    "controls:soa_detail": soa_detail,
}


# --- فرم ارزیابی اثربخشی ---


def control_assessment_form(context, request):
    """برگه‌ی آزمون کنترل (control_assessment_form.html): بخش‌های فرم، کارت کنترل و سطح‌ها و شرط‌های E کنارش."""
    control, thresholds, form = context["control"], context["thresholds"], context["form"]
    rows = [
        ("کنترل", str(control)),
        ("نوع", f"{control.get_kind_display()}{'، کنترل کلیدی' if control.is_key else ''}"),
        ("مسئول", control.owner.get_full_name() or control.owner.username),
    ]
    return {
        "facts": {"title": "کنترل", "rows": [{"label": label, "value": value} for label, value in rows]},
        "fieldsets": [
            {"title": title, "fields": [field.name for field in fields]} for title, fields in form.fieldsets()
        ],
        "guides": [
            {
                "title": "سطح‌های E (بخش ۱۶)",
                "items": [
                    {"term": f"E{level.value}", "label": level.name, "text": level.criteria}
                    for level in context["levels"]
                ],
                "notes": [],
            },
            {
                "title": "شرط‌ها در این نسخه‌ی روش",
                "items": [
                    {
                        "term": "",
                        "label": "E2 و بالاتر",
                        "text": "اثر واقعی کنترل با شاهد آزمون اثبات شده و روش، نتیجه و دلیل نمونه ثبت است. صرف نصب و "
                        "اجرا اعتبار کاهش ندارد. کنترل بدون شاهد E1 است.",
                    },
                    {
                        "term": "",
                        "label": "E3 و بالاتر",
                        "text": f"طراحی کافی، اثربخشی عملیاتی، پوشش دست‌کم {plain_number(thresholds.coverage)} درصد، "
                        f"همه‌ی نقاط حیاتی، بدون شکاف شناخته‌شده، نمونه‌ی دست‌کم {thresholds.sample}، و "
                        "تأییدکننده‌ای جز مسئول کنترل.",
                    },
                    {
                        "term": "",
                        "label": "E4 و E5",
                        "text": "E4: عملکرد مستمر در دوره‌ی بررسی. E5: به‌اضافه‌ی آزمون خرابی و دورزدن و پایش مستمر.",
                    },
                ],
                "notes": [
                    (
                        f"شاهد کنترل کلیدی {thresholds.key_age} روز و کنترل‌های دیگر {thresholds.other_age} روز بعد از "
                        "پایان آزمون کهنه می‌شود؛ کنترل با شاهد کهنه در Bc فقط E1 حساب می‌شود."
                    )
                ],
            },
        ],
    }
