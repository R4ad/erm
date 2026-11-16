"""«پروفایل کاربر» در رابط React (فیگما ۲۹): هویت سازمانی (از AD، فقط خواندنی)، نقش‌ها با دامنه و منشأ، نتیجه‌ی
تفکیک وظایف همین کاربر، تفویض اختیار موقت، مسئولیت‌های فعال در سوابق و فعالیت اخیر. فقط مدیر سامانه این صفحه را
می‌بیند و نقش‌های گروهی، تفویض و غیرفعال‌سازی را ثبت می‌کند؛ نقش‌های برگرفته از سوابق (مالک ریسک، مجری اقدام و
مانند آن) با خود سوابق عوض می‌شوند."""

from django.contrib.auth.models import Group
from django.db import transaction
from django.db.models import Min, Q
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from rest_framework.response import Response

from apps.accounts import delegation
from apps.accounts.directory import duties
from apps.accounts.models import Delegation, DirectorySync, User
from apps.actions.acceptance import signable_authorities
from apps.actions.models import AcceptanceSignature, RiskAcceptance, TreatmentAction
from apps.assessments.services import decision_assessment
from apps.audit.models import AuditEvent
from apps.core.jalali import parse_jalali
from apps.methodology.services import active_version
from apps.risks.models import Risk
from apps.workflow.models import StatusTransition

from . import formatting as fmt
from .action_verification import jalali
from .ad_sync import duty_text, when
from .base import ApiView
from .treatment import fa
from .user_roles import INACTIVE, ROLES, conflicts, holders, status_of

GLOBAL_SCOPE = "همه‌ی واحدها"
GROUP_OF = {key: group for key, _label, _tone, _description, _scope, group in ROLES if group}


def initials(user):
    parts = [part for part in (user.first_name, user.last_name) if part]
    return " ".join(part[0] for part in parts) if parts else user.username[:2]


def manager_of(user):
    """مدیر مستقیم: مدیر واحد کاربر، و اگر خود او مدیر واحد است، مدیر واحد بالادست."""
    unit = user.org_unit
    while unit is not None:
        found = unit.managers.filter(is_active=True).exclude(pk=user.pk).order_by("first_name", "last_name").first()
        if found:
            return found
        unit = unit.parent
    return None


def name(user):
    return (user.get_full_name() or user.username) if user else None


def active_risks(user):
    return Risk.objects.filter(owner=user).exclude(status__in=INACTIVE).filter(merged_into__isnull=True)


def role_since(user, key):
    """تاریخ افزوده شدن نقش گروهی از لاگ ممیزی، یا برای مالک ریسک تاریخ نخستین ریسک فعال."""
    group = GROUP_OF.get(key)
    if group:
        event = (
            AuditEvent.objects.filter(
                event=AuditEvent.Event.ROLES_CHANGED,
                details__target__endswith=f"({user.username})",
                details__action="added",
                details__items__contains=[group],
            )
            .order_by("-at")
            .first()
        )
        return jalali(timezone.localtime(event.at).date()) if event else None
    if key == "owner":
        first = active_risks(user).aggregate(first=Min("created_at"))["first"]
        return jalali(timezone.localtime(first).date()) if first else None
    return None


def role_scope(user, key):
    if key == "owner":
        unit = user.org_unit.name if user.org_unit else "بدون واحد"
        return f"{unit} · {fa(active_risks(user).count())} ریسک"
    if key == "unit_manager":
        names = list(user.managed_units.order_by("name").values_list("name", flat=True))
        return "، ".join(names) if names else "واحد خود"
    if key == "control_owner":
        return f"{fa(user.owned_controls.filter(is_active=True).count())} کنترل"
    if key in ("expert", "project"):
        field = "assignee" if key == "expert" else "owner"
        count = TreatmentAction.objects.filter(**{field: user}).exclude(status=TreatmentAction.Status.VERIFIED).count()
        return f"{fa(count)} اقدام باز"
    if key == "viewer":
        names = list(user.scope_units.order_by("name").values_list("name", flat=True))
        return "، ".join(names) if names else GLOBAL_SCOPE
    return GLOBAL_SCOPE


