"""همگام‌سازی با Active Directory (فیگما ۲۸).

حساب‌های AD از آخرین برداشت (DirectoryEntry) خوانده و با کاربران سامانه مقایسه می‌شوند: حساب تازه در شاخه‌ی
نگاشت‌شده کاربر جدید بدون نقش می‌شود، تغییر شاخه واحد کاربر را عوض می‌کند و حساب غیرفعال یا حذف‌شده در AD کاربر را
غیرفعال می‌کند. هیچ‌کدام تا «اعمال» روی کاربران اثری ندارد. نگاشت شاخه به واحد همان «گروه AD» واحد در چارت سازمانی
است و شاخه‌ی نگاشت‌نشده تا تعیین واحد کاربرانش را وارد نمی‌کند. نقش‌های سامانه فقط در ERM تعیین می‌شوند و کاربر
غیرفعال تا انتقال مسئولیت‌های باز در سوابق می‌ماند."""

import csv
import io
import re
import socket
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.actions.acceptance import required_authorities, signature_of
from apps.actions.models import AcceptanceSignature, RiskAcceptance, TreatmentAction
from apps.organization.models import OrgUnit
from apps.risks.models import Risk

from .models import DirectoryConnection, DirectoryEntry, DirectorySync, User

CHANGE_REASON = "همگام‌سازی با AD"
COLUMNS = ["username", "first_name", "last_name", "email", "personnel_code", "job_title", "ou", "enabled"]
FALSE_WORDS = {"0", "false", "no", "disabled", "خیر", "غیرفعال"}


class DirectoryError(Exception):
    """برداشت AD را نمی‌شود خواند یا داده‌ی ارسالی معتبر نیست."""


def ou_label(text):
    """نخستین جزء مسیر شاخه، مثل OU=Security؛ جداکننده‌ی «,» یا «·» است."""
    return re.split(r"[,·]", text or "", maxsplit=1)[0].strip()


def ou_key(text):
    return "".join(ou_label(text).split()).lower()


def connection():
    return DirectoryConnection.objects.order_by("pk").first()


@dataclass
class Duties:
    """مسئولیت‌های باز یک کاربر که با غیرفعال شدنش بی‌صاحب می‌مانند."""

    risks: list = field(default_factory=list)
    actions: list = field(default_factory=list)
    assigned: list = field(default_factory=list)
    units: list = field(default_factory=list)
    approvals: list = field(default_factory=list)

    @property
    def any(self):
        return bool(self.risks or self.actions or self.assigned or self.units or self.approvals)

    @property
    def needs_successor(self):
        return bool(self.risks or self.actions or self.assigned)


def duties(user):
    open_actions = TreatmentAction.objects.exclude(status=TreatmentAction.Status.VERIFIED)
    managed = list(user.managed_units.order_by("name"))
    approvals = []
    pending = RiskAcceptance.objects.filter(status=RiskAcceptance.Status.PENDING, risk__org_unit__in=managed)
    for acceptance in pending.select_related("risk").order_by("code"):
        authority = AcceptanceSignature.Authority.UNIT_MANAGER
        if authority in required_authorities(acceptance) and not signature_of(acceptance, authority):
            approvals.append(acceptance.code)
    return Duties(
        risks=list(
            Risk.objects.filter(owner=user)
            .exclude(status__in=Risk.CLOSED_STATUSES)
            .order_by("code")
            .values_list("code", flat=True)
        ),
        actions=list(
            open_actions.filter(Q(owner=user) | Q(verifier=user)).order_by("code").values_list("code", flat=True)
        ),
        assigned=list(open_actions.filter(assignee=user).order_by("code").values_list("code", flat=True)),
        units=[unit.name for unit in managed],
        approvals=approvals,
    )


@dataclass
class Change:
    kind: str  # new · moved · disabled
    entry: DirectoryEntry | None
    user: User | None
    unit: OrgUnit | None
    duties: Duties
    apply: bool
    gone: bool = False  # حساب در برداشت AD نیست


@dataclass
class Plan:
    changes: list
    branches: list
    unchanged: int
    unmapped: int

    @property
    def applicable(self):
        return [change for change in self.changes if change.apply]

    @property
    def pending(self):
        return len(self.changes) + self.unmapped


