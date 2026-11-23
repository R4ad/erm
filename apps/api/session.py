from django.middleware.csrf import get_token
from django.urls import reverse
from django.utils import timezone
from rest_framework.response import Response

from apps.actions.models import MonitoringNotice
from apps.assessments.models import Assessment
from apps.core.jalali import jalali_year, jalali_year_range
from apps.methodology.services import active_version
from apps.risks.identification import can_answer
from apps.risks.models import Risk

from . import formatting as fmt
from .base import ApiView
from .routes import route_table, spa_route
from .treatment import required_rows


def link(label, url_name, count=None, tone=None):
    """یک پیوند منو. route یعنی همین صفحه در رابط React هست (routes.py)؛ بقیه صفحه‌های جنگو‌اند و با بارگذاری کامل
    باز می‌شوند. key نام ثابت همان صفحه است و رابط React آیکون پیوند را با آن انتخاب می‌کند. count شمار کارهای
    منتظر کنار نام است (فقط وقتی بیشتر از صفر است) و tone رنگ آن: gold برای صف عادی، red برای صف عقب‌افتاده."""
    href = reverse(url_name)
    return {"key": url_name, "label": label, "href": href, "route": spa_route(href), "count": count or None, "tone": tone}


def spa_link(label, key, route, count=None, tone=None):
    """پیوند صفحه‌ای که فقط در رابط React هست (صفحه‌های ماژول‌های منوی فیگما) و نشانی جنگو ندارد."""
    return {"key": key, "label": label, "href": f"/app{route}", "route": route, "count": count or None, "tone": tone}


def inbox_counts(user):
    """شمارنده‌های منو: اعلان‌های پایش نخوانده، ریسک‌های نیازمند اقدام و ریسک‌های در اجرای درمان."""
    return {
        "notices": MonitoringNotice.objects.filter(recipient=user, read_at__isnull=True).count(),
        # همان سطرهای صفحه‌ی «ریسک‌های نیازمند اقدام» (فیگما ۱۴)، تا عدد منو با صفحه یکی باشد.
        "action_required": len(required_rows(user)),
        "in_treatment": Risk.objects.filter(status=Risk.Status.TREATMENT, merged_into__isnull=True).count(),
    }


def navigation(user):
    """منوی کناری فیگما («Navigation 2.0»): «میز کار» و سه ماژول یک چرخه (ارزیابی ریسک، برطرف‌سازی ریسک،
    پیکربندی سامانه)، هر ماژول با گام‌های شماره‌دار. صفحه‌های دیگر (کاتالوگ، کنترل‌ها، پرسشنامه‌ها، ...) از درون
    همین صفحه‌ها و جست‌وجوی سراسری باز می‌شوند."""
    counts = inbox_counts(user)
    config = [link("تعریف متدولوژی", "methodology:active"), link("چارت سازمانی", "organization:unit_list")]
    if user.is_system_admin:
        config.append(link("تعریف کاربر و نقش", "accounts:user_list"))
    desk = [link("کارهای من", "actions:my_work")]
    if can_answer(user):
        # مدیر واحد سناریوی واحدش را از اینجا می‌فرستد؛ عضو GRC آن را در «شناسایی ریسک» تکمیل می‌کند.
        desk.append(spa_link("پاسخ به پرسشنامه‌ها", "desk:questionnaire_answers", "/questionnaire-answers"))
    desk += [
        link("رجیستر ریسک", "risks:risk_list"),
        link("اعلان‌های پایش", "actions:notices", counts["notices"], "gold"),
        link("گزارش مدیریتی", "reports:management"),
    ]
    return {
        "desk": {"title": "میز کار", "items": desk},
        "modules": [
            {
                "key": "assessment",
                "title": "ارزیابی ریسک",
                "items": [
                    spa_link("شناسایی ریسک", "module:identification", "/identification"),
                    spa_link("آنالیز ریسک", "module:analysis", "/analysis"),
                    spa_link("سنجش ریسک", "module:evaluation", "/evaluation"),
                ],
            },
            {
                "key": "treatment",
                "title": "برطرف‌سازی ریسک",
                "items": [
                    spa_link(
                        "ریسک‌های نیازمند اقدام",
                        "module:action_required",
                        "/treatment/required",
                        counts["action_required"],
                        "red",
                    ),
                    spa_link(
                        "ریسک‌های در حال درمان", "module:in_treatment", "/treatment/board", counts["in_treatment"], "gold"
                    ),
                    spa_link("لیست ریسک‌های هدف", "module:targets", "/treatment/targets"),
                ],
            },
            {"key": "config", "title": "پیکربندی سامانه", "items": config},
        ],
    }


def assessment_cycle():
    """کارت «چرخه‌ی ارزیابی» پایین منو: از ریسک‌های فعال رجیستر، چندتا در سال شمسی جاری ارزیابی جاری تأییدشده دارند."""
    today = timezone.localdate()
    year = jalali_year(today)
    start, end = jalali_year_range(year)
    active = Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES).filter(merged_into__isnull=True)
    assessed = active.filter(
        assessments__kind=Assessment.Kind.CURRENT,
        assessments__status=Assessment.Status.APPROVED,
        assessments__approved_at__date__gte=start,
        assessments__approved_at__date__lt=end,
    ).distinct()
    return {"year": year, "assessed": assessed.count(), "total": active.count()}


def method_badge():
    """نشان نسخه‌ی فعال روش ارزیابی در نوار بالا."""
    version = active_version()
    if version is None:
        return None
    return {"number": version.number, "title": version.title, "route": spa_route(reverse("methodology:active"))}


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
                "cycle": assessment_cycle(),
                "method": method_badge(),
                # کدام نشانی‌های جنگو در رابط React هم هستند؛ رابط هر پیوند سرور را با این جدول به صفحه‌ی خودش می‌برد.
                "routes": route_table(),
                "logout_url": reverse("api:logout"),
                "classic_home": reverse("core:home"),
                # کوکی csrftoken را می‌سازد تا درخواست‌های POST و PUT بعدی آن را بفرستند.
                "csrf_token": get_token(request),
            }
        )
