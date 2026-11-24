"""«اعلان‌های پایش» در رابط React (فیگما ۲۰): صندوق اعلان‌های کاربر با نوع، عنوان، شرح، برچسب‌ها و دکمه‌ی کار هر اعلان؛
کاشی‌های محرک فوری، بازبینی نزدیک، پذیرش رو به انقضا و شاهد منقضی‌شونده؛ تقویم بازبینی دوره‌ای هر سطح؛ محرک‌های
بازسنجی بخش ۲۱ روش؛ و کانال‌های دریافت.

اعلان‌ها را همان زمان‌بند پایش (actions.monitoring) می‌سازد و کلید رویدادشان می‌گوید از کدام بازبینی، پذیرش یا اقدام
آمده‌اند؛ این‌جا فقط همان رکورد خوانده و به شکل کارت فیگما درمی‌آید. اعلان‌های شناسایی از پاسخنامه
(apps/questionnaires/notices.py) ریسک ندارند و موضوعشان پاسخنامه است."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response

from apps.actions.models import MonitoringNotice, NoticePreference, RiskAcceptance, RiskReview, TreatmentAction
from apps.actions.monitoring import latest_current
from apps.controls.models import ControlAssessment
from apps.core.jalali import to_jalali
from apps.methodology.models import MethodParameter
from apps.methodology.services import active_version, parameter
from apps.questionnaires.permissions import visible_responses
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks
from apps.workcalendar.workdays import add_period

from .base import ApiView
from .method_definition import cycle
from .treatment import fa

T = RiskReview.Trigger
URGENT = {T.INCIDENT, T.CONTROL}
TAB_OF_TRIGGER = {T.PERIODIC: "periodic", T.ANNUAL: "periodic", T.ACCEPTANCE: "acceptance", T.EVIDENCE: "evidence"}
ICON_OF_TRIGGER = {
    T.INCIDENT: ("lightning", "danger"),
    T.CONTROL: ("x-circle", "danger"),
    T.PERIODIC: ("calendar", "warning"),
    T.ANNUAL: ("calendar", "warning"),
    T.ACCEPTANCE: ("signature", "info"),
    T.EVIDENCE: ("paperclip", "warning"),
    T.CHANGE: ("layers", "info"),
    T.DEPENDENCY: ("link", "neutral"),
    T.CUSTOMER: ("users", "neutral"),
    T.REQUIREMENT: ("file-text", "info"),
}
TABS = [
    ("all", "همه"),
    ("trigger", "محرک‌ها"),
    ("periodic", "بازبینی دوره‌ای"),
    ("acceptance", "انقضای پذیرش"),
    ("evidence", "شاهد"),
]


def jalali(day):
    return fa(to_jalali(day)) if day else None


def person_chip(label, user):
    return f"{label}: {user.get_full_name() or user.username}" if user else None


def group_of(created, today):
    day = timezone.localdate(created)
    if day == today:
        return "today", "امروز"
    if day == today - timedelta(days=1):
        return "yesterday", "دیروز"
    if day > today - timedelta(days=7):
        return "week", "این هفته"
    return "older", "قدیمی‌تر"


def ago(created, now):
    minutes = int((now - created).total_seconds() // 60)
    if minutes < 60:
        return f"{fa(max(1, minutes))} دقیقه پیش"
    if minutes < 24 * 60:
        return f"{fa(minutes // 60)} ساعت پیش"
    return None


def visible_notices(user):
    """اعلان‌های کاربر که موضوعشان (ریسک یا پاسخنامه) هنوز برایش دیدنی است."""
    return MonitoringNotice.objects.filter(recipient=user).filter(
        Q(risk__in=visible_risks(user)) | Q(risk__isnull=True, response__in=visible_responses(user))
    )


# کلید اعلان‌های پاسخنامه ← (آیکون، لحن). کلید اجرای شناسایی وضعیت پایانش را دارد (ai-run:{pk}:{status}).
RESPONSE_CARDS = {
    "succeeded": ("lightning", "info"),
    "empty": ("file-text", "neutral"),
    "failed": ("x-circle", "danger"),
    "returned": ("file-text", "warning"),
    "resubmitted": ("file-text", "info"),
    "identified": ("check-square", "info"),
    "reviewed": ("check-square", "neutral"),
}


def response_card(notice):
    """کارت اعلان پاسخنامه: پیام همان عنوان است و دکمه به بررسی پاسخنامه یا ویزارد پاسخ‌دهنده می‌رود."""
    parts = notice.event_key.split(":")
    icon, tone = RESPONSE_CARDS.get(parts[2] if len(parts) > 2 else "", ("bell", "neutral"))
    route = notice.href.removeprefix("/app") if notice.href.startswith("/app/") else None
    return {
        "tab": "other",
        "icon": icon,
        "tone": tone,
        "title": notice.message,
        "body": "",
        "chips": [notice.response.code] if notice.response else [],
        "mine": True,
        "cta": {"label": "مشاهده", "href": notice.href, "route": route, "icon": "arrow-left", "primary": False},
    }


def related(notices):
    """رکورد پشت هر اعلان، از روی پیشوند کلید رویداد، با یک پرس‌وجو برای هر نوع."""
    ids = {"review": set(), "acceptance": set(), "action": set()}
    for notice in notices:
        prefix, _, rest = notice.event_key.partition(":")
        head = rest.split(":")[0]
        if head.isdigit():
            if prefix in ("trigger", "review"):
                ids["review"].add(int(head))
            elif prefix in ids:
                ids[prefix].add(int(head))
    return {
        "review": RiskReview.objects.select_related("responsible").in_bulk(ids["review"]),
        "acceptance": RiskAcceptance.objects.select_related("assessment__decision_level").in_bulk(ids["acceptance"]),
        "action": TreatmentAction.objects.select_related("assignee").in_bulk(ids["action"]),
    }


def card(notice, records, today, now):
    """کارت فیگما برای یک اعلان: نوع (زبانه)، آیکون، عنوان، شرح، برچسب‌ها و دکمه‌ی کار."""
    risk = notice.risk
    if risk is None:
        key, label = group_of(notice.created_at, today)
        return {
            "id": notice.pk,
            **response_card(notice),
            "group": {"key": key, "label": label},
            "created": {"iso": notice.created_at.isoformat(), "ago": ago(notice.created_at, now)},
            "unread": notice.read_at is None,
        }
    prefix, _, rest = notice.event_key.partition(":")
    head = rest.split(":")[0]
    pk = int(head) if head.isdigit() else None
    tab, icon, tone = "other", "bell", "neutral"
    title, body, chips = notice.message, "", [risk.code]
    cta = {"label": "مشاهده", "href": notice.href, "icon": "arrow-left", "primary": False}

    review = records["review"].get(pk) if prefix in ("trigger", "review") else None
    acceptance = records["acceptance"].get(pk) if prefix == "acceptance" else None
    action = records["action"].get(pk) if prefix == "action" else None
    if review:
        tab = TAB_OF_TRIGGER.get(review.trigger, "trigger")
        icon, tone = ICON_OF_TRIGGER.get(review.trigger, ("bell", "neutral"))
        label = review.get_trigger_display()
        title = f"{label} · {risk.code}"
        if review.trigger in (T.PERIODIC, T.ANNUAL) and review.assessment_id and review.assessment.decision_level_id:
            level = review.assessment.decision_level
            title = f"بازبینی {cycle(level.review_value, level.review_unit)} ریسک {level.name} {risk.code}"
        body = review.reason
        chips += [person_chip("مالک", review.responsible), f"مهلت: {jalali(review.due)}"]
        done = review.completed_at is not None
        if review.trigger in URGENT:
            cta = {"label": "آغاز بازسنجی", "href": review.get_absolute_url(), "icon": "flow", "primary": not done}
        elif review.trigger in (T.PERIODIC, T.ANNUAL):
            cta = {"label": "باز کردن ریسک", "href": risk.get_absolute_url(), "icon": "arrow-left", "primary": False}
        elif review.trigger == T.EVIDENCE:
            cta = {"label": "جایگزینی شاهد", "href": review.get_absolute_url(), "icon": "paperclip", "primary": False}
        else:
            cta = {
                "label": "باز کردن بازبینی",
                "href": review.get_absolute_url(),
                "icon": "arrow-left",
                "primary": False,
            }
        if done:
            chips.append("بررسی شد")
    elif acceptance:
        tab, icon, tone = "acceptance", "signature", "info"
        days = (acceptance.end_date - today).days
        title = (
            f"پذیرش {acceptance.code} منقضی شد"
            if days < 0
            else f"انقضای پذیرش {acceptance.code} تا {fa(days)} روز دیگر"
        )
        level = acceptance.assessment.decision_level
        body = (
            f"پذیرش {level.name if level else ''} {risk.code} · تمدید خودکار ممنوع است؛ تصمیم جدید یا بازبینی لازم است."
        )
        stage = rest.split(":")[1] if rest.count(":") else ""
        chips += [
            person_chip("مالک", risk.owner),
            {"first": "یادآوری اول", "second": "یادآوری دوم", "expired": "منقضی"}.get(stage),
        ]
        cta = {"label": "بازبینی پذیرش", "href": acceptance.get_absolute_url(), "icon": "signature", "primary": False}
    elif action:
        tab, icon, tone = "other", "check-square", "warning" if "overdue" in rest else "info"
        title = notice.message
        body = action.title
        chips += [person_chip("مجری", action.assignee), f"سررسید: {jalali(action.due_date)}"]
        cta = {"label": "باز کردن اقدام", "href": action.get_absolute_url(), "icon": "arrow-left", "primary": False}
    elif prefix == "containment":
        tab, icon, tone = "other", "warning", "danger"
        title = f"مهلت مهار {risk.code} رسیده است"
        body = "اقدام بی‌درنگ و ارجاع به مقام مجاز لازم است."
        chips.append(person_chip("مالک", risk.owner))
        cta = {"label": "باز کردن ریسک", "href": risk.get_absolute_url(), "icon": "arrow-left", "primary": True}
    else:
        chips.append(person_chip("مالک", risk.owner))
    key, label = group_of(notice.created_at, today)
    when = ago(notice.created_at, now)
    if when and tab == "trigger":
        chips.append(when)
    return {
        "id": notice.pk,
        "tab": tab,
        "icon": icon,
        "tone": tone,
        "title": title,
        "body": body,
        "chips": [chip for chip in chips if chip],
        "group": {"key": key, "label": label},
        "created": {"iso": notice.created_at.isoformat(), "ago": when},
        "unread": notice.read_at is None,
        "mine": risk.owner_id == notice.recipient_id
        or (review is not None and review.responsible_id == notice.recipient_id),
        "cta": cta,
    }


def next_periodic(risk, base, today):
    """تاریخ بازبینی دوره‌ای بعدی ریسک: از آخرین بازبینی دوره‌ایِ بسته‌شده یا تأیید ارزیابی جاری، به اندازه‌ی دوره‌ی سطح."""
    last = (
        risk.monitoring_reviews.filter(assessment=base, trigger=T.PERIODIC, completed_at__isnull=False)
        .order_by("-completed_at")
        .first()
    )
    start = timezone.localdate(last.completed_at) if last else timezone.localdate(base.approved_at)
    level = base.decision_level
    return add_period(start, level.review_value, level.review_unit)


def calendar(user, today):
    version = active_version()
    if version is None:
        return []
    rows = {
        level.rank: {
            "rank": level.rank,
            "name": level.name,
            "cycle": cycle(level.review_value, level.review_unit),
            "count": 0,
            "next": None,
        }
        for level in version.risk_levels.all()
    }
    risks = visible_risks(user).exclude(status__in=Risk.CLOSED_STATUSES).filter(merged_into__isnull=True)
    for risk in risks:
        base = latest_current(risk)
        if not base or not base.decision_level_id or not base.approved_at or base.decision_level.rank not in rows:
            continue
        row = rows[base.decision_level.rank]
        row["count"] += 1
        due = next_periodic(risk, base, today)
        row["next"] = min(row["next"], due) if row["next"] else due
    return [
        {**row, "next": jalali(row["next"]), "overdue": bool(row["next"] and row["next"] < today)}
        for row in sorted(rows.values(), key=lambda item: item["rank"], reverse=True)
    ]


def triggers(version):
    incident = int(parameter(version, MethodParameter.Key.REASSESS_INCIDENT)) if version else 1
    requirement = int(parameter(version, MethodParameter.Key.REASSESS_REQUIREMENT)) if version else 5
    return [
        {"key": T.CHANGE, "label": "معماری یا خدمت جدید و تغییر مهم", "rule": "ارزیابی پیش از تصویب تولید"},
        {"key": T.INCIDENT, "label": T.INCIDENT.label, "rule": f"ارجاع فوری؛ بازسنجی حداکثر {fa(incident)} روز کاری"},
        {"key": T.CONTROL, "label": T.CONTROL.label, "rule": f"تعلیق اعتبار کاهش؛ حداکثر {fa(incident)} روز کاری"},
        {"key": T.DEPENDENCY, "label": "تغییر تأمین‌کننده یا وابستگی مشترک", "rule": "پیش از تعهد و انتقال"},
        {"key": T.CUSTOMER, "label": "تغییر مشتری، SLA یا طبقه‌ی داده", "rule": "پیش از پذیرش تعهد"},
        {"key": T.REQUIREMENT, "label": T.REQUIREMENT.label, "rule": f"شروع بررسی حداکثر {fa(requirement)} روز کاری"},
    ]


def preference_of(user):
    pref = NoticePreference.objects.filter(user=user).first() or NoticePreference(user=user)
    return {"in_app": True, "email": pref.email, "sms": pref.sms, "delegate": pref.delegate}


def page(request):
    user = request.user
    today, now = timezone.localdate(), timezone.now()
    risks = visible_risks(user)
    notices = list(
        visible_notices(user).select_related("risk__owner", "response").order_by("-created_at", "-pk")[:200]
    )
    records = related(notices)
    for review in records["review"].values():
        review.assessment  # noqa: B018 — یک بار بارگذاری؛ تعداد کم است
    cards = [card(notice, records, today, now) for notice in notices]
    # هر روز: فوری‌ها (قرمز) اول، بعد هشدارها؛ ترتیب زمانی درون هر دسته می‌ماند
    order = {"today": 0, "yesterday": 1, "week": 2, "older": 3}
    urgency = {"danger": 0, "warning": 1, "info": 2, "neutral": 3}
    cards.sort(key=lambda item: (order[item["group"]["key"]], urgency[item["tone"]]))

    version = active_version()
    open_reviews = RiskReview.objects.filter(risk__in=risks, completed_at__isnull=True)
    first = int(parameter(version, MethodParameter.Key.REMINDER_FIRST)) if version else 30
    second = int(parameter(version, MethodParameter.Key.REMINDER_SECOND)) if version else 7
    incident = int(parameter(version, MethodParameter.Key.REASSESS_INCIDENT)) if version else 1
    sheets = ControlAssessment.objects.filter(control__risks__in=risks).filter(
        Q(suspended=True) | Q(valid_until__lte=today + timedelta(days=first))
    )
    counts = {key: sum(1 for item in cards if key == "all" or item["tab"] == key) for key, _ in TABS}
    return {
        "unread": sum(1 for item in cards if item["unread"]),
        "summary": {
            "urgent": open_reviews.filter(trigger__in=URGENT).count(),
            "urgent_days": incident,
            "reviews": open_reviews.filter(due__lte=today + timedelta(days=second)).count(),
            "review_days": second,
            "acceptances": RiskAcceptance.objects.filter(
                risk__in=risks, status=RiskAcceptance.Status.ACTIVE, end_date__lte=today + timedelta(days=first)
            ).count(),
            "reminders": [first, second],
            "evidence": sheets.distinct().count(),
        },
        "tabs": [{"key": key, "label": label, "count": counts[key]} for key, label in TABS],
        "notices": cards,
        "calendar": calendar(user, today),
        "triggers": triggers(version),
        "channels": preference_of(user),
    }


class MonitoringInboxView(ApiView):
    def get(self, request):
        return Response(page(request))


class NoticeReadView(ApiView):
    """خواندن یک اعلان (با باز کردن کارش) یا همه‌ی اعلان‌های نخوانده."""

    def post(self, request, pk=None):
        notices = visible_notices(request.user).filter(read_at__isnull=True)
        if pk is not None:
            get_object_or_404(MonitoringNotice, pk=pk, recipient=request.user)
            notices = notices.filter(pk=pk)
        with transaction.atomic():
            count = 0
            for notice in notices.select_for_update():
                notice.read_at = timezone.now()
                notice._history_user = request.user
                notice.save()
                count += 1
        return Response({"read": count, "page": page(request)})


class NoticeChannelsView(ApiView):
    FIELDS = ("email", "sms", "delegate")

    def post(self, request):
        values = {key: bool(request.data[key]) for key in self.FIELDS if key in request.data}
        pref, _ = NoticePreference.objects.get_or_create(user=request.user)
        for key, value in values.items():
            setattr(pref, key, value)
        pref.save()
        return Response({"channels": preference_of(request.user)})
