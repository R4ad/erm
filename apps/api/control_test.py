"""«آزمون اثربخشی کنترل» در رابط React (فیگما ۲۲): برگه‌ی آزمون یک ارزیابی اثربخشی (بخش ۱۶ و ۲۵ روش) با چهار
وضعیت جدا (وجود، کفایت طراحی، پوشش اجرا، اثربخشی عملیاتی)، طرح آزمون، نتیجه‌ی نمونه‌ها، نردبان E با شروط سطح هدف،
اثر E این آزمون بر Bc و B مسیرهای ریسک‌های وابسته با موتور محاسبه، شواهد و قواعد شاهد کنترل (بخش ۱۴).
ثبت آزمون تازه و ویرایش همان فرم‌های جنگوست؛ آزمون تازه ردیف تازه است و این برگه حذف نمی‌شود."""

from collections import OrderedDict
from dataclasses import replace

from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework.response import Response

from apps.actions.models import RiskReview
from apps.assessments.models import Assessment
from apps.assessments.results import compute, outcome
from apps.controls.effectiveness import Thresholds, checklist
from apps.controls.permissions import can_edit_controls, visible_control_assessments
from apps.methodology.engine import Inputs, InvalidInput, calculate
from apps.methodology.models import MethodParameter
from apps.methodology.services import MethodTables, parameter
from apps.risks.permissions import visible_evidence, visible_risks

from . import formatting as fmt
from .base import ApiView
from .treatment import fa

# توضیح کوتاه هر سطح E در نردبان، وقتی نسخه‌ی روش معیاری برایش ننوشته باشد
LADDER = {
    1: "بدون اثر",
    2: "ناقص یا پوشش محدود",
    3: "اجرا + پوشش نقاط حیاتی + آزمون موفق",
    4: "پایدار با تأیید مستقل",
    5: "آزمون خرابی و دورزدن",
}

RULES = [
    "تعداد و تنوع نمونه با اهمیت کنترل تعیین و دلیل آن ثبت می‌شود",
    "موفقیت چند نمونه برای اثبات اثربخشی در کل دامنه کافی نیست",
    "سطح E3 یا بالاتر با شکاف شناخته‌شده در دامنه‌ی مورد اتکا مجاز نیست",
    "پس از تغییر مهم در کنترل یا محیط، اعتبار شواهد دوباره بررسی می‌شود",
    "کنترل در اختیار تأمین‌کننده بدون شاهد معتبر، اثبات‌شده نیست",
]

MET, PARTIAL, UNMET = "met", "partial", "unmet"
STATE_LABEL = {MET: "احراز شد", PARTIAL: "ناقص", UNMET: "احراز نشد"}


def percent(value):
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    return fa(text.replace(".", "٫"))


def card(key, label, state, text):
    return {"key": key, "label": label, "state": state, "state_label": STATE_LABEL[state], "text": text}


def cards(assessment, thresholds, samples):
    """چهار وضعیت جدای بخش ۱۶. پوشش اجرا با درصد پوشش، نقاط حیاتی و استثناهای نمونه سنجیده می‌شود."""
    control = assessment.control
    failed = [sample for sample in samples if not sample.passed]
    exists = card(
        "exists",
        "وجود",
        MET if assessment.exists else UNMET,
        f"کنترل در دامنه‌ی «{assessment.scope}» تعریف شده و اجرا می‌شود."
        if assessment.exists
        else "کنترل در این دامنه اجرا نمی‌شود؛ بدون اجرا E1 است.",
    )
    design = card(
        "design",
        "کفایت طراحی",
        MET if assessment.design_ok else UNMET,
        (control.objective or control.title)
        if assessment.design_ok
        else "طراحی کنترل برای قطع مرحله‌ی ضروری مسیر سناریو کافی نیست.",
    )
    covered = (
        assessment.coverage_pct is not None
        and assessment.coverage_pct >= thresholds.coverage
        and assessment.critical_points_covered
        and not failed
    )
    # با نمونه، شمار استثناها و شرح شکست؛ بی‌نمونه، درصد پوشش و استثناهای ثبت‌شده
    if samples:
        parts = [f"{fa(len(failed))} استثنا از {fa(len(samples))} نمونه", assessment.failures if failed else ""]
    elif assessment.coverage_pct is not None:
        parts = [
            f"پوشش {percent(assessment.coverage_pct)}٪ از {assessment.population or 'جمعیت کل'}",
            assessment.exceptions,
        ]
    else:
        parts = ["پوشش اجرا ثبت نشده است", assessment.exceptions]
    text = "؛ ".join(part.strip().rstrip(".") for part in parts if part.strip())
    coverage = card("coverage", "پوشش اجرا", MET if covered else PARTIAL if assessment.exists else UNMET, f"{text}.")
    if assessment.known_gap:
        operating_text = "شکاف شناخته‌شده در دامنه‌ی مورد اتکا؛ شرط E3 برقرار نیست."
    elif assessment.operating_ok:
        operating_text = assessment.test_result or "آزمون فعلی اثربخشی عملیاتی کنترل را نشان می‌دهد."
    else:
        operating_text = assessment.failures or "آزمون فعلی اثربخشی عملیاتی کنترل را نشان نمی‌دهد."
    operating = card(
        "operating",
        "اثربخشی عملیاتی",
        MET if assessment.operating_ok and not assessment.known_gap else UNMET,
        operating_text,
    )
    return [exists, design, coverage, operating]