def roles(user, viewer):
    held = holders()
    keys = {key for key, ids in held.items() if user.pk in ids}
    groups = set(user.groups.values_list("name", flat=True))
    rows = []
    for key, label, tone, description, _scope, group in ROLES:
        if key not in keys:
            continue
        assigned = bool(group and group in groups)
        rows.append(
            {
                "key": key,
                "label": label,
                "tone": tone,
                "description": description,
                "scope": role_scope(user, key),
                "origin": "تخصیص در ERM" if assigned else "از روی سوابق",
                "since": role_since(user, key),
                # مدیر سامانه نقش مدیریت خودش را برنمی‌دارد تا کسی بیرون نماند.
                "removable": assigned and not (key == "admin" and user.pk == viewer.pk),
            }
        )
    available = [
        {"key": key, "label": label} for key, label, *_rest in ROLES if key in GROUP_OF and GROUP_OF[key] not in groups
    ]
    return rows, keys, available


def sod(user, keys):
    checks = []
    own_verified = (
        TreatmentAction.objects.filter(verifier=user, plan__risk__owner=user)
        .exclude(status=TreatmentAction.Status.VERIFIED)
        .order_by("code")
        .values_list("code", flat=True)
    )
    if "owner" in keys or TreatmentAction.objects.filter(verifier=user).exists():
        if own_verified:
            checks.append({"text": f"تأییدکننده‌ی نتیجه‌ی {'، '.join(own_verified)} روی ریسک خودش است", "tone": "danger"})
        else:
            checks.append({"text": "تأییدکننده‌ی نتیجه‌ی اقدام‌های ریسک‌های خودش نیست", "tone": "success"})
    for item in conflicts():
        if item["user"]["id"] == user.pk:
            checks.append({"text": item["note"], "tone": "danger"})
    if "authority" in keys and "owner" in keys:
        checks.append(
            {"text": "مالک و مرجع مجاز یک شخص‌اند؛ تصمیم پذیرش با همان هویت یک بار ثبت می‌شود", "tone": "success"}
        )
    if "method" in keys and "authority" in keys:
        checks.append({"text": "متولی روش نسخه‌ی پیشنهادی خود را تصویب نمی‌کند · در ثبت تصویب", "tone": "success"})
    if "workgroup" in keys and "owner" in keys:
        checks.append(
            {"text": "عضو کارگروه و مالک هم‌زمان: در بررسی اختلاف امتیاز ریسک‌های خود کنار گذاشته شود", "tone": "warning"}
        )
    if not checks:
        checks.append({"text": "نقش‌های این کاربر قاعده‌ی تفکیک وظایف فعالی ندارند", "tone": "success"})
    open_conflicts = sum(check["tone"] == "danger" for check in checks)
    chip = (
        {"label": f"{fa(open_conflicts)} تعارض فعال", "tone": "danger"}
        if open_conflicts
        else {"label": "بدون تعارض فعال", "tone": "success"}
    )
    return {"chip": chip, "checks": checks}


def levels():
    version = active_version()
    return [
        {**fmt.level(level), "delegable": delegation.delegable(level)}
        for level in (version.risk_levels.order_by("rank") if version else [])
    ]


