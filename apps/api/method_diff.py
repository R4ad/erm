"""«مقایسه‌ی نسخه‌ها» (فیگما ۲۶): پارامترهای کلیدی نسخه‌ی پیشنهادی در برابر نسخه‌ی مبنا، شبیه‌سازی اثر نسخه روی
ارزیابی‌های جاری بی‌آن‌که رکوردی عوض شود، یادداشت تغییر، گردش تصویب و قاعده‌ی گزارش‌دهی. هر ارزیابی نسخه‌ی روش خود
را نگه می‌دارد؛ نسخه‌ی تازه فقط در ارزیابی یا بازسنجی بعدی به کار می‌رود (بخش ۲۱)."""

import csv
from datetime import timedelta

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.response import Response

from apps.actions.models import RiskAcceptance
from apps.assessments.services import decision_assessment
from apps.methodology.models import MethodParameter, MethodSimulation, MethodVersion
from apps.methodology.permissions import can_manage_method, visible_versions
from apps.methodology.services import MethodTables
from apps.risks.models import Risk
from apps.workcalendar.workdays import add_period

from . import formatting as fmt
from .action_verification import jalali
from .base import ApiView
from .method_definition import GROUPS, approval_steps, cycle, group_of, param_text, params_of, period
from .monitoring_inbox import next_periodic
from .treatment import fa

K = MethodParameter.Key
ST = MethodVersion.Status
UNIT_DAYS = {"day": 1, "working_day": 1, "week": 7, "month": 30}


def days_of(value, unit):
    return value * UNIT_DAYS.get(unit, 1)


def number(value):
    """عدد پارامتر بدون صفرهای اعشاری، با رقم فارسی."""
    return fa(f"{value.normalize():f}") if value is not None else "—"


def ranges(version):
    return " · ".join(
        f"{level.name} {fa(level.min_score)}–{fa(level.max_score)}" for level in version.risk_levels.order_by("rank")
    )


def floors(version):
    items = version.impact_floors.select_related("min_level").order_by("-min_impact")
    return " · ".join(f"پیامد {fa(item.min_impact)} حداقل {item.min_level.name}" for item in items) or "—"


def cells(version):
    return {(cell.a, cell.b): cell.likelihood for cell in version.likelihood_cells.all()}


def coverage_text(params):
    row, months = params.get(K.A_DATA_COVERAGE), params.get(K.A_DATA_PERIOD)
    if row is None:
        return "—"
    text = f"حداقل {number(row.value)}٪"
    return f"{text} در {number(months.value)} ماه" if months else text


def reminder_text(params):
    days = [params[key].value for key in (K.REMINDER_FIRST, K.REMINDER_SECOND) if key in params]
    distinct = list(dict.fromkeys(int(day) for day in days))
    return f"{' و '.join(fa(day) for day in distinct)} روز پیش از انقضا" if distinct else "—"


def levels_by_rank(version):
    return {level.rank: level for level in version.risk_levels.all()}


def status(changed, label):
    return {"label": label, "tone": "warning"} if changed else {"label": "بدون تغییر", "tone": "neutral"}


def review_label(old, new):
    old_days, new_days = days_of(old.review_value, old.review_unit), days_of(new.review_value, new.review_unit)
    return "کوتاه‌تر" if new_days < old_days else "طولانی‌تر"


