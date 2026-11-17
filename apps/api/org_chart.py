"""«چارت سازمانی» در رابط React (فیگما ۱۸): درخت واحدها با مدیر، شمار ریسک فعال و بحرانی هر زیردرخت؛ جزئیات واحد
انتخاب‌شده (بالادست، مدیر، جانشین، خدمات و مشتریان در دامنه، گروه AD، مرجع پذیرش متوسط، ریسک‌ها به تفکیک سطح جاری) و
اعضای آن با نقش سامانه‌ای جدا از سمت سازمانی. ساخت و ویرایش واحد همان فرم‌های جنگوست."""

from collections import Counter, defaultdict

from django.db.models import OuterRef, Q, Subquery
from django.urls import reverse
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.assessments.models import Assessment
from apps.catalog.models import Service
from apps.controls.models import Control
from apps.methodology.services import active_version
from apps.organization.models import OrgUnit
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks

from . import ad_sync
from . import formatting as fmt
from .base import ApiView

INACTIVE = [Risk.Status.CLOSED, Risk.Status.REJECTED]


def current_rank():
    """رتبه‌ی سطح تصمیم آخرین ارزیابی جاری تأییدشده‌ی هر ریسک؛ برای شمارش‌های چارت کافی است."""
    return Subquery(
        Assessment.objects.filter(
            risk=OuterRef("pk"),
            kind=Assessment.Kind.CURRENT,
            status=Assessment.Status.APPROVED,
            decision_level__isnull=False,
        )
        .order_by("-approved_at", "-pk")
        .values("decision_level__rank")[:1]
    )


def initials(user):
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return (first[:1] + last[:1]) or user.username[:2]


def manager_of(unit):
    managers = list(unit.managers.all())
    return managers[0] if managers else None


def subtree_ids(unit_id, children):
    ids, stack = [], [unit_id]
    while stack:
        current = stack.pop()
        ids.append(current)
        stack.extend(children.get(current, []))
    return ids


def build_tree(units, children, risk_ranks, critical_rank):
    """درخت تو در تو با شمار ریسک فعال و بحرانی (بالاترین سطح روش) هر زیردرخت، یعنی خود واحد و زیرمجموعه‌ها."""
    by_id = {unit.pk: unit for unit in units}

    def node(unit, depth):
        ids = subtree_ids(unit.pk, children)
        ranks = [rank for unit_id in ids for rank in risk_ranks.get(unit_id, [])]
        manager = manager_of(unit)
        return {
            "id": unit.pk,
            "code": unit.code,
            "name": unit.name,
            "depth": depth,
            "manager": fmt.person(manager),
            "manager_title": manager.job_title if manager else "",
            "risks": len(ranks),
            "critical": sum(1 for rank in ranks if rank == critical_rank),
            "children": [node(by_id[child], depth + 1) for child in children.get(unit.pk, [])],
        }

    roots = [unit for unit in units if unit.parent_id is None or unit.parent_id not in by_id]
    return [node(unit, 0) for unit in roots]


def depth_of(tree):
    return max((1 + depth_of(node["children"]) for node in tree), default=0)


def roles_of(user, unit, owners, control_owners):
    """نقش‌های سامانه‌ای عضو: نقش‌های گروهی، به‌علاوه‌ی مدیر همین واحد، مالک ریسک و مسئول کنترل."""
    roles = []
    names = set(user.groups.values_list("name", flat=True))
    if unit.pk in {managed.pk for managed in user.managed_units.all()}:
        roles.append({"label": "مدیر واحد", "tone": "info"})
    if user.pk in owners:
        roles.append({"label": "مالک ریسک", "tone": "warning"})
    if user.pk in control_owners:
        roles.append({"label": "مسئول کنترل", "tone": "success"})
    labels = {Role.GRC_MEMBER: "کارشناس ریسک", Role.SYSTEM_ADMIN: "مدیر سامانه"}
    for role in Role.ALL:
        if role in names and role != Role.UNIT_MANAGER:
            roles.append({"label": labels.get(role, role), "tone": "neutral"})
    if not roles:
        roles.append({"label": "کارشناس", "tone": "neutral"})
    return roles