def plan(assessment, samples):
    """طرح آزمون: روش، جامعه، اندازه و ترکیب نمونه، دلیل انتخاب و مسیرهای آزموده با نتیجه‌شان."""
    by_path = OrderedDict()
    for sample in samples:
        by_path.setdefault(sample.path, []).append(sample)
    size = assessment.sample_size or len(samples) or None
    mix = " + ".join(f"{fa(len(rows))} {path}" for path, rows in by_path.items())
    return {
        "kind": "نمونه‌گیری + آزمون عملی" if samples else assessment.test_method or None,
        "rows": [
            {"label": "روش آزمون", "value": assessment.test_method or "—"},
            {"label": "جامعه‌ی آماری", "value": assessment.population or "—"},
            {
                "label": "اندازه‌ی نمونه",
                "value": " · ".join(part for part in (f"{fa(size)} مورد" if size else "", mix) if part) or "—",
            },
            {"label": "دلیل انتخاب", "value": assessment.sample_rationale or "—"},
        ],
        "paths": [{"name": path, "passed": all(row.passed for row in rows)} for path, rows in by_path.items()],
    }


def results(samples):
    failed = [sample for sample in samples if not sample.passed]
    summary = f"{fa(len(samples) - len(failed))} موفق · {fa(len(failed))} استثنا"
    paths = {sample.path for sample in failed}
    if len(paths) == 1:
        every = f"هر {fa(len(failed))} " if len(failed) > 1 else ""
        summary += f" — {every}در مسیر {paths.pop()}"
    return {
        "summary": summary if samples else None,
        "rate": percent(100 * (len(samples) - len(failed)) / len(samples)) if samples else None,
        "rows": [
            {
                "id": sample.pk,
                "reference": sample.reference,
                "date": fmt.day(sample.occurred_on),
                "path": sample.path,
                "performer": sample.performer or None,
                "passed": sample.passed,
                "note": sample.note or None,
            }
            for sample in samples
        ],
    }


def ladder(assessment, version, previous, thresholds):
    """نردبان E با سطح فعلی، قبلی و هدف. هدف بازگشت به E قبلی است اگر پایین آمده باشد، وگرنه سطح بعدی."""
    levels = {level.value: level for level in version.scales.get(code="E").levels.all()}
    current = assessment.e
    before = previous.e if previous else None
    target = before if before and before > current else min(current + 1, 5)
    facts = assessment.test_facts()
    notes = {}
    failed = assessment.samples.filter(passed=False).count()
    if failed:
        notes["operating"] = f"{fa(failed)} استثنا"
    if assessment.known_gap and (assessment.failures or assessment.exceptions):
        notes["gap"] = (assessment.failures or assessment.exceptions).rstrip(".")
    return {
        "current": current,
        "previous": before,
        "target": target if target != current else None,
        "levels": [
            {
                "value": value,
                "name": levels[value].name if value in levels else f"E{value}",
                "text": LADDER[value],
                "criteria": levels[value].criteria if value in levels else "",
            }
            for value in range(1, 6)
        ],
        "conditions": [
            {"key": key, "label": fa(label), "met": met, "note": None if met else notes.get(key)}
            for key, label, met in checklist(target, facts, thresholds)
        ]
        if target != current
        else [],
        "rationale": assessment.rationale,
    }