def rows(version, base):
    """نُه پارامتر کلیدی روش؛ ستون نسخه‌ی پیشنهادی برای ردیف بدون تغییر «همان» است."""
    mine, theirs = params_of(version), params_of(base)
    new_levels, old_levels = levels_by_rank(version), levels_by_rank(base)
    ranks = sorted(set(new_levels) & set(old_levels))
    items = []

    def add(key, label, before, after, changed_label):
        changed = before != after
        items.append(
            {
                "key": key,
                "label": label,
                "before": before,
                "after": after if changed else "همان",
                "changed": changed,
                "status": status(changed, changed_label),
            }
        )

    add("ranges", "آستانه‌های سطح", ranges(base), ranges(version), "تغییر کرد")
    moved = sum(1 for key, value in cells(version).items() if cells(base).get(key) != value)
    add(
        "likelihood",
        "جدول احتمال از A و B",
        "ماتریس ۵×۵",
        f"ماتریس ۵×۵ · {fa(moved)} خانه‌ی تازه" if moved else "ماتریس ۵×۵",
        "تغییر کرد",
    )
    add("floors", "کف سطح بر اساس پیامد", floors(base), floors(version), "تغییر کرد")
    old_cov, new_cov = theirs.get(K.A_DATA_COVERAGE), mine.get(K.A_DATA_COVERAGE)
    stricter = old_cov and new_cov and new_cov.value > old_cov.value
    add(
        "coverage",
        "پوشش ثبت داده‌ی آغازگر",
        coverage_text(theirs),
        coverage_text(mine),
        "سخت‌گیرانه‌تر" if stricter else "آسان‌گیرانه‌تر",
    )
    old_reminders, new_reminders = reminder_text(theirs), reminder_text(mine)
    more = len(new_reminders.split(" و ")) > len(old_reminders.split(" و "))
    add("reminders", "یادآوری انقضای پذیرش", old_reminders, new_reminders, "افزوده شد" if more else "تغییر کرد")
    if ranks:
        low = ranks[0]
        add(
            "review_low",
            f"بازبینی دوره‌ای سطح {new_levels[low].name}",
            cycle(old_levels[low].review_value, old_levels[low].review_unit),
            cycle(new_levels[low].review_value, new_levels[low].review_unit),
            review_label(old_levels[low], new_levels[low]),
        )
        rest = list(reversed(ranks[1:]))
        add(
            "review_rest",
            "بازبینی " + "، ".join(new_levels[rank].name for rank in rest),
            " · ".join(cycle(old_levels[rank].review_value, old_levels[rank].review_unit) for rank in rest),
            " · ".join(cycle(new_levels[rank].review_value, new_levels[rank].review_unit) for rank in rest),
            "تغییر کرد",
        )
        add(
            "acceptance",
            "حداکثر اعتبار پذیرش",
            " · ".join(period(old_levels[r].acceptance_value, old_levels[r].acceptance_unit) for r in ranks),
            " · ".join(period(new_levels[r].acceptance_value, new_levels[r].acceptance_unit) for r in ranks),
            "تغییر کرد",
        )
    add(
        "horizon", "افق پیش‌فرض ارزیابی", param_text(theirs.get(K.HORIZON)), param_text(mine.get(K.HORIZON)), "تغییر کرد"
    )
    return items


def active_assessments():
    """ارزیابی جاری تأییدشده‌ی هر ریسک فعال: همانی که تصمیم بر آن است."""
    found = []
    for risk in Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES).order_by("code"):
        assessment = decision_assessment(risk)
        if assessment is not None and assessment.is_approved:
            found.append(assessment)
    return found


def review_start(assessment):
    """مبدأ دوره‌ی بازبینی، مثل next_periodic: آخرین بازبینی دوره‌ایِ بسته‌شده یا تأیید ارزیابی جاری."""
    last = (
        assessment.risk.monitoring_reviews.filter(assessment=assessment, trigger="periodic", completed_at__isnull=False)
        .order_by("-completed_at")
        .first()
    )
    return timezone.localdate(last.completed_at if last else assessment.approved_at)


