"""شاخص‌های بخش ۲۱؛ امتیازهای ترتیبی جمع و میانگین نمی‌شوند."""

from collections import Counter
from datetime import timedelta

import jdatetime
from django.db.models import OuterRef, Q, Subquery
from django.utils import timezone

from apps.actions.acceptance import required_authorities, signature_of
from apps.actions.models import RiskAcceptance, RiskReview, TreatmentAction
from apps.assessments.models import Assessment
from apps.catalog.models import Dependency
from apps.catalog.permissions import visible_services
from apps.core.choices import Confidence
from apps.risks.permissions import visible_risks
from apps.risks.services import active_categories, active_risks, complete_services


def current_assessments(risks):
    latest = (
        Assessment.objects.filter(
            risk_id=OuterRef("risk_id"),
            kind=Assessment.Kind.CURRENT,
            status=Assessment.Status.APPROVED,
        )
        .order_by("-approved_at", "-pk")
        .values("pk")[:1]
    )
    return (
        Assessment.objects.filter(risk__in=risks, pk=Subquery(latest))
        .select_related(
            "risk__service",
            "risk__owner",
            "risk__org_unit",
            "decision_level",
            "method_version",
        )
        .prefetch_related(
            "risk__customers", "impacts__scale", "paths__control_assessments__control"
        )
    )


