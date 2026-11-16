"""«لیست ریسک‌های هدف» (فیگما ۱۶): امتیاز جاری و هدف، پروفایل پیامد، سازوکار، معیار پذیرش و وضعیت هدف هر طرح جاری."""

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import TreatmentAction, TreatmentPlan
from apps.actions.tests.test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan
from apps.assessments.models import Assessment, ImpactDetail
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db
URL = "/api/treatment/targets/"
ST = TreatmentAction.Status


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def owner():
    return make_user("owner")


@pytest.fixture
def assignee():
    return make_user("assignee")


@pytest.fixture
def verifier():
    return make_user("verifier")


def plan_for(owner, grc, title, level, score, option="reduce", target=None):
    risk = make_risk(owner, title)
    approved(risk, grc, level, score)
    to_treatment_plan(risk, grc)
    plan = make_plan(risk, grc, option=option)
    fields = {"owner_approved_at": timezone.now(), "owner_approved_by": owner}
    if target:
        fields["target_assessment"] = approved(risk, grc, *target, kind="target")
    TreatmentPlan.objects.filter(pk=plan.pk).update(**fields)
    Risk.objects.filter(pk=risk.pk).update(status=Risk.Status.TREATMENT)
    plan.refresh_from_db()
    return plan


def profile(assessment, levels):
    scales = assessment.method_version.scales
    for code, level in levels.items():
        ImpactDetail.objects.create(
            assessment=assessment, scale=scales.get(code=code), level=level, rationale="" if level else "درگیر نیست"
        )


def test_each_current_plan_shows_its_path_mechanism_and_acceptance_criteria(client, grc, owner, assignee, verifier):
    plan = plan_for(owner, grc, "دسترسی ممتاز بدون کنترل", "بحرانی", 20, target=("متوسط", 8))
    profile(plan.assessment, {"S": 5, "D": 4, "F": 4, "C": 4, "R": 3})
    profile(plan.target_assessment, {"S": 4, "D": 0})
    Assessment.objects.filter(pk=plan.assessment_id).update(b_low=5, b_high=5, impact_low=5, impact_high=5)
    Assessment.objects.filter(pk=plan.target_assessment_id).update(b_low=1, b_high=1, impact_low=4, impact_high=4)
    first = make_action(plan, grc, owner, assignee, verifier, acceptance_criteria="دو مانع مستقل E3")
    make_action(plan, grc, owner, assignee, verifier, title="آزمون بازیابی", acceptance_criteria="دو مانع مستقل E3")
    above = plan_for(owner, grc, "افشای اطلاعات مشتری", "بالا", 15, target=("بالا", 12))
    plan_for(owner, grc, "بی‌هدف", "بالا", 10)

    client.force_login(grc)
    data = client.get(URL).json()

    assert [row["risk"]["title"] for row in data["rows"]] == ["دسترسی ممتاز بدون کنترل", "افشای اطلاعات مشتری", "بی‌هدف"]
    row = data["rows"][0]
    assert row["current"]["score"] == 20 and row["current"]["profile"] == "S5 D4 F4 C4 R3"
    assert row["target"]["score"] == 8 and row["target"]["profile"] == "S4 D0 F0 C0 R0"
    assert row["mechanisms"] == ["B ۵→۱", "I ۵→۴"]
    assert row["criteria"] == "دو مانع مستقل E3"  # معیار تکراری یک بار
    assert row["plan"]["action"] == first.code and row["status"]["value"] == "on_track"
    assert row["risk"]["category"] == "T1" and row["retire"] is False
    assert data["rows"][1]["id"] == above.pk and data["rows"][1]["status"]["label"] == "بالاتر از اشتها"
    assert data["rows"][2]["target"] is None and data["rows"][2]["status"]["value"] == "missing"
    assert data["counts"] == {"with_target": 2, "within": 1, "above": 1, "retire": 0}

    client.force_login(make_user("stranger"))
    assert client.get(URL).json()["rows"] == []


def test_avoid_retires_the_risk_and_verified_actions_lead_to_a_post_action_assessment(
    client, grc, owner, assignee, verifier
):
    avoid = plan_for(owner, grc, "آسیب‌پذیری بحرانی", "بحرانی", 20, option="avoid")
    make_action(plan_for(owner, grc, "انقضای گواهی", "متوسط", 9, target=("پایین", 4)), grc, owner, assignee, verifier)
    TreatmentAction.objects.exclude(plan=avoid).update(status=ST.VERIFIED)

    client.force_login(grc)
    data = client.get(URL).json()

    retire = next(row for row in data["rows"] if row["id"] == avoid.pk)
    assert retire["retire"] is True and retire["target"] is None and retire["mechanisms"] == ["حذف مسیر"]
    assert retire["status"] == {"value": "proof", "label": "در انتظار اثبات", "tone": "neutral"}
    assert data["counts"]["retire"] == 1 and data["counts"]["within"] == 1
    (step,) = data["reassess"]
    assert step["title"] == "انقضای گواهی" and step["step"].startswith("شروع بازبینی")
    assert step["href"].startswith("/risks/")

    client.force_login(make_user("viewer", Role.VIEWER))
    assert client.get(URL).json()["reassess"] == []