def delegation_view(user, today):
    found = delegation.upcoming(user, today)
    if found is None:
        return None
    rows = {level["rank"]: level for level in levels()}
    top = rows.get(found.max_rank)
    if found.starts_on > today:
        days = (found.starts_on - today).days
        chip = {"label": f"زمان‌بندی‌شده · {fa(days)} روز دیگر", "tone": "info"}
    else:
        chip = {"label": f"برقرار تا {jalali(found.ends_on)}", "tone": "success"}
    manager = manager_of(user)
    successor = found.successor
    return {
        "id": found.pk,
        "chip": chip,
        "successor": {
            "id": successor.pk,
            "name": " · ".join(part for part in (name(successor), successor.job_title) if part),
        },
        "created": f"{name(found.created_by)} · {jalali(timezone.localtime(found.created_at).date())}",
        "period": f"{jalali(found.starts_on)} تا {jalali(found.ends_on)}",
        "starts_on": jalali(found.starts_on),
        "ends_on": jalali(found.ends_on),
        "scope": f"تصمیم مواجهه و پذیرش تا سطح {top['name']}" if top else "—",
        "escalation": name(manager) or "مدیر بالادست",
        "max_rank": found.max_rank,
        "notify_successor": found.notify_successor,
        "copy_owner": found.copy_owner,
    }


def duties_view(user):
    rows = []
    for risk in active_risks(user):
        assessment = decision_assessment(risk)
        rows.append((risk, assessment.score_high if assessment else None, assessment))
    open_actions = (
        TreatmentAction.objects.filter(Q(owner=user) | Q(assignee=user))
        .exclude(status=TreatmentAction.Status.VERIFIED)
        .distinct()
        .count()
    )
    active = RiskAcceptance.objects.filter(status=RiskAcceptance.Status.ACTIVE, risk__owner=user).count()
    pending = sum(
        bool(signable_authorities(user, acceptance))
        for acceptance in RiskAcceptance.objects.filter(status=RiskAcceptance.Status.PENDING).select_related(
            "risk", "assessment__decision_level"
        )
    )
    rows.sort(key=lambda row: (-(row[1] if row[1] is not None else -1), row[0].code))
    return {
        "tiles": [
            {"key": "risks", "label": "ریسک مالک", "value": len(rows)},
            {"key": "actions", "label": "اقدام باز", "value": open_actions},
            {"key": "acceptances", "label": "پذیرش فعال", "value": active},
            {"key": "approvals", "label": "تأیید در انتظار", "value": pending},
        ],
        "risks": [
            {
                "id": risk.pk,
                "code": risk.code,
                "title": risk.title,
                "href": risk.get_absolute_url(),
                "score": score,
                "level": fmt.level(assessment.decision_level) if assessment else None,
            }
            for risk, score, assessment in rows[:5]
        ],
        "more": max(0, len(rows) - 5),
    }


def activity(user, limit=20):
    rows = []
    target = f"({user.username})"
    events = AuditEvent.objects.filter(
        Q(event=AuditEvent.Event.LOGIN_FAILED, username=user.username)
        | Q(event=AuditEvent.Event.EXPORT, user=user)
        | Q(
            event__in=[AuditEvent.Event.ROLES_CHANGED, AuditEvent.Event.MANAGED_UNITS_CHANGED],
            details__target__endswith=target,
        )
    ).order_by("-at")[:limit]
    for event in events:
        if event.event == AuditEvent.Event.LOGIN_FAILED:
            rows.append((event.at, "lock", "danger", "ورود ناموفق", "رمز یا نام کاربری نادرست"))
        elif event.event == AuditEvent.Event.EXPORT:
            rows.append((event.at, "download", "neutral", "خروجی گرفتن", event.details.get("what", "")))
        else:
            verb = "افزودن" if event.details.get("action") == "added" else "برداشتن"
            items = "، ".join(event.details.get("items", []))
            kind = "نقش" if event.event == AuditEvent.Event.ROLES_CHANGED else "واحد تحت مدیریت"
            actor = f"توسط {event.username}" if event.username else ""
            rows.append((event.at, "gear", "warning", f"تغییر {kind}: {verb} {items}", actor))
    for move in StatusTransition.objects.filter(created_by=user).select_related("risk").order_by("-created_at")[:limit]:
        rows.append(
            (
                move.created_at,
                "flow",
                "info",
                f"انتقال پرونده‌ی {move.risk.code} به {move.get_to_status_display()}",
                move.risk.title,
            )
        )
    for signature in (
        AcceptanceSignature.objects.filter(created_by=user).select_related("acceptance").order_by("-created_at")[:limit]
    ):
        rows.append(
            (
                signature.created_at,
                "check-circle",
                "success",
                f"{signature.get_decision_display()} پذیرش {signature.acceptance.code}",
                signature.get_authority_display(),
            )
        )
    for item in Delegation.objects.filter(user=user).select_related("successor", "created_by")[:limit]:
        rows.append(
            (
                item.created_at,
                "users",
                "info",
                f"ثبت تفویض به {name(item.successor)}",
                f"{jalali(item.starts_on)} تا {jalali(item.ends_on)} · ثبت {name(item.created_by)}",
            )
        )
    rows.sort(key=lambda row: row[0], reverse=True)
    return [
        {
            "key": f"{index}",
            "icon": icon,
            "tone": tone,
            "title": title,
            "note": " · ".join(filter(None, [when(at), note])),
        }
        for index, (at, icon, tone, title, note) in enumerate(rows[:limit])
    ]


