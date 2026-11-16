"""«تعریف متدولوژی» در رابط React (فیگما ۱۷): مجموعه‌ی پارامتر نسخه‌دار روش. نسخه‌ها، تغییرات نسبت به نسخه‌ی پایه،
گردش تصویب، طبقه‌بندی، پارامترهای پایه، جدول A × B، آستانه‌ی سطوح و قواعد تقدم، اشتها و مرجع مجاز، ابعاد پیامد و
پارامترهای پایش. متولی روش پیش‌نویس می‌سازد، پارامترهایش را عوض می‌کند و برای تصویب می‌فرستد؛ تصویب و فعال‌سازی
همان سرویس‌های پنل مدیریت است."""

from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework.response import Response

from apps.assessments.models import Assessment
from apps.assessments.services import FINANCIAL_SCALE
from apps.methodology.models import MethodParameter, MethodVersion, PeriodUnit, RiskLevel, Scale
from apps.methodology.permissions import can_manage_method, visible_versions
from apps.methodology.services import copy_version, save_with_reason, set_parameters, submit_version
from apps.risks.models import Risk, RiskCategory

from . import formatting as fmt
from .base import ApiView
from .treatment import fa

K = MethodParameter.Key
ST = MethodVersion.Status
BASE_KEYS = [K.HORIZON, K.INPUT_RETURN, K.A_DATA_PERIOD, K.A_DATA_COVERAGE]
IMPACT_KEYS = [K.S_RTO_FRACTION, K.S_PROVISIONAL_LEVEL]
APPETITE_KEYS = [K.REMINDER_FIRST, K.REMINDER_SECOND]
GROUPS = {
    "base": "پارامترهای پایه",
    "likelihood": "احتمال",
    "impact": "پیامد",
    "levels": "سطح و تصمیم",
    "appetite": "اشتها و پذیرش",
    "monitoring": "پایش",
}
# دوره‌های بازبینی به زبان سند: «ماهانه»، «سه‌ماهه»...
PERIOD_NAMES = {
    (1, PeriodUnit.WEEK): "هفتگی",
    (1, PeriodUnit.MONTH): "ماهانه",
    (3, PeriodUnit.MONTH): "سه‌ماهه",
    (6, PeriodUnit.MONTH): "شش‌ماهه",
    (12, PeriodUnit.MONTH): "سالانه",
}
AUTHORITY = {
    RiskLevel.CoApprover.NONE: "مالک ریسک",
    RiskLevel.CoApprover.UPPER_MANAGER: "مالک + مدیر بالادست",
    RiskLevel.CoApprover.SECURITY_COMMITTEE: "مالک + کمیته امنیت",
}


def group_of(key):
    if key in BASE_KEYS:
        return "base"
    if key in IMPACT_KEYS:
        return "impact"
    if key in APPETITE_KEYS:
        return "appetite"
    return "monitoring"


def period(value, unit):
    if not value:
        return None
    return f"{fa(value)} {PeriodUnit(unit).label}"


def cycle(value, unit):
    return PERIOD_NAMES.get((value, unit)) or period(value, unit)


def param_text(row):
    return f"{fa(row.value_display)} {row.unit}".strip() if row else "—"


def reminders(params, level):
    """یادآوری‌های انقضای پذیرش؛ یادآوری‌ای که از خود اعتبار پذیرش بلندتر است برای آن سطح معنی ندارد."""
    days = [params[key].value for key in APPETITE_KEYS if key in params]
    validity = level.acceptance_value * {"day": 1, "working_day": 1, "week": 7, "month": 30}.get(
        level.acceptance_unit, 1
    )
    days = [int(day) for day in days if day < validity]
    if not days:
        return "—"
    return f"{' و '.join(fa(day) for day in days)} روز"


# ─────────────────────────────── مقایسه ───────────────────────────────


