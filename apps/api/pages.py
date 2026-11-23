"""صفحه‌های خواندنی جنگو (فهرست و پرونده) که رابط React از راه bridge.PageBridgeView نشان می‌دهد.

برای هر صفحه یک تابع، context همان صفحه‌ی جنگو را (بعد از دسترسی، فیلتر و صفحه‌بندی خود view) به JSON تبدیل
می‌کند. پس هر ردیف و هر دکمه همان است که صفحه‌ی جنگو به همین کاربر نشان می‌دهد. نشانی‌ها همان نشانی‌های جنگو‌اند
و رابط React با جدول routes.py آن‌ها را به صفحه‌ی خودش می‌برد. فقط صفحه‌های READ_PAGES از این راه باز می‌شوند.
"""

from urllib.parse import urlencode

from django.urls import reverse

from apps.workflow.models import ChangeRequest

from . import formatting as fmt
from .actions import ACTION_PAGES
from .admin_pages import ADMIN_PAGES
from .assessments import ASSESSMENT_PAGES
from .catalog import CATALOG_PAGES
from .controls import CONTROL_PAGES
from .forms import describe_field
from .listing import listing
from .methodology import METHODOLOGY_PAGES
from .monitoring import MONITORING_PAGES
from .records import record_parts
from .rows import coverage_cell, coverage_create_url, evidence_row, risk_brief, risk_ref


def evidence_list(context, request):
    return {
        "title": "شواهد",
        **listing(context, [evidence_row(item) for item in context["evidence_list"]]),
        "create_url": reverse("risks:evidence_create") if context["can_create"] else None,
    }


def evidence_detail(context, request):
    evidence = context["evidence"]
    return {
        "title": str(evidence),
        "evidence": {
            **evidence_row(evidence),
            "summary": evidence.summary,
            "source": evidence.source,
            "scope": evidence.scope,
            "valid_until": fmt.day(evidence.valid_until),
            "access_class": fmt.choice(evidence, "access_class"),
            "url": evidence.url,
            "customer": evidence.customer.name if evidence.customer_id else None,
            "owner": fmt.person(evidence.owner),
        },
        "risks": [risk_brief(risk) for risk in context["risks"]],
        **record_parts(evidence, request.user, context),
        "edit_url": reverse("risks:evidence_update", args=[evidence.pk]) if context["can_edit"] else None,
        "list_url": reverse("risks:evidence_list"),
    }


def scenario_row(scenario):
    return {
        "id": scenario.pk,
        "code": scenario.code,
        "title": scenario.title,
        "category": {"code": scenario.category.code, "name": scenario.category.name},
        "version": scenario.version,
        "is_active": scenario.is_active,
        "href": scenario.get_absolute_url(),
    }


def scenario_list(context, request):
    return {
        "title": "کتابخانه‌ی سناریوهای مرجع",
        **listing(context, [scenario_row(scenario) for scenario in context["scenarios"]]),
        "create_url": reverse("risks:scenario_create") if context["can_edit"] else None,
    }


def scenario_detail(context, request):
    scenario = context["scenario"]
    can_edit = context["can_edit"]
    return {
        "title": str(scenario),
        "scenario": {
            **scenario_row(scenario),
            "event": scenario.event,
            "conditions": scenario.conditions,
            "consequence": scenario.consequence,
            "narrative": scenario.narrative,
        },
        "risks": [risk_brief(risk) for risk in context["risks"]],
        "edit_url": reverse("risks:scenario_update", args=[scenario.pk]) if can_edit else None,
        # ریسک فقط از سناریوی فعال ساخته می‌شود.
        "create_risk_url": f"{reverse('risks:risk_create')}?scenario={scenario.pk}"
        if can_edit and scenario.is_active
        else None,
        "list_url": reverse("risks:scenario_list"),
    }


def category_list(context, request):
    can_edit = context["can_edit"]
    return {
        "title": "دسته‌های ریسک",
        **listing(
            context,
            [
                {
                    "id": category.pk,
                    "code": category.code,
                    "name": category.name,
                    "is_active": category.is_active,
                    "edit_url": reverse("risks:category_update", args=[category.pk]) if can_edit else None,
                }
                for category in context["categories"]
            ],
        ),
        "create_url": reverse("risks:category_create") if can_edit else None,
        "coverage_url": reverse("risks:coverage"),
    }


