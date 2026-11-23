"""«همگام‌سازی با Active Directory» در رابط React (فیگما ۲۸): اتصال LDAPS، شمار تغییرهای در انتظار، نگاشت شاخه‌های AD
به واحد، پیش‌نمایش تغییر کاربران با اثر بر نقش‌ها و مسئولیت‌های باز، قواعد همگام‌سازی و تاریخچه‌ی اجراها. فقط مدیر
سامانه این صفحه را می‌بیند؛ قاعده‌ها، نگاشت، اعمال و انتقال مسئولیت هم کار همین نقش است."""

from django.utils import timezone
from rest_framework.response import Response

from apps.accounts import directory
from apps.accounts.directory import TransferError, build_plan, name_of
from apps.accounts.models import DirectorySync, User
from apps.organization.models import OrgUnit

from .action_verification import jalali
from .base import ApiView
from .treatment import fa

KIND = {"new": ("جدید", "info"), "moved": ("جابه‌جایی", "warning"), "disabled": ("غیرفعال", "danger")}
BRANCH = {
    "mapped": ("نگاشت‌شده", "success"),
    "unmapped": ("نیازمند نگاشت", "warning"),
    "excluded": ("خارج از دامنه", "neutral"),
}
STATE_TONE = {"connected": "success", "failed": "danger", "unknown": "neutral"}
RUN_TONE = {"preview": "warning", "applied": "success", "failed": "danger"}
RULES = [
    ("auto_create", "ایجاد خودکار کاربر جدید", "بدون نقش؛ فقط دسترسی مشاهده"),
    ("update_unit", "به‌روزرسانی واحد از شاخه‌ی AD", "طبق جدول نگاشت"),
    ("deactivate", "غیرفعال‌سازی هم‌زمان با AD", "سوابق و مسئولیت‌ها حفظ می‌شوند"),
]
RULE_KEYS = {key for key, _label, _note in RULES}
ROLES_PAGE = "/accounts/users"


def clock(moment):
    return fa(timezone.localtime(moment).strftime("%H:%M"))


def when(moment, with_time=True):
    """امروز و دیروز با ساعت، روزهای دیگر با تاریخ شمسی."""
    local = timezone.localtime(moment)
    days = (timezone.localdate() - local.date()).days
    if days == 0:
        return f"امروز {clock(moment)}" if with_time else "امروز"
    if days == 1:
        return f"دیروز {clock(moment)}" if with_time else "دیروز"
    return jalali(local.date())


def codes(items, noun):
    return "، ".join(items) if len(items) <= 2 else f"{fa(len(items))} {noun}"


def duty_text(found):
    parts = []
    if found.risks:
        parts.append(f"مالک {codes(found.risks, 'ریسک')}")
    if found.actions:
        parts.append(
            f"{fa(len(found.actions))} اقدام باز" if found.risks else f"مسئول {fa(len(found.actions))} اقدام باز"
        )
    if found.assigned:
        parts.append(f"مجری {fa(len(found.assigned))} اقدام باز")
    if found.approvals:
        parts.append(f"تأییدکننده‌ی پذیرش {codes(found.approvals, 'پذیرش')}")
    elif found.units:
        parts.append(f"مدیر {'، '.join(found.units)}")
    return " و ".join(parts)


def change_row(change):
    label, tone = KIND[change.kind]
    user, found = change.user, change.duties
    username = (user or change.entry).username
    action = {"kind": "none", "label": "", "href": None}
    if change.kind == "new":
        unit = change.unit.name
        impact = ("بدون نقش؛ نقش در ERM تعیین می‌شود", "neutral")
        action["label"] = "ایجاد کاربر" if change.apply else "ایجاد خودکار خاموش است"
    elif change.kind == "moved":
        unit = f"از {user.org_unit.name if user.org_unit else 'بدون واحد'} به {change.unit.name}"
        if found.any:
            impact = (f"{duty_text(found)}؛ نقش‌ها حفظ می‌شوند و تأیید مدیر جدید لازم است", "warning")
            action = {"kind": "review", "label": "بررسی", "href": ROLES_PAGE}
        else:
            impact = ("بدون نقش ERM" if not user.role_names else "نقش‌ها حفظ می‌شوند", "neutral")
            action["label"] = "به‌روزرسانی واحد" if change.apply else "به‌روزرسانی واحد خاموش است"
    else:
        unit = user.org_unit.name if user.org_unit else "بدون واحد"
        if found.needs_successor:
            impact = (f"{duty_text(found)}؛ جانشین لازم است", "danger")
            action = {"kind": "successor", "label": "تعیین جانشین", "href": None}
        elif found.any:
            impact = (f"{duty_text(found)}؛ تفویض لازم است", "danger")
            action = {"kind": "delegate", "label": "تفویض", "href": None}
        else:
            impact = ("بدون مسئولیت باز", "neutral")
        if action["kind"] == "none":
            action["label"] = "غیرفعال‌سازی" if change.apply else "غیرفعال‌سازی خاموش است"
    return {
        "key": f"{change.kind}-{username}",
        "kind": change.kind,
        "label": "حذف از AD" if change.gone else label,
        "tone": tone,
        "user": {"id": user.pk if user else None, "name": name_of(change), "username": username},
        "unit": unit,
        "impact": {"text": impact[0], "tone": impact[1]},
        "action": action,
        "apply": change.apply,
        "attention": change.kind == "disabled" and found.any,
        "inactive": bool(user and not user.is_active),
    }