def build_plan(conn):
    units = {}
    for unit in OrgUnit.objects.filter(is_active=True).exclude(ad_group="").order_by("pk"):
        units.setdefault(ou_key(unit.ad_group), unit)
    excluded = {ou_key(text) for text in conn.excluded}
    users = {user.username.lower(): user for user in User.objects.select_related("org_unit")}
    seen, changes, branches, unchanged = set(), [], {}, 0

    for entry in DirectoryEntry.objects.all():
        key = ou_key(entry.ou)
        branch = branches.setdefault(key, {"ou": ou_label(entry.ou), "users": 0})
        branch["users"] += 1
        user = users.get(entry.username.lower())
        if user is not None:
            seen.add(user.pk)
            if user.source != User.Source.AD:
                unchanged += 1  # حساب محلی هم‌نام دست نمی‌خورد
                continue
        unit = None if key in excluded else units.get(key)
        if not entry.enabled:
            if user is not None:
                found = duties(user)
                if user.is_active or found.any:
                    changes.append(
                        Change("disabled", entry, user, user.org_unit, found, conn.deactivate and user.is_active)
                    )
                else:
                    unchanged += 1
            continue
        if unit is None:
            unchanged += user is not None
            continue
        if user is None:
            changes.append(Change("new", entry, None, unit, Duties(), conn.auto_create))
        elif user.org_unit_id != unit.pk:
            changes.append(Change("moved", entry, user, unit, duties(user), conn.update_unit))
        else:
            unchanged += 1

    for user in users.values():
        if user.source == User.Source.AD and user.pk not in seen:
            found = duties(user)
            if user.is_active or found.any:
                changes.append(
                    Change("disabled", None, user, user.org_unit, found, conn.deactivate and user.is_active, gone=True)
                )

    rows = []
    for key, branch in branches.items():
        if key in excluded:
            state = "excluded"
        elif key in units:
            state = "mapped"
        else:
            state = "unmapped"
        rows.append({**branch, "key": key, "unit": units.get(key) if state == "mapped" else None, "state": state})
    order = {"mapped": 0, "unmapped": 1, "excluded": 2}
    rows.sort(key=lambda row: (order[row["state"]], row["ou"].lower()))
    kinds = {"disabled": 0, "moved": 1, "new": 2}
    changes.sort(key=lambda change: (kinds[change.kind], not change.duties.any, name_of(change)))
    unmapped = sum(row["state"] == "unmapped" for row in rows)
    return Plan(changes=changes, branches=rows, unchanged=unchanged, unmapped=unmapped)


def name_of(change):
    if change.user is not None:
        return change.user.get_full_name() or change.user.username
    return f"{change.entry.first_name} {change.entry.last_name}".strip() or change.entry.username


def summary(plan):
    """خلاصه‌ی تغییرها برای سابقه‌ی اجرا؛ نام‌ها و نوع تغییر، بدون هیچ داده‌ی ورود."""
    return [
        {"kind": change.kind, "username": (change.user or change.entry).username, "name": name_of(change)}
        for change in plan.changes
    ]


def preview(conn, by=None):
    plan = build_plan(conn)
    DirectorySync.objects.create(
        status=DirectorySync.Status.PREVIEW, run_by=by, pending=plan.pending, changes=summary(plan)
    )
    return plan


def personnel_code(entry):
    code = entry.personnel_code.strip()
    if not code.isdigit() or User.objects.filter(personnel_code=code).exists():
        return None
    return code


@transaction.atomic
def apply(conn, by):
    plan = build_plan(conn)
    applied = []
    for change in plan.applicable:
        if change.kind == "new":
            entry = change.entry
            user = User(
                username=entry.username,
                first_name=entry.first_name,
                last_name=entry.last_name,
                email=entry.email,
                job_title=entry.job_title,
                personnel_code=personnel_code(entry),
                org_unit=change.unit,
                source=User.Source.AD,
            )
            user.set_unusable_password()  # ورود با AD است، نه گذرواژه‌ی محلی
        else:
            user = change.user
            if change.kind == "moved":
                user.org_unit = change.unit
            else:
                user.is_active = False
        user._change_reason = CHANGE_REASON
        user.save()
        applied.append(change)
    after = build_plan(conn)
    DirectorySync.objects.create(
        status=DirectorySync.Status.APPLIED,
        run_by=by,
        pending=after.pending,
        applied=len(applied),
        changes=summary(Plan(applied, [], 0, 0)),
    )
    return len(applied)


