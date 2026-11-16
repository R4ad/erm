"""«آزمون اثربخشی کنترل» (فیگما ۲۲): چهار وضعیت، نمونه‌ها و مسیرهای آزموده، نردبان E با شروط سطح هدف و اثر E آزمون
بر Bc مسیرهای ریسک وابسته."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Path
from apps.assessments.services import create_assessment
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_service, make_user
from apps.controls.effectiveness import Thresholds, checklist
from apps.controls.models import Control, ControlAssessment, ControlTestSample
from apps.controls.tests.factories import valid_control_assessment
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def risk():
    service = make_service("SRV-1")
    return Risk.objects.create(
        title="اعمال بسته‌ی انتشار نامعتبر",
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T2"),
        org_unit=service.org_unit,
        service=service,
        status=Risk.Status.ASSESSMENT,
        initiator="ایجاد یک بسته‌ی انتشار نامعتبر",
        count_unit="هر بسته‌ی نامعتبر یکتا",
        scope="خدمت SRV-1 در محیط تولید",
    )


@pytest.fixture
def control(risk):
    item = Control.objects.create(
        title="تأیید دوم انتشار",
        objective="تغییر نامعتبر را پیش از تولید متوقف می‌کند.",
        kind=Control.Kind.PREVENTIVE,
        owner=make_user("owner"),
        operated_by=Responsibility.DATIN,
        is_key=True,
    )
    risk.controls.add(item)
    return item


def sheet_for(control, grc, days_ago, **fields):
    return valid_control_assessment(control, grc, test_to=timezone.localdate() - timedelta(days=days_ago), **fields)


@pytest.fixture
def sheets(control, grc):
    """آزمون سال گذشته با E3 و آزمون تازه با E2: شکاف شناخته‌شده در مسیر اضطراری با یک استثنا."""
    previous = sheet_for(control, grc, 380, e=3, sustained=False)
    ControlAssessment.objects.filter(pk=previous.pk).update(created_at=timezone.now() - timedelta(days=380))
    current = sheet_for(
        control,
        grc,
        10,
        e=2,
        operating_ok=False,
        limited_effect_proven=True,
        known_gap=True,
        failures="مسیر اضطراری از تأیید دوم عبور نمی‌کند",
        rationale="تا رفع شکاف E2 می‌ماند.",
        sustained=False,
    )
    for index, (path, passed) in enumerate(
        [("انتشار عادی", True), ("انتشار عادی", True), ("انتشار اضطراری", True), ("انتشار اضطراری", False)]
    ):
        ControlTestSample.objects.create(
            assessment=current,
            reference=f"REL-{index}",
            occurred_on=timezone.localdate() - timedelta(days=20 - index),
            path=path,
            performer="" if not passed else "علی رضایی",
            passed=passed,
            note="" if passed else "تأیید دوم پس از انتشار ثبت شد",
        )
    return previous, current


def test_the_sheet_shows_states_samples_and_the_ladder_toward_the_previous_level(client, grc, sheets):
    previous, current = sheets
    client.force_login(grc)
    data = client.get(f"/api/controls/effectiveness/{current.pk}/test/").json()

    assert data["e"]["value"] == 2 and data["previous"]["e"] == 3
    states = {card["key"]: card["state"] for card in data["cards"]}
    assert states == {"exists": "met", "design": "met", "coverage": "partial", "operating": "unmet"}
    coverage = next(card for card in data["cards"] if card["key"] == "coverage")
    assert coverage["text"] == "۱ استثنا از ۴ نمونه؛ مسیر اضطراری از تأیید دوم عبور نمی‌کند."
    assert data["plan"]["paths"] == [
        {"name": "انتشار عادی", "passed": True},
        {"name": "انتشار اضطراری", "passed": False},
    ]
    assert data["results"]["summary"] == "۳ موفق · ۱ استثنا — در مسیر انتشار اضطراری"
    assert data["results"]["rate"] == "۷۵"

    ladder = data["ladder"]
    assert (ladder["current"], ladder["previous"], ladder["target"]) == (2, 3, 3)
    conditions = {row["key"]: (row["met"], row["note"]) for row in ladder["conditions"]}
    assert conditions["gap"] == (False, "مسیر اضطراری از تأیید دوم عبور نمی‌کند")
    assert conditions["operating"] == (False, "۱ استثنا")
    assert conditions["design"] == (True, None)

    states = [(row["state"], row["code"]) for row in data["evidence"]]
    assert [state for state, _ in states] == ["current", "superseded"]


def test_dependent_risks_show_bc_before_and_after_and_the_key_control_alert(client, grc, risk, sheets):
    _, current = sheets
    assessment = create_assessment(risk, grc, "current", horizon_months=12)
    assessment.a_basis, assessment.a, assessment.a_rationale = "forward", 4, "هدف‌گیری معتبر"
    assessment.save()
    path = Path.objects.create(assessment=assessment, name="انتشار اضطراری", description="-", b0=5, b0_rationale="-")
    path.control_assessments.add(current)
    other = Risk.objects.create(
        title="ریسک دیگر",
        description="-",
        channel=Risk.Channel.INTERVIEW,
        category=risk.category,
        org_unit=risk.org_unit,
        service=risk.service,
    )
    other.controls.add(current.control)

    client.force_login(grc)
    data = client.get(f"/api/controls/effectiveness/{current.pk}/test/").json()

    [row] = data["risks"]
    assert row["code"] == risk.code and row["alert"].startswith("شکست کنترل کلیدی")
    [shown] = row["paths"]
    assert shown["name"] == "مسیر ۱ · انتشار اضطراری" and shown["b0"] == "۵"
    assert shown["bc_before"] and shown["bc_before"] != shown["bc"]  # E3 قبلی Bc کمتری می‌داد
    assert "کنترل دیگری این مسیر را قطع نمی‌کند" in shown["note"]
    assert data["others"] == [
        {
            "id": other.pk,
            "code": other.code,
            "href": other.get_absolute_url(),
            "scope": risk.service.name,
            "state": "بدون مسیر وابسته",
            "tone": "neutral",
        }
    ]


def test_someone_who_cannot_see_the_control_gets_nothing(client, sheets):
    _, current = sheets
    client.force_login(make_user("stranger"))
    assert client.get(f"/api/controls/effectiveness/{current.pk}/test/").status_code == 404


def test_the_checklist_lists_the_target_level_and_the_lower_conditions_that_block_it(sheets):
    _, current = sheets
    facts = current.test_facts()
    thresholds = Thresholds.of(current.method_version)
    rows = checklist(3, facts, thresholds)
    keys = [key for key, _, _ in rows]
    assert keys == ["design", "operating", "coverage", "critical", "gap", "sample", "verifier"]
    assert all(met for key, _, met in rows if key not in {"operating", "gap"})
    # یک شرط E2 که برقرار نیست، در فهرست E3 هم می‌آید
    blocked = checklist(3, facts.__class__(**{**facts.__dict__, "exists": False}), thresholds)
    assert blocked[0][:2] == ("exists", "کنترل وجود دارد و اجرا می‌شود")
