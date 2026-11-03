import math
from dataclasses import dataclass, field
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.catalog.models import ServiceCustomer
from apps.controls.models import Control as ControlRecord
from apps.controls.models import ControlAssessment
from apps.methodology.engine import (
    A_UNKNOWN,
    NO_PATH,
    Band,
    Control,
    Impact,
    PathResult,
    check_impacts,
    check_likelihood,
    impact_band,
    likelihood_result,
)
from apps.methodology.engine import Path as EnginePath
from apps.methodology.models import MethodParameter, Scale
from apps.methodology.services import MethodTables, active_version, parameter
from apps.risks.models import Risk

from .models import Assessment

DATIN = "داتین"
# ارزیابی ذاتی و جاری وقتی ریسک «در ارزیابی» است ثبت می‌شود؛ ارزیابی هدف در «برنامه‌ی درمان» هم، چون همان‌جا اقدام
# طراحی می‌شود (جدول س۱۵).
ASSESSABLE_STATUSES = {
    Assessment.Kind.INHERENT: [Risk.Status.ASSESSMENT],
    Assessment.Kind.CURRENT: [Risk.Status.ASSESSMENT],
    Assessment.Kind.TARGET: [Risk.Status.ASSESSMENT, Risk.Status.TREATMENT_PLAN],
}
# پیشنهاد سطح از روی عدد فقط برای این دو بُعد است (جواب س۵۶). کد بُعد از نسخه‌ی روش می‌آید.
DURATION_SCALE = "S"
FINANCIAL_SCALE = "F"
INITIATOR_SCALE = "A"
UNITS = {DURATION_SCALE: "دقیقه", FINANCIAL_SCALE: "ریال"}


def creation_problems(risk, kind=None):
    """چرا الان برای این ریسک ارزیابی تازه ثبت نمی‌شود. بدون kind، یعنی هیچ نوعی ثبت نمی‌شود."""
    problems = []
    if kind:
        statuses = ASSESSABLE_STATUSES[kind]
        if risk.status not in statuses:
            labels = " یا ".join(f"«{Risk.Status(status).label}»" for status in statuses)
            problems.append(f"ارزیابی {Assessment.Kind(kind).label} فقط وقتی ریسک {labels} است ثبت می‌شود.")
    elif not any(risk.status in statuses for statuses in ASSESSABLE_STATUSES.values()):
        problems.append("ارزیابی فقط وقتی ریسک «در ارزیابی» یا «برنامه‌ی درمان» است ثبت می‌شود.")
    if active_version() is None:
        problems.append("هیچ نسخه‌ی روشی فعال نیست.")
    return problems


def assessable_kinds(risk):
    return [kind for kind, statuses in ASSESSABLE_STATUSES.items() if risk.status in statuses]


def default_horizon():
    version = active_version()
    value = parameter(version, MethodParameter.Key.HORIZON) if version else None
    return int(value) if value is not None else None


class AssessmentError(Exception):
    def __init__(self, problems):
        super().__init__("؛ ".join(problems))
        self.problems = problems


@transaction.atomic
def create_assessment(risk, user, kind, **fields):
    problems = creation_problems(risk, kind)
    if problems:
        raise AssessmentError(problems)
    assessment = Assessment(risk=risk, kind=kind, method_version=active_version(), created_by=user, **fields)
    assessment._history_user = user
    assessment.save()
    return assessment


def stakeholders(assessment):
    """ستون‌های پروفایل پیامد: داتین و هر بانک متأثر ریسک (جواب س۵۵)، به‌اضافه‌ی بانکی که قبلاً برایش سطح ثبت شده و
    بعداً از بانک‌های ریسک برداشته شده، تا سطحش گم نشود."""
    banks = {customer.pk: customer for customer in assessment.risk.customers.all()}
    for impact in assessment.impacts.select_related("customer"):
        if impact.customer_id:
            banks.setdefault(impact.customer_id, impact.customer)
    return [None] + sorted(banks.values(), key=lambda customer: customer.name)


def impact_scales(assessment):
    return list(assessment.method_version.scales.filter(kind=Scale.Kind.IMPACT).prefetch_related("levels"))