def last_sync(user):
    if user.source != User.Source.AD:
        return "حساب محلی؛ همگام نمی‌شود"
    run = DirectorySync.objects.filter(status=DirectorySync.Status.APPLIED).first()
    return when(run.run_at) if run else "هنوز همگام نشده"


def page(user, viewer):
    today = timezone.localdate()
    manager = manager_of(user)
    role_rows, keys, available = roles(user, viewer)
    unit = user.org_unit.name if user.org_unit else "بدون واحد"
    open_duties = duties(user)
    candidates = (
        User.objects.filter(is_active=True).exclude(pk=user.pk).select_related("org_unit").order_by("first_name")
    )
    conflicted = {item["user"]["id"] for item in conflicts()}
    return {
        "id": user.pk,
        "name": name(user),
        "initials": initials(user),
        "username": user.username,
        "status": status_of(user, conflicted, today),
        "source": {"value": user.source, "label": "همگام با AD" if user.source == User.Source.AD else "حساب محلی"},
        "subtitle": f"{unit} · نام کاربری {user.username}" + (f" · مدیر مستقیم: {name(manager)}" if manager else ""),
        "identity": {
            "locked": user.source == User.Source.AD,
            "fields": [
                {"key": "name", "label": "نام و نام خانوادگی", "value": user.get_full_name() or "—"},
                {"key": "username", "label": "نام کاربری", "value": user.username, "code": True},
                {"key": "unit", "label": "واحد سازمانی", "value": unit},
                {"key": "job_title", "label": "سمت", "value": user.job_title or "—"},
                {"key": "manager", "label": "مدیر مستقیم", "value": name(manager) or "—"},
                {"key": "synced", "label": "آخرین همگام‌سازی", "value": last_sync(user)},
            ],
            "edit_url": reverse("admin:accounts_user_change", args=[user.pk]),
        },
        "roles": role_rows,
        "available_roles": available,
        "sod": sod(user, keys),
        "delegation": delegation_view(user, today),
        "levels": levels(),
        "successors": [
            {"id": person.pk, "name": name(person), "unit": person.org_unit.name if person.org_unit else ""}
            for person in candidates
        ],
        "escalation": name(manager) or "مدیر بالادست",
        "duties": duties_view(user),
        "activity": activity(user),
        "can_deactivate": user.is_active and user.pk != viewer.pk,
        "open_duties": duty_text(open_duties) if open_duties.any else "",
        "users_page": "/accounts/users",
    }


class ProfileError(Exception):
    pass