def level_fields(level, params):
    plan = period(level.plan_value, level.plan_unit)
    containment = period(level.containment_value, level.containment_unit)
    return {
        "range": f"{fa(level.min_score)}–{fa(level.max_score)}",
        "authority": "کمیته امنیت · ارجاع فوری" if containment else AUTHORITY[level.co_approver],
        "plan": f"مهار {containment} · طرح {plan}" if containment else plan,
        "acceptance": period(level.acceptance_value, level.acceptance_unit),
        "review": cycle(level.review_value, level.review_unit),
        "reminder": reminders(params, level),
    }


LEVEL_FIELD_LABELS = {
    "range": "بازه‌ی امتیاز",
    "authority": "مرجع مجاز",
    "plan": "مهلت طرح",
    "acceptance": "اعتبار پذیرش",
    "review": "بازبینی دوره‌ای",
    "reminder": "یادآوری انقضای پذیرش",
}


def changes(version, base):
    """تغییرات این نسخه نسبت به نسخه‌ی پایه: [{group, label, before, after}]. نسخه‌ی بی‌پایه تغییری ندارد."""
    if base is None:
        return []
    rows = []
    mine, theirs = params_of(version), params_of(base)
    for key, row in mine.items():
        other = theirs.get(key)
        if other is None or other.value != row.value:
            rows.append(
                {
                    "key": f"param:{key}",
                    "group": group_of(key),
                    "label": row.get_key_display(),
                    "before": param_text(other),
                    "after": param_text(row),
                }
            )
    old_levels = {level.rank: level for level in base.risk_levels.all()}
    reminder_seen = False
    for level in version.risk_levels.all():
        other = old_levels.get(level.rank)
        if other is None:
            continue
        new, old = level_fields(level, mine), level_fields(other, theirs)
        for field, label in LEVEL_FIELD_LABELS.items():
            if new[field] == old[field]:
                continue
            if field == "reminder":
                if reminder_seen or any(row["key"].startswith("param:reminder") for row in rows):
                    continue  # یادآوری از پارامتر می‌آید و یک بار گزارش می‌شود
                reminder_seen = True
            rows.append(
                {
                    "key": f"level:{level.rank}:{field}",
                    "group": "levels" if field == "range" else "appetite",
                    "label": f"{label} سطح {level.name}",
                    "before": old[field] or "—",
                    "after": new[field] or "—",
                }
            )
    old_cells = {(cell.a, cell.b): cell.likelihood for cell in base.likelihood_cells.all()}
    moved = sum(1 for cell in version.likelihood_cells.all() if old_cells.get((cell.a, cell.b)) != cell.likelihood)
    if moved:
        rows.append(
            {
                "key": "likelihood",
                "group": "likelihood",
                "label": "جدول احتمال A × B",
                "before": "—",
                "after": f"{fa(moved)} خانه",
            }
        )
    old_floors = {(floor.min_impact, floor.min_level.rank) for floor in base.impact_floors.select_related("min_level")}
    new_floors = {
        (floor.min_impact, floor.min_level.rank) for floor in version.impact_floors.select_related("min_level")
    }
    if old_floors != new_floors:
        rows.append(
            {
                "key": "floors",
                "group": "levels",
                "label": "قواعد کف پیامد",
                "before": fa(len(old_floors)),
                "after": fa(len(new_floors)),
            }
        )
    return rows


def params_of(version):
    return {row.key: row for row in version.parameters.all()}


# ─────────────────────────────── بخش‌ها ───────────────────────────────