def simulate(version, base, today=None):
    """اثر نسخه روی ارزیابی‌های جاری بدون تغییر رکوردها: سطح تصمیم با جدول‌های نسخه، ارزیابی نرخ‌محوری که با پوشش
    تازه داده‌ی بیشتر می‌خواهد، بازبینی دوره‌ای که زودتر می‌رسد، و یادآوری پذیرش‌های معتبر."""
    today = today or timezone.localdate()
    tables = MethodTables(version)
    mine, theirs = params_of(version), params_of(base)
    new_levels = levels_by_rank(version)
    old_cov = theirs[K.A_DATA_COVERAGE].value if K.A_DATA_COVERAGE in theirs else None
    new_cov = mine[K.A_DATA_COVERAGE].value if K.A_DATA_COVERAGE in mine else None
    assessments = active_assessments()
    effects, data, moved, earlier, earlier_levels = [], 0, 0, 0, []
    cache = {version.pk: tables}

    def tables_of(other):
        if other.pk not in cache:
            cache[other.pk] = MethodTables(other)
        return cache[other.pk]

    def row(assessment, effect, action):
        risk = assessment.risk
        effects.append(
            {
                "assessment": {"code": assessment.code, "href": assessment.get_absolute_url()},
                "risk": {"code": risk.code, "title": risk.title, "href": risk.get_absolute_url()},
                "effect": effect,
                "action": action,
            }
        )

    for assessment in assessments:
        likelihood, impact = assessment.likelihood_high, assessment.impact_high
        current = assessment.decision_level
        if likelihood and impact and current:
            # فقط اثر جدول‌های روش: سطح جدول نسخه‌ی خود ارزیابی در برابر سطح جدول نسخه‌ی پیشنهادی. قاعده‌های تقدم
            # (بخش ۱۸) به روش وابسته نیستند و در هر دو یکسان می‌مانند.
            before = tables_of(assessment.method_version).decision_level(likelihood, impact)
            level = tables.decision_level(likelihood, impact)
            if level.rank != before.rank:
                moved += 1
                row(assessment, f"سطح جدول {before.name} به {level.name}", f"بازسنجی و تصمیم تازه با v{version.number}")
        coverage = assessment.a_coverage
        if (
            assessment.a_basis == "rate"
            and coverage is not None
            and new_cov is not None
            and old_cov is not None
            and old_cov <= coverage < new_cov
        ):
            data += 1
            row(
                assessment,
                f"پوشش ثبت {number(coverage)}٪ کمتر از {number(new_cov)}٪",
                "اطمینان A به کم می‌رسد؛ داده‌ی بیشتر جمع‌آوری شود",
            )
        new = new_levels.get(current.rank) if current else None
        if (
            new
            and assessment.approved_at
            and (new.review_value, new.review_unit) != (current.review_value, current.review_unit)
        ):
            due = next_periodic(assessment.risk, assessment, today)
            fresh = add_period(review_start(assessment), new.review_value, new.review_unit)
            if fresh < due:
                earlier += 1
                earlier_levels.append(current.name)
                row(
                    assessment,
                    f"بازبینی {cycle(current.review_value, current.review_unit)} به "
                    f"{cycle(new.review_value, new.review_unit)}",
                    f"سررسید جدید {jalali(max(fresh, today))}",
                )

    reminders = 0
    old_days = int(theirs[K.REMINDER_SECOND].value) if K.REMINDER_SECOND in theirs else None
    new_days = int(mine[K.REMINDER_SECOND].value) if K.REMINDER_SECOND in mine else None
    if old_days != new_days and new_days:
        acceptances = RiskAcceptance.objects.filter(
            status=RiskAcceptance.Status.ACTIVE, end_date__gte=today
        ).select_related("risk", "assessment")
        for acceptance in acceptances.order_by("end_date"):
            notice = acceptance.end_date - timedelta(days=new_days)
            if notice < today:
                continue
            reminders += 1
            effects.append(
                {
                    "assessment": {"code": acceptance.code, "href": acceptance.get_absolute_url()},
                    "risk": {
                        "code": acceptance.risk.code,
                        "title": acceptance.risk.title,
                        "href": acceptance.risk.get_absolute_url(),
                    },
                    "effect": f"یادآوری {fa(new_days)} روزه‌ی پذیرش {acceptance.code}",
                    "action": f"اعلان {jalali(notice)}",
                }
            )
    thresholds_same = ranges(version) == ranges(base) and floors(version) == floors(base)
    names = list(dict.fromkeys(earlier_levels))
    return {
        "count": len(assessments),
        "subtitle": f"اجرای v{version.number} روی {fa(len(assessments))} ارزیابی جاری بدون تغییر رکوردها",
        "tiles": [
            {"key": "count", "label": "ارزیابی شبیه‌سازی‌شده", "value": len(assessments), "note": "همه‌ی ارزیابی‌های فعال"},
            {
                "key": "data",
                "label": "نیازمند داده‌ی بیشتر",
                "value": data,
                "note": f"پوشش ثبت بین {number(old_cov)} و {number(new_cov)}٪"
                if old_cov is not None and new_cov is not None and old_cov != new_cov
                else "آستانه‌ی پوشش ثابت مانده است",
            },
            {
                "key": "levels",
                "label": "تغییر سطح ریسک",
                "value": moved,
                "note": "آستانه‌ها ثابت مانده‌اند" if thresholds_same else "با آستانه‌ها و کف‌های تازه",
            },
            {
                "key": "review",
                "label": "بازبینی زودتر",
                "value": earlier,
                "note": f"ریسک‌های سطح {'، '.join(names)}" if names else "دوره‌های بازبینی کوتاه نشده‌اند",
            },
        ],
        "reminders": reminders,
        "rows": effects,
    }


