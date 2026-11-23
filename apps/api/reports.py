"""گزارش مدیریتی فیگما (صفحه‌ی ۰۲) روی همان شاخص‌های بخش ۲۱ (apps/reports/services.py).

شمارش‌ها فقط از آخرین ارزیابی جاری تأییدشده‌ی هر ریسک است؛ امتیازهای ترتیبی جمع و میانگین نمی‌شوند و هر مقایسه
بر اساس شمار سطح است.
"""

from collections import Counter
from io import BytesIO

from django.http import HttpResponse
from django.utils import timezone
from openpyxl import Workbook
from openpyxl.styles import Font
from rest_framework.response import Response

from apps.actions.models import Reassessment, RiskAcceptance, TreatmentPlan
from apps.assessments.models import Assessment
from apps.core.jalali import to_jalali
from apps.methodology.services import MethodTables, active_version
from apps.reports.services import management_report
from apps.risks.permissions import visible_risks
from apps.risks.services import active_risks
from apps.workcalendar.workdays import add_months

from . import formatting as fmt
from .base import ApiView
from .routes import spa_route

PERIODS = (1, 3, 6, 12)
DEFAULT_PERIOD = 6
LEVELS = (1, 2, 3, 4, 5)

# دلیل ردشدن پذیرش در گزارش (services.management_report) و ردیف «پذیرش‌های نیازمند توجه» فیگما.
ACCEPTANCE_GROUPS = [
    ("expired", "منقضی", "منقضی‌شده", "clock", "danger"),
    ("unsigned", "فاقد امضای صاحب اختیار", "فاقد امضای لازم", "signature", "warning"),
    ("out_of_authority", "خارج از اختیار پذیرش", "خارج از اختیار پذیرش", "lock", "danger"),
    ("superseded", "فاقد نسخه ارزیابی جاری معتبر", "وابسته به ارزیابی جایگزین‌شده", "layers", "neutral"),
]


def fa(value):
    return str(value).translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))


def period_months(request):
    try:
        months = int(request.query_params.get("months", DEFAULT_PERIOD))
    except ValueError:
        months = DEFAULT_PERIOD
    return months if months in PERIODS else DEFAULT_PERIOD


def rank_of(assessment):
    return assessment.decision_level.rank if assessment and assessment.decision_level_id else None


def levels_at(risks, moment):
    """رتبه‌ی سطح تصمیم هر ریسک فعال در آغاز دوره: آخرین ارزیابی جاری تأییدشده پیش از آن روز."""
    ranks = {}
    rows = (
        Assessment.objects.filter(
            risk__in=risks,
            kind=Assessment.Kind.CURRENT,
            status=Assessment.Status.APPROVED,
            approved_at__date__lt=moment,
        )
        .select_related("decision_level")
        .order_by("risk_id", "approved_at", "pk")
    )
    for assessment in rows:  # آخرین ارزیابی هر ریسک بر قبلی‌ها می‌نشیند
        ranks[assessment.risk_id] = rank_of(assessment)
    return ranks


def distribution(version, current, risks, start):
    now = Counter(rank_of(item) for item in current)
    unassessed_now = risks.count() - sum(count for rank, count in now.items() if rank)
    then_ranks = levels_at(risks, start)
    then = Counter(then_ranks.values())
    unassessed_then = risks.count() - sum(count for rank, count in then.items() if rank)
    rows = [
        {
            "level": fmt.level(level),
            "label": level.name,
            "count": now.get(level.rank, 0),
            "delta": now.get(level.rank, 0) - then.get(level.rank, 0),
            # بیشتر شدن ریسک‌های پایین‌ترین سطح خوب است و بیشتر شدن بقیه بد.
            "up_is_good": level.rank == 1,
        }
        for level in sorted(version.risk_levels.all(), key=lambda item: -item.rank)
    ] if version else []
    rows.append({
        "level": None,
        "label": "ارزیابی‌نشده",
        "count": unassessed_now,
        "delta": unassessed_now - unassessed_then,
        "up_is_good": False,
    })
    return rows


