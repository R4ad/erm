"""ردیف‌هایی که چند صفحه به یک شکل نشان می‌دهند: ریسک در جدول کوتاه ریسک‌ها، شاهد در فهرست شواهد و خانه‌ی جهان ریسک."""

from django.urls import reverse

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


def coverage_cell(cell, service, category, can_edit, back):
    """یک خانه‌ی جهان ریسک (risks/includes/coverage_cell.html). back همان ?next= است که ویرایش خانه بعد از ذخیره به
    آن برمی‌گردد."""
    # خانه‌ی ذخیره‌شده دسته و خدمتش را جدا می‌خواند؛ همان شیء‌های جدول جای آن می‌نشیند.
    cell.service, cell.category = service, category
    return {
        "category": category.code,
        "category_name": category.name,
        "status": fmt.choice(cell, "status"),
        "summary": cell.summary,
        "risk_count": cell.risk_count,
        "risks_url": f"{reverse('risks:risk_list')}?service={service.pk}&category={category.pk}"
        if cell.risk_count
        else None,
        "edit_url": f"{reverse('risks:coverage_update', args=[service.pk, category.pk])}?{back}" if can_edit else None,
    }