def what_if(computation, assessment, code, e):
    """نتیجه‌ی همان ارزیابی ریسک اگر E این کنترل e بود؛ برای «Bc از … به …». ارزیابی تأییدشده مسیرهای موتور ندارد
    (نتیجه‌اش ثابت ذخیره شده) و ورودی نامعتبر هم نتیجه ندارد."""
    paths = computation.likelihood.engine_paths
    if not paths:
        return None
    swapped = tuple(
        replace(path, controls=tuple(replace(item, e=e) if item.name == code else item for item in path.controls))
        for path in paths
    )
    inputs = Inputs(
        a=assessment.a_engine_value,
        paths=swapped,
        impacts=tuple(impact for impact, _ in computation.impacts.cells),
        ongoing_incident=assessment.ongoing_incident,
        binding_prohibition=assessment.binding_prohibition,
        customer_tolerance_exceeded=assessment.customer_tolerance_exceeded,
    )
    try:
        return calculate(MethodTables(assessment.method_version), inputs)
    except InvalidInput:
        return None


def band(value):
    return fa(str(value)) if value else None


def dependents(test, previous, user, failing):
    """ریسک‌هایی که مسیرشان به این آزمون تکیه دارد، با B0 و Bc هر مسیر، B و L و امتیاز؛ و ریسک‌های دیگری که این
    کنترل را دارند ولی مسیری از آن‌ها به این آزمون نرسیده است."""
    control = test.control
    risks = visible_risks(user)
    version = test.method_version
    days = int(parameter(version, MethodParameter.Key.REASSESS_INCIDENT))
    alert = (
        f"شکست کنترل کلیدی: اعتبار کاهش تعلیق و بازسنجی حداکثر ظرف {fa(days)} روز کاری آغاز شود (بخش ۲۱)."
        if control.is_key and failing
        else None
    )
    assessments = (
        Assessment.objects.filter(paths__control_assessments=test, risk__in=risks, kind=Assessment.Kind.CURRENT)
        .select_related("risk__service", "decision_level", "method_version")
        .distinct()
        .order_by("risk__code", "-pk")
    )
    rows, seen = [], set()
    for assessment in assessments:
        if assessment.risk_id in seen:
            continue
        seen.add(assessment.risk_id)
        computation = compute(assessment)
        # ارزیابی تأییدشده نتیجه‌ی ذخیره‌شده‌اش را نشان می‌دهد، پیش‌نویس نتیجه‌ی همین حالا را
        result = outcome(assessment) if assessment.is_approved else computation.outcome
        before = what_if(computation, assessment, control.code, previous.e) if previous else None
        paths = []
        for number, row in enumerate(computation.likelihood.paths, 1):
            if test.pk not in {item.control_assessment.pk for item in row.controls}:
                continue
            others = [item for item in row.controls if item.control_assessment.pk != test.pk]
            own = next(item for item in row.controls if item.control_assessment.pk == test.pk)
            old = before.paths[number - 1].bc if before else None
            notes = []
            if own.note:
                notes.append(f"اعتبار {control.code} {own.note}")
            notes.extend(
                f"{item.control_assessment.control.code} {item.control_assessment.control.title} E{item.e} باقی است"
                for item in others
            )
            if not others:
                notes.append(f"کنترل دیگری این مسیر را قطع نمی‌کند؛ Bc فقط از {control.code} می‌آید")
            paths.append(
                {
                    "id": row.path.pk,
                    "name": f"مسیر {fa(number)} · {row.path.name}",
                    "b0": band(row.result.b0) if row.result else None,
                    "bc": band(row.result.bc) if row.result else None,
                    "bc_before": band(old) if old and row.result and old != row.result.bc else None,
                    "note": "؛ ".join(notes),
                }
            )
        b_before = before.b if before else None
        level = result.decision_level
        rows.append(
            {
                "id": assessment.risk.pk,
                "code": assessment.risk.code,
                "title": assessment.risk.title,
                "href": assessment.risk.get_absolute_url(),
                "assessment": {"code": assessment.code, "href": assessment.get_absolute_url()},
                "approved": assessment.is_approved,
                "paths": paths,
                "b": band(result.b),
                "b_change": None
                if not result.b or not b_before
                else "بدون تغییر"
                if b_before == result.b
                else f"از {band(b_before)}",
                "l": band(result.likelihood),
                "score": band(result.score),
                "level": fmt.level(level) if level else None,
                "alert": alert,
            }
        )
    reviews = set(
        RiskReview.objects.filter(risk__controls=control, completed_at__isnull=True).values_list("risk_id", flat=True)
    )
    others = [
        {
            "id": risk.pk,
            "code": risk.code,
            "href": risk.get_absolute_url(),
            "scope": " · ".join(
                part
                for part in (
                    risk.service.name if risk.service_id else "",
                    "، ".join(customer.name for customer in risk.customers.all()),
                )
                if part
            )
            or risk.title,
            "state": "بازسنجی" if risk.pk in reviews else "بدون مسیر وابسته",
            "tone": "warning" if risk.pk in reviews else "neutral",
        }
        for risk in risks.filter(controls=control)
        .exclude(pk__in=seen)
        .select_related("service")
        .prefetch_related("customers")
        .order_by("code")
    ]
    return {"risks": rows, "others": others}