def matrix(version, current, unassessed):
    """ماتریس L × I با کران بالای L و I، همان دو عددی که سطح تصمیم از آن‌ها ساخته می‌شود (موتور روش)."""
    counts = Counter(
        (item.likelihood_high, item.impact_high) for item in current if item.likelihood_high and item.impact_high
    )
    levels = {}
    if version:
        for likelihood, cells in MethodTables(version).decision_matrix():
            for impact, cell in zip(LEVELS, cells, strict=True):
                levels[(likelihood, impact)] = cell["level"]
    return {
        "rows": [
            {
                "likelihood": likelihood,
                "cells": [
                    {
                        "impact": impact,
                        "count": counts.get((likelihood, impact), 0),
                        "level": fmt.level(levels.get((likelihood, impact))),
                    }
                    for impact in LEVELS
                ],
            }
            for likelihood in reversed(LEVELS)
        ],
        "unassessed": unassessed,
    }


def kpis(report, current, risks):
    today = report["today"]
    by_rank = Counter(rank_of(item) for item in current)
    critical = [item for item in current if (rank_of(item) or 0) >= 4]
    planned = set(
        TreatmentPlan.objects.filter(assessment__in=critical).values_list("assessment_id", flat=True)
    )
    high_ids = [item.risk_id for item in current if rank_of(item) == 3]
    temporary = RiskAcceptance.objects.filter(
        risk_id__in=high_ids, status=RiskAcceptance.Status.ACTIVE, end_date__gte=today
    ).count()
    unassessed = risks.count() - sum(count for rank, count in by_rank.items() if rank)
    coverage, key = report["critical"], report["key_controls"]
    return {
        "active": {
            "count": risks.count(),
            "note": f"{fa(unassessed)} هنوز ارزیابی جاری تأییدشده ندارند" if unassessed else "همه ارزیابی جاری دارند",
        },
        "critical": {
            "count": by_rank.get(4, 0) + sum(count for rank, count in by_rank.items() if rank and rank > 4),
            "note": f"{fa(len(critical) - len(planned))} ریسک هنوز طرح مواجهه ندارند"
            if len(critical) > len(planned) else "همه طرح مواجهه دارند",
        },
        "high": {"count": by_rank.get(3, 0), "note": f"{fa(temporary)} پذیرش موقت و استثنایی"},
        "coverage": {
            "percent": coverage["percent"],
            "note": f"{fa(coverage['complete'])} از {fa(coverage['total'])} خدمت حیاتی · شرط: ارزیابی جاری کامل",
        },
        "key_controls": {
            "percent": key["percent"],
            "note": f"{fa(key['valid'])} از {fa(key['total'])} کنترل کلیدی مرتبط با مسیرها",
        },
    }


def overdue_rows(report, by_risk):
    today = report["today"]
    rows = []
    for action in report["overdue"]:
        base = by_risk.get(action.plan.risk_id)
        owner = fmt.person(action.owner)
        rows.append({
            "key": f"action-{action.pk}",
            "code": action.code,
            "title": action.title,
            "level": fmt.level(base.decision_level if base else None),
            "owner": owner["name"] if owner else None,
            "service": action.plan.risk.service.name if action.plan.risk.service_id else None,
            "days": (today - action.due_date).days,
            "route": spa_route(action.get_absolute_url()),
        })
    return sorted(rows, key=lambda row: (-(row["level"]["rank"] if row["level"] else 0), -row["days"]))


def acceptance_groups(report):
    reasons = [row["reasons"] for row in report["invalid_acceptances"]]
    return [
        {
            "key": key,
            "label": label,
            "icon": icon,
            "tone": tone,
            "count": sum(1 for text in reasons if reason in text),
            "route": "/actions/acceptances",
        }
        for key, reason, label, icon, tone in ACCEPTANCE_GROUPS
    ]


def change_rows(report):
    post_action = set(
        Reassessment.objects.filter(
            assessment__in=[change["after"] for change in report["changes"]]
        ).values_list("assessment_id", flat=True)
    )
    rows = []
    for change in sorted(report["changes"], key=lambda item: item["after"].approved_at, reverse=True):
        before, after = change["before"], change["after"]
        if before.decision_level_id == after.decision_level_id:
            continue
        if change["method_changed"]:
            reason = {"label": "بخشی از تغییر روش", "tone": "gold"}
        elif after.pk in post_action:
            reason = {"label": "پس از اقدام", "tone": "success"}
        else:
            reason = {"label": "ارزیابی جاری تازه", "tone": "info"}
        rows.append({
            "key": f"change-{after.pk}",
            "code": after.risk.code,
            "title": after.risk.title,
            "before": fmt.level(before.decision_level),
            "after": fmt.level(after.decision_level),
            "reason": reason,
            "route": spa_route(after.risk.get_absolute_url()),
        })
    return rows