@dataclass(frozen=True)
class Suggestion:
    """پیشنهاد سطح از روی عدد. level خالی یعنی پیشنهادی نیست و note می‌گوید چرا."""

    level: int | None
    note: str


@dataclass(frozen=True)
class StakeholderFacts:
    """عددهایی که پیشنهاد S و F برای یک ذی‌نفع لازم دارد."""

    critical: bool
    rto: int | None
    mtpd: int | None
    basis: int | None
    label: str = ""


def stakeholder_facts(assessment, customer):
    service = assessment.risk.service
    critical = bool(service and service.is_critical)
    if customer is None:
        return StakeholderFacts(critical=critical, rto=None, mtpd=None, basis=None, label=DATIN)
    link = None
    if service:
        # رابطه‌ی جاری خدمت و بانک؛ رابطه‌ای که «اعتبار تا»ی آن گذشته کنار می‌رود.
        link = (
            ServiceCustomer.objects.filter(service=service, customer=customer)
            .exclude(valid_until__lt=timezone.localdate())
            .order_by(F("valid_from").desc(nulls_last=True))
            .first()
        )
    return StakeholderFacts(
        critical=critical,
        rto=link.rto_minutes if link else None,
        mtpd=link.mtpd_minutes if link else None,
        basis=customer.financial_basis,
        label=customer.name,
    )


def suggest_duration(minutes, facts, fraction):
    """سطح S از مدت اختلال d و RTO و MTPD همان بانک (معیارهای جدول S بخش ۹). فقط پیشنهاد است (جواب س۵۶)."""
    if minutes is None:
        return None
    if minutes == 0:
        return Suggestion(0, "اختلالی ثبت نشده است.")
    if facts.rto is None or facts.mtpd is None:
        where = "ستون داتین" if facts.label == DATIN else f"خدمت این ریسک برای {facts.label}"
        return Suggestion(None, f"RTO یا MTPD مصوب برای {where} ثبت نشده است و سطح از روی مدت پیشنهاد نمی‌شود.")
    if not 0 < facts.rto < facts.mtpd:
        return Suggestion(None, "RTO باید مثبت و کمتر از MTPD باشد؛ ناسازگاری به مسئول BIA برگردانده می‌شود.")
    quarter = Decimal(facts.rto) * fraction
    minutes = Decimal(minutes)
    if facts.critical:
        if minutes <= quarter:
            return Suggestion(2, "خدمت حیاتی، مدت حداکثر یک‌چهارم RTO.")
        if minutes <= facts.rto:
            return Suggestion(3, "خدمت حیاتی، مدت بیش از یک‌چهارم RTO و حداکثر RTO.")
        if minutes < facts.mtpd:
            return Suggestion(4, "خدمت حیاتی، مدت بیش از RTO و کمتر از MTPD.")
        return Suggestion(5, "خدمت حیاتی، مدت برابر یا بیشتر از MTPD.")
    if minutes <= quarter:
        return Suggestion(1, "خدمت غیرحیاتی، مدت حداکثر یک‌چهارم RTO؛ اگر تعهد مشتری متأثر است سطح بالاتر است.")
    if minutes <= facts.rto:
        return Suggestion(2, "خدمت غیرحیاتی، مدت بیش از یک‌چهارم RTO تا خود RTO.")
    return Suggestion(3, "خدمت غیرحیاتی، عبور از RTO.")


def suggest_financial(loss, basis, scale):
    """سطح F از درصد زیان ناخالص نسبت به مبنای مالی، با مرزهای جدول F همان نسخه‌ی روش (بخش ۱۱)."""
    if loss is None:
        return None
    if loss == 0:
        return Suggestion(0, "زیان قابل انتساب ثبت نشده است.")
    if not basis:
        return Suggestion(None, "مبنای مالی ثبت نشده است و سطح از روی مبلغ پیشنهاد نمی‌شود.")
    percent = Decimal(loss) * 100 / Decimal(basis)
    level = scale.level_for(percent)
    shown = f"{percent:.4f}".rstrip("0").rstrip(".")
    if level is None:
        return Suggestion(None, f"زیان {shown} درصد مبنای مالی است و در مرزهای جدول F نمی‌افتد.")
    return Suggestion(level.value, f"زیان {shown} درصد مبنای مالی است.")