def chip(version):
    if version.status == ST.DRAFT:
        if version.submitted_at:
            return {"label": "در انتظار تصویب کمیته", "tone": "warning"}
        return {"label": "پیش‌نویس · در دست ویرایش", "tone": "neutral"}
    if version.status == ST.APPROVED:
        return {"label": "تصویب‌شده · آماده‌ی فعال‌سازی", "tone": "success"}
    return {"label": version.get_status_display(), "tone": "success" if version.status == ST.ACTIVE else "neutral"}


def steps(version, simulation):
    """گردش تصویب فیگما ۲۶: پیشنهاد، بررسی، شبیه‌سازی اثر، تصویب کمیته و انتشار. گام‌های جز شبیه‌سازی همان گردش
    صفحه‌ی تعریف متدولوژی‌اند."""
    base = {step["key"]: step for step in approval_steps(version)}
    draft = base["draft"]
    review = base["review"]
    approval = base["approval"]
    publish = base["publish"]
    simulated = simulation is not None
    done_before = review["state"] == "done" or approval["state"] == "done"
    return [
        {**draft, "title": "پیشنهاد متولی روش"},
        {**review, "title": "بررسی کارگروه ریسک"},
        {
            "key": "simulation",
            "title": "شبیه‌سازی اثر",
            "note": f"{jalali(simulation.run_at)} · {fa(simulation.assessments)} ارزیابی"
            if simulated
            else "اجرای نسخه روی ارزیابی‌های جاری",
            "state": "done" if simulated or done_before else "current" if version.submitted_at else "locked",
        },
        {**approval, "title": "تصویب کمیته‌ی امنیت"},
        {
            **publish,
            "title": "انتشار و اجرا",
            "note": publish["note"]
            if version.activated_at or not version.effective_from
            else f"از {jalali(version.effective_from)}",
        },
    ]


RULES = [
    "هر ارزیابی شناسه‌ی نسخه‌ی پارامتر خود را نگه می‌دارد",
    "ارزیابی‌های قبلی بازنویسی نمی‌شوند؛ بازسنجی در موعد بعدی با v{n} انجام می‌شود",
    "در گزارش روند، نسخه‌ی روش هر نقطه نمایش داده می‌شود",
    "مقایسه‌ی امتیاز بین دو نسخه بدون ذکر تغییر روش مجاز نیست",
]


def pick_base(user, version, number):
    versions = visible_versions(user)
    if number:
        return get_object_or_404(versions, number=number)
    if version.based_on_id:
        return version.based_on
    return versions.exclude(pk=version.pk).filter(status=ST.ACTIVE).first() or get_object_or_404(
        versions.exclude(pk=version.pk).filter(number__lt=version.number).order_by("-number")[:1]
    )