def tiles(plan):
    by_kind = {kind: [change for change in plan.changes if change.kind == kind] for kind in KIND}
    moved_open = sum(change.duties.any for change in by_kind["moved"])
    disabled_open = sum(change.duties.any for change in by_kind["disabled"])
    return [
        {"key": "new", "label": "کاربر جدید", "value": len(by_kind["new"]), "note": "در AD ایجاد شده‌اند"},
        {
            "key": "moved",
            "label": "جابه‌جایی واحد",
            "value": len(by_kind["moved"]),
            "note": f"{fa(moved_open)} مورد مسئولیت باز دارد" if moved_open else "بدون مسئولیت باز",
        },
        {
            "key": "disabled",
            "label": "غیرفعال در AD",
            "value": len(by_kind["disabled"]),
            "note": f"{fa(disabled_open)} مورد نیازمند جانشین" if disabled_open else "بدون مسئولیت باز",
        },
        {
            "key": "unmapped",
            "label": "شاخه‌ی نگاشت‌نشده",
            "value": plan.unmapped,
            "note": f"{fa(plan.unchanged)} کاربر بدون تغییر",
        },
    ]


def run_row(run):
    if run.status == DirectorySync.Status.PREVIEW:
        note = f"{fa(run.pending)} تغییر در انتظار اعمال" if run.pending else "بدون تغییر"
    elif run.status == DirectorySync.Status.APPLIED:
        who = (run.run_by.get_full_name() or run.run_by.username) if run.run_by else "زمان‌بندی"
        note = f"{fa(run.applied)} تغییر · {who}" if run.applied else "بدون تغییر"
    else:
        note = run.note
    return {
        "id": run.pk,
        "title": f"{when(run.run_at)} · {run.get_status_display()}",
        "note": note,
        "status": run.status,
        "tone": RUN_TONE[run.status],
    }


def subtitle(conn):
    head = "واحدها و کاربران از AD خوانده می‌شوند؛ نقش‌های سامانه فقط در ERM تعیین می‌شوند"
    last = DirectorySync.objects.filter(status=DirectorySync.Status.PREVIEW).first()
    if last is None:
        return f"{head} · هنوز پیش‌نمایشی اجرا نشده است"
    local = timezone.localtime(last.run_at)
    return f"{head} · پیش‌نمایش {when(last.run_at, with_time=False)} ساعت {clock(local)} آماده شد"


def page(conn):
    plan = build_plan(conn)
    return {
        "title": "همگام‌سازی با Active Directory",
        "subtitle": subtitle(conn),
        "pending": plan.pending,
        "applicable": len(plan.applicable),
        "connection": {
            "server": conn.server,
            "base_dn": conn.base_dn,
            "service_account": f"{conn.service_account} · فقط خواندنی",
            "schedule": f"روزانه ساعت {fa(conn.schedule.strftime('%H:%M'))}",
            "state": {"label": conn.get_state_display(), "tone": STATE_TONE[conn.state]},
            "note": conn.state_note,
            "tested": when(conn.tested_at) if conn.tested_at else None,
        },
        "tiles": tiles(plan),
        "branches": [
            {
                "key": branch["key"],
                "ou": branch["ou"],
                "users": branch["users"],
                "state": branch["state"],
                "status": {"label": BRANCH[branch["state"]][0], "tone": BRANCH[branch["state"]][1]},
                "unit": branch["unit"].name if branch["unit"] else None,
            }
            for branch in plan.branches
        ],
        "unit_options": [
            {"id": unit.pk, "name": unit.name}
            for unit in OrgUnit.objects.filter(is_active=True, ad_group="").order_by("name")
        ],
        "changes": [change_row(change) for change in plan.changes],
        "unchanged": plan.unchanged,
        "rules": [
            {"key": key, "label": label, "note": note, "on": getattr(conn, key), "locked": False}
            for key, label, note in RULES
        ]
        + [
            {
                "key": "roles",
                "label": "اعطا یا حذف نقش از گروه‌های AD",
                "note": "همیشه غیرفعال · قفل‌شده",
                "on": False,
                "locked": True,
            }
        ],
        "rules_note": "نقش‌های ERM مانند مالک ریسک، تأییدکننده و متولی روش هرگز از AD اعطا یا حذف نمی‌شوند. کاربر "
        "غیرفعال تا انتقال مسئولیت‌های باز در رکوردها باقی می‌ماند.",
        "history": [run_row(run) for run in DirectorySync.objects.select_related("run_by")[:12]],
        "successors": [
            {
                "id": user.pk,
                "name": user.get_full_name() or user.username,
                "unit": user.org_unit.name if user.org_unit else "",
            }
            for user in User.objects.filter(is_active=True)
            .select_related("org_unit")
            .order_by("first_name", "last_name")
        ],
        "org_chart": "/units",
    }


