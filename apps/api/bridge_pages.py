"""صفحه‌های فرم جنگو که رابط React با bridge.py نشان می‌دهد و ذخیره می‌کند، و برای هر کدام چیزهایی از context همان
صفحه که کنار فرم لازم است. فقط صفحه‌های این فهرست از راه API در دسترس‌اند."""

from . import formatting as fmt
from .assessments import impact_forms, impact_profile, initiator_form, path_form


def _transition(context, request):
    risk, transition = context["risk"], context["transition"]
    return {
        "risk": {"id": risk.pk, "code": risk.code, "title": risk.title, "status": fmt.choice(risk, "status")},
        "transition": {
            "label": transition.label,
            "description": transition.description,
            "source": risk.get_status_display(),
            "target": transition.target_label,
        },
        "problems": [str(problem) for problem in context["problems"]],
        "submit": transition.label,
    }


def _coverage(context, request):
    cell = context["cell"]
    return {
        "cell": {
            "service": {"code": cell.service.code, "name": cell.service.name},
            "category": {"code": cell.category.code, "name": cell.category.name},
            "status": fmt.choice(cell, "status"),
            "reviewed_by": fmt.person(cell.reviewed_by),
            "reviewed_on": fmt.day(cell.reviewed_on),
        },
        "risks": [
            {
                "id": risk.pk,
                "code": risk.code,
                "title": risk.title,
                "owner": fmt.person(risk.owner),
                "href": risk.get_absolute_url(),
            }
            for risk in context["cell_risks"]
        ],
        "next": context.get("next") or "",
    }


def _intro(context, request):
    return {"intro": str(context["intro"])} if context.get("intro") else {}


def _scenario_for_risk(context, request):
    scenario = context["scenario"]
    rows = [
        ("کد", scenario.code), ("نسخه", str(scenario.version)), ("عنوان", scenario.title),
        ("خدمت یا فرآیند", f"{scenario.service.code} - {scenario.service_name_snapshot or scenario.service.name}"),
        ("عامل و وضعیت", scenario.conditions), ("رویداد مشخص", scenario.event),
        ("هدف یا تعهد", scenario.objective), ("داتین یا مشتری", scenario.customer_text),
        ("نوع و دامنه پیامد", scenario.consequence), ("دسته", str(scenario.category)), ("وضعیت", "فعال"),
        ("متن سناریو", scenario.narrative),
    ]
    return {"facts": {"title": "جزئیات سناریو", "rows": [{"label": label, "value": value} for label, value in rows]}}


def _submit(label):
    """فقط دکمه‌ی فرستادن برچسب دیگری از «ذخیره» دارد."""
    return lambda context, request: {"submit": label}


# نام صفحه‌ی جنگو → تابعی که چیزهای بیشتر صفحه را از context می‌خواند (یا None). title و cancel_url آن تابع، اگر
# باشد، جای title و cancel_url خود context را می‌گیرد؛ برای صفحه‌هایی که قالب اختصاصی دارند و آن دو را ندارند.
FORM_PAGES = {
    "risks:risk_create": _scenario_for_risk,
    "risks:risk_update": None,
    "risks:link_create": None,
    "risks:link_update": None,
    "risks:evidence_create": None,
    "risks:evidence_update": None,
    "risks:scenario_create": None,
    "risks:scenario_update": None,
    "risks:category_create": None,
    "risks:category_update": None,
    "risks:coverage_update": _coverage,
    "workflow:transition": _transition,
    "workflow:change_request_create": _submit("ثبت پیشنهاد"),
    "core:attachment_upload": _submit("بارگذاری پیوست"),
    "core:comment_update": _intro,
    "assessments:assessment_create": None,
    "assessments:assessment_update": None,
    "assessments:initiator": initiator_form,
    "assessments:path_create": path_form,
    "assessments:path_update": path_form,
    "assessments:impact_profile": impact_profile,
}

# صفحه‌هایی که به‌جای یک form چند فرم با پیشوند دارند؛ خطاهای فرستادن ناموفق از همه‌ی این فرم‌ها خوانده می‌شود.
FORM_SETS = {"assessments:impact_profile": impact_forms}

# صفحه‌هایی که فقط فرمشان از راه API فرستاده می‌شود (نمایش صفحه API جدای خودش را دارد).
POST_ONLY_PAGES = {
    "workflow:change_request_detail",
    "core:comment_create",
    "assessments:submit",
    "assessments:review",
    "assessments:referral",
    "assessments:path_delete",
}
