"""«تعریف کاربر و نقش» در رابط React (فیگما ۱۹): کاربران با نقش‌های سامانه‌ای، دامنه‌ی مشتری، منبع حساب و آخرین ورود؛
یازده نقش سند تحلیل با دارندگان، دامنه و اختیار پذیرش؛ ماتریس نقش و دسترسی (جدول RACI روش)؛ و تفکیک وظایف.

بعضی نقش‌ها گروه جنگو هستند (مدیر سامانه، کارشناس ریسک، کارگروه، کمیته، بازدیدکننده) و بقیه از روی سوابق شناخته
می‌شوند: مالک ریسک از ریسک‌های فعال، مدیر واحد از واحدهای تحت مدیریت، مسئول کنترل از کنترل‌ها، مدیر پروژه از مالک
اقدام (وقتی مالک ریسک نیست) و کارشناس از مجری اقدام. متولی روش همان اختیار ویرایش روش (عضو GRC) است و مرجع مجاز
همان کمیته‌ی امنیت که سطح بالا و بحرانی را می‌پذیرد. این صفحه فقط برای مدیر سامانه است."""

from collections import defaultdict
from datetime import timedelta

from django.contrib.auth.models import Group
from django.db.models import F
from django.urls import reverse
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.actions.models import TreatmentAction
from apps.catalog.models import Service
from apps.controls.models import Control
from apps.core.jalali import to_jalali
from apps.methodology.models import RiskLevel
from apps.methodology.permissions import MANAGE_ROLES
from apps.methodology.services import active_version
from apps.organization.services import get_subtree_ids
from apps.risks.models import Risk

from .base import ApiView
from .treatment import fa

INACTIVE = [Risk.Status.CLOSED, Risk.Status.REJECTED]
SCOPES = {"unit": "واحد خود و زیرواحدها", "assigned": "خدمات و مشتریان تخصیص‌یافته", "all": "همه‌ی واحدها"}
GLOBAL_ROLES = {"admin", "method", "authority", "workgroup", "analyst"}


def group_members(*names):
    return set(User.objects.filter(groups__name__in=names).values_list("pk", flat=True))


def holders():
    """دارندگان هر نقش، به ترتیب ستون‌های ماتریس فیگما."""
    active_risks = Risk.objects.exclude(status__in=INACTIVE).filter(merged_into__isnull=True)
    return {
        "admin": group_members(Role.SYSTEM_ADMIN)
        | set(User.objects.filter(is_superuser=True).values_list("pk", flat=True)),
        "method": group_members(*MANAGE_ROLES),
        "authority": group_members(Role.SECURITY_COMMITTEE),
        "workgroup": group_members(Role.SECURITY_WORKGROUP),
        "analyst": group_members(Role.GRC_MEMBER),
        "owner": set(active_risks.values_list("owner_id", flat=True)),
        "unit_manager": set(User.objects.filter(managed_units__isnull=False).values_list("pk", flat=True))
        | group_members(Role.UNIT_MANAGER),
        "control_owner": set(Control.objects.filter(is_active=True).values_list("owner_id", flat=True)),
        "expert": set(TreatmentAction.objects.values_list("assignee_id", flat=True)),
        "project": set(
            TreatmentAction.objects.exclude(owner_id=F("plan__risk__owner_id")).values_list("owner_id", flat=True)
        ),
        "viewer": group_members(Role.VIEWER),
    }


