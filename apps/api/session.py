from django.middleware.csrf import get_token
from django.urls import reverse
from rest_framework.response import Response

from apps.actions.models import MonitoringNotice
from apps.controls.permissions import can_view_soa
from apps.risks.permissions import visible_risks
from apps.workflow.permissions import answerable_questions

from . import formatting as fmt
from .base import ApiView
from .routes import route_table, spa_route


def link(label, url_name, badge=None):
    """یک پیوند منو. route یعنی همین صفحه در رابط React هست (routes.py)؛ بقیه صفحه‌های جنگو‌اند و با بارگذاری کامل
    باز می‌شوند. key نام ثابت همان صفحه است و رابط React آیکون پیوند را با آن انتخاب می‌کند. badge شمار چیزهای
    نخوانده یا بی‌جواب همان صفحه است و فقط روی صفحه‌هایی می‌آید که شمارشش یک پرس‌وجوی ساده است."""
    href = reverse(url_name)
    return {"key": url_name, "label": label, "href": href, "route": spa_route(href), "badge": badge}


def inbox_counts(user):
    """شمار کارهای نخوانده‌ی منو. فقط صف‌هایی که با یک count ساده شمرده می‌شوند: «کارهای من» شمارنده ندارد، چون
    ساختن فهرستش گران است و خود صفحه خلاصه‌اش را بالای کارها می‌گوید."""
    return {
        "notices": MonitoringNotice.objects.filter(
            recipient=user, read_at__isnull=True, risk__in=visible_risks(user)
        ).count(),
        "questions": answerable_questions(user).count(),
    }


def navigation(user):
    """منوی اصلی. گروه‌ها نام مرحله‌های خود روش‌اند (شناسایی، ارزیابی، مواجهه)، تا منو همان ترتیبی را یاد بدهد
    که سند روش و پرونده‌ی ارزیابی دارند. منوی صفحه‌های جنگو (templates/base.html) همین گروه‌ها را دارد."""
    counts = inbox_counts(user)
    groups = [
        {
            "title": "میز کار",
            "items": [
                link("کارهای من", "actions:my_work"),
                link("اعلان‌های پایش", "actions:notices", badge=counts["notices"]),
                link("گزارش مدیریتی", "reports:management"),
            ],
        },
        {
            "title": "شناسایی ریسک",
            "items": [
                link("رجیستر ریسک", "risks:risk_list"),
                link("جهان ریسک", "risks:coverage"),
                link("کتابخانه‌ی سناریو", "risks:scenario_list"),
                link("شواهد", "risks:evidence_list"),
                link("ادغام و تفکیک", "workflow:change_request_list"),
            ],
        },
        {
            "title": "ارزیابی",
            "items": [
                link("ارزیابی ریسک", "assessments:assessment_list"),
                link("روش ارزیابی", "methodology:active"),
                link("دسته‌های ریسک", "risks:category_list"),
            ],
        },
        {
            "title": "مواجهه",
            "items": [
                link("اقدام‌ها", "actions:action_list"),
                link("پذیرش‌های ریسک", "actions:acceptance_list"),
                link("کتابخانه‌ی کنترل", "controls:control_list"),
                *([link("بیانیه‌ی کاربردپذیری", "controls:soa_list")] if can_view_soa(user) else []),
            ],
        },
        {
            "title": "پرسشنامه",
            "items": [
                link("پاسخ به سؤال‌ها", "questionnaires:answer_home"),
                link("پرسش‌های ریسک", "workflow:question_list", badge=counts["questions"]),
                link("پاسخ‌ها و بررسی", "questionnaires:response_list"),
                link("تعریف پرسشنامه‌ها", "questionnaires:questionnaire_list"),
            ],
        },
        {
            "title": "کاتالوگ سازمان",
            "items": [
                link("خدمات", "catalog:service_list"),
                link("تعهدها", "catalog:commitment_list"),
                link("دارایی‌ها", "catalog:asset_list"),
                link("تأمین‌کنندگان", "catalog:supplier_list"),
                link("بانک‌ها", "catalog:customer_list"),
                link("ساختار سازمانی", "organization:unit_list"),
            ],
        },
    ]
    admin = []
    if user.is_system_admin:
        admin += [
            link("کاربران", "accounts:user_list"),
            link("ورود کارکنان", "accounts:staff_import"),
            link("تعطیلات", "workcalendar:holiday_list"),
        ]
    if user.can_view_audit_log:
        admin.append(link("سوابق ممیزی", "audit:event_list"))
    if admin:
        groups.append({"title": "مدیریت سامانه", "items": admin})
    return groups


class SessionView(ApiView):
    """کاربر واردشده، نقش‌ها، منو و تاریخ امروز؛ اولین چیزی که رابط React می‌خواند."""

    def get(self, request):
        user = request.user
        return Response(
            {
                "user": {
                    **fmt.person(user),
                    "username": user.username,
                    "roles": user.role_names,
                    "job_title": user.job_title,
                    "org_unit": str(user.org_unit) if user.org_unit_id else None,
                },
                "today": fmt.today(),
                "navigation": navigation(user),
                # کدام نشانی‌های جنگو در رابط React هم هستند؛ رابط هر پیوند سرور را با این جدول به صفحه‌ی خودش می‌برد.
                "routes": route_table(),
                "logout_url": reverse("api:logout"),
                "classic_home": reverse("core:home"),
                # کوکی csrftoken را می‌سازد تا درخواست‌های POST و PUT بعدی آن را بفرستند.
                "csrf_token": get_token(request),
            }
        )
