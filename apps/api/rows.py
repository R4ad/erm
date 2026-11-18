"""ردیف‌هایی که چند صفحه به یک شکل نشان می‌دهند: ریسک در جدول کوتاه ریسک‌ها، شاهد در فهرست شواهد و خانه‌ی جهان ریسک."""

from urllib.parse import urlencode

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
        "category": fmt.category(risk.category),
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


def coverage_cell(cell, service, category, can_edit, back, create_url=None):
    """یک خانه‌ی جهان ریسک (risks/includes/coverage_cell.html). back همان ?next= است که ویرایش خانه بعد از ذخیره به
    آن برمی‌گردد. create_url نشانی «ثبت ریسک برای این خانه» است، برای کسی که ریسک ثبت می‌کند؛ خانه‌ی «نامرتبط» ریسک
    نمی‌پذیرد."""
    # خانه‌ی ذخیره‌شده دسته و خدمتش را جدا می‌خواند؛ همان شیء‌های جدول جای آن می‌نشیند.
    cell.service, cell.category = service, category
    return {
        "category": category.code,
        "category_name": category.name,
        "status": fmt.choice(cell, "status"),
        "summary": cell.summary,
        "reason": cell.reason,
        "reviewed_by": fmt.person(cell.reviewed_by),
        "reviewed_on": fmt.day(cell.reviewed_on),
        "risk_count": cell.risk_count,
        "risks_url": f"{reverse('risks:risk_list')}?service={service.pk}&category={category.pk}"
        if cell.risk_count
        else None,
        "edit_url": f"{reverse('risks:coverage_update', args=[service.pk, category.pk])}?{back}" if can_edit else None,
        "create_risk_url": create_url if cell.status != cell.Status.NOT_RELEVANT else None,
    }


def coverage_create_url(service, category, scenarios):
    """«ثبت ریسک برای این خانه»: ریسک همیشه از یک سناریو ثبت می‌شود. اگر این خدمت و دسته دقیقاً یک سناریوی فعال
    دارند ثبت ریسک از همان، وگرنه کتابخانه‌ی سناریو با همین خدمت و دسته."""
    matches = scenarios.get((service.pk, category.pk), [])
    if len(matches) == 1:
        return f"{reverse('risks:risk_create')}?scenario={matches[0]}"
    return f"{reverse('risks:scenario_list')}?{urlencode({'service': service.pk, 'category': category.pk})}"