def suggest(scale, actual_value, basis, facts, fraction):
    if scale.code == DURATION_SCALE:
        return suggest_duration(actual_value, facts, fraction)
    if scale.code == FINANCIAL_SCALE:
        return suggest_financial(actual_value, basis, scale)
    return None


@dataclass
class ImpactSummary:
    rows: list  # [(scale, [ImpactDetail یا None برای هر ذی‌نفع])]
    stakeholders: list
    impact: object  # Band یا None
    problems: list  # ورودی نامعتبر، مثل پروفایل تمام‌صفر
    incomplete: list  # چرا I هنوز کران بالای قابل دفاعی ندارد
    missing: list  # خانه‌هایی که هنوز ثبت نشده‌اند
    unknown: list  # خانه‌هایی که «نامعلوم» ثبت شده‌اند
    cells: list = field(default_factory=list)  # [(Impact موتور، ImpactDetail یا None)] به ترتیب جدول


def impact_summary(assessment):
    """جدول پروفایل پیامد و I همان‌طور که موتور محاسبه با نسخه‌ی روش ارزیابی حساب می‌کند. خانه‌ی ثبت‌نشده مثل
    نامعلوم است: سطح را با صفر پر نمی‌کند (بخش ۸)."""
    scales = impact_scales(assessment)
    columns = stakeholders(assessment)
    cells = {(impact.customer_id, impact.scale_id): impact for impact in assessment.impacts.select_related("customer")}
    rows, impacts, missing, unknown, pairs = [], [], [], [], []
    for scale in scales:
        row = []
        for customer in columns:
            name = customer.name if customer else DATIN
            detail = cells.get((customer.pk if customer else None, scale.pk))
            row.append(detail)
            if detail is None:
                missing.append(f"{scale.code} برای {name}")
            elif detail.is_unknown:
                unknown.append(f"{scale.code} برای {name}")
            impacts.append(Impact(name, scale.code, detail.engine_level if detail else None))
            pairs.append((impacts[-1], detail))
        rows.append((scale, row))
    problems, incomplete = [], []
    tables = MethodTables(assessment.method_version)
    checked = check_impacts(tables, impacts, problems)
    band = None if problems else impact_band(tables, checked, incomplete)
    return ImpactSummary(rows, columns, band, problems, incomplete, missing, unknown, pairs)


@dataclass(frozen=True)
class RateCheck:
    """نرخ سالانه‌ی آغازگر از داده‌ی مشاهده‌شده و این‌که داده برای یک سطح قطعی کافی هست یا نه (بخش ۱۴)."""

    rate: Decimal
    suggestion: Suggestion
    insufficient: list  # چرا داده برای سطح قطعی کافی نیست؛ خالی یعنی کافی است


def check_rate(count, months, coverage, scale, period_min, coverage_min):
    """نرخ = تعداد آغازگر یکتا تقسیم بر سال‌های مشاهده، با مرزهای جدول A همان نسخه‌ی روش."""
    if count is None or not months:
        return None
    rate = Decimal(count) * 12 / Decimal(months)
    shown = f"{rate:.4f}".rstrip("0").rstrip(".")
    insufficient = []
    if months < period_min:
        insufficient.append(f"دوره‌ی مشاهده {months} ماه است و کمتر از {period_min} ماه.")
    if coverage is None:
        insufficient.append("پوشش ثبت دامنه‌ی آغازگر معلوم نیست.")
    elif coverage < coverage_min:
        insufficient.append(
            f"پوشش ثبت {coverage.normalize():f} درصد است و کمتر از {coverage_min.normalize():f} درصد؛ "
            "تعداد مشاهده‌شده کران پایین است."
        )
    lowest = scale.levels.all()[0]
    if count == 0 and lowest.upper is not None:
        # صفر رخداد فقط وقتی نرخ کمتر از مرز بالای A1 را نشان می‌دهد که دوره دست‌کم یک بار در همان مرز باشد.
        needed = math.ceil(12 / lowest.upper)
        if months < needed:
            insufficient.append(
                f"صفر رخداد در {months} ماه نرخ کمتر از {lowest.upper.normalize():f} را ثابت نمی‌کند (بخش ۱۴)."
            )
            return RateCheck(rate, Suggestion(None, "صفر رخداد در این دوره سطح A را پیشنهاد نمی‌کند."), insufficient)
    level = scale.level_for(rate)
    if level is None:
        return RateCheck(rate, Suggestion(None, f"نرخ {shown} بار در سال در مرزهای جدول A نمی‌افتد."), insufficient)
    return RateCheck(rate, Suggestion(level.value, f"نرخ {shown} بار در سال."), insufficient)