def unit_detail(unit, children, risk_ranks, levels, user):
    ids = subtree_ids(unit.pk, children)
    services = list(Service.objects.filter(org_unit_id__in=ids, is_active=True).prefetch_related("customers"))
    customers = sorted({customer.name for service in services for customer in service.customers.all()})
    parent_manager = manager_of(unit.parent) if unit.parent_id else None
    counts = Counter(rank for unit_id in ids for rank in risk_ranks.get(unit_id, []))
    manager = manager_of(unit)
    can_edit = user.is_system_admin
    return {
        "id": unit.pk,
        "code": unit.code,
        "name": unit.name,
        "active": unit.is_active,
        "ad_group": unit.ad_group,
        "parent": unit.parent.name if unit.parent_id else None,
        "manager": fmt.person(manager),
        "deputy": fmt.person(unit.deputy),
        "services": [service.name for service in services],
        "customers": customers,
        "acceptance": f"مدیر بالادست: {parent_manager.get_full_name()}" if parent_manager else None,
        "levels": [
            {"rank": level["rank"], "name": level["name"], "count": counts.get(level["rank"], 0)}
            for level in reversed(levels)
        ],
        "edit_url": reverse("organization:unit_update", args=[unit.pk]) if can_edit else None,
        "add_child_url": f"{reverse('organization:unit_create')}?parent={unit.pk}" if can_edit else None,
    }


def add_member_url(unit):
    """«افزودن عضو» فرم کاربر جدید را با واحد انتخاب‌شده (اگر فعال باشد) باز می‌کند."""
    url = reverse("accounts:user_create")
    return f"{url}?org_unit={unit.pk}" if unit and unit.is_active else url


def members(unit):
    users = (
        User.objects.filter(Q(org_unit=unit) | Q(managed_units=unit))
        .distinct()
        .prefetch_related("groups", "managed_units")
        .order_by("last_name", "first_name")
    )
    owners = set(Risk.objects.exclude(status__in=INACTIVE).filter(owner__in=users).values_list("owner_id", flat=True))
    control_owners = set(Control.objects.filter(owner__in=users).values_list("owner_id", flat=True))
    managers = {manager.pk for manager in unit.managers.all()}
    rows = [
        {
            "id": member.pk,
            "name": member.get_full_name() or member.username,
            "username": member.username,
            "initials": initials(member),
            "job_title": member.job_title,
            "roles": roles_of(member, unit, owners, control_owners),
            "source": fmt.choice(member, "source"),
            "active": member.is_active,
        }
        for member in users
    ]
    # مدیر و جانشین اول فهرست
    deputy = unit.deputy_id
    rows.sort(key=lambda row: (row["id"] not in managers, row["id"] != deputy))
    return rows


class OrgChartView(ApiView):
    def get(self, request):
        user = request.user
        units = list(
            OrgUnit.objects.filter(is_active=True).select_related("parent", "deputy").prefetch_related("managers")
        )
        children = defaultdict(list)
        for unit in sorted(units, key=lambda item: (item.code or "", item.name)):
            if unit.parent_id:
                children[unit.parent_id].append(unit.pk)
        risk_ranks = defaultdict(list)
        risks = (
            visible_risks(user)
            .exclude(status__in=INACTIVE)
            .filter(merged_into__isnull=True)
            .annotate(rank=current_rank())
            .values_list("org_unit_id", "rank")
        )
        for unit_id, rank in risks:
            risk_ranks[unit_id].append(rank)
        version = active_version()
        levels = [{"rank": level.rank, "name": level.name} for level in version.risk_levels.all()] if version else []
        tree = build_tree(units, children, risk_ranks, max((level["rank"] for level in levels), default=None))

        by_id = {unit.pk: unit for unit in units}
        wanted = request.query_params.get("unit")
        selected = by_id.get(int(wanted)) if wanted and wanted.isdigit() else None
        if selected is None:
            selected = by_id.get(user.org_unit_id) or (by_id.get(tree[0]["id"]) if tree else None)
        return Response(
            {
                "summary": {
                    "units": len(units),
                    "levels": depth_of(tree),
                    "users": User.objects.filter(is_active=True).count(),
                },
                "tree": tree,
                "selected": unit_detail(selected, children, risk_ranks, levels, user) if selected else None,
                "members": members(selected) if selected else [],
                "can_edit": user.is_system_admin,
                "add_unit_url": reverse("organization:unit_create") if user.is_system_admin else None,
                "ad_sync_url": ad_sync.sync_url(user),
                "add_member_url": add_member_url(selected) if user.is_system_admin else None,
            }
        )
