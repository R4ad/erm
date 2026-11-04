from django.middleware.csrf import get_token
from django.urls import reverse
from rest_framework.response import Response

from apps.controls.permissions import can_view_soa

from . import formatting as fmt
from .base import ApiView


def link(label, url_name, route=None):
    """یک پیوند منو. route یعنی همین صفحه در رابط React هست؛ بقیه صفحه‌های جنگو‌اند و با بارگذاری کامل باز می‌شوند.
    key نام ثابت همان صفحه است و رابط React آیکون پیوند را با آن انتخاب می‌کند."""
    return {"key": url_name, "label": label, "href": reverse(url_name), "route": route}


def navigation(user):
    """منوی اصلی، با همان گروه‌ها و همان قاعده‌های دیدن که منوی صفحه‌های جنگو (templates/base.html) دارد."""
    groups = [
        {
            "title": "کار روزانه",
            "items": [
                link("کارهای من", "actions:my_work", "/"),
                link("پاسخ به سؤال‌ها", "questionnaires:answer_home", "/questionnaires"),
            ],
        },
        {
            "title": "ریسک‌ها",
            "items": [
                link("رجیستر ریسک", "risks:risk_list", "/risks"),
                link("کتابخانه‌ی سناریو", "risks:scenario_list"),
                link("شواهد", "risks:evidence_list"),
                link("ادغام و تفکیک", "workflow:change_request_list"),
                link("جهان ریسک", "risks:coverage"),
                link("دسته‌های ریسک", "risks:category_list"),
            ],
        },
        {
            "title": "پرسشنامه",
            "items": [
                link("پرسش‌های ریسک", "workflow:question_list", "/questionnaires/risk-questions"),
                link("پاسخ‌ها و بررسی", "questionnaires:response_list"),
                link("تعریف پرسشنامه‌ها", "questionnaires:questionnaire_list"),
            ],
        },
        {
            "title": "کنترل‌ها و اقدامات",
            "items": [
                link("کتابخانه‌ی کنترل", "controls:control_list"),
                *([link("بیانیه‌ی کاربردپذیری", "controls:soa_list")] if can_view_soa(user) else []),
                link("اقدام‌ها", "actions:action_list"),
                link("پذیرش‌های ریسک", "actions:acceptance_list"),
            ],
        },
        {
            "title": "خدمات و سازمان",
            "items": [
                link("خدمات", "catalog:service_list"),
                link("تعهدها", "catalog:commitment_list"),
                link("دارایی‌ها", "catalog:asset_list"),
                link("تأمین‌کنندگان", "catalog:supplier_list"),
                link("بانک‌ها", "catalog:customer_list"),
                link("روش ارزیابی", "methodology:active"),
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
                "logout_url": reverse("api:logout"),
                "classic_home": reverse("core:home"),
                # کوکی csrftoken را می‌سازد تا درخواست‌های POST و PUT بعدی آن را بفرستند.
                "csrf_token": get_token(request),
            }
        )