# برچسب، رنگ، شرح، دامنه و گروه جنگوی هر نقش (اگر نقش گروه است)
ROLES = [
    (
        "admin",
        "مدیر سامانه",
        "brand",
        "کاربر، نقش، چارت سازمانی و تعطیلات را تعریف می‌کند؛ در ارزیابی و تصمیم نقشی ندارد.",
        "all",
        Role.SYSTEM_ADMIN,
    ),
    (
        "method",
        "متولی روش",
        "success",
        "پیش‌نویس روش (ParameterSet) را ویرایش و برای تصویب می‌فرستد؛ کنترل کیفیت ارزیابی با اوست.",
        "all",
        None,
    ),
    (
        "authority",
        "مرجع مجاز",
        "warning",
        "پذیرش ریسک بالا و بحرانی و تصویب نسخه‌ی روش و اشتها با اوست.",
        "all",
        Role.SECURITY_COMMITTEE,
    ),
    (
        "workgroup",
        "کارگروه ریسک",
        "info",
        "اختلاف ارزیابی و ریسک‌های بالا را بررسی و به مرجع مجاز پیشنهاد می‌کند.",
        "all",
        Role.SECURITY_WORKGROUP,
    ),
    (
        "analyst",
        "کارشناس ریسک",
        "info",
        "ورودی‌ها را به سناریو می‌رساند، A، B و I را می‌سنجد و اثربخشی اقدام را تأیید می‌کند.",
        "all",
        Role.GRC_MEMBER,
    ),
    (
        "owner",
        "مالک ریسک",
        "warning",
        "مسئول پیامد کسب‌وکاری و تصمیم مواجهه؛ پاسخ‌گوی نهایی (A) ثبت سناریو، تهیه‌ی طرح، اجرای اقدام و پایش. تأیید طرح و باقیمانده با اوست.",
        "unit",
        None,
    ),
    (
        "unit_manager",
        "مدیر واحد",
        "info",
        "مالک ریسک‌های واحد را تعیین می‌کند و پذیرش سطح متوسط را کنار مالک امضا می‌کند.",
        "unit",
        Role.UNIT_MANAGER,
    ),
    (
        "control_owner",
        "مسئول کنترل",
        "success",
        "اجرا و شواهد کنترل با اوست؛ در آزمون کنترل شاهد می‌دهد.",
        "assigned",
        None,
    ),
    ("expert", "کارشناس", "neutral", "مجری اقدام طرح مواجهه؛ شواهد اجرا را ثبت می‌کند.", "assigned", None),
    (
        "project",
        "مدیر پروژه",
        "info",
        "مالک اقدامی که مالک ریسک نیست؛ پروژه‌ی اجرای اقدام را پیش می‌برد.",
        "assigned",
        None,
    ),
    (
        "viewer",
        "بازدیدکننده",
        "neutral",
        "ممیز یا ناظر؛ فقط گزارش و سوابق را در دامنه‌ی تعیین‌شده می‌بیند.",
        "all",
        Role.VIEWER,
    ),
]

# ماتریس فیگما (برگرفته از RACI روش): F کامل، L محدود به دامنه
MATRIX = [
    (
        "intake",
        "ثبت ورودی و سناریو",
        "شناسایی",
        {"analyst": "F", "workgroup": "L", "owner": "L", "unit_manager": "L", "expert": "L", "project": "L"},
    ),
    ("analysis", "تحلیل و امتیازدهی A، B، I", "آنالیز", {"analyst": "F", "owner": "L"}),
    ("qc", "کنترل کیفیت ارزیابی", "سنجش", {"method": "F", "workgroup": "L"}),
    ("decision", "تصمیم و پذیرش ریسک", "سنجش", {"authority": "F", "workgroup": "L", "owner": "L", "unit_manager": "L"}),
    (
        "treatment",
        "تهیه و اجرای طرح مواجهه",
        "برطرف‌سازی",
        {"owner": "F", "analyst": "L", "unit_manager": "L", "control_owner": "L", "expert": "L", "project": "L"},
    ),
    ("verify", "آزمون و تأیید اثربخشی", "برطرف‌سازی", {"analyst": "F", "control_owner": "L"}),
    ("method", "ویرایش متدولوژی (ParameterSet)", "پیکربندی", {"method": "F"}),
    ("approve", "تصویب نسخه‌ی روش و اشتها", "پیکربندی", {"authority": "F", "workgroup": "L"}),
    ("admin", "مدیریت کاربران، نقش و چارت", "پیکربندی", {"admin": "F", "unit_manager": "L"}),
    (
        "reports",
        "مشاهده‌ی گزارش و داشبورد",
        "میز کار",
        {
            **{key: "F" for key in ("admin", "method", "authority", "workgroup", "analyst")},
            **{key: "L" for key in ("owner", "unit_manager", "control_owner", "expert", "project", "viewer")},
        },
    ),
]