def save_roles(user, wanted, viewer):
    wanted = set(wanted)
    if not wanted <= set(GROUP_OF):
        raise ProfileError("نقش ناشناخته یا برگرفته از سوابق فرستاده شده است.")
    if user.pk == viewer.pk and "admin" not in wanted and user.has_role(GROUP_OF["admin"]):
        raise ProfileError("نقش مدیر سامانه را از خودتان برنمی‌دارید.")
    groups = {group.name: group for group in Group.objects.filter(name__in=GROUP_OF.values())}
    held = set(user.groups.values_list("name", flat=True))
    add = [groups[GROUP_OF[key]] for key in wanted if GROUP_OF[key] not in held and GROUP_OF[key] in groups]
    remove = [groups[name] for key, name in GROUP_OF.items() if key not in wanted and name in held and name in groups]
    if add:
        user.groups.add(*add)
    if remove:
        user.groups.remove(*remove)
    return len(add) + len(remove)


def save_delegation(user, data, viewer, today):
    try:
        successor = User.objects.get(pk=data.get("successor"), is_active=True)
        starts_on = parse_jalali(str(data.get("starts_on") or ""))
        ends_on = parse_jalali(str(data.get("ends_on") or ""))
        max_rank = int(data.get("max_rank"))
    except (User.DoesNotExist, ValueError, TypeError) as error:
        raise ProfileError("جانشین، دوره و سطح تفویض را کامل وارد کنید.") from error
    if successor.pk == user.pk:
        raise ProfileError("جانشین نمی‌تواند خود کاربر باشد.")
    if ends_on < starts_on:
        raise ProfileError("پایان دوره پیش از آغاز آن است.")
    if ends_on < today:
        raise ProfileError("دوره‌ی تفویض گذشته است.")
    allowed = {level["rank"] for level in levels() if level["delegable"]}
    if max_rank not in allowed:
        raise ProfileError("تصمیم ریسک‌های بالا و بحرانی تفویض نمی‌شود؛ سطح مجاز را انتخاب کنید.")
    found = delegation.upcoming(user, today) or Delegation(user=user, created_by=viewer)
    found.successor, found.starts_on, found.ends_on, found.max_rank = successor, starts_on, ends_on, max_rank
    found.notify_successor = bool(data.get("notify_successor", True))
    found.copy_owner = bool(data.get("copy_owner", True))
    found._history_user = viewer
    found.save()
    return found


class UserProfileView(ApiView):
    """GET پروفایل؛ POST {action}: save {roles?, delegation?}، cancel_delegation و deactivate."""

    def target(self, request, pk):
        if not request.user.is_system_admin:
            return None, Response({"detail": "پروفایل کاربران را مدیر سامانه می‌بیند."}, status=403)
        return get_object_or_404(User.objects.select_related("org_unit__parent"), pk=pk), None

    def get(self, request, pk):
        user, refused = self.target(request, pk)
        return refused or Response(page(user, request.user))

    def post(self, request, pk):
        user, refused = self.target(request, pk)
        if refused:
            return refused
        action = request.data.get("action")
        today = timezone.localdate()
        try:
            with transaction.atomic():
                if action == "save":
                    if "roles" in request.data:
                        save_roles(user, request.data.get("roles") or [], request.user)
                    if request.data.get("delegation"):
                        save_delegation(user, request.data["delegation"], request.user, today)
                    message = "تغییرات ذخیره شد"
                elif action == "cancel_delegation":
                    found = delegation.upcoming(user, today)
                    if found is None:
                        raise ProfileError("تفویضی برای لغو نیست.")
                    found.cancelled_at = timezone.now()
                    found._history_user = request.user
                    found.save()
                    message = "تفویض لغو شد"
                elif action == "deactivate":
                    if user.pk == request.user.pk:
                        raise ProfileError("حساب خودتان را غیرفعال نمی‌کنید.")
                    user.is_active = False
                    user._change_reason = "غیرفعال‌سازی از پروفایل"
                    user.save()
                    message = "کاربر غیرفعال شد؛ سوابق و مسئولیت‌ها حفظ شد"
                else:
                    raise ProfileError("عمل ناشناخته.")
        except ProfileError as error:
            return Response({"detail": str(error)}, status=400)
        user.refresh_from_db()
        return Response({**page(user, request.user), "message": message})