def version_row(version, current):
    linked = Assessment.objects.filter(method_version=version)
    if version.status == ST.DRAFT:
        changed = len(changes(version, version.based_on)) if version.based_on_id else 0
        state = "در انتظار بازبینی روش‌شناختی" if version.submitted_at else "در دست ویرایش"
        note = f"{fa(changed)} تغییر · {state}"
        date = version.submitted_at or version.updated_at
    elif version.status == ST.APPROVED:
        note = f"تصویب {version.approval_ref} · آماده‌ی فعال‌سازی"
        date = version.approved_on
    elif version.status == ST.ACTIVE:
        approval = f"تصویب {version.approval_ref}" if version.approved_on else "نسخه‌ی آزمایشی بدون تصویب"
        current_count = linked.filter(kind=Assessment.Kind.CURRENT).count()
        note = f"{approval} · {fa(current_count)} ارزیابی جاری به این نسخه پیوند دارند"
        date = version.activated_at
    else:
        note = f"{fa(linked.count())} ارزیابی تاریخی · فقط خواندنی"
        date = version.activated_at
    return {
        "number": version.number,
        "name": f"v{version.number}",
        "title": version.title,
        "status": fmt.choice(version, "status"),
        "date": fmt.day(date.date() if hasattr(date, "date") else date) if date else None,
        "note": note,
        "current": version.pk == current.pk,
    }


def approval_steps(version):
    """گردش تصویب: پیش‌نویس ← بازبینی روش‌شناختی ← تصویب مرجع مجاز ← انتشار."""
    draft = version.status == ST.DRAFT
    submitted = version.submitted_at is not None
    approved = version.approved_on is not None
    used = version.status in (ST.ACTIVE, ST.ARCHIVED)

    def state(done, current):
        return "done" if done else "current" if current else "locked"

    steps = [
        {
            "key": "draft",
            "title": "پیش‌نویس",
            "note": f"متولی روش · {fa(fmt.day(version.created_at.date())['jalali'])}",
            "state": state(not draft or submitted, draft and not submitted),
        },
        {
            "key": "review",
            "title": "بازبینی روش‌شناختی امنیت",
            "note": f"ارسال {fmt.person(version.submitted_by)['name']} · {fa(fmt.day(version.submitted_at.date())['jalali'])}"
            if submitted
            else "کارشناس ریسک",
            "state": state(approved or (used and not version.is_trial), draft and submitted),
        },
        {
            "key": "approval",
            "title": "تصویب مرجع مجاز",
            "note": f"نامه‌ی {version.approval_ref} · {fa(fmt.day(version.approved_on)['jalali'])}"
            if approved
            else ("نسخه‌ی آزمایشی؛ تصویب ثبت نشده" if version.is_trial else "کمیته امنیت"),
            "state": "skipped" if version.is_trial else state(approved, False),
        },
        {
            "key": "publish",
            "title": "انتشار",
            "note": f"فعال از {fa(fmt.day(version.activated_at.date())['jalali'])}"
            if version.activated_at
            else "فقط ارزیابی‌های جدید یا بازسنجی‌شده",
            "state": state(used, version.status == ST.APPROVED),
        },
    ]
    return steps


def parameter_rows(version, base, keys=None):
    theirs = params_of(base) if base else {}
    rows = []
    for row in version.parameters.all():
        if keys is not None and row.key not in keys:
            continue
        other = theirs.get(row.key)
        rows.append(
            {
                "key": row.key,
                "label": row.get_key_display(),
                "group": group_of(row.key),
                "value": row.value_display,
                "unit": row.unit,
                "text": param_text(row),
                "note": row.note,
                "before": param_text(other) if other is not None and other.value != row.value else None,
            }
        )
    return rows


def likelihood(version, base):
    cells = {(cell.a, cell.b): cell.likelihood for cell in version.likelihood_cells.all()}
    old = {(cell.a, cell.b): cell.likelihood for cell in base.likelihood_cells.all()} if base else cells
    l_scale = version.scales.filter(code="L").prefetch_related("levels").first()
    return {
        "rows": [
            {
                "a": a,
                "cells": [
                    {"b": b, "l": cells.get((a, b)), "changed": old.get((a, b)) != cells.get((a, b))}
                    for b in range(1, 6)
                ],
            }
            for a in range(1, 6)
        ],
        "names": [{"value": level.value, "name": level.name} for level in l_scale.levels.all()] if l_scale else [],
        "source": version.source,
        "changed": sum(1 for key, value in cells.items() if old.get(key) != value),
    }


