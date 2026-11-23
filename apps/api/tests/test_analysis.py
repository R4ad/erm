"""«آنالیز ریسک» (فیگما ۱۲): عددهای موتور محاسبه، ماتریس A × B، ذخیره‌ی A از همان InitiatorForm، اثربخشی کنترل‌ها،
و ارزیابی‌ای که پیوند منو باز می‌کند."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Assessment
from apps.assessments.tests import test_results
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_user
from apps.controls.models import Control, ControlAssessment

pytestmark = pytest.mark.django_db

bank, checker, evidence, grc = test_results.bank, test_results.checker, test_results.evidence, test_results.grc
ready, risk = test_results.ready, test_results.risk


def url(assessment):
    return f"/api/analysis/{assessment.pk}/"


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


def rate_values(**changes):
    return {
        "a_basis": "rate",
        "a_count": 20,
        "a_period_months": 12,
        "a_coverage": 98,
        "a_level": "4",
        "a_high": None,
        "a_confidence": "medium",
        "a_rationale": "۲۰ بسته‌ی نامعتبر یکتا در ۱۲ ماه",
        **changes,
    }


def test_the_analysis_has_the_engine_numbers_matrix_and_paths(api, grc, ready):
    data = api(grc).get(url(ready)).json()

    summary = data["summary"]
    assert summary["a"]["value"] == "2" and summary["b"]["value"] == "3"
    assert summary["l"] == {"value": "2", "a": 2, "b": 3}
    assert summary["i"]["value"] == "3" and summary["i"]["source"] == "S"
    assert summary["score"]["value"] == "6" and summary["score"]["level"]["name"] == "متوسط"
    matrix = data["matrix"]
    assert [row["a"] for row in matrix["rows"]] == [5, 4, 3, 2, 1]  # سطر A5 بالای جدول، مثل فیگما
    assert matrix["rows"][3]["cells"][2] == matrix["l"] == 2
    path = data["paths"]["rows"][0]
    assert path["name"] == "انتشار از مسیر رسمی" and path["b0"] == [3, None] and path["b"] == [3, 3]
    assert path["determining"] is True and data["paths"]["highs"] == [3]
    assert [row["code"] for row in data["impacts"]["rows"]] == ["S", "D", "F", "C", "R"]
    assert data["impacts"]["rows"][0]["level"] == 3
    initiator = data["initiator"]
    assert initiator["values"]["a_basis"] == "forward" and initiator["values"]["a_level"] == "2"
    assert [band["value"] for band in initiator["bands"]] == [1, 2, 3, 4, 5]
    assert initiator["bands"][0]["lower"] is None and initiator["bands"][-1]["upper"] is None
    assert data["uncertainty"]["confidence_key"] == "medium"
    assert data["submit"] == {"can_submit": True, "url": reverse("assessments:submit", args=[ready.pk]), "problems": []}

    assert api(make_user("stranger")).get(url(ready)).status_code == 404


def test_saving_a_rate_records_a_and_keeps_the_evidence(api, grc, ready, evidence):
    response = api(grc).post(url(ready), {"values": rate_values()}, content_type="application/json")

    assert response.status_code == 200
    ready.refresh_from_db()
    assert (ready.a_basis, ready.a_count, ready.a_period_months, ready.a) == ("rate", 20, 12, 4)
    assert list(ready.a_evidence.all()) == [evidence]
    analysis = response.json()["analysis"]
    assert analysis["summary"]["a"]["value"] == "4"
    assert analysis["initiator"]["rate"] == 20 and analysis["initiator"]["suggestion"] == 4
    assert analysis["initiator"]["rows"][4]["value"].endswith("(12 ماه)")


def test_the_initiator_form_rules_still_apply(api, grc, ready):
    client = api(grc)
    missing = client.post(
        url(ready), {"values": rate_values(a_count=None, a_rationale="")}, content_type="application/json"
    )
    assert missing.status_code == 400
    assert {"a_count", "a_rationale"} <= set(missing.json()["errors"])

    short = client.post(url(ready), {"values": rate_values(a_period_months=3)}, content_type="application/json")
    assert short.status_code == 400 and "a_level" in short.json()["errors"]
    ready.refresh_from_db()
    assert ready.a_basis == "forward" and ready.a == 2


def test_only_a_draft_editor_saves(api, grc, ready):
    client = api(grc)
    Assessment.objects.filter(pk=ready.pk).update(status=Assessment.Status.IN_QC)

    data = client.get(url(ready)).json()
    assert data["assessment"]["can_edit"] is False and data["paths"]["add_url"] is None
    assert client.post(url(ready), {"values": rate_values()}, content_type="application/json").status_code == 403


def test_controls_show_the_four_conditions_and_impact_controls_last(api, grc, ready, risk, evidence):
    owner = make_user("ctrl-owner", Role.GRC_MEMBER)
    monitor = Control.objects.create(
        title="پایش پس از اعمال",
        objective="پایش",
        kind=Control.Kind.DETECTIVE,
        owner=owner,
        operated_by=Responsibility.DATIN,
    )
    gate = Control.objects.create(
        title="اعتبارسنجی بسته",
        objective="اعتبارسنجی",
        kind=Control.Kind.PREVENTIVE,
        owner=owner,
        operated_by=Responsibility.DATIN,
        is_key=True,
    )
    risk.controls.add(monitor, gate)
    today = timezone.localdate()
    test = ControlAssessment.objects.create(
        control=gate,
        method_version=ready.method_version,
        scope="بسته‌ها",
        exists=True,
        design_ok=True,
        operating_ok=False,
        limited_effect_proven=True,
        coverage_pct=60,
        critical_points_covered=False,
        exceptions="۳ استثنا",
        sample_size=12,
        test_from=today - timedelta(days=30),
        test_to=today - timedelta(days=5),
        e=2,
        confidence="medium",
        rationale="E2",
        created_by=grc,
    )
    test.evidence.add(evidence)
    ready.paths.get().control_assessments.add(test)

    rows = api(grc).get(url(ready)).json()["controls"]

    assert [row["code"] for row in rows] == [gate.code, monitor.code]
    first = rows[0]
    assert first["preventive"] is True and first["owner"] == owner.username
    assert {key: first["test"][key] for key in ("exists", "design_ok", "coverage", "operating_ok", "e")} == {
        "exists": True,
        "design_ok": True,
        "coverage": "partial",
        "operating_ok": False,
        "e": 2,
    }
    assert first["evidence"]["code"] == evidence.code and "۳ استثنا" in first["evidence"]["note"]
    assert first["test_url"] == reverse("controls:control_assessment_create", args=[gate.pk])
    assert rows[1]["preventive"] is False and rows[1]["test"] is None


def test_the_menu_opens_the_latest_editable_draft(api, grc, ready):
    assert api(grc).get("/api/analysis/").json()["assessment"] == ready.pk
    assert api(make_user("nobody", Role.VIEWER)).get("/api/analysis/").json()["assessment"] is None
