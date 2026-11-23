"""«ارزیابی پس از اقدام» (فیگما ۲۵): مقایسه‌ی ارزیابی‌ها، تصمیم گام بعدی مالک ریسک که بازسنجی طرح است، درخواست
تصمیم از مالک و کار اقدام اصلاحی برای شکاف کنترل."""

import pytest

from apps.accounts.roles import Role
from apps.actions import reassessment as reassess
from apps.actions.models import MonitoringNotice, Reassessment, RiskReview, TreatmentPlan
from apps.actions.services import create_plan
from apps.actions.tests.test_reassessment import new_round
from apps.actions.tests.test_treatment import approved, make_plan, make_risk, to_treatment_plan
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_user
from apps.controls.models import Control

pytestmark = pytest.mark.django_db


@pytest.fixture
def people():
    return {
        "grc": make_user("grc", Role.GRC_MEMBER, first_name="ندا", last_name="احمدی"),
        "owner": make_user("owner", first_name="حسین", last_name="نوری"),
        "stranger": make_user("stranger"),
    }


@pytest.fixture
def plan(people):
    """ریسک «بالا» با امتیاز ۱۲، طرح کاهش و هدف «متوسط» با امتیاز ۶."""
    grc = people["grc"]
    risk = make_risk(people["owner"], "انتشار ساتنا")
    approved(risk, grc, "بالا", 12)
    target = approved(risk, grc, "متوسط", 6, kind="target")
    to_treatment_plan(risk, grc)
    return make_plan(risk, grc, option="reduce", target_assessment=target)


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


def url(plan):
    return f"/api/actions/plans/{plan.pk}/post-action/"


def test_the_page_waits_for_the_new_current_assessment(api, people, plan):
    data = api(people["owner"]).get(url(plan)).json()

    assert data["title"] == "ارزیابی پس از اقدام · انتشار ساتنا"
    assert [card["key"] for card in data["cards"]] == ["before", "target"]
    assert "هنوز تأیید نشده است" in data["waiting"]
    assert data["decision"] is None and data["status"] is None and data["compare_href"] is None
    assert api(people["stranger"]).get(url(plan)).status_code == 404


def test_the_new_assessment_is_compared_with_the_target(api, people, plan):
    fresh = new_round(plan.risk, people["grc"], "متوسط", 6)
    data = api(people["owner"]).get(url(plan)).json()

    assert data["status"] == {"label": "هدف محقق شد", "tone": "success"}
    after = data["cards"][-1]
    assert after["key"] == "after" and after["current"] and after["score"] == "۶"
    assert after["chip"] == {"label": "محقق", "tone": "success"}
    assert data["cards"][0]["score"] == "۱۲" and data["cards"][1]["chip"]["label"] == "هدف"
    assert data["summary"]["title"] == "ریسک هدف محقق شد"
    assert data["summary"]["text"] == "امتیاز جاری از ۱۲ به ۶ رسید و با هدف طرح برابر است"
    assert data["compare_href"].endswith(f"{plan.assessment.pk},{plan.target_assessment.pk},{fresh.pk}")
    assert f"ارزیابی {fresh.code} برای {plan.risk.code}" in data["subtitle"]

    decision = data["decision"]
    assert decision["can_decide"] is True and decision["can_ask"] is False  # مالک از خودش تصمیم نمی‌خواهد.
    assert [option["value"] for option in decision["options"]] == ["monitor", "continue", "accept"]
    assert all(option["problems"] == [] for option in decision["options"])
    assert api(people["grc"]).get(url(plan)).json()["decision"]["can_ask"] is True


def test_the_owner_records_active_monitoring_and_the_next_plan_retains_the_risk(api, people, plan):
    new_round(plan.risk, people["grc"], "متوسط", 6)
    response = api(people["owner"]).post(url(plan), {"decision": "monitor"}, "application/json")

    assert response.status_code == 200
    reassessment = Reassessment.objects.get(plan=plan)
    assert reassessment.decision == "monitor" and reassessment.target_met is True
    assert reassessment.note.startswith("پایش فعال با بازبینی") and reassessment.created_by == people["owner"]
    data = response.json()
    assert data["decision"]["can_decide"] is False and data["decision"]["last"]["label"] == "پایش فعال"
    assert data["decision"]["last"]["next"] is None  # طرح دور تازه را GRC می‌نویسد.
    assert api(people["grc"]).get(url(plan)).json()["decision"]["last"]["next"].endswith("/plan/new/")

    again = api(people["owner"]).post(url(plan), {"decision": "continue"}, "application/json")
    assert again.status_code == 400 and "بازسنجی شده" in again.json()["detail"]
    with pytest.raises(Exception, match="پایش فعال"):
        create_plan(TreatmentPlan(option="reduce", rationale="ادامه"), plan.risk, people["grc"])


def test_monitoring_needs_the_target_met(api, people, plan):
    new_round(plan.risk, people["grc"], "متوسط", 8)
    data = api(people["owner"]).get(url(plan)).json()

    assert data["status"]["label"] == "هدف محقق نشد" and data["summary"]["reached"] is False
    monitor = data["decision"]["options"][0]
    assert monitor["value"] == "monitor" and "به هدف طرح رسیده باشد" in monitor["problems"][0]
    response = api(people["owner"]).post(url(plan), {"decision": "monitor"}, "application/json")
    assert response.status_code == 400 and not Reassessment.objects.exists()
    assert api(people["stranger"]).post(url(plan), {"decision": "continue"}, "application/json").status_code == 404


def test_grc_asks_the_owner_for_the_decision_once_a_day(api, people, plan):
    new_round(plan.risk, people["grc"], "متوسط", 6)
    first = api(people["grc"]).post(url(plan), {"ask": True}, "application/json")

    assert first.status_code == 200 and first.json()["result"] == {"asked": True}
    notice = MonitoringNotice.objects.get(recipient=people["owner"])
    assert notice.event_key.startswith(f"reassess-ask:{plan.pk}:") and notice.href.endswith("/reassess/")
    assert api(people["grc"]).post(url(plan), {"ask": True}, "application/json").json()["result"] == {"asked": False}
    owner = api(people["owner"]).post(url(plan), {"ask": True}, "application/json")
    assert owner.status_code == 400 and "عضو GRC" in owner.json()["detail"]


def test_a_corrective_review_goes_to_the_control_owner_once(people, plan):
    control = Control.objects.create(
        title="تأیید دومرحله‌ای انتشار اضطراری",
        objective="تأیید دوم",
        kind=Control.Kind.PREVENTIVE,
        owner=people["grc"],
        operated_by=Responsibility.DATIN,
        is_key=True,
    )
    created = reassess.create_corrective(plan, people["owner"], [control])

    assert len(created) == 1
    review = RiskReview.objects.get()
    assert review.trigger == RiskReview.Trigger.CONTROL and review.responsible == people["grc"]
    assert control.code in review.reason and review.due >= review.created_at.date()
    assert reassess.create_corrective(plan, people["owner"], [control]) == []