def evidence(test, previous, user):
    visible = visible_evidence(user)
    rows = []
    for item in visible.filter(control_assessments=test).order_by("-observed_on", "pk"):
        rows.append(
            {
                "id": item.pk,
                "code": item.code,
                "title": item.title,
                "kind": item.get_kind_display(),
                "observed_on": fmt.day(item.observed_on),
                "state": "stale" if item.is_expired else "current",
                "state_label": "کهنه" if item.is_expired else "جاری",
                "href": item.get_absolute_url(),
            }
        )
    if previous:
        current = {row["id"] for row in rows}
        for item in visible.filter(control_assessments=previous).exclude(pk__in=current).order_by("-observed_on"):
            rows.append(
                {
                    "id": item.pk,
                    "code": item.code,
                    "title": f"{item.title} (مبنای E{previous.e} قبلی)",
                    "kind": item.get_kind_display(),
                    "observed_on": fmt.day(item.observed_on),
                    "state": "superseded",
                    "state_label": "منسوخ",
                    "href": item.get_absolute_url(),
                }
            )
    return rows


def page(test, user):
    control = test.control
    version = test.method_version
    thresholds = Thresholds.of(version)
    samples = list(test.samples.all())
    previous = (
        type(test)
        .objects.filter(control=control, created_at__lt=test.created_at)
        .exclude(pk=test.pk)
        .order_by("-created_at", "-pk")
        .first()
    )
    level = version.scales.get(code="E").levels.filter(value=test.e).first()
    failing = test.known_gap or test.suspended or not test.operating_ok or any(not s.passed for s in samples)
    can_edit = can_edit_controls(user)
    tester = test.verified_by or test.created_by
    return {
        "id": test.pk,
        "code": test.code,
        "control": {
            "id": control.pk,
            "code": control.code,
            "title": control.title,
            "is_key": control.is_key,
            "owner": fmt.person(control.owner),
            "href": control.get_absolute_url(),
        },
        "e": {"value": test.e, "name": level.name if level else f"E{test.e}"},
        "previous": {"e": previous.e, "code": previous.code, "href": previous.get_absolute_url()} if previous else None,
        "tester": fmt.person(tester),
        "period": {"from": fmt.day(test.test_from), "to": fmt.day(test.test_to)},
        "valid_until": fmt.deadline(test.valid_until),
        "evidence_age": fa(thresholds.evidence_age(control.is_key)),
        "suspended": test.suspended,
        "cards": cards(test, thresholds, samples),
        "plan": plan(test, samples),
        "results": results(samples),
        "ladder": ladder(test, version, previous, thresholds),
        **dependents(test, previous, user, failing),
        "evidence": evidence(test, previous, user),
        "rules": RULES,
        "new_test_url": reverse("controls:control_assessment_create", args=[control.pk]) if can_edit else None,
        # شاهد آزمون در همان فرم ویرایش انتخاب می‌شود که عضو GRC باز می‌کند
        "edit_url": reverse("controls:control_assessment_update", args=[test.pk]) if can_edit else None,
    }


class ControlTestView(ApiView):
    def get(self, request, pk):
        test = get_object_or_404(
            visible_control_assessments(request.user).select_related(
                "control__owner", "verified_by", "created_by", "method_version"
            ),
            pk=pk,
        )
        return Response(page(test, request.user))