def initiator_scale(version):
    return version.scales.prefetch_related("levels").get(code=INITIATOR_SCALE)


def assessment_rate_check(assessment, count=None, months=None, coverage=None):
    """همان check_rate با پارامترهای نسخه‌ی روش ارزیابی. بی‌آرگومان، داده‌ی ذخیره‌شده‌ی خود ارزیابی را می‌خواند."""
    version = assessment.method_version
    if count is None and months is None and coverage is None:
        count, months, coverage = assessment.a_count, assessment.a_period_months, assessment.a_coverage
    return check_rate(
        count,
        months,
        coverage,
        initiator_scale(version),
        int(parameter(version, MethodParameter.Key.A_DATA_PERIOD)),
        parameter(version, MethodParameter.Key.A_DATA_COVERAGE),
    )


@dataclass
class ControlRow:
    control_assessment: object
    e: int  # E که در Bc به کار رفته
    note: str = ""  # چرا کمتر از E ثبت‌شده حساب شده


@dataclass
class PathRow:
    path: object
    controls: list
    result: object = None  # PathResult موتور
    notes: list = field(default_factory=list)


@dataclass
class LikelihoodSummary:
    rate: RateCheck | None
    paths: list
    b: object  # Band یا None
    likelihood: object  # Band یا None
    problems: list  # ورودی نامعتبر
    incomplete: list  # چرا L هنوز کران بالای قابل دفاعی ندارد
    blockers: list  # آن‌چه تأیید نهایی ارزیابی را می‌بندد
    engine_paths: list = field(default_factory=list)  # مسیرها به زبان موتور محاسبه


def band_or_none(low, high):
    return None if low is None else Band(low, high)


def band_list(band):
    return None if band is None else [band.low, band.high]


