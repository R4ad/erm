"""نتیجه‌ی ارزیابی (بخش ۷ و ۱۸ سند v5): امتیاز، سطح پایه و تصمیم، علت تصعید، اطمینان کل و «ارزیابی ناقص»، و
قاعده‌هایی که پیش از کنترل کیفیت و تأیید باید برقرار باشند (قاعده‌های مسدودکننده‌ی بخش ۲۳)."""

from dataclasses import dataclass, field

from apps.core.choices import Confidence
from apps.methodology.engine import Inputs, InvalidInput, calculate
from apps.methodology.services import MethodTables

from .models import Assessment
from .services import band_or_none, impact_summary, likelihood_summary

ORDER = [Confidence.LOW, Confidence.MEDIUM, Confidence.HIGH]


@dataclass
class Outcome:
    """نتیجه‌ای که صفحه‌ی ارزیابی نشان می‌دهد: برای پیش‌نویس هر بار حساب می‌شود و برای ارزیابی تأییدشده همان
    است که هنگام تأیید ذخیره شده. problems یعنی هنوز نتیجه‌ای حساب نمی‌شود."""

    b: object = None
    likelihood: object = None
    impact: object = None
    score: object = None
    base_level: object = None
    decision_level: object = None
    escalation_reasons: list = field(default_factory=list)
    incomplete_reasons: list = field(default_factory=list)
    confidence: str = ""
    out_of_acceptance_authority: bool = False
    acceptance_restricted: bool = False
    problems: list = field(default_factory=list)

    @property
    def incomplete(self):
        return bool(self.incomplete_reasons)

    @property
    def confidence_label(self):
        return Confidence(self.confidence).label if self.confidence else ""

    @property
    def decision_score(self):
        return self.score.high if self.score else None


@dataclass
class Computation:
    outcome: Outcome
    likelihood: object  # LikelihoodSummary
    impacts: object  # ImpactSummary


def compute(assessment, on=None):
    """نتیجه‌ی ارزیابی با موتور محاسبه و نسخه‌ی روش خود ارزیابی. E کنترل‌ها همان است که روز on اعتبار دارد."""
    likelihood = likelihood_summary(assessment, on)
    impacts = impact_summary(assessment)
    tables = MethodTables(assessment.method_version)
    inputs = Inputs(
        a=assessment.a_engine_value,
        paths=tuple(likelihood.engine_paths),
        impacts=tuple(impact for impact, _ in impacts.cells),
        ongoing_incident=assessment.ongoing_incident,
        binding_prohibition=assessment.binding_prohibition,
        customer_tolerance_exceeded=assessment.customer_tolerance_exceeded,
    )
    try:
        result = calculate(tables, inputs)
    except InvalidInput as error:
        return Computation(Outcome(problems=error.messages), likelihood, impacts)
    outcome = Outcome(
        b=result.b,
        likelihood=result.likelihood,
        impact=result.impact,
        score=result.score,
        base_level=result.base_level,
        decision_level=result.decision_level,
        escalation_reasons=list(result.escalation_reasons),
        incomplete_reasons=list(result.incomplete_reasons),
        confidence=overall_confidence(assessment, result, likelihood, impacts, tables),
        out_of_acceptance_authority=result.out_of_acceptance_authority,
        acceptance_restricted=result.acceptance_restricted,
    )
    return Computation(outcome, likelihood, impacts)


def overall_confidence(assessment, result, likelihood, impacts, tables):
    """کمترین اطمینان در مؤلفه‌های تعیین‌کننده (بخش ۷ و جواب س۶۱): A؛ B0 و E کنترل‌های مسیری که B سناریو را
    تعیین کرده؛ و خانه‌هایی از پروفایل پیامد که I از آن‌ها آمده. ارزیابی ناقص اطمینان کم دارد، چون دست‌کم یک
    مؤلفه‌ی تعیین‌کننده کران قابل دفاعی ندارد."""
    if result.incomplete or not result.b or not result.impact:
        return Confidence.LOW
    values = [assessment.a_confidence]
    top_bc = max(tables.scale_values["Bc"])
    for row in likelihood.paths:
        path_result = row.result
        if not path_result.b or path_result.b.high != result.b.high:
            continue
        if path_result.b0.high <= path_result.bc.high:
            values.append(row.path.b0_confidence)
        if path_result.bc.high <= path_result.b0.high and path_result.bc.high < top_bc:
            values.extend(item.control_assessment.confidence for item in row.controls if item.e >= 2)
    for impact, detail in impacts.cells:
        if detail and detail.level is not None and (detail.level_high or detail.level) == result.impact.high:
            values.append(detail.confidence)
    # اطمینانی که ثبت نشده، کم حساب می‌شود.
    return min((value or Confidence.LOW for value in values), key=ORDER.index)