def levels(version):
    return {
        "levels": [
            {
                "rank": level.rank,
                "name": level.name,
                "min": level.min_score,
                "max": level.max_score,
                "color": level.color,
                "text_color": level.text_color,
            }
            for level in version.risk_levels.all()
        ],
        "rules": [
            *[
                {
                    "key": f"floor-{floor.min_impact}",
                    "title": f"کف پیامد {fa(floor.min_impact)} ← حداقل «{floor.min_level.name}»",
                    "note": "عدد خام تغییر نمی‌کند؛ علت ارتقا ثبت می‌شود"
                    if floor.min_level.rank >= 3
                    else f"مثال: L1 × I{floor.min_impact} = {fa(floor.min_impact)} در سطح {floor.min_level.name}",
                    "source": "version",
                }
                for floor in version.impact_floors.select_related("min_level").order_by("-min_impact")
            ],
            {
                "key": "incident",
                "title": "رویداد در حال وقوع ← اولویت بحرانی",
                "note": "ارجاع هم‌زمان به مدیریت رخداد",
                "source": "system",
            },
            {
                "key": "prohibition",
                "title": "منع الزام‌آور ← خارج از اختیار پذیرش",
                "note": "تعیین دامنه و اقدام مجاز توسط حقوقی",
                "source": "system",
            },
        ],
    }


def appetite(version, base):
    mine = params_of(version)
    theirs = params_of(base) if base else mine
    old_levels = {level.rank: level for level in base.risk_levels.all()} if base else {}
    rows = []
    for level in version.risk_levels.all():
        fields = level_fields(level, mine)
        other = old_levels.get(level.rank)
        before = level_fields(other, theirs) if other else fields
        rows.append(
            {
                "rank": level.rank,
                "level": {"name": level.name, "color": level.color, "rank": level.rank},
                **{field: fields[field] for field in ("authority", "plan", "acceptance", "review", "reminder")},
                "changed": [
                    field
                    for field in ("authority", "plan", "acceptance", "review", "reminder")
                    if fields[field] != before[field]
                ],
            }
        )
    return rows


def impact_scales(version):
    return [
        {
            "code": scale.code,
            "name": scale.name,
            "scope": scale.scope,
            "stakeholders": ["داتین"] if scale.code == FINANCIAL_SCALE else ["داتین", "مشتری"],
            "levels": scale.level_count,
        }
        for scale in version.scales.filter(kind=Scale.Kind.IMPACT)
        .annotate(level_count=Count("levels"))
        .order_by("order")
    ]


def categories():
    counts = Risk.objects.filter(merged_into__isnull=True).exclude(status=Risk.Status.REJECTED)
    return [
        {"code": category.code, "name": category.name, "risks": category.risk_count}
        for category in RiskCategory.objects.annotate(risk_count=Count("risks", filter=Q(risks__in=counts))).order_by(
            "code"
        )
    ]


def pick_version(user, number):
    versions = visible_versions(user)
    if number:
        return get_object_or_404(versions, number=number)
    # متولی روش اول پیش‌نویس در دست کار را می‌بیند؛ بقیه نسخه‌ی فعال را.
    if can_manage_method(user):
        draft = versions.filter(status__in=[ST.DRAFT, ST.APPROVED]).order_by("-number").first()
        if draft:
            return draft
    return versions.filter(status=ST.ACTIVE).first() or get_object_or_404(versions.order_by("-number")[:1])


