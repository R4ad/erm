from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.actions.models import Reassessment, TreatmentAction, TreatmentPlan
from apps.actions.mywork import my_work
from apps.actions.permissions import can_add_action
from apps.actions.services import PlanError, create_plan, plan_creation_problems
from apps.assessments.comparison import compare, target_met, trend
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.risks.models import Risk
from apps.workflow.models import StatusTransition

from .test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan

pytestmark = pytest.mark.django_db
S = Risk.Status
ST = TreatmentAction.Status


def new_round(risk, grc, level_name, score):
    """بازبینی، ارسال برای ارزیابی دوباره (ردیف ۹)، ارزیابی جاری تازه و برنامه‌ی درمان دور تازه (ردیف ۶)."""
    StatusTransition.objects.create(risk=risk, from_status=S.REVIEW, to_status=S.ASSESSMENT, created_by=grc)
    risk.status = S.ASSESSMENT
    risk.save()
    assessment = approved(risk, grc, level_name, score)
    to_treatment_plan(risk, grc)
    return assessment


@pytest.fixture
def round_one(grc, owner):
    """ریسک «بالا» با طرح کاهش و ارزیابی هدف «متوسط» با امتیاز ۶."""
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    target = approved(risk, grc, "متوسط", 6, kind="target")
    to_treatment_plan(risk, grc)
    plan = make_plan(risk, grc, option="reduce", target_assessment=target)
    return risk, plan


def test_assessments_are_compared_side_by_side(client, grc, owner, round_one):
    risk, plan = round_one
    client.force_login(grc)
    url = reverse("assessments:compare")
    page = client.get(url, {"ids": f"{plan.assessment.pk},{plan.target_assessment.pk}"})
    rows = {row["label"]: row["cells"] for row in page.context["rows"]}
    assert [cell["value"] for cell in rows["سطح تصمیم"]] == [
        plan.assessment.decision_level,
        plan.target_assessment.decision_level,
    ]
    assert rows["سطح تصمیم"][1]["trend"] == "down"
    assert rows["امتیاز L × I"][1]["trend"] == "down"
    assert not page.context["method_changed"]

    other = make_risk(owner, "ریسک دیگر")
    elsewhere = approved(other, grc, "پایین", 3)
    assert client.get(url, {"ids": f"{plan.assessment.pk},{elsewhere.pk}"}).status_code == 404
    assert "دو تا چهار" in client.get(url, {"ids": f"{plan.assessment.pk}"}).context["error"]
    picked = client.get(f"{url}?id={plan.target_assessment.pk}&id={plan.assessment.pk}")
    assert [item.assessment for item in picked.context["profiles"]] == [plan.assessment, plan.target_assessment]
    assert 'name="id"' in client.get(risk.get_absolute_url()).content.decode()
    assert client.get(url, {"ids": "x,y"}).status_code == 404
    client.force_login(make_user("stranger"))
    assert client.get(url, {"ids": f"{plan.assessment.pk},{plan.target_assessment.pk}"}).status_code == 404


def test_the_target_is_met_only_by_a_complete_assessment_at_or_below_it(grc, round_one):
    risk, plan = round_one
    target = plan.target_assessment
    assert not target_met(plan.assessment, target)
    better = approved(risk, grc, "متوسط", 6)
    assert target_met(better, target)
    Assessment.objects.filter(pk=better.pk).update(incomplete_reasons=["A نامعلوم"])
    better.refresh_from_db()
    assert not target_met(better, target)
    lower_score = approved(risk, grc, "متوسط", 8)
    assert not target_met(lower_score, target)


def test_the_next_plan_waits_for_the_reassessment_of_the_last_one(client, grc, owner, assignee, verifier, round_one):
    risk, plan = round_one
    make_action(plan, grc, owner, assignee, verifier)
    assert plan_creation_problems(risk) == [f"برای ارزیابی {plan.assessment.code} طرح مواجهه ثبت شده است."]
    client.force_login(grc)
    assert client.get(reverse("actions:reassessment_create", args=[plan.pk])).url.endswith("#reassessment")

    new_round(risk, grc, "متوسط", 6)
    assert any("هنوز بازسنجی نشده" in problem for problem in plan_creation_problems(risk))
    assert not can_add_action(grc, plan)  # طرح دور قبل اقدام تازه نمی‌گیرد
    page = client.get(risk.get_absolute_url())
    assert page.context["pending_reassessment"] == plan
    row = next(item for item in my_work(grc)["waiting_risks"] if item.risk == risk)
    assert row.state == "منتظر بازسنجی طرح قبلی" and row.plan == plan
    plan_page = client.get(plan.get_absolute_url())
    assert plan_page.context["can_reassess"]
    assert len(plan_page.context["comparison"]["profiles"]) == 3  # مبنا، تازه و هدف