class TransferError(Exception):
    pass


@transaction.atomic
def transfer(user, successor, by):
    """مسئولیت‌های باز کاربر به جانشین می‌رسد: ریسک‌های باز، نقش در اقدام‌های باز و مدیریت واحدها (که امضای مدیر
    واحد روی پذیرش‌های منتظر را هم با خود می‌برد). سوابق بسته به نام همان کاربر می‌مانند."""
    if successor.pk == user.pk or not successor.is_active:
        raise TransferError("جانشین باید کاربر فعال دیگری باشد.")
    reason = f"انتقال مسئولیت‌های {user.get_full_name() or user.username} در همگام‌سازی AD"
    actions = TreatmentAction.objects.exclude(status=TreatmentAction.Status.VERIFIED).filter(
        Q(owner=user) | Q(assignee=user) | Q(verifier=user)
    )
    conflicts = []
    for action in actions:
        for name in ("owner", "assignee", "verifier"):
            if getattr(action, f"{name}_id") == user.pk:
                setattr(action, name, successor)
        if action.verifier_id in (action.owner_id, action.assignee_id):
            conflicts.append(action.code)
    if conflicts:
        raise TransferError(
            f"جانشین در {'، '.join(conflicts)} هم مجری یا مالک و هم تأییدکننده‌ی نتیجه می‌شود؛ جانشین دیگری انتخاب کنید."
        )
    moved = 0
    for action in actions:
        action._change_reason = reason
        action.save()
        moved += 1
    for risk in Risk.objects.filter(owner=user).exclude(status__in=Risk.CLOSED_STATUSES):
        risk.owner = successor
        risk._change_reason = reason
        risk.save()
        moved += 1
    units = list(user.managed_units.all())
    if units:
        successor.managed_units.add(*units)
        user.managed_units.remove(*units)
        moved += len(units)
    return moved


def test_connection(conn):
    """فقط دسترسی شبکه‌ای به سرور را می‌آزماید (اتصال TCP به درگاه LDAPS)، نه ورود حساب سرویس."""
    parts = urlsplit(conn.server)
    host = parts.hostname or conn.server
    port = parts.port or (636 if parts.scheme == "ldaps" else 389)
    try:
        with socket.create_connection((host, port), timeout=3):
            pass
    except OSError:
        conn.state, conn.state_note = DirectoryConnection.State.FAILED, f"{host}:{port} پاسخ نداد."
    else:
        conn.state, conn.state_note = DirectoryConnection.State.CONNECTED, f"{host}:{port} در دسترس است."
    conn.tested_at = timezone.now()
    conn._change_reason = "آزمون اتصال AD"
    conn.save()
    return conn.state == DirectoryConnection.State.CONNECTED


@transaction.atomic
def load_entries(text):
    """برداشت تازه از خروجی CSV حساب‌های AD (مثلاً با Get-ADUser | Export-Csv) با ستون‌های COLUMNS؛ ستون enabled
    خالی یعنی فعال. همه‌ی ردیف‌های برداشت قبلی جایگزین می‌شوند."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    missing = {"username", "ou"} - set(reader.fieldnames or [])
    if missing:
        raise DirectoryError(f"ستون‌های {'، '.join(sorted(missing))} در فایل نیست.")
    now, rows, names = timezone.now(), [], set()
    for line, row in enumerate(reader, start=2):
        username = (row.get("username") or "").strip()
        ou = (row.get("ou") or "").strip()
        if not username or not ou:
            raise DirectoryError(f"سطر {line}: نام کاربری و شاخه لازم است.")
        if username.lower() in names:
            raise DirectoryError(f"سطر {line}: نام کاربری {username} تکراری است.")
        names.add(username.lower())
        rows.append(
            DirectoryEntry(
                username=username,
                first_name=(row.get("first_name") or "").strip(),
                last_name=(row.get("last_name") or "").strip(),
                email=(row.get("email") or "").strip(),
                personnel_code=(row.get("personnel_code") or "").strip(),
                job_title=(row.get("job_title") or "").strip(),
                ou=ou,
                enabled=(row.get("enabled") or "").strip().lower() not in FALSE_WORDS,
                fetched_at=now,
            )
        )
    DirectoryEntry.objects.all().delete()
    DirectoryEntry.objects.bulk_create(rows)
    return len(rows)