def concentration_rows(report, risks):
    rows = [
        {
            "key": f"dep-{index}",
            "target": row["name"],
            "risks": risks.filter(service_id__in=row["service_ids"]).count(),
            "services": len(row["services"]),
            "shared": row["common"],
        }
        for index, row in enumerate(report["concentrations"])
    ]
    return sorted((row for row in rows if row["risks"]), key=lambda row: -row["risks"])


def build(user, months):
    today = timezone.localdate()
    start = add_months(today, -months)
    report = management_report(user, start=start, end=today)
    risks = active_risks(visible_risks(user))
    current = report["current"]
    by_risk = {item.risk_id: item for item in current}
    version = active_version()
    unassessed = risks.count() - sum(1 for item in current if item.decision_level_id)
    return {
        "today": fmt.today(),
        "months": months,
        "periods": list(PERIODS),
        "start": fmt.day(start),
        "kpis": kpis(report, current, risks),
        "distribution": distribution(version, current, risks, start),
        "matrix": matrix(version, current, unassessed),
        "overdue": overdue_rows(report, by_risk),
        "acceptances": acceptance_groups(report),
        "changes": change_rows(report),
        "concentration": concentration_rows(report, risks),
    }


class ManagementReportView(ApiView):
    def get(self, request):
        return Response(build(request.user, period_months(request)))


class ManagementExportView(ApiView):
    """«خروجی Excel» فیگما: همان داده‌ی صفحه، هر بخش یک برگه."""

    def get(self, request):
        months = period_months(request)
        data = build(request.user, months)
        book = Workbook()
        sheets = [
            ("شاخص‌ها", ["شاخص", "مقدار", "توضیح"], [
                ["ریسک‌های فعال", data["kpis"]["active"]["count"], data["kpis"]["active"]["note"]],
                ["بحرانی", data["kpis"]["critical"]["count"], data["kpis"]["critical"]["note"]],
                ["بالا", data["kpis"]["high"]["count"], data["kpis"]["high"]["note"]],
                ["پوشش خدمات حیاتی (٪)", data["kpis"]["coverage"]["percent"], data["kpis"]["coverage"]["note"]],
                ["کنترل کلیدی با E3 معتبر (٪)", data["kpis"]["key_controls"]["percent"],
                 data["kpis"]["key_controls"]["note"]],
            ]),
            ("توزیع سطح", ["سطح", "تعداد", f"تغییر نسبت به {months} ماه قبل"],
             [[row["label"], row["count"], row["delta"]] for row in data["distribution"]]),
            ("ماتریس L×I", ["L \\ I", *LEVELS],
             [[f"L{row['likelihood']}", *[cell["count"] for cell in row["cells"]]] for row in data["matrix"]["rows"]]),
            ("اقدام‌های معوق", ["کد", "عنوان اقدام", "سطح ریسک", "مالک اقدام", "خدمت", "روز تأخیر"],
             [[row["code"], row["title"], row["level"]["name"] if row["level"] else "", row["owner"],
               row["service"], row["days"]] for row in data["overdue"]]),
            ("پذیرش‌ها", ["وضعیت", "تعداد"], [[row["label"], row["count"]] for row in data["acceptances"]]),
            ("تغییر سطح", ["کد", "ریسک", "سطح قبلی", "سطح تازه", "دلیل"],
             [[row["code"], row["title"], row["before"]["name"] if row["before"] else "",
               row["after"]["name"] if row["after"] else "", row["reason"]["label"]] for row in data["changes"]]),
            ("تمرکز وابستگی", ["وابستگی", "ریسک فعال وابسته", "خدمت وابسته", "نقطه‌ی شکست مشترک"],
             [[row["target"], row["risks"], row["services"], "بله" if row["shared"] else "خیر"]
              for row in data["concentration"]]),
        ]
        book.remove(book.active)
        for title, header, rows in sheets:
            sheet = book.create_sheet(title)
            sheet.sheet_view.rightToLeft = True
            sheet.append(header)
            for cell in sheet[1]:
                cell.font = Font(bold=True)
            for row in rows:
                sheet.append(row)
        buffer = BytesIO()
        book.save(buffer)
        stamp = to_jalali(timezone.localdate()).replace("/", "-")
        response = HttpResponse(
            buffer.getvalue(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        response["Content-Disposition"] = f'attachment; filename="management-report-{stamp}.xlsx"'
        return response