def test_grc_records_the_reassessment_and_the_decision_sets_the_next_option(
    client, grc, owner, assignee, verifier, round_one
):
    risk, plan = round_one
    action = make_action(plan, grc, owner, assignee, verifier)
    fresh = new_round(risk, grc, "متوسط", 6)
    # تصمیم پس از اقدام با مالک ریسک یا GRC است (فیگما ۲۵)؛ مجری اقدام آن را ثبت نمی‌کند.
    client.force_login(assignee)
    assert client.get(reverse("actions:reassessment_create", args=[plan.pk])).status_code in (403, 404)

    client.force_login(grc)
    url = reverse("actions:reassessment_create", args=[plan.pk])
    page = client.get(url)
    assert list(page.context["open_actions"]) == [action]
    tomorrow = timezone.localdate() + timedelta(days=1)
    data = {"performed_on": to_jalali(tomorrow), "responsible": grc.pk, "decision": "continue", "note": "هدف محقق شد"}
    assert "بعد از امروز" in client.post(url, data).context["form"].errors["performed_on"][0]
    data["performed_on"] = to_jalali(timezone.localdate())
    response = client.post(url, data)
    assert response.url == plan.get_absolute_url() + "#reassessment"
    reassessment = Reassessment.objects.get()
    assert reassessment.assessment == fresh and reassessment.target_met is True
    assert not reassessment.method_changed and reassessment.created_by == grc
    assert plan_creation_problems(risk) == []

    with pytest.raises(PlanError, match="ادامه‌ی اصلاح"):
        create_plan(TreatmentPlan(option="accept", rationale="پذیرش"), risk, grc)
    form = client.post(reverse("actions:plan_create", args=[risk.pk]), {"option": "accept", "rationale": "-"})
    assert "ادامه‌ی اصلاح" in form.context["form"].errors["option"][0]
    second = create_plan(TreatmentPlan(option="reduce", rationale="ادامه با PAM"), risk, grc)
    assert second.assessment == fresh
    assert client.get(reverse("actions:reassessment_create", args=[plan.pk])).status_code == 302


def test_accepting_needs_a_level_that_allows_acceptance(client, grc, round_one):
    risk, plan = round_one
    new_round(risk, grc, "بالا", 10)
    client.force_login(grc)
    url = reverse("actions:reassessment_create", args=[plan.pk])
    data = {"performed_on": to_jalali(timezone.localdate()), "responsible": grc.pk, "decision": "accept", "note": "-"}
    form = client.post(url, data).context["form"]
    assert any("طرح مواجهه الزامی" in error for error in form.non_field_errors())
    data["decision"] = "continue"
    client.post(url, data)
    reassessment = Reassessment.objects.get()
    assert reassessment.target_met is False


def test_an_accept_decision_makes_the_next_plan_an_acceptance(client, grc, round_one):
    risk, plan = round_one
    new_round(risk, grc, "پایین", 3)
    client.force_login(grc)
    client.post(
        reverse("actions:reassessment_create", args=[plan.pk]),
        {"performed_on": to_jalali(timezone.localdate()), "responsible": grc.pk, "decision": "accept", "note": "پایین"},
    )
    page = client.get(reverse("actions:plan_create", args=[risk.pk]))
    assert page.context["form"].initial["option"] == "accept"
    with pytest.raises(PlanError, match="پذیرش ریسک باقیمانده"):
        create_plan(TreatmentPlan(option="reduce", rationale="-"), risk, grc)
    assert create_plan(TreatmentPlan(option="accept", rationale="پایش"), risk, grc).option == "accept"


def test_my_work_shows_plans_whose_actions_are_all_verified(grc, owner, assignee, verifier, round_one):
    risk, plan = round_one
    action = make_action(plan, grc, owner, assignee, verifier)
    risk.status = S.TREATMENT
    risk.save()
    assert my_work(grc)["ready_for_review"] == []
    TreatmentAction.objects.filter(pk=action.pk).update(status=ST.VERIFIED)
    assert my_work(grc)["ready_for_review"] == [plan]
    assert my_work(owner)["ready_for_review"] == []


def test_the_comparison_helper_flags_a_method_change(grc, round_one):
    risk, plan = round_one
    table = compare([plan.assessment, plan.target_assessment])
    assert table["method_changed"] is False
    assert [row["label"] for row in table["rows"]][:3] == ["A", "B", "L"]


def test_text_cells_have_no_direction():
    assert trend(3, 2) == "down" and trend(2, 4) == "up" and trend(2, 2) == ""
    assert trend("متوسط", "-") == ""  # اطمینان کل ثبت‌نشده
    assert trend("3 تا 4", "ثبت‌نشده") == ""
    assert trend(None, 3) == ""
