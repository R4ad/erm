"""«ویرایش بُعد پیامد» (فیگما ۲۷): سطوح یک بُعد پیامد در یک نسخه‌ی روش با معیار و برچسب‌های کوتاه، ذی‌نفعان پیامد،
قواعد تکمیلی، تاریخچه‌ی سطوح بُعد در نسخه‌ها و ماشین‌حساب نمونه‌ی بُعد S. متولی روش فقط سطوح پیش‌نویس در دست ویرایش
را عوض می‌کند و هر تغییر با تاریخچه ثبت می‌شود."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.response import Response

from apps.assessments.services import FINANCIAL_SCALE
from apps.catalog.models import Service
from apps.methodology.models import MethodParameter, MethodVersion, Scale
from apps.methodology.permissions import can_manage_method, visible_versions
from apps.methodology.services import parameter, save_with_reason

from .action_verification import jalali
from .base import ApiView
from .treatment import fa

ST = MethodVersion.Status
DURATION_SCALE = "S"
TAG_SEPARATOR = "؛"


def tags_of(level):
    return [tag.strip() for tag in level.tags.split(TAG_SEPARATOR) if tag.strip()]


def levels_of(scale):
    return [
        {"id": level.pk, "value": level.value, "criteria": level.criteria, "tags": tags_of(level)}
        for level in scale.levels.order_by("value")
    ]


def chip(version):
    if version.status == ST.DRAFT:
        return {"label": f"پیش‌نویس v{version.number}", "tone": "warning"}
    if version.status == ST.ACTIVE:
        return {"label": f"فعال v{version.number}", "tone": "success"}
    return {"label": f"{version.get_status_display()} v{version.number}", "tone": "neutral"}


def rules(scale):
    """قواعد تکمیلی بُعد از متن راهنمای نسخه: هر بند «•» یک قاعده است."""
    found = []
    for line in scale.guidance.splitlines():
        line = line.strip()
        if line.startswith("•"):
            found.append(line.lstrip("• ").strip())
    return found


def stakeholders(scale):
    """ذی‌نفعان پیامد بُعد طبق قواعد روش (بخش ۸)؛ در این نسخه از قواعد موتور می‌آیند و از این صفحه عوض نمی‌شوند."""
    per_customer = scale.code != FINANCIAL_SCALE
    return [
        {"key": "datin", "label": "داتین", "note": "پیامد خدمت برای خود سازمان", "on": True},
        {
            "key": "customer",
            "label": "هر بانک مشتری مهم",
            "note": "ارزیابی جداگانه برای هر بانک" if per_customer else "زیان مالی فقط برای داتین سنجیده می‌شود",
            "on": per_customer,
        },
        {"key": "aggregate", "label": "جمع پیامد چند مشتری", "note": "فقط با علت مشترک مستند · غیرفعال", "on": False},
    ]


def changed_values(scale, other):
    """سطوحی که معیارشان با همان بُعد در نسخه‌ی دیگر فرق دارد؛ برچسب‌ها نمایشی‌اند و تغییر روش حساب نمی‌شوند."""
    if other is None:
        return []
    mine = {level.value: level.criteria.strip() for level in scale.levels.all()}
    theirs = {level.value: level.criteria.strip() for level in other.levels.all()}
    return sorted(value for value in set(mine) | set(theirs) if mine.get(value) != theirs.get(value))


def history(user, scale):
    rows = []
    for version in visible_versions(user).order_by("-number"):
        mine = version.scales.filter(code=scale.code).prefetch_related("levels").first()
        if mine is None:
            continue
        base = version.based_on.scales.filter(code=scale.code).first() if version.based_on_id else None
        changed = changed_values(mine, base)
        if base is None:
            title = f"تعریف نخست سطوح {scale.code}"
        elif changed:
            title = f"تغییر معیار سطح {'، '.join(fa(value) for value in changed)} در سطوح {scale.code}"
        else:
            title = f"بدون تغییر در سطوح {scale.code}"
        if version.status == ST.DRAFT:
            note = f"پیش‌نویس · {jalali(version.updated_at)}"
        elif version.approved_on:
            note = f"مصوب {jalali(version.approved_on)}"
        else:
            note = f"{version.get_status_display()}" + (
                f" · {jalali(version.activated_at)}" if version.activated_at else ""
            )
        rows.append({"version": f"v{version.number}", "title": title, "note": note, "current": False})
    return rows


def calculator(version, scale):
    """ماشین‌حساب نمونه‌ی بُعد S: خدمت‌ها با RTO و MTPD نخستین بانکشان. محاسبه همان پیشنهاد سطح S ارزیابی است
    (suggest_duration) و اعدادش فقط نمونه‌اند."""
    if scale.code != DURATION_SCALE:
        return None
    services = []
    for service in Service.objects.prefetch_related("customer_links").order_by("-is_critical", "name"):
        link = next((item for item in service.customer_links.all() if item.rto_minutes and item.mtpd_minutes), None)
        services.append(
            {
                "id": service.pk,
                "label": f"{service.name} · {'حیاتی' if service.is_critical else 'غیرحیاتی'}",
                "critical": service.is_critical,
                "rto": link.rto_minutes if link else None,
                "mtpd": link.mtpd_minutes if link else None,
            }
        )
    return {"fraction": float(parameter(version, MethodParameter.Key.S_RTO_FRACTION)), "services": services}


def page(user, version, scale):
    base = version.based_on.scales.filter(code=scale.code).first() if version.based_on_id else None
    values = [level.value for level in scale.levels.all()]
    low, high = (min(values), max(values)) if values else (0, 0)
    current = history(user, scale)
    for row in current:
        row["current"] = row["version"] == f"v{version.number}"
    return {
        "version": {
            "number": version.number,
            "name": f"v{version.number}",
            "chip": chip(version),
            "editable": can_manage_method(user) and version.is_editable_draft,
        },
        "scale": {
            "code": scale.code,
            "name": scale.name,
            "title": f"ویرایش بُعد پیامد · {scale.name} ({scale.code})",
            "subtitle": f"سطح {fa(low)} تا {fa(high)} · {scale.scope} · بالاترین وضعیت منطبق انتخاب می‌شود · تغییر "
            "سطوح پس از تصویب کمیته نافذ است",
        },
        "tabs": [
            {"code": item.code, "name": item.name}
            for item in version.scales.filter(kind=Scale.Kind.IMPACT).order_by("order")
        ],
        "levels": levels_of(scale),
        "base": {"name": f"v{version.based_on.number}", "levels": levels_of(base)} if base else None,
        "stakeholders": stakeholders(scale),
        "stakeholder_note": "داشتن دو مشتری به‌خودی‌خود امتیاز اضافه ندارد؛ عبور مشترک خدمات حیاتی از حد تحمل در "
        "سطح ۵ لحاظ می‌شود.",
        "rules": rules(scale),
        "history": current,
        "calculator": calculator(version, scale),
        "definition": f"/method/{version.number}",
    }


def resolve(request, number, code):
    version = get_object_or_404(visible_versions(request.user), number=number)
    scale = get_object_or_404(version.scales.filter(kind=Scale.Kind.IMPACT), code=code)
    return version, scale


class ImpactLevelsView(ApiView):
    """GET سطوح بُعد؛ POST {levels: [{value, criteria, tags}]} سطوح پیش‌نویس را با تاریخچه ذخیره می‌کند."""

    def get(self, request, number, code):
        version, scale = resolve(request, number, code)
        return Response(page(request.user, version, scale))

    def post(self, request, number, code):
        version, scale = resolve(request, number, code)
        if not can_manage_method(request.user):
            return Response({"detail": "سطوح بُعد را متولی روش عوض می‌کند."}, status=403)
        if not version.is_editable_draft:
            return Response({"detail": "فقط سطوح پیش‌نویسِ فرستاده‌نشده ویرایش می‌شوند."}, status=400)
        raw = request.data.get("levels")
        if not isinstance(raw, list) or not raw:
            return Response({"detail": "سطحی فرستاده نشده است."}, status=400)
        levels = {level.value: level for level in scale.levels.all()}
        errors, updates = {}, []
        for item in raw:
            level = levels.get(item.get("value")) if isinstance(item, dict) else None
            if level is None:
                return Response({"detail": "سطح ناشناخته فرستاده شده است."}, status=400)
            criteria = str(item.get("criteria") or "").strip()
            tags = [str(tag).strip() for tag in item.get("tags") or [] if str(tag).strip()]
            if not criteria:
                errors[str(level.value)] = ["معیار سطح خالی نمی‌ماند."]
                continue
            text = f" {TAG_SEPARATOR} ".join(tags)
            if criteria != level.criteria or text != level.tags:
                updates.append((level, criteria, text))
        if errors:
            return Response({"errors": errors}, status=400)
        with transaction.atomic():
            for level, criteria, text in updates:
                level.criteria, level.tags = criteria, text
                save_with_reason(level, request.user, f"ویرایش سطوح بُعد {scale.code}")
        response = page(request.user, version, scale)
        response["saved"] = len(updates)
        return Response(response)