def coverage(context, request):
    """جدول «خدمت × دسته‌ی» جهان ریسک (فیگما ۰۹). ویرایش هر خانه با ?next= به همین صفحه و همین فیلترها برمی‌گردد."""
    categories = list(context["categories"])
    can_edit = context["can_edit"]
    scenarios = context["scenarios"]
    back = urlencode({"next": request.get_full_path()})
    rows = []
    for service, cells in context["rows"]:
        row_cells = [
            coverage_cell(
                cell,
                service,
                category,
                can_edit,
                back,
                coverage_create_url(service, category, scenarios) if context["can_create_risk"] else None,
            )
            for category, cell in zip(categories, cells, strict=True)
        ]
        rows.append(
            {
                "service": {
                    "id": service.pk,
                    "code": service.code,
                    "name": service.name,
                    "is_critical": service.is_critical,
                    "org_unit": str(service.org_unit),
                    "href": service.get_absolute_url(),
                },
                "cells": row_cells,
                "done": sum(1 for cell in cells if not cell.is_pending),
                "total": len(cells),
            }
        )
    # خروجی Excel همان فیلترها را می‌گیرد، بی‌صفحه‌بندی.
    query = request.GET.copy()
    for key in ("page", "size"):
        query.pop(key, None)
    export = reverse("api:coverage_export")
    page = context["page_obj"]
    return {
        "title": "جهان ریسک",
        **listing(context, rows),
        "categories": [{"id": item.pk, "code": item.code, "name": item.name} for item in categories],
        "critical": context["critical"],
        "counts": context["counts"],
        "tabs": context["tabs"],
        "size": page.paginator.per_page if page else len(rows),
        "can_edit": can_edit,
        "categories_url": reverse("risks:category_list"),
        "export_url": f"{export}?{query.urlencode()}" if query else export,
    }


def change_row(change):
    return {
        "id": change.pk,
        "kind": fmt.choice(change, "kind"),
        "status": fmt.choice(change, "status"),
        "risk": risk_ref(change.risk),
        "merge_into": risk_ref(change.merge_into) if change.merge_into_id else None,
        "owner": fmt.person(change.risk.owner),
        "proposed_by": fmt.person(change.proposed_by),
        "created_at": fmt.day(change.created_at),
        "href": change.get_absolute_url(),
    }


def change_request_list(context, request):
    return {
        "title": "درخواست‌های ادغام و تفکیک",
        **listing(context, [change_row(change) for change in context["requests"]]),
    }


def change_request_detail(context, request):
    change = context["change"]
    decision = None
    if context["can_decide"]:
        # فرم تصمیم با همان view جنگو و از راه /api/forms/ فرستاده می‌شود؛ مقدار decision از دکمه‌ی تأیید یا رد است.
        if change.kind == ChangeRequest.Kind.MERGE:
            effect = (
                f"با تأیید، ریسک {change.risk.code} با همین کد و سابقه «بسته‌شده» می‌شود و به "
                f"{change.merge_into.code} اشاره می‌کند."
            )
        else:
            effect = (
                f"با تأیید، برای هر بخش یک ریسک تازه با کد تازه و «تفکیک از {change.risk.code}» ساخته می‌شود و "
                f"{change.risk.code} با همان کد می‌ماند."
            )
        decision = {"url": change.get_absolute_url(), "effect": effect, "note": describe_field(context["form"]["note"])}
    return {
        "title": f"پیشنهاد {change.get_kind_display()} {change.risk.code}",
        "change": {
            **change_row(change),
            "part_titles": change.part_titles(),
            "parts": [{"code": part.code, "href": part.get_absolute_url()} for part in context["parts"]],
            "reason": change.reason,
            "decided_by": fmt.person(change.decided_by),
            "decided_at": fmt.day(change.decided_at),
            "decision_note": change.decision_note,
        },
        "decision": decision,
        "list_url": reverse("workflow:change_request_list"),
    }


READ_PAGES = {
    "risks:evidence_list": evidence_list,
    "risks:evidence_detail": evidence_detail,
    "risks:scenario_list": scenario_list,
    "risks:scenario_detail": scenario_detail,
    "risks:category_list": category_list,
    "risks:coverage": coverage,
    "workflow:change_request_list": change_request_list,
    "workflow:change_request_detail": change_request_detail,
    **ASSESSMENT_PAGES,
    **ACTION_PAGES,
    **MONITORING_PAGES,
    **CONTROL_PAGES,
    **CATALOG_PAGES,
    **METHODOLOGY_PAGES,
    **ADMIN_PAGES,
}
