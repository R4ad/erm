"""کاتالوگ (بانک‌ها، خدمات، تعهدها، تأمین‌کنندگان و دارایی‌ها) و ساختار سازمانی در رابط React
(apps/catalog/templates/catalog/ و organization/unit_list.html).

مثل pages.py، هر تابع context همان view جنگو را به JSON می‌دهد. هر رکورد همان است که view به همین کاربر نشان می‌دهد و
هر دکمه فقط وقتی نشانی دارد که صفحه‌ی جنگو همان دکمه را نشان می‌دهد.
"""

from urllib.parse import urlencode

from django.urls import reverse

from apps.core.templatetags.formatting import minutes
from apps.risks.services import active_categories

from . import formatting as fmt
from .listing import listing
from .rows import coverage_cell, risk_brief


def validity(record):
    """catalog/includes/validity.html: بازه‌ی اعتبار و منقضی بودن."""
    return {"from": fmt.day(record.valid_from), "until": fmt.day(record.valid_until), "expired": record.is_expired}


def _edit(name, pk, can_edit, query=""):
    return f"{reverse(name, args=[pk])}{query}" if can_edit else None


# --- بانک‌ها ---


def customer_list(context, request):
    can_edit = context["can_edit"]
    rows = [
        {
            "id": customer.pk,
            "name": customer.name,
            "is_key": customer.is_key,
            "financial_basis": customer.financial_basis,
            "is_active": customer.is_active,
            "edit_url": _edit("catalog:customer_update", customer.pk, can_edit),
        }
        for customer in context["customers"]
    ]
    return {
        "title": "بانک‌ها",
        **listing(context, rows),
        "create_url": reverse("catalog:customer_create") if can_edit else None,
    }


# --- خدمات ---


def service_row(service):
    return {
        "id": service.pk,
        "code": service.code,
        "name": service.name,
        "kind": fmt.choice(service, "kind"),
        "org_unit": str(service.org_unit),
        "owner": fmt.person(service.owner),
        "lifecycle_stage": fmt.choice(service, "lifecycle_stage"),
        "is_critical": service.is_critical,
        "is_active": service.is_active,
        "href": service.get_absolute_url(),
    }


def service_list(context, request):
    return {
        "title": "خدمات و فرایندها",
        **listing(context, [service_row(service) for service in context["services"]]),
        "create_url": reverse("catalog:service_create") if context["can_edit"] else None,
    }


def dependents(context):
    """catalog/includes/dependents_table.html: خدمت‌هایی که کاربر می‌بیند و به این رکورد وابسته‌اند."""
    return [
        {
            "id": dependency.pk,
            "service": {
                "code": dependency.service.code,
                "name": dependency.service.name,
                "is_critical": dependency.service.is_critical,
                "href": dependency.service.get_absolute_url(),
            },
            "is_shared_point": dependency.is_shared_point,
            "description": dependency.description,
            "validity": validity(dependency),
        }
        for dependency in context["dependents"]
    ]


BOUNDARY = [
    ("مالک زیرساخت", "infra_owner"),
    ("اجراکننده‌ی کنترل", "control_operator"),
    ("ارائه‌دهنده‌ی شاهد", "evidence_provider"),
    ("تصمیم‌گیر تغییر", "change_authority"),
]


def _boundary(dependency):
    """مرز مسئولیت یک وابستگی، یا None اگر هیچ‌کدام از پنج پرسش جواب ندارد."""
    if not dependency.has_boundary:
        return None
    rows = [{"label": label, "value": getattr(dependency, f"get_{name}_display")() or "-"} for label, name in BOUNDARY]
    rows.append({"label": "مخاطب اعلام رخداد", "value": dependency.incident_contact or "-"})
    return rows


def _duration(value):
    return minutes(value) or None


def service_detail(context, request):
    service = context["service"]
    can_edit = context["can_edit"]
    back = f"?service={service.pk}"
    coverage = None
    if service.is_active:
        # همان خانه‌های جدول جهان ریسک برای همین خدمت؛ ویرایش هر خانه با ?next= به همین صفحه برمی‌گردد.
        next_query = urlencode({"next": request.get_full_path()})
        cells = [
            coverage_cell(cell, service, category, context["can_edit_coverage"], next_query)
            for category, cell in zip(active_categories(), context["coverage"], strict=True)
        ]
        coverage = {"cells": cells, "table_url": f"{reverse('risks:coverage')}?{urlencode({'q': service.code})}"}
    return {
        "title": str(service),
        "service": {
            **service_row(service),
            "description": service.description,
            "environment": fmt.choice(service, "environment"),
        },
        "commitments": [
            {
                "id": commitment.pk,
                "title": commitment.title,
                "description": commitment.description,
                "kind": fmt.choice(commitment, "kind"),
                "clause_ref": commitment.clause_ref,
                "customer": commitment.customer.name if commitment.customer_id else None,
                "owner": fmt.person(commitment.owner),
                "validity": validity(commitment),
                "edit_url": _edit("catalog:commitment_update", commitment.pk, can_edit, back),
            }
            for commitment in context["commitments"]
        ],
        "add_commitment_url": f"{reverse('catalog:commitment_create')}{back}" if can_edit else None,
        "dependencies": [
            {
                "id": dependency.pk,
                "target_kind": str(dependency.target_kind),
                "target": str(dependency.target),
                # نام خدمت بالادستی همیشه هست، ولی پیوندش فقط اگر کاربر آن خدمت را می‌بیند.
                "target_url": dependency.target_url,
                "is_shared_point": dependency.is_shared_point,
                "description": dependency.description,
                "alternative": dependency.alternative,
                "boundary": _boundary(dependency),
                "validity": validity(dependency),
                "edit_url": _edit("catalog:dependency_update", dependency.pk, can_edit),
            }
            for dependency in context["dependencies"]
        ],
        "add_dependency": [
            {"label": label, "href": reverse("catalog:dependency_create", args=[service.pk, kind])}
            for kind, label in [("service", "به خدمت دیگر"), ("supplier", "به تأمین‌کننده"), ("asset", "به دارایی")]
        ]
        if can_edit
        else [],
        "dependents": dependents(context),
        "customer_links": [
            {
                "id": link.pk,
                "customer": link.customer.name,
                "is_key": link.customer.is_key,
                "tolerance_notes": link.tolerance_notes,
                "rto": _duration(link.rto_minutes),
                "mtpd": _duration(link.mtpd_minutes),
                "rpo": _duration(link.rpo_minutes),
                "bia_reference": link.bia_reference,
                "validity": validity(link),
                "edit_url": _edit("catalog:service_customer_update", link.pk, can_edit),
            }
            for link in context["customer_links"]
        ],
        "add_customer_url": reverse("catalog:service_customer_create", args=[service.pk]) if can_edit else None,
        "coverage": coverage,
        "risks": [risk_brief(risk) for risk in context["risks"]],
        # ریسک از سناریو ثبت می‌شود و فقط برای خدمت فعال.
        "create_risk_url": reverse("risks:scenario_list") if context["can_edit_risks"] and service.is_active else None,
        "edit_url": _edit("catalog:service_update", service.pk, can_edit),
        "list_url": reverse("catalog:service_list"),
    }


