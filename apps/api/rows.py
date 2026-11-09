"""ردیف‌هایی که چند صفحه به یک شکل نشان می‌دهند: ریسک در جدول کوتاه ریسک‌ها و شاهد در فهرست شواهد."""

from . import formatting as fmt


def risk_brief(risk):
    """یک ردیف جدول ریسک‌های صفحه‌های شاهد و سناریو (risks/includes/risk_table.html)."""
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "status": fmt.choice(risk, "status"),
        "is_active": risk.is_active,
        "service": risk.service.code if risk.service_id else None,
        "category": {"code": risk.category.code, "name": risk.category.name},
        "owner": fmt.person(risk.owner),
        "href": risk.get_absolute_url(),
    }


def risk_ref(risk):
    return {
        "id": risk.pk,
        "code": risk.code,
        "title": risk.title,
        "status": fmt.choice(risk, "status"),
        "href": risk.get_absolute_url(),
    }


def evidence_row(item):
    return {
        "id": item.pk,
        "code": item.code,
        "title": item.title,
        "kind": fmt.choice(item, "kind"),
        "observed_on": fmt.day(item.observed_on),
        "reliability": fmt.choice(item, "reliability"),
        "expired": item.is_expired,
        "confidential": item.access_class == item.AccessClass.CONFIDENTIAL,
        "href": item.get_absolute_url(),
    }