SOD_RULES = [
    ("ارزیاب یک ارزیابی نمی‌تواند کنترل کیفیت همان ارزیابی را تأیید کند.", "در گردش کنترل کیفیت"),
    ("مجری اقدام نمی‌تواند تأییدکننده‌ی اثربخشی همان اقدام باشد.", "قید پایگاه داده"),
    ("متولی روش نمی‌تواند نسخه‌ی پیشنهادی خود را تصویب کند؛ تصویب با مرجع مجاز است.", "در ثبت تصویب"),
    ("اگر مالک و مرجع مجاز یک شخص‌اند، یک تصمیم با همان هویت ثبت می‌شود.", "در گردش پذیرش"),
]


def acceptance(key, levels):
    """اختیار پذیرش نقش در هر سطح روش جاری؛ سطح‌های پشت سر هم با یک متن، یک ردیف می‌شوند (مثل «بالا و بحرانی»)."""
    CA = RiskLevel.CoApprover
    rows = []
    for level in levels:
        validity = f"{fa(level.acceptance_value)} {level.get_acceptance_unit_display()}"
        if key == "owner":
            text, tone = {
                CA.NONE: (f"پذیرش مستقل · {validity}", "success"),
                CA.UPPER_MANAGER: ("با مجوز مدیر بالادست", "neutral"),
                CA.SECURITY_COMMITTEE: ("فقط پیشنهاد به کمیته امنیت", "warning"),
            }[level.co_approver]
        elif key == "unit_manager" and level.co_approver == CA.UPPER_MANAGER:
            text, tone = (f"امضای کنار مالک (مدیر بالادست) · {validity}", "info")
        elif key == "authority" and level.co_approver == CA.SECURITY_COMMITTEE:
            text, tone = (f"امضای کنار مالک (کمیته امنیت) · {validity}", "warning")
        else:
            continue
        if rows and rows[-1]["text"] == text:
            rows[-1]["levels"].append(level.name)
        else:
            rows.append({"levels": [level.name], "text": text, "tone": tone})
    for row in rows:
        row["label"] = " و ".join(row["levels"]) if len(row["levels"]) > 1 else f"سطح {row['levels'][0]}"
    return rows


def last_login(value):
    if value is None:
        return None
    moment = timezone.localtime(value)
    today = timezone.localdate()
    clock = moment.strftime("%H:%M")
    if moment.date() == today:
        label = f"امروز {clock}"
    elif moment.date() == today - timedelta(days=1):
        label = f"دیروز {clock}"
    else:
        label = to_jalali(moment.date())
    return {"iso": moment.isoformat(), "label": fa(label)}


def conflicts():
    """مالک ریسکی که مسئول کنترل همان ریسک هم هست: تأیید نتیجه‌ی اقدام آن مسیر باید با فرد مستقل باشد."""
    pairs = (
        Risk.controls.through.objects.filter(risk__owner_id=F("control__owner_id"))
        .exclude(risk__status__in=INACTIVE)
        .filter(risk__merged_into__isnull=True)
        .select_related("risk__owner", "control")
        .order_by("risk__code", "control__code")
    )
    grouped = defaultdict(list)
    for pair in pairs:
        grouped[pair.risk].append(pair.control.code)
    return [
        {
            "key": f"owner-control-{risk.pk}",
            "user": {"id": risk.owner_id, "name": risk.owner.get_full_name() or risk.owner.username},
            "title": "مالک ریسک + مسئول کنترل",
            "note": f"مالک {risk.code} و مسئول {'، '.join(codes)} در همان مسیر؛ تأیید نتیجه‌ی اقدام باید با فرد مستقل باشد.",
            "state": "open",
            "href": risk.get_absolute_url(),
        }
        for risk, codes in grouped.items()
    ]


def customer_scope(user, keys, service_customers):
    """«همه‌ی مشتریان» برای نقش‌های سراسری و بازدیدکننده‌ی بی‌دامنه؛ برای بقیه مشتریان خدمات واحدها و خدمات خودشان."""
    scope = user.scope_unit_ids() if "viewer" in keys else None
    if keys & GLOBAL_ROLES or ("viewer" in keys and scope is None):
        return None
    units = set(scope or ())
    for unit in user.managed_units.all():
        units |= get_subtree_ids(unit)
    if user.org_unit_id:
        units.add(user.org_unit_id)
    names = set()
    for unit_id, owner_id, customers in service_customers:
        if unit_id in units or owner_id == user.pk:
            names |= customers
    return sorted(names)


