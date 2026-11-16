"""«کتابخانه‌ی سناریو» (فیگما ۲۱): سناریوها با نمونه و بالاترین سطح، جزئیات سناریو و پیشنهاد ادغام یا تفکیک."""

import pytest

from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import approved, make_risk
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk, RiskCategory, RiskScenario, ScenarioProposal

pytestmark = pytest.mark.django_db
URL = "/api/scenarios/library/"


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="ندا", last_name="احمدی")


def scenario(title, category="T2", conditions="ثبت اشتباه تنظیمات مقصد", event="اعمال تغییر نامعتبر در تولید"):
    return RiskScenario.objects.create(
        title=title,
        category=RiskCategory.objects.get(code=category),
        event=event,
        conditions=conditions,
        consequence="توقف پردازش تا بازگردانی نسخه",
    )


def test_rows_count_instances_and_the_highest_current_level(client, grc):
    release = scenario("انتشار نامعتبر")
    empty = scenario("باج‌افزار ایستگاه کاری", "T1", "پیوست آلوده", "رمزگذاری ایستگاه")
    owner = make_user("owner")
    for level, score in (("بالا", 12), ("بحرانی", 20)):
        risk = make_risk(owner, f"انتشار {score}")
        approved(risk, grc, level, score)
        Risk.objects.filter(pk=risk.pk).update(scenario=release, scenario_version=1)

    client.force_login(grc)
    data = client.get(f"{URL}?scenario={release.pk}").json()

    rows = {row["code"]: row for row in data["rows"]}
    assert rows[release.code]["instances"] == 2 and rows[release.code]["level"]["name"] == "بحرانی"
    assert rows[empty.code]["instances"] == 0 and rows[empty.code]["level"] is None
    assert data["summary"]["scenarios"] == 2 and data["summary"]["empty"] == 1 and data["summary"]["instances"] == 2
    selected = data["selected"]
    assert selected["code"] == release.code and selected["event"] == "اعمال تغییر نامعتبر در تولید"
    assert sorted(item["score"] for item in selected["instances"]) == [12, 20]
    assert selected["edit_url"] == f"/risks/scenarios/{release.pk}/edit/" and data["can_propose"] is True


def test_a_merge_proposal_is_decided_with_a_reason_and_deactivates_the_source(client, grc):
    source = scenario("اعمال بسته‌ی انتشار نامعتبر")
    target = scenario("خطای پیکربندی در پنجره‌ی تغییر", "T4", "ثبت اشتباه تنظیمات مقصد در تغییر")
    client.force_login(make_user("viewer", Role.VIEWER))
    denied = client.post(
        "/api/scenarios/proposals/",
        {"scenario": source.pk, "kind": "merge", "target": target.pk, "reason": "مشابه"},
        content_type="application/json",
    )
    assert denied.status_code == 400 and "GRC" in denied.json()["detail"]

    client.force_login(grc)
    missing = client.post(
        "/api/scenarios/proposals/", {"scenario": source.pk, "kind": "merge", "reason": "مشابه"}, content_type="application/json"
    )
    assert missing.status_code == 400
    created = client.post(
        "/api/scenarios/proposals/",
        {"scenario": source.pk, "kind": "merge", "target": target.pk, "reason": "عامل آغازگر مشابه"},
        content_type="application/json",
    )
    assert created.status_code == 201
    proposal = ScenarioProposal.objects.get()
    assert proposal.similarity > 50 and proposal.status == ScenarioProposal.Status.PENDING
    row = next(row for row in created.json()["rows"] if row["id"] == source.pk)
    assert row["note"] == {"tone": "warning", "text": f"پیشنهاد ادغام با {target.code}"}
    again = client.post(
        "/api/scenarios/proposals/",
        {"scenario": source.pk, "kind": "split", "reason": "دوباره"},
        content_type="application/json",
    )
    assert again.status_code == 400

    url = f"/api/scenarios/proposals/{proposal.pk}/decide/"
    assert client.post(url, {"accept": True, "reason": " "}, content_type="application/json").status_code == 400
    decided = client.post(url, {"accept": True, "reason": "کنترل و مالک یکسان"}, content_type="application/json")
    assert decided.status_code == 200
    source.refresh_from_db()
    assert source.is_active is False and source.merged_into == target
    assert RiskScenario.objects.filter(pk=source.pk).exists()  # حذف فیزیکی نه
    page = client.get(f"{URL}?scenario={source.pk}").json()
    assert page["selected"]["merged_into"]["code"] == target.code and page["summary"]["proposals"] == 0
    assert client.post(url, {"accept": False, "reason": "دیر"}, content_type="application/json").status_code == 400


def test_a_rejected_proposal_keeps_the_scenario_active(client, grc):
    source, target = scenario("الف"), scenario("ب")
    client.force_login(grc)
    client.post(
        "/api/scenarios/proposals/",
        {"scenario": source.pk, "kind": "merge", "target": target.pk, "reason": "مشابه"},
        content_type="application/json",
    )
    proposal = ScenarioProposal.objects.get()
    client.post(
        f"/api/scenarios/proposals/{proposal.pk}/decide/",
        {"accept": False, "reason": "دامنه و کنترل‌ها متفاوت‌اند"},
        content_type="application/json",
    )
    proposal.refresh_from_db()
    source.refresh_from_db()
    assert proposal.status == ScenarioProposal.Status.REJECTED and proposal.decided_by == grc
    assert source.is_active is True and source.merged_into is None
