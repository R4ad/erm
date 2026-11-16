"""«آنالیز ریسک» در رابط React (فیگما ۱۲): خلاصه‌ی A، B، L، I و امتیاز؛ عامل آغازگر با مسیر امتیازدهی و جدول A؛
مسیرهای تحقق با B0، Bc و B؛ اثربخشی کنترل‌ها؛ ماتریس A × B؛ پروفایل پیامد؛ عدم قطعیت. همه‌ی عددها از همان موتور
محاسبه و همان سرویس‌های صفحه‌ی ارزیابی می‌آیند و ذخیره‌ی A از همان InitiatorForm می‌گذرد."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.urls import reverse
from rest_framework import status
from rest_framework.response import Response as ApiResponse

from apps.assessments.forms import UNKNOWN, InitiatorForm
from apps.assessments.models import ABasis, Assessment
from apps.assessments.permissions import can_edit_assessment, visible_assessments
from apps.assessments.results import compute, outcome, submission_problems
from apps.assessments.review import can_submit
from apps.assessments.services import band_list, impact_summary, initiator_scale, likelihood_summary
from apps.assessments.views import evidence_choices
from apps.controls.effectiveness import Thresholds
from apps.controls.models import Control
from apps.controls.permissions import visible_controls
from apps.core.choices import Confidence
from apps.core.jalali import to_jalali
from apps.methodology.models import MethodParameter, plain_number
from apps.methodology.services import MethodTables, parameter

from . import formatting as fmt
from .base import ApiView

CONFIDENCE_KEYS = {Confidence.LOW: "low", Confidence.MEDIUM: "medium", Confidence.HIGH: "high"}
PREVENTIVE = Control.Kind.PREVENTIVE


def _number(value):
    return None if value is None else float(value)


def _band(band):
    """«۳» یا «۳ تا ۴»؛ None یعنی هنوز حساب نشده."""
    if band is None:
        return None
    return str(band.low) if band.high in (None, band.low) else f"{band.low} تا {band.high}"


def _scale_band(level):
    lower, upper = level.lower, level.upper
    if lower is None and upper is not None:
        text = f"کمتر از {plain_number(upper)}"
    elif upper is None and lower is not None:
        text = f"{plain_number(lower)} یا بیشتر"
    elif lower is not None:
        text = f"{plain_number(lower)} تا {plain_number(upper)}"
    else:
        text = level.name
    return {"value": level.value, "name": level.name, "lower": _number(lower), "upper": _number(upper), "text": text}


def _period(assessment):
    """دوره‌ی مشاهده‌ی نرخ به ماه شمسی، تا ماه ثبت ارزیابی: «۱۴۰۴/۰۸ تا ۱۴۰۵/۰۸ (۱۲ ماه)»."""
    months = assessment.a_period_months
    if not months:
        return ""
    year, month, _ = (int(part) for part in to_jalali(assessment.created_at.date()).split("/"))
    total = year * 12 + month - 1 - months
    start = f"{total // 12}/{total % 12 + 1:02d}"
    return f"{start} تا {year}/{month:02d} ({months} ماه)"


def _initiator(assessment, likelihood):
    risk = assessment.risk
    scale = initiator_scale(assessment.method_version)
    snapshot = risk.scenario_snapshot or {}
    rate = likelihood.rate
    event = snapshot.get("event") or (risk.intake or {}).get("event") or risk.title
    evidence = list(assessment.a_evidence.all())
    return {
        "locked": not risk.needs_completion,
        "rows": [
            {"label": "تعریف عامل آغازگر", "value": risk.initiator},
            {"label": "رویداد اصلی", "value": event},
            {"label": "واحد شمارش", "value": risk.count_unit},
            {"label": "دامنه", "value": risk.scope},
            {"label": "دوره‌ی مشاهده", "value": _period(assessment)},
            {"label": "موارد خارج از شمارش", "value": risk.count_exclusions},
            {"label": "منبع شواهد", "value": "، ".join(item.title for item in evidence)},
        ],
        "values": {
            "a_basis": assessment.a_basis,
            "a_count": assessment.a_count,
            "a_period_months": assessment.a_period_months,
            "a_coverage": _number(assessment.a_coverage),
            "a_level": (UNKNOWN if assessment.a is None else str(assessment.a)) if assessment.a_recorded else "",
            "a_high": assessment.a_high,
            "a_confidence": assessment.a_confidence,
            "a_rationale": assessment.a_rationale,
        },
        "count_unit": risk.count_unit,
        "rate": _number(rate.rate) if rate else None,
        "suggestion": rate.suggestion.level if rate else None,
        "insufficient": list(rate.insufficient) if rate else [],
        "coverage_min": _number(parameter(assessment.method_version, MethodParameter.Key.A_DATA_COVERAGE)),
        "period_min": _number(parameter(assessment.method_version, MethodParameter.Key.A_DATA_PERIOD)),
        "bound_rule": scale.bound_rule,
        "bands": [_scale_band(level) for level in scale.levels.all()],
        "basis_choices": [{"value": value, "label": str(label)} for value, label in ABasis.choices],
        "confidence_choices": [{"value": value, "label": str(label)} for value, label in Confidence.choices],
        "evidence": [{"code": item.code, "title": item.title, "href": item.get_absolute_url()} for item in evidence],
        "evidence_count": len(evidence),
        "form_url": reverse("assessments:initiator", args=[assessment.pk]),
    }


def _paths(assessment, likelihood, can_edit):
    scenario_b = likelihood.b.high if likelihood.b else None
    rows = []
    for row in likelihood.paths:
        path, result = row.path, row.result
        rows.append(
            {
                "id": path.pk,
                "name": path.name,
                "description": path.description if path.description != path.name else "",
                "b0": [path.b0, path.b0_high] if path.b0 is not None else None,
                "controls": [
                    {
                        "code": item.control_assessment.control.code,
                        "title": item.control_assessment.control.title,
                        "e": item.e,
                        "recorded_e": item.control_assessment.e,
                        "note": item.note,
                    }
                    for item in row.controls
                ],
                "bc": band_list(result.bc) if result else None,
                "b": band_list(result.b) if result and result.b else None,
                "determining": bool(result and result.b and scenario_b is not None and result.b.high == scenario_b),
                "notes": [str(note) for note in row.notes],
                "edit_url": reverse("assessments:path_update", args=[path.pk]) if can_edit else None,
            }
        )
    highs = [row["b"][1] for row in rows if row["b"]]
    return {
        "rows": rows,
        "b": band_list(likelihood.b),
        "highs": highs,
        "problems": [str(problem) for problem in likelihood.problems],
        "add_url": reverse("assessments:path_create", args=[assessment.pk]) if can_edit else None,
    }


def _controls(assessment, user, can_edit):
    """همه‌ی کنترل‌های ریسک با آخرین ارزیابی اثربخشی هر کدام؛ کنترل کاهش پیامد در E و Bc نمی‌آید (بخش ۷)."""
    thresholds = Thresholds.of(assessment.method_version)
    on_paths = {
        item.control_id: item
        for path in assessment.paths.prefetch_related("control_assessments")
        for item in path.control_assessments.all()
    }
    rows = []
    controls = (
        visible_controls(user)
        .filter(risks=assessment.risk)
        .select_related("owner")
        .prefetch_related("effectiveness_assessments__evidence")
        .order_by("code")
    )
    # کنترل‌های پیشگیرانه اول، چون فقط آن‌ها در Bc اعتبار می‌گیرند؛ کنترل‌های کاهش پیامد آخر.
    for control in sorted(controls, key=lambda item: item.kind != PREVENTIVE):
        test = on_paths.get(control.pk) or max(
            control.effectiveness_assessments.all(), key=lambda item: item.pk, default=None
        )
        preventive = control.kind == PREVENTIVE
        coverage = None
        evidence = None
        if test:
            enough = test.coverage_pct is not None and test.coverage_pct >= thresholds.coverage
            coverage = "ok" if enough and test.critical_points_covered and not test.known_gap else "partial"
            proof = next(iter(test.evidence.all()), None)
            facts = []
            if test.sample_size:
                facts.append(f"آزمون {test.sample_size} نمونه")
            if test.exceptions.strip():
                facts.append(test.exceptions.strip())
            evidence = {
                "code": proof.code if proof else None,
                "href": proof.get_absolute_url() if proof else None,
                "note": " · ".join(facts),
            }
        owner = fmt.person(control.owner)
        rows.append(
            {
                "code": control.code,
                "title": control.title,
                "kind": fmt.choice(control, "kind"),
                "owner": owner["name"] if owner else "",
                "preventive": preventive,
                "href": control.get_absolute_url(),
                "test": None
                if test is None
                else {
                    "code": test.code,
                    "href": test.get_absolute_url(),
                    "exists": test.exists,
                    "design_ok": test.design_ok,
                    "coverage": coverage,
                    "operating_ok": test.operating_ok,
                    "e": test.effective_e(),
                    "recorded_e": test.e,
                    "problem": test.credit_problem() or "",
                },
                "evidence": evidence,
                "test_url": reverse("controls:control_assessment_create", args=[control.pk]) if can_edit else None,
            }
        )
    return rows


def _matrix(assessment, outcome_, likelihood):
    version = assessment.method_version
    tables = MethodTables(version)
    l_scale = next((scale for scale in version.scales.all() if scale.code == "L"), None)
    return {
        "a": assessment.a_high or assessment.a,
        "b": likelihood.b.high if likelihood.b else None,
        "l": outcome_.likelihood.high if outcome_.likelihood else None,
        "rows": [{"a": a, "cells": cells} for a, cells in reversed(tables.likelihood_grid())],
        "names": {level.value: level.name for level in l_scale.levels.all()} if l_scale else {},
    }


def _impacts(summary):
    rows = []
    for scale, cells in summary.rows:
        known = [detail for detail in cells if detail is not None and detail.level is not None]
        top = max(known, key=lambda detail: detail.level_high or detail.level, default=None)
        rows.append(
            {
                "code": scale.code,
                "name": scale.name,
                "level": (top.level_high or top.level) if top else None,
                "note": top.rationale if top else "",
                "unknown": any(detail is not None and detail.level is None for detail in cells),
                "missing": any(detail is None for detail in cells),
            }
        )
    return {"i": band_list(summary.impact), "rows": rows}


def _uncertainty(assessment, result, likelihood, summary, controls):
    items = []
    rate = likelihood.rate
    if assessment.a_basis == ABasis.RATE and rate:
        if rate.insufficient:
            items.extend({"ok": False, "text": str(reason)} for reason in rate.insufficient)
        else:
            coverage = f" با پوشش ثبت {plain_number(assessment.a_coverage)}٪ دامنه" if assessment.a_coverage else ""
            items.append({"ok": True, "text": f"دوره‌ی داده {assessment.a_period_months} ماه{coverage}"})
    elif assessment.a_basis == ABasis.FORWARD:
        items.append({"ok": True, "text": "A از شاهد آینده‌نگر با دلیل ثبت‌شده آمده است"})
    if assessment.risk.needs_completion:
        items.append({"ok": False, "text": "تعریف آغازگر، واحد شمارش یا دامنه کامل نیست"})
    else:
        items.append({"ok": True, "text": "تعریف آغازگر پیش از امتیازدهی ثبت و قفل شد"})
    for row in controls:
        test = row["test"]
        if row["preventive"] and test and test["coverage"] == "partial":
            items.append({"ok": False, "text": f"شاهد پوشش اجرای «{row['title']}» ناقص است"})
        elif row["preventive"] and test and test["problem"]:
            items.append({"ok": False, "text": f"«{row['title']}» {test['problem']}؛ E1 حساب می‌شود"})
    for name in summary.unknown:
        items.append({"ok": False, "text": f"پیامد {name} نامعلوم است"})
    for name in summary.missing:
        items.append({"ok": False, "text": f"پیامد {name} ثبت نشده است"})
    items.extend({"ok": False, "text": str(reason)} for reason in likelihood.incomplete)
    l_band = result.likelihood
    return {
        "confidence": result.confidence_label,
        "confidence_key": CONFIDENCE_KEYS.get(result.confidence, ""),
        "items": items,
        "l_range": band_list(l_band),
    }


def _inherent(assessment):
    inherent = (
        Assessment.objects.filter(
            risk=assessment.risk, kind=Assessment.Kind.INHERENT, status=Assessment.Status.APPROVED
        )
        .select_related("decision_level")
        .order_by("-approved_at", "-pk")
        .first()
    )
    if inherent is None or inherent.score_high is None:
        return None
    return {"score": inherent.score_high, "level": fmt.level(inherent.decision_level)}


def analysis(assessment, user):
    can_edit = can_edit_assessment(user, assessment)
    risk = assessment.risk
    computation = compute(assessment) if not assessment.is_approved else None
    result = computation.outcome if computation else outcome(assessment)
    likelihood = computation.likelihood if computation else likelihood_summary(assessment)
    summary = computation.impacts if computation else impact_summary(assessment)
    initiator = _initiator(assessment, likelihood)
    paths = _paths(assessment, likelihood, can_edit)
    controls = _controls(assessment, user, can_edit)
    matrix = _matrix(assessment, result, likelihood)
    impacts = _impacts(summary)
    submit_allowed = can_submit(user, assessment)
    category = risk.category
    i_high = result.impact.high if result.impact else None
    i_source = next((row["code"] for row in impacts["rows"] if i_high is not None and row["level"] == i_high), "")
    determining = [row for row in paths["rows"] if row["determining"]]
    return {
        "assessment": {
            "id": assessment.pk,
            "code": assessment.code,
            "status": fmt.choice(assessment, "status"),
            "kind": fmt.choice(assessment, "kind"),
            "horizon_months": assessment.horizon_months,
            "method_number": assessment.method_version.number,
            "href": assessment.get_absolute_url(),
            "impact_url": reverse("assessments:impact_profile", args=[assessment.pk]),
            "can_edit": can_edit,
        },
        "risk": {
            "id": risk.pk,
            "code": risk.code,
            "title": risk.title,
            "narrative": risk.description,
            "status": fmt.choice(risk, "status"),
            "category": {"code": category.code, "name": category.name},
            "href": risk.get_absolute_url(),
        },
        "summary": {
            "a": {"value": assessment.a_display if assessment.a_recorded else None, "basis": assessment.a_basis},
            "b": {"value": _band(likelihood.b)},
            "l": {"value": _band(result.likelihood), "a": matrix["a"], "b": matrix["b"]},
            "i": {"value": _band(result.impact), "source": i_source, "dimensions": len(impacts["rows"])},
            "score": {
                "value": _band(result.score),
                "level": fmt.level(result.decision_level),
                "inherent": _inherent(assessment),
            },
            "paths": len(paths["rows"]),
            "determining": [row["name"] for row in determining],
        },
        "initiator": initiator,
        "paths": paths,
        "controls": controls,
        "matrix": matrix,
        "impacts": impacts,
        "uncertainty": _uncertainty(assessment, result, likelihood, summary, controls),
        "problems": [str(problem) for problem in result.problems],
        "submit": {
            "can_submit": submit_allowed,
            "url": reverse("assessments:submit", args=[assessment.pk]) if submit_allowed else None,
            "problems": [str(problem) for problem in submission_problems(assessment)] if submit_allowed else [],
        },
    }


def latest_analysis(user):
    """ارزیابی‌ای که «آنالیز ریسک» بی‌شناسه باز می‌کند: تازه‌ترین پیش‌نویسی که کاربر ویرایش می‌کند."""
    drafts = (
        visible_assessments(user)
        .filter(status=Assessment.Status.DRAFT)
        .select_related("risk", "method_version")
        .order_by("-updated_at", "-pk")
    )
    return next((item for item in drafts if can_edit_assessment(user, item)), None)


class AnalysisIndexView(ApiView):
    def get(self, request):
        assessment = latest_analysis(request.user)
        return ApiResponse(
            {
                "assessment": assessment.pk if assessment else None,
                "workspace_url": reverse("assessments:assessment_list"),
            }
        )


class AnalysisView(ApiView):
    """GET داده‌ی آنالیز یک ارزیابی، POST ذخیره‌ی عامل آغازگر (A) با InitiatorForm."""

    def get_assessment(self, request, pk):
        return get_object_or_404(
            visible_assessments(request.user).select_related(
                "risk__category", "method_version", "created_by", "decision_level"
            ),
            pk=pk,
        )

    def get(self, request, pk):
        return ApiResponse(analysis(self.get_assessment(request, pk), request.user))

    def post(self, request, pk):
        assessment = self.get_assessment(request, pk)
        if not can_edit_assessment(request.user, assessment):
            return ApiResponse({"message": "این ارزیابی را نمی‌توانید ویرایش کنید."}, status=status.HTTP_403_FORBIDDEN)
        values = dict(request.data.get("values") or {})
        current = list(assessment.a_evidence.all())
        data = {
            name: "" if values.get(name) is None else str(values.get(name))
            for name in [
                "a_basis",
                "a_count",
                "a_period_months",
                "a_coverage",
                "a_level",
                "a_high",
                "a_confidence",
                "a_rationale",
            ]
        }
        data["a_denominator"] = assessment.a_denominator
        data["a_evidence"] = [str(item.pk) for item in current]
        form = InitiatorForm(
            data, instance=assessment, evidence=evidence_choices(assessment.risk, current), user=request.user
        )
        if not form.is_valid():
            return ApiResponse(
                {"message": "عامل آغازگر ذخیره نشد.", "errors": fmt.form_errors(form)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            form.save()
        assessment = self.get_assessment(request, pk)
        return ApiResponse(
            {
                "message": f"عامل آغازگر ارزیابی {assessment.code} ذخیره شد.",
                "analysis": analysis(assessment, request.user),
            }
        )