def status_of(user, conflicted, today):
    if not user.is_active:
        return {"value": "inactive", "label": "غیرفعال", "tone": "neutral"}
    if user.access_expires and user.access_expires < today:
        return {"value": "expired", "label": "دسترسی منقضی", "tone": "danger"}
    if user.pk in conflicted:
        return {"value": "sod", "label": "تعارض SoD", "tone": "warning"}
    if user.access_expires:
        jalali = to_jalali(user.access_expires)
        return {"value": "temporary", "label": f"موقت تا {fa(jalali[5:])}", "tone": "info"}
    return {"value": "active", "label": "فعال", "tone": "success"}


class UsersRolesView(ApiView):
    def get(self, request):
        if not request.user.is_system_admin:
            raise PermissionDenied("این صفحه فقط برای مدیر سامانه است.")
        today = timezone.localdate()
        held = holders()
        role_of = defaultdict(set)
        for key, ids in held.items():
            for pk in ids:
                role_of[pk].add(key)
        found = conflicts()
        conflicted = {item["user"]["id"] for item in found}
        services = Service.objects.filter(is_active=True).prefetch_related("customers")
        service_customers = [
            (service.org_unit_id, service.owner_id, {customer.name for customer in service.customers.all()})
            for service in services
        ]
        users = (
            User.objects.select_related("org_unit")
            .prefetch_related("managed_units", "scope_units")
            .order_by("last_name", "first_name")
        )
        labels = {key: (label, tone) for key, label, tone, *_ in ROLES}
        rows = []
        for user in users:
            keys = role_of.get(user.pk, set())
            rows.append(
                {
                    "id": user.pk,
                    "name": user.get_full_name() or user.username,
                    "username": user.username,
                    "unit": user.org_unit.name if user.org_unit_id else None,
                    "job_title": user.job_title,
                    "roles": [
                        {"key": key, "label": labels[key][0], "tone": labels[key][1]}
                        for key, *_ in ROLES
                        if key in keys
                    ],
                    "customers": customer_scope(user, keys, service_customers),
                    "source": {"value": user.source, "label": user.get_source_display()},
                    "last_login": last_login(user.last_login),
                    "status": status_of(user, conflicted, today),
                    "edit_url": reverse("admin:accounts_user_change", args=[user.pk]),
                }
            )

        version = active_version()
        levels = list(version.risk_levels.order_by("rank")) if version else []
        groups = {group.name: group.pk for group in Group.objects.all()}
        roles = [
            {
                "key": key,
                "label": label,
                "tone": tone,
                "description": description,
                "kind": "group" if group else "derived",
                "kind_label": "گروه دسترسی" if group else "از روی سوابق",
                "scope": {"value": scope, "label": SCOPES[scope]},
                "count": len(held[key]),
                "acceptance": acceptance(key, levels),
                "edit_url": reverse("admin:auth_group_change", args=[groups[group]]) if group in groups else None,
            }
            for key, label, tone, description, scope, group in ROLES
        ]
        # فعال‌ها اول، و میانشان کاربرهای پرنقش‌تر
        rows.sort(key=lambda row: (row["status"]["value"] in ("inactive", "expired"), -len(row["roles"])))
        active = [row for row in rows if row["status"]["value"] not in ("inactive", "expired")]
        soon = today + timedelta(days=30)
        return Response(
            {
                "summary": {
                    "active": len(active),
                    "units": len({user.org_unit_id for user in users if user.is_active and user.org_unit_id}),
                    "ad": sum(1 for row in active if row["source"]["value"] == User.Source.AD),
                    "local": sum(1 for row in active if row["source"]["value"] == User.Source.LOCAL),
                    "temporary": sum(
                        1
                        for user in users
                        if user.is_active and user.access_expires and today <= user.access_expires <= soon
                    ),
                    "roles": len(ROLES),
                    "conflicts": len(found),
                },
                "users": rows,
                "roles": roles,
                "matrix": [
                    {"key": key, "label": label, "stage": stage, "access": access}
                    for key, label, stage, access in MATRIX
                ],
                "sod": {"conflicts": found, "rules": [{"text": text, "where": where} for text, where in SOD_RULES]},
                "add_user_url": reverse("accounts:user_create"),
                "login_report_url": f"{reverse('audit:event_list')}?event=login",
                "import_url": reverse("accounts:staff_import"),
            }
        )
