from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.catalog.models import ServiceCustomer
from apps.methodology.engine import Impact, check_impacts, impact_band
from apps.methodology.models import MethodParameter, MethodVersion, Scale
from apps.methodology.services import MethodTables
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
UNITS = {DURATION_SCALE: "دقیقه", FINANCIAL_SCALE: "ریال"}


def active_version():
    return MethodVersion.objects.filter(status=MethodVersion.Status.ACTIVE).first()


def parameter(version, key):
    row = version.parameters.filter(key=key).first()
    return row.value if row else None


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


def impact_summary(assessment):
    """جدول پروفایل پیامد و I همان‌طور که موتور محاسبه با نسخه‌ی روش ارزیابی حساب می‌کند. خانه‌ی ثبت‌نشده مثل
    نامعلوم است: سطح را با صفر پر نمی‌کند (بخش ۸)."""
    scales = impact_scales(assessment)
    columns = stakeholders(assessment)
    cells = {(impact.customer_id, impact.scale_id): impact for impact in assessment.impacts.select_related("customer")}
    rows, impacts, missing, unknown = [], [], [], []
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
        rows.append((scale, row))
    problems, incomplete = [], []
    tables = MethodTables(assessment.method_version)
    checked = check_impacts(tables, impacts, problems)
    band = None if problems else impact_band(tables, checked, incomplete)
    return ImpactSummary(rows, columns, band, problems, incomplete, missing, unknown)
