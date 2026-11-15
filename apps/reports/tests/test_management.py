from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import RiskAcceptance
from apps.actions.tests.test_acceptance import make_acceptance
from apps.actions.tests.test_treatment import approved, make_risk, to_treatment_plan
from apps.assessments.models import Path
from apps.catalog.models import Dependency, Supplier
from apps.catalog.tests.factories import make_user
from apps.controls.models import Control
from apps.controls.tests.factories import valid_control_assessment
from apps.reports.services import management_report
from apps.risks.models import Coverage, RiskCategory

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def owner():
    return make_user("owner")


def test_report_uses_latest_current_once_and_never_the_target(grc, owner):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    current = approved(risk, grc, "متوسط", 6)
    approved(risk, grc, "پایین", 2, kind="target")
    data = management_report(grc)
    assert data["levels"] == {"متوسط": 1}
    assert [item.pk for item in data["current"]] == [current.pk]
    assert len(data["changes"]) == 1
    assert not data["changes"][0]["method_changed"]


def test_critical_coverage_requires_both_category_review_and_all_current_assessments(
    grc, owner
):
    risk = make_risk(owner)
    service = risk.service
    service.is_critical = True
    service.save()
    for category in RiskCategory.objects.filter(is_active=True):
        Coverage.objects.create(
            service=service, category=category, status=Coverage.Status.REVIEWED
        )
    assert management_report(grc)["critical"]["complete"] == 0
    approved(risk, grc, "بالا", 12)
    assert management_report(grc)["critical"] == {
        "total": 1,
        "complete": 1,
        "percent": 100,
    }
    another = make_risk(owner)
    another.service = service
    another.save()
    assert management_report(grc)["critical"]["complete"] == 0


def test_key_controls_count_once_and_missing_tests_are_not_effective(grc, owner):
    risk = make_risk(owner)
    base = approved(risk, grc, "بالا", 12)
    key = Control.objects.create(
        title="کلیدی",
        objective="توقف مسیر",
        owner=owner,
        is_key=True,
        kind="preventive",
    )
    untested = Control.objects.create(
        title="بدون آزمون",
        objective="توقف",
        owner=owner,
        is_key=True,
        kind="preventive",
    )
    risk.controls.add(key, untested)
    sheet = valid_control_assessment(key, grc)
    for i in range(2):
        path = Path.objects.create(
            assessment=base,
            name=f"مسیر {i}",
            b0=5,
            b0_rationale="-",
            b0_confidence="high",
        )
        path.control_assessments.add(sheet)
    assert management_report(grc)["key_controls"] == {
        "total": 2,
        "valid": 1,
        "percent": 50,
    }
    sheet.suspended = True
    sheet.save()
    assert management_report(grc)["key_controls"]["valid"] == 0
    risk.controls.remove(key)
    assert management_report(grc)["key_controls"] == {"total": 1, "valid": 0, "percent": 0}


def test_report_detects_expired_unsigned_and_superseded_acceptance(grc, owner):
    risk = make_risk(owner)
    approved(risk, grc, "پایین", 3)
    to_treatment_plan(risk, grc)
    acceptance = make_acceptance(
        risk,
        grc,
        start_date=timezone.localdate() - timedelta(days=50),
        end_date=timezone.localdate() - timedelta(days=1),
    )
    acceptance.status = RiskAcceptance.Status.ACTIVE
    acceptance.decision_text = "متن تصمیم ثبت‌شده"
    acceptance.save()
    approved(risk, grc, "متوسط", 6)
    data = management_report(grc)
    assert len(data["invalid_acceptances"]) == 1
    reasons = data["invalid_acceptances"][0]["reasons"]
    assert "منقضی" in reasons and "فاقد امضای" in reasons and "نسخه ارزیابی" in reasons


def test_report_and_concentration_are_scoped_to_visible_records(client, grc, owner):
    mine = make_risk(owner)
    approved(mine, grc, "بالا", 12)
    other = make_risk(make_user("other"))
    approved(other, grc, "بحرانی", 20)
    supplier = Supplier.objects.create(name="تأمین‌کننده مشترک")
    Dependency.objects.create(
        service=mine.service, supplier=supplier, is_shared_point=True
    )
    Dependency.objects.create(service=other.service, supplier=supplier)
    client.force_login(owner)
    response = client.get(reverse("reports:management"))
    assert response.status_code == 200
    assert response.context["levels"] == {"بالا": 1}
    # مالک خدمت با مالک ریسک متفاوت است؛ خدمت غیرقابل‌دیدن وارد گزارش تمرکز نمی‌شود.
    assert response.context["concentrations"] == []
    assert other.code not in response.content.decode()
    assert len(management_report(grc)["concentrations"][0]["services"]) == 2


def test_empty_report_and_invalid_period_are_rendered(client, grc):
    client.force_login(grc)
    assert client.get(reverse("reports:management")).status_code == 200
    response = client.get(
        reverse("reports:management"), {"start": "1405/09/01", "end": "1405/08/01"}
    )
    assert response.context["form"].errors and "current" not in response.context


def test_report_api_shapes_the_figma_dashboard(grc, owner):
    from datetime import timedelta as days

    from rest_framework.test import APIClient

    from apps.assessments.models import Assessment

    first = make_risk(owner)
    older = approved(first, grc, "متوسط", 6)
    Assessment.objects.filter(pk=older.pk).update(approved_at=timezone.now() - days(300))
    current = approved(first, grc, "بالا", 12)
    Assessment.objects.filter(pk=current.pk).update(likelihood_high=3, impact_high=4)
    second = make_risk(owner, "قطع سرویس پیامک")
    supplier = Supplier.objects.create(name="ارائه‌دهنده‌ی پیامک")
    for risk in (first, second):
        Dependency.objects.create(service=risk.service, supplier=supplier)

    api = APIClient(HTTP_HOST="127.0.0.1")
    api.force_authenticate(grc)
    data = api.get(reverse("api:management_report")).json()

    assert data["months"] == 6
    assert data["kpis"]["active"]["count"] == 2
    assert data["kpis"]["high"]["count"] == 1
    high = next(row for row in data["distribution"] if row["label"] == "بالا")
    medium = next(row for row in data["distribution"] if row["label"] == "متوسط")
    assert (high["count"], high["delta"], medium["delta"]) == (1, 1, -1)
    unassessed = data["distribution"][-1]
    assert unassessed["level"] is None and unassessed["count"] == 1
    l3 = next(row for row in data["matrix"]["rows"] if row["likelihood"] == 3)
    assert [cell["count"] for cell in l3["cells"]] == [0, 0, 0, 1, 0]
    assert data["matrix"]["unassessed"] == 1
    [change] = data["changes"]
    assert (change["before"]["name"], change["after"]["name"]) == ("متوسط", "بالا")
    assert change["reason"]["label"] == "ارزیابی جاری تازه"
    assert data["concentration"] == [
        {"key": "dep-0", "target": "ارائه‌دهنده‌ی پیامک", "risks": 2, "services": 2, "shared": False}
    ]
    assert api.get(reverse("api:management_report"), {"months": 7}).json()["months"] == 6

    export = api.get(reverse("api:management_export"), {"months": 12})
    assert export.status_code == 200
    assert export["Content-Type"].startswith("application/vnd.openxmlformats")
    assert export.content[:2] == b"PK"