def likelihood_summary(assessment, on=None):
    """A، B هر مسیر، B سناریو و L همان‌طور که موتور محاسبه با نسخه‌ی روش ارزیابی حساب می‌کند. E هر کنترل از
    ارزیابی اثربخشی‌اش می‌آید و کنترل معلق یا با شاهد کهنه E1 حساب می‌شود. ارزیابی تأییدشده همان چیزی را نشان
    می‌دهد که هنگام تأیید حساب و ذخیره شده است، حتی اگر شاهد کنترلی بعداً کهنه شده باشد."""
    rate = assessment_rate_check(assessment) if assessment.a_basis == "rate" else None
    if assessment.is_approved and "paths" in assessment.result_detail:
        return approved_likelihood(assessment, rate)

    tables = MethodTables(assessment.method_version)
    rows, engine_paths = [], []
    for path in assessment.paths.prefetch_related("control_assessments__control", "evidence"):
        controls = [
            ControlRow(item, item.effective_e(on), item.credit_problem(on) or "")
            for item in sorted(path.control_assessments.all(), key=lambda item: item.control.code)
        ]
        notes = []
        if path.critical_exception:
            notes.append("استثنای بحرانی باز کاهش کنترل را در این مسیر می‌بندد (بخش ۲۳).")
        credited = (
            ()
            if path.critical_exception
            else tuple(Control(e=row.e, name=row.control_assessment.control.code) for row in controls)
        )
        engine_paths.append(
            EnginePath(b0=path.b0_engine_value, controls=credited, independent=path.independent, name=path.name)
        )
        rows.append(PathRow(path, controls, notes=notes))

    problems, incomplete = [], []
    checked = check_likelihood(tables, assessment.a_engine_value, engine_paths, problems)
    if NO_PATH in problems:
        problems.remove(NO_PATH)
        incomplete.append("هنوز مسیر تحققی ثبت نشده است؛ " + NO_PATH)
    b = likelihood = None
    if not problems:
        results, b, likelihood = likelihood_result(tables, engine_paths, checked, incomplete)
        for row, result in zip(rows, results):
            row.result = result
    if not assessment.a_recorded:
        incomplete = ["A هنوز ثبت نشده است." if reason == A_UNKNOWN else reason for reason in incomplete]

    blockers = []
    if assessment.risk.needs_completion:
        blockers.append("تعریف آغازگر، واحد شمارش یا دامنه‌ی ریسک کامل نیست؛ A نهایی تأیید نمی‌شود (بخش ۱۳).")
    if assessment.a_recorded and not assessment.a_evidence.exists():
        blockers.append("A شاهد ندارد؛ هر امتیاز شناسه‌ی شاهد می‌خواهد (بخش ۲۴).")
    for row in rows:
        if not row.path.evidence.all():
            blockers.append(f"B0 مسیر «{row.path.name}» شاهد ندارد.")
    return LikelihoodSummary(rate, rows, b, likelihood, problems, incomplete, blockers, engine_paths)


def likelihood_snapshot(summary):
    """مسیرها همان‌طور که هنگام تأیید حساب شده‌اند، برای ذخیره در result_detail."""
    return [
        {
            "path": row.path.pk,
            "controls": [
                {"assessment": item.control_assessment.pk, "e": item.e, "note": item.note} for item in row.controls
            ],
            "b0": band_list(row.result.b0),
            "bc": band_list(row.result.bc),
            "b": band_list(row.result.b),
            "notes": row.notes,
        }
        for row in summary.paths
    ]


def approved_likelihood(assessment, rate):
    detail = assessment.result_detail
    paths = {path.pk: path for path in assessment.paths.all()}
    ids = [item["assessment"] for row in detail["paths"] for item in row["controls"]]
    found = {item.pk: item for item in ControlAssessment.objects.filter(pk__in=ids).select_related("control")}
    rows = []
    for row in detail["paths"]:
        path = paths[row["path"]]
        controls = [ControlRow(found[item["assessment"]], item["e"], item["note"]) for item in row["controls"]]
        result = PathResult(
            name=path.name,
            b0=band_or_none(*(row["b0"] or [None, None])),
            bc=band_or_none(*row["bc"]),
            b=band_or_none(*(row["b"] or [None, None])),
        )
        rows.append(PathRow(path, controls, result, row["notes"]))
    return LikelihoodSummary(
        rate,
        rows,
        band_or_none(assessment.b_low, assessment.b_high),
        band_or_none(assessment.likelihood_low, assessment.likelihood_high),
        problems=[],
        incomplete=[],
        blockers=[],
    )


def path_control_choices(assessment, current=()):
    """ارزیابی‌های اثربخشی که به مسیرهای این ارزیابی وصل می‌شوند: کنترل پیشگیرانه‌ی همین ریسک (بخش ۱۵: کنترل
    بازیابی و مهار در پیامد ارزیابی می‌شود) که الان اعتبار کاهش دارد، به‌اضافه‌ی آن‌هایی که همین مسیر قبلاً
    انتخاب کرده تا با کهنه‌شدن شاهد بی‌صدا حذف نشوند."""
    today = timezone.localdate()
    candidates = ControlAssessment.objects.filter(
        control__in=assessment.risk.controls.all(), control__kind=ControlRecord.Kind.PREVENTIVE
    ).select_related("control")
    current_ids = {item.pk for item in current}
    keep = [item.pk for item in candidates if item.pk in current_ids or not item.credit_problem(today)]
    return candidates.filter(pk__in=keep).order_by("control__code", "-created_at")