def page(user, version, base):
    items = rows(version, base)
    changed = [item for item in items if item["changed"]]
    simulation = version.simulations.filter(base=base).select_related("run_by").first()
    author = version.submitted_by or (version.history.earliest().history_user if version.history.exists() else None)
    linked = version.assessments.filter(kind="current", status="approved").count()
    base_linked = base.assessments.filter(kind="current", status="approved").count()
    base_note = "نسخه‌ی جاری" if base.status == ST.ACTIVE else base.get_status_display()
    if base.approved_on:
        base_note += f" · مصوب {jalali(base.approved_on)}"
    groups = list(dict.fromkeys(group_of_row(item["key"]) for item in changed))
    return {
        "title": f"مقایسه‌ی ParameterSet v{version.number} با v{base.number}",
        "subtitle": f"{fa(len(changed))} پارامتر تغییر کرده و بقیه بدون تغییرند · هر ارزیابی نسخه‌ی پارامتر خود را "
        "نگه می‌دارد و تغییر روش، خودکار به گذشته اعمال نمی‌شود",
        "version": {
            "number": version.number,
            "name": f"v{version.number}",
            "chip": chip(version),
            "note": f"{version.get_status_display()} · {fmt.person(author)['name']}" if author else version.title,
            "hint": f"تاریخ اجرای پیشنهادی {jalali(version.effective_from)}"
            if version.effective_from
            else f"{fa(linked)} ارزیابی با این نسخه",
        },
        "base": {
            "number": base.number,
            "name": f"v{base.number}",
            "note": base_note,
            "hint": f"{fa(base_linked)} ارزیابی فعال با این نسخه",
        },
        "rows": items,
        "changed": len(changed),
        "simulation": simulate(version, base),
        "last_run": {"at": jalali(simulation.run_at), "by": fmt.person(simulation.run_by)["name"]}
        if simulation
        else None,
        "notes": {
            "author": fmt.person(author)["name"] if author else None,
            "date": jalali(version.submitted_at or version.updated_at),
            "text": version.change_notes,
            "groups": [GROUPS[key] for key in groups if key in GROUPS],
        },
        "steps": steps(version, simulation),
        "rules": [rule.format(n=version.number) for rule in RULES],
        "can_submit": can_manage_method(user) and version.is_editable_draft,
        "can_simulate": can_manage_method(user) and version.status in (ST.DRAFT, ST.APPROVED),
        "definition": f"/method/{version.number}",
    }


ROW_GROUPS = {
    "ranges": "levels",
    "likelihood": "likelihood",
    "floors": "levels",
    "coverage": "base",
    "reminders": "appetite",
    "review_low": "monitoring",
    "review_rest": "monitoring",
    "acceptance": "appetite",
    "horizon": "base",
}


def group_of_row(key):
    return ROW_GROUPS.get(key) or group_of(key)


def export(version, base):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="method-v{version.number}-v{base.number}.csv"'
    response.write("﻿")
    writer = csv.writer(response)
    writer.writerow(["پارامتر", f"نسخه‌ی v{base.number}", f"نسخه‌ی v{version.number}", "وضعیت"])
    for item in rows(version, base):
        writer.writerow([item["label"], item["before"], item["after"], item["status"]["label"]])
    simulation = simulate(version, base)
    writer.writerow([])
    writer.writerow(["ارزیابی", "ریسک", f"اثر v{version.number}", "اقدام لازم"])
    for item in simulation["rows"]:
        writer.writerow([item["assessment"]["code"], item["risk"]["title"], item["effect"], item["action"]])
    return response


def resolve(request, number):
    version = get_object_or_404(visible_versions(request.user), number=number)
    raw = request.query_params.get("base")
    base = pick_base(request.user, version, int(raw) if raw and raw.isdigit() else None)
    return version, base


class MethodDiffView(ApiView):
    """GET مقایسه (با ?export=csv خروجی CSV)؛ POST شبیه‌سازی اثر را دوباره اجرا و در گردش تصویب ثبت می‌کند."""

    def get(self, request, number):
        version, base = resolve(request, number)
        if version.pk == base.pk:
            return Response({"detail": "نسخه با خودش مقایسه نمی‌شود."}, status=400)
        if request.query_params.get("export") == "csv":
            return export(version, base)
        return Response(page(request.user, version, base))

    def post(self, request, number):
        version, base = resolve(request, number)
        if not can_manage_method(request.user):
            return Response({"detail": "شبیه‌سازی اثر را متولی روش اجرا می‌کند."}, status=403)
        if version.status not in (ST.DRAFT, ST.APPROVED) or version.pk == base.pk:
            return Response({"detail": "شبیه‌سازی فقط برای نسخه‌ی پیشنهادی‌ای است که هنوز فعال نشده."}, status=400)
        result = simulate(version, base)
        MethodSimulation.objects.create(
            version=version,
            base=base,
            run_by=request.user,
            assessments=result["count"],
            summary={tile["key"]: tile["value"] for tile in result["tiles"]},
        )
        return Response(page(request.user, version, base))