def outcome(assessment):
    """نتیجه برای نمایش: ارزیابی تأییدشده از ستون‌های ذخیره‌شده، بقیه با محاسبه‌ی همین حالا."""
    if not assessment.is_approved:
        return compute(assessment).outcome
    return Outcome(
        b=band_or_none(assessment.b_low, assessment.b_high),
        likelihood=band_or_none(assessment.likelihood_low, assessment.likelihood_high),
        impact=band_or_none(assessment.impact_low, assessment.impact_high),
        score=band_or_none(assessment.score_low, assessment.score_high),
        base_level=assessment.base_level,
        decision_level=assessment.decision_level,
        escalation_reasons=assessment.escalation_reasons,
        incomplete_reasons=assessment.incomplete_reasons,
        confidence=assessment.confidence,
        out_of_acceptance_authority=assessment.out_of_acceptance_authority,
        acceptance_restricted=assessment.acceptance_restricted,
    )


def submission_problems(assessment, computation=None):
    """قاعده‌های مسدودکننده‌ی بخش ۲۳ و بخش ۲۴، به‌اضافه‌ی جواب س۸۱، س۸۲ و س۸۷. فهرست خالی یعنی ارزیابی برای کنترل
    کیفیت و تأیید آماده است. مقدار «نامعلوم» با دلیل رسیدگی‌شده است و ارزیابی را فقط «ناقص» می‌کند."""
    computation = computation or compute(assessment)
    risk = assessment.risk
    problems = []
    if not risk.owner_id or not risk.owner.is_active:
        problems.append("ریسک مالک حقیقی فعال ندارد.")
    if not risk.service_id:
        problems.append("خدمت ریسک تعیین نشده است.")
    if not risk.customers.exists():
        problems.append("هیچ بانکی برای ریسک تعیین نشده است.")
    if assessment.kind in assessment.KINDS_NEEDING_ASSUMPTIONS and not assessment.assumptions.strip():
        problems.append("فرض‌های ارزیابی نوشته نشده است.")
    if assessment.kind == Assessment.Kind.TARGET and not assessment.target_due:
        problems.append("موعد تحقق هدف ثبت نشده است (بخش ۱۷).")
    from apps.methodology.models import MethodParameter
    from apps.methodology.services import parameter

    default_horizon = parameter(assessment.method_version, MethodParameter.Key.HORIZON)
    if assessment.horizon_months != default_horizon and not assessment.horizon_rationale.strip():
        problems.append("افق متفاوت از پیش‌فرض روش باید دلیل داشته باشد (بخش ۱۳).")

    likelihood = computation.likelihood
    if not assessment.a_recorded:
        problems.append("A ثبت نشده است.")
    if not likelihood.paths:
        problems.append("دست‌کم یک مسیر تحقق لازم است (بخش ۱۵).")
    problems.extend(likelihood.blockers)
    for row in likelihood.paths:
        path = row.path
        if path.b0 is not None and not path.b0_confidence:
            problems.append(f"اطمینان B0 مسیر «{path.name}» ثبت نشده است.")
        for item in row.controls:
            control_assessment = item.control_assessment
            if item.e >= 2 and not control_assessment.confidence:
                problems.append(f"اطمینان E در {control_assessment.code} ثبت نشده است.")

    impacts = computation.impacts
    if impacts.missing:
        problems.append(f"سطح این خانه‌های پروفایل پیامد ثبت نشده است: {'، '.join(impacts.missing)}.")
    for impact, detail in impacts.cells:
        if detail is None:
            continue
        label = f"{impact.dimension} برای {impact.stakeholder}"
        if not detail.rationale.strip():
            problems.append(f"پیامد {label} دلیل ندارد.")
        if detail.level is not None and not detail.confidence:
            problems.append(f"اطمینان پیامد {label} ثبت نشده است.")
        if detail.level and not detail.evidence.exists():
            problems.append(f"پیامد {label} شاهد ندارد.")

    if assessment.has_escalation_flag:
        if not assessment.escalation_rationale.strip():
            problems.append("قاعده‌ی تقدم بدون دلیل ثبت شده است.")
        if not assessment.escalation_evidence.exists():
            problems.append("قاعده‌ی تقدم بدون شاهد ثبت شده است.")
    problems.extend(computation.outcome.problems)
    # ترتیب را نگه می‌دارد و تکرار را حذف می‌کند، چون بعضی ایرادها از دو راه می‌رسند.
    return list(dict.fromkeys(problems))