# --- تأمین‌کنندگان ---


def supplier_row(supplier):
    return {
        "id": supplier.pk,
        "name": supplier.name,
        "description": supplier.description,
        "is_critical": supplier.is_critical,
        "contract_owner": fmt.person(supplier.contract_owner),
        "is_active": supplier.is_active,
        "href": supplier.get_absolute_url(),
    }


def supplier_list(context, request):
    return {
        "title": "تأمین‌کنندگان",
        **listing(context, [supplier_row(supplier) for supplier in context["suppliers"]]),
        "create_url": reverse("catalog:supplier_create") if context["can_edit"] else None,
    }


def supplier_detail(context, request):
    supplier = context["supplier"]
    return {
        "title": str(supplier),
        "supplier": supplier_row(supplier),
        "dependents": dependents(context),
        "edit_url": _edit("catalog:supplier_update", supplier.pk, context["can_edit"]),
        "list_url": reverse("catalog:supplier_list"),
    }


# --- دارایی‌ها ---


def asset_row(asset):
    return {
        "id": asset.pk,
        "code": asset.code,
        "name": asset.name,
        "kind": fmt.choice(asset, "kind"),
        "org_unit": str(asset.org_unit),
        "owner": fmt.person(asset.owner),
        "data_class": fmt.choice(asset, "data_class"),
        # حرف‌های تیک‌خورده‌ی محرمانگی، صحت و دسترس‌پذیری، تا رابط هر کدام را جدا نشان دهد.
        "cia": [letter for letter, checked in [("C", asset.cia_c), ("I", asset.cia_i), ("A", asset.cia_a)] if checked],
        "is_active": asset.is_active,
        "href": asset.get_absolute_url(),
    }


def asset_list(context, request):
    return {
        "title": "دارایی‌ها",
        **listing(context, [asset_row(asset) for asset in context["assets"]]),
        "create_url": reverse("catalog:asset_create") if context["can_edit"] else None,
    }


def asset_detail(context, request):
    asset = context["asset"]
    return {
        "title": str(asset),
        "asset": asset_row(asset),
        "dependents": dependents(context),
        "edit_url": _edit("catalog:asset_update", asset.pk, context["can_edit"]),
        "list_url": reverse("catalog:asset_list"),
    }


# --- تعهدها ---


def commitment_list(context, request):
    can_edit = context["can_edit"]
    rows = [
        {
            "id": commitment.pk,
            "title": commitment.title,
            "description": commitment.description,
            "kind": fmt.choice(commitment, "kind"),
            "clause_ref": commitment.clause_ref,
            # فقط خدمت‌هایی که کاربر می‌بیند (Prefetch همان view).
            "services": [
                {"code": service.code, "href": service.get_absolute_url()} for service in commitment.services.all()
            ],
            "customer": commitment.customer.name if commitment.customer_id else None,
            "owner": fmt.person(commitment.owner),
            "validity": validity(commitment),
            "edit_url": _edit("catalog:commitment_update", commitment.pk, can_edit),
        }
        for commitment in context["commitments"]
    ]
    return {
        "title": "تعهدها",
        **listing(context, rows),
        "create_url": reverse("catalog:commitment_create") if can_edit else None,
    }


# --- ساختار سازمانی ---


def unit_list(context, request):
    can_edit = context["can_edit"]
    rows = [
        {
            "id": unit.pk,
            "name": unit.name,
            "code": unit.code,
            "depth": unit.depth,
            "managers": [fmt.person(manager) for manager in unit.managers.all()],
            "is_active": unit.is_active,
            "edit_url": _edit("organization:unit_update", unit.pk, can_edit),
        }
        for unit in context["units"]
    ]
    return {
        "title": "ساختار سازمانی",
        **listing(context, rows),
        "create_url": reverse("organization:unit_create") if can_edit else None,
    }


CATALOG_PAGES = {
    "catalog:customer_list": customer_list,
    "catalog:service_list": service_list,
    "catalog:service_detail": service_detail,
    "catalog:supplier_list": supplier_list,
    "catalog:supplier_detail": supplier_detail,
    "catalog:asset_list": asset_list,
    "catalog:asset_detail": asset_detail,
    "catalog:commitment_list": commitment_list,
    "organization:unit_list": unit_list,
}