def management_report(user, start=None, end=None):
    today = timezone.localdate()
    start = start or jdatetime.date.fromgregorian(date=today).replace(day=1).togregorian()
    end = end or today
    risks = active_risks(visible_risks(user))
    services = visible_services(user).filter(is_active=True)
    current = list(current_assessments(risks))
    by_risk = {item.risk_id: item for item in current}
    for base in current:
        uncertain = {}
        for path in base.paths.all():
            for sheet in path.control_assessments.all():
                if (
                    sheet.effective_e(on=today) < 3
                    or sheet.confidence == Confidence.LOW
                ):
                    uncertain[sheet.control_id] = sheet.control.code
        base.report_uncertain_controls = "، ".join(uncertain.values())
        due_dates = list(
            RiskReview.objects.filter(
                risk_id=base.risk_id, completed_at__isnull=True
            ).values_list("due", flat=True)
        )
        due_dates += list(
            TreatmentAction.objects.filter(plan__risk_id=base.risk_id)
            .exclude(status=TreatmentAction.Status.VERIFIED)
            .values_list("due_date", flat=True)
        )
        base.report_due = min(due_dates) if due_dates else None
    critical = services.filter(is_critical=True)
    complete_ids = set(
        complete_services(critical, active_categories()).values_list("pk", flat=True)
    )
    assessed_services, incomplete_services = set(), set()
    for risk in risks:
        base = by_risk.get(risk.pk)
        if base and base.decision_level_id and not base.incomplete_reasons:
            assessed_services.add(risk.service_id)
        else:
            incomplete_services.add(risk.service_id)
    covered = len(complete_ids & assessed_services - incomplete_services)
    total = critical.count()
    counts = Counter(
        item.decision_level.name if item.decision_level_id else "نیازمند تکمیل"
        for item in current
    )
    unassessed = risks.exclude(pk__in=by_risk).count()
    if unassessed:
        counts["بدون ارزیابی جاری"] = unassessed
    # سطح جاری هر ریسک ملاک اقدام است؛ هدف یا ارزیابی ذاتی هرگز وارد این شمارش نمی‌شود.
    overdue = []
    for action in (
        TreatmentAction.objects.filter(plan__risk__in=risks, due_date__lt=today)
        .exclude(status=TreatmentAction.Status.VERIFIED)
        .select_related(
            "plan__risk__service",
            "owner",
            "assignee",
            "plan__assessment__decision_level",
        )
    ):
        base = by_risk.get(action.plan.risk_id)
        if (
            base
            and base.decision_level
            and base.decision_level.co_approver == "security_committee"
        ):
            overdue.append(action)
    invalid = []
    for acceptance in (
        RiskAcceptance.objects.filter(
            risk__in=risks,
            status__in=[RiskAcceptance.Status.ACTIVE, RiskAcceptance.Status.EXPIRED],
        )
        .select_related("risk__owner", "assessment__decision_level")
        .prefetch_related("signatures")
    ):
        reasons = []
        if (
            acceptance.end_date < today
            or acceptance.status == RiskAcceptance.Status.EXPIRED
        ):
            reasons.append("منقضی")
        base = by_risk.get(acceptance.risk_id)
        if not base or base.pk != acceptance.assessment_id:
            reasons.append("فاقد نسخه ارزیابی جاری معتبر")
        if acceptance.assessment.binding_prohibition:
            reasons.append("خارج از اختیار پذیرش")
        if any(
            not signature_of(acceptance, authority)
            or not signature_of(acceptance, authority).is_approval
            for authority in required_authorities(acceptance)
        ):
            reasons.append("فاقد امضای صاحب اختیار")
        if reasons:
            invalid.append({"acceptance": acceptance, "reasons": "؛ ".join(reasons)})
    # واحد شمارش کنترل است؛ یک کنترل با چند آزمون، چند بار در مخرج نمی‌آید.
    from apps.controls.models import Control

    related_key_ids = set(
        Control.objects.filter(is_key=True, risks__in=risks).values_list(
            "pk", flat=True
        )
    )
    key_controls = {}
    for base in current:
        for path in base.paths.all():
            for sheet in path.control_assessments.all():
                if sheet.control_id not in related_key_ids:
                    continue
                supported = sheet.effective_e(on=today) >= 3
                key_controls[sheet.control_id] = (
                    key_controls.get(sheet.control_id, True) and supported
                )
    key_total, key_valid = len(key_controls), sum(key_controls.values())
    # کنترل کلیدی مرتبط با ریسک ولی بدون ارزیابی مسیر، در مخرج باقی می‌ماند.
    key_total = len(related_key_ids)
    dependencies = (
        Dependency.objects.filter(service__in=services)
        .filter(Q(valid_from__isnull=True) | Q(valid_from__lte=today))
        .filter(Q(valid_until__isnull=True) | Q(valid_until__gte=today))
        .select_related("service", "supplier", "upstream_service", "asset")
    )
    concentration = {}
    for dependency in dependencies:
        target = dependency.supplier or dependency.upstream_service or dependency.asset
        key = (target._meta.label, target.pk)
        row = concentration.setdefault(
            key, {"target": str(target), "services": set(), "common": False}
        )
        row["services"].add(str(dependency.service))
        row["common"] |= dependency.is_shared_point
    concentrations = [
        row
        for row in concentration.values()
        if len(row["services"]) > 1 or row["common"]
    ]
    end_exclusive = end + timedelta(days=1)
    changes = []
    for after in Assessment.objects.filter(
        risk__in=visible_risks(user),
        kind=Assessment.Kind.CURRENT,
        status=Assessment.Status.APPROVED,
        approved_at__date__gte=start,
        approved_at__date__lt=end_exclusive,
    ).select_related("risk", "decision_level", "method_version"):
        before = (
            after.risk.assessments.filter(
                kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED
            )
            .filter(
                Q(approved_at__lt=after.approved_at)
                | Q(approved_at=after.approved_at, pk__lt=after.pk)
            )
            .select_related("decision_level")
            .order_by("-approved_at", "-pk")
            .first()
        )
        if before:
            changes.append(
                {
                    "before": before,
                    "after": after,
                    "method_changed": before.method_version_id
                    != after.method_version_id,
                }
            )
    return {
        "today": today,
        "start": start,
        "end": end,
        "levels": dict(counts),
        "critical": {
            "total": total,
            "complete": covered,
            "percent": round(100 * covered / total) if total else None,
        },
        "overdue": overdue,
        "invalid_acceptances": invalid,
        "key_controls": {
            "total": key_total,
            "valid": key_valid,
            "percent": round(100 * key_valid / key_total) if key_total else None,
        },
        "low_confidence": [
            item
            for item in current
            if item.confidence == Confidence.LOW or item.incomplete_reasons
        ],
        "concentrations": concentrations,
        "changes": changes,
        "current": current,
    }
