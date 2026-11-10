from decimal import Decimal

from django.utils import timezone

from apps.controls.models import ControlAssessment
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence


def valid_control_assessment(control, user, **fields):
    """آزمون با شاهد و همه شروط E5؛ آزمون‌های مصرف‌کننده شرط موردنظر را تغییر می‌دهند."""
    defaults = dict(
        method_version=MethodVersion.objects.get(number=1),
        scope="دامنه آزمون",
        exists=True,
        design_ok=True,
        operating_ok=True,
        coverage_pct=Decimal("100"),
        critical_points_covered=True,
        sample_size=30,
        sustained=True,
        failure_bypass_tested=True,
        monitored=True,
        test_to=timezone.localdate(),
        verified_by=user,
        e=3,
        rationale="آزمون موفق",
        created_by=user,
        test_result="مسیر در آزمون متوقف شد.",
        confidence="high",
    )
    defaults.update(fields)
    sheet = ControlAssessment.objects.create(control=control, **defaults)
    sheet.evidence.add(
        Evidence.objects.create(
            owner=user,
            kind=Evidence.Kind.TEST,
            title="شاهد آزمون کنترل",
            summary="آزمون دامنه",
            source="گزارش آزمون",
            observed_on=sheet.test_to,
            reliability=Evidence.Reliability.HIGH,
        )
    )
    return sheet