def page(user, version):
    base = version.based_on
    manage = can_manage_method(user)
    versions = list(visible_versions(user).order_by("-number"))
    has_draft = any(other.status in (ST.DRAFT, ST.APPROVED) for other in versions)
    active = next((other for other in versions if other.status == ST.ACTIVE), None)
    found = changes(version, base)
    return {
        "version": {
            "number": version.number,
            "name": f"v{version.number}",
            "title": version.title,
            "status": fmt.choice(version, "status"),
            "is_trial": version.is_trial,
            "based_on": f"v{base.number}" if base else None,
            "saved": fmt.day(version.updated_at.date()),
            "submitted": version.submitted_at is not None,
            "editable": manage and version.is_editable_draft,
            "reference": reverse("methodology:version_reference", args=[version.number]),
            "change_notes": version.change_notes,
        },
        "can_submit": manage and version.is_editable_draft,
        "can_copy": manage and not has_draft and active is not None,
        "copy_from": f"v{active.number}" if active else None,
        "versions": [version_row(other, version) for other in versions],
        "changes": found,
        "groups": [
            {"key": key, "label": label, "changes": sum(1 for row in found if row["group"] == key)}
            for key, label in GROUPS.items()
        ],
        "approval": approval_steps(version),
        "categories": categories(),
        "parameters": parameter_rows(version, base),
        "likelihood": likelihood(version, base),
        "levels": levels(version),
        "appetite": appetite(version, base),
        "impact_scales": impact_scales(version),
        "admin_url": reverse("admin:methodology_methodversion_change", args=[version.pk])
        if user.is_system_admin
        else None,
    }


class MethodDefinitionView(ApiView):
    def get(self, request):
        number = request.query_params.get("version")
        version = pick_version(request.user, int(number) if number and number.isdigit() else None)
        return Response(page(request.user, version))


def managed_version(request, number):
    if not can_manage_method(request.user):
        return None, Response({"detail": "فقط متولی روش این کار را می‌کند."}, status=403)
    return get_object_or_404(visible_versions(request.user), number=number), None


class MethodParametersView(ApiView):
    def post(self, request, number):
        version, denied = managed_version(request, number)
        if denied:
            return denied
        raw = request.data.get("values")
        if not isinstance(raw, dict) or not raw:
            return Response({"detail": "مقداری فرستاده نشده است."}, status=400)
        values, errors = {}, {}
        for key, value in raw.items():
            try:
                values[key] = Decimal(str(value).strip().translate(str.maketrans("۰۱۲۳۴۵۶۷۸۹٫", "0123456789.")))
            except InvalidOperation:
                errors[key] = ["عدد معتبر نیست."]
        if errors:
            return Response({"errors": errors}, status=400)
        try:
            changed = set_parameters(version, values, request.user)
        except ValidationError as error:
            return Response({"detail": "؛ ".join(error.messages)}, status=400)
        version.refresh_from_db()
        return Response({"changed": changed, "page": page(request.user, version)})


class MethodSubmitView(ApiView):
    def post(self, request, number):
        version, denied = managed_version(request, number)
        if denied:
            return denied
        notes = request.data.get("change_notes")
        try:
            if isinstance(notes, str) and version.is_editable_draft:
                version.change_notes = notes.strip()
                save_with_reason(version, request.user, "شرح تغییرات")
            submit_version(version, request.user)
        except ValidationError as error:
            return Response({"detail": "؛ ".join(error.messages)}, status=400)
        version.refresh_from_db()
        return Response(page(request.user, version))


class MethodCopyView(ApiView):
    def post(self, request, number):
        version, denied = managed_version(request, number)
        if denied:
            return denied
        if version.status != ST.ACTIVE:
            return Response({"detail": "پیش‌نویس تازه فقط از نسخه‌ی فعال ساخته می‌شود."}, status=400)
        if MethodVersion.objects.filter(status__in=[ST.DRAFT, ST.APPROVED]).exists():
            return Response(
                {"detail": "یک پیش‌نویس یا نسخه‌ی تصویب‌شده‌ی فعال‌نشده هست؛ اول همان را تمام کنید."}, status=400
            )
        copy = copy_version(version, request.user)
        return Response(page(request.user, copy), status=201)
