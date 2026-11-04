"""صفحه‌های فرم جنگو که رابط React با bridge.py نشان می‌دهد و ذخیره می‌کند، و برای هر کدام چیزهایی از context همان
صفحه که کنار فرم لازم است. فقط صفحه‌های این فهرست از راه API در دسترس‌اند."""

from . import formatting as fmt


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


# نام صفحه‌ی جنگو → تابعی که چیزهای بیشتر صفحه را از context می‌خواند (یا None)، و روش‌های مجاز.
FORM_PAGES = {
    "risks:risk_create": None,
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
    "workflow:change_request_create": None,
    "core:attachment_upload": None,
    "core:comment_update": _intro,
}

# صفحه‌هایی که فقط فرمشان از راه API فرستاده می‌شود (نمایش صفحه API جدای خودش را دارد).
POST_ONLY_PAGES = {"workflow:change_request_detail", "core:comment_create"}