def sync_url(user):
    """پیوند صفحه برای دکمه‌ی چارت سازمانی: فقط مدیر سامانه و فقط وقتی اتصال پیکربندی شده است."""
    return "/units/ad-sync" if user.is_system_admin and directory.connection() else None


class AdSyncView(ApiView):
    """GET صفحه؛ POST {action}: preview، apply، test، rules {key,on}، map {ou,unit|"exclude"} و successor {user,successor}."""

    def gate(self, request):
        if not request.user.is_system_admin:
            return None, Response({"detail": "همگام‌سازی AD کار مدیر سامانه است."}, status=403)
        conn = directory.connection()
        if conn is None:
            return None, Response({"detail": "اتصال Active Directory پیکربندی نشده است."}, status=404)
        return conn, None

    def get(self, request):
        conn, refused = self.gate(request)
        return refused or Response(page(conn))

    def post(self, request):
        conn, refused = self.gate(request)
        if refused:
            return refused
        action = request.data.get("action")
        message = None
        if action == "preview":
            plan = directory.preview(conn, request.user)
            message = f"پیش‌نمایش تازه آماده شد · {fa(plan.pending)} مورد در انتظار"
        elif action == "apply":
            message = f"{fa(directory.apply(conn, request.user))} تغییر اعمال شد"
        elif action == "test":
            ok = directory.test_connection(conn)
            message = f"اتصال برقرار است · {conn.state_note}" if ok else f"اتصال ناموفق بود · {conn.state_note}"
        elif action == "rules":
            key = request.data.get("key")
            if key not in RULE_KEYS or not isinstance(request.data.get("on"), bool):
                return Response({"detail": "قاعده‌ی ناشناخته."}, status=400)
            setattr(conn, key, request.data["on"])
            conn._change_reason = "تغییر قواعد همگام‌سازی AD"
            conn.save()
        elif action == "map":
            failure = self.map(conn, request.data)
            if failure:
                return failure
            message = "نگاشت شاخه ثبت شد"
        elif action == "successor":
            user = User.objects.filter(pk=request.data.get("user")).first()
            successor = User.objects.filter(pk=request.data.get("successor")).first()
            if user is None or successor is None:
                return Response({"detail": "کاربر یا جانشین پیدا نشد."}, status=400)
            try:
                moved = directory.transfer(user, successor, request.user)
            except TransferError as error:
                return Response({"detail": str(error)}, status=400)
            message = f"{fa(moved)} مسئولیت به {successor.get_full_name() or successor.username} منتقل شد"
        else:
            return Response({"detail": "عمل ناشناخته."}, status=400)
        return Response({**page(conn), "message": message})

    def map(self, conn, data):
        plan = build_plan(conn)
        branch = next((row for row in plan.branches if row["key"] == data.get("ou")), None)
        if branch is None or branch["state"] != "unmapped":
            return Response({"detail": "این شاخه نیازمند نگاشت نیست."}, status=400)
        if data.get("unit") == "exclude":
            conn.excluded = [*conn.excluded, branch["ou"]]
            conn._change_reason = "مستثنا کردن شاخه‌ی AD"
            conn.save()
            return None
        unit = OrgUnit.objects.filter(pk=data.get("unit"), is_active=True).first()
        if unit is None:
            return Response({"detail": "واحد پیدا نشد."}, status=400)
        if unit.ad_group:
            return Response({"detail": f"{unit.name} به شاخه‌ی {unit.ad_group} نگاشت شده است."}, status=400)
        unit.ad_group = branch["ou"]
        unit._change_reason = CHANGE_REASON_MAP
        unit.save()
        return None


CHANGE_REASON_MAP = "نگاشت شاخه‌ی AD"
