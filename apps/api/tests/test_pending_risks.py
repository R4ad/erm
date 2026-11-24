"""تصمیم درباره‌ی ریسک‌های پیشنهادی (12c و 12d): ویرایش، تأیید به «آنالیز ریسک»، رد با دلیل، گزینه‌ها و مقایسه."""

import pytest

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.ai import pipeline
from apps.questionnaires.models import PendingRisk, Response
from apps.questionnaires.tests.factories import payment_response
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db

P = PendingRisk.Status


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="پرداخت الکترونیک")


@pytest.fixture
def respondent(unit):
    user = make_user("maryam", Role.UNIT_MANAGER, first_name="مریم", last_name="صادقی")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def sara():
    return make_user("sara", Role.GRC_MEMBER, first_name="سارا", last_name="محمدی")


@pytest.fixture
def response(unit, respondent):
    return payment_response(unit, respondent)


@pytest.fixture
def drafts(response, sara):
    pipeline.run_identification(pipeline.request_identification(response, sara))
    return list(response.pending_risks.order_by("pk"))


def api(tail):
    return f"/api/pending-risks/{tail}"


def test_approve_creates_an_analysis_risk_and_settles_the_response(client, sara, respondent, response, drafts):
    first, second = drafts
    client.force_login(sara)

    reply = client.post(api(f"{first.pk}/approve/"), {}, content_type="application/json")
    assert reply.status_code == 200, reply.json()
    data = reply.json()
    assert data["status"]["value"] == "converted"
    risk = Risk.objects.get(pending_sources=first)
    assert data["risk"]["code"] == risk.code
    assert (risk.status, risk.channel) == (Risk.Status.ANALYSIS, Risk.Channel.QUESTIONNAIRE)
    assert risk.title == first.title and risk.initiator == first.initiating_factor
    assert risk.org_unit_id == first.owner_unit_id and risk.owner == respondent
    assert risk.intake["questionnaire"]["response"] == response.code
    assert [item["number"] for item in risk.intake["questionnaire"]["paths"]] == [1, 3]
    assert risk.history.first().history_user == sara
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED

    reply = client.post(api(f"{second.pk}/reject/"), {"reason": "تکراری با ریسک قبلی"}, content_type="application/json")
    assert reply.status_code == 200
    response.refresh_from_db()
    assert (response.status, response.reviewed_by) == (Response.Status.IDENTIFIED, sara)

    history = client.get(f"/api/questionnaire-responses/{response.pk}/history/").json()["events"]
    texts = [item["text"] for item in history]
    assert f"ریسک {risk.code} تأیید شد" in texts
    assert f"ریسک پیشنهادی «{second.title}» رد شد" in texts


def test_rejecting_every_draft_marks_the_response_reviewed(client, sara, response, drafts):
    client.force_login(sara)
    for draft in drafts:
        client.post(api(f"{draft.pk}/reject/"), {"reason": "نامرتبط"}, content_type="application/json")
    response.refresh_from_db()
    assert response.status == Response.Status.REVIEWED
    assert not Risk.objects.exists()


def test_reject_needs_a_reason_and_a_decision_is_final(client, sara, drafts):
    draft = drafts[0]
    client.force_login(sara)
    reply = client.post(api(f"{draft.pk}/reject/"), {"reason": "  "}, content_type="application/json")
    assert reply.status_code == 400
    assert reply.json()["errors"] == {"reason": ["دلیل رد را بنویسید."]}

    assert client.post(api(f"{draft.pk}/approve/"), {}, content_type="application/json").status_code == 200
    again = client.post(api(f"{draft.pk}/approve/"), {}, content_type="application/json")
    assert again.status_code == 409
    assert Risk.objects.count() == 1


def test_save_validates_and_keeps_the_ai_suggestion(client, sara, unit, drafts):
    draft = drafts[0]
    other = OrgUnit.objects.create(name="زیرساخت")
    category = RiskCategory.objects.filter(is_active=True).exclude(pk=draft.category_id).first()
    client.force_login(sara)

    bad = client.patch(
        api(f"{draft.pk}/"),
        {"title": "", "paths": [{"number": 1, "text": "x"}], "owner_unit": None, "category": 999999},
        content_type="application/json",
    )
    assert bad.status_code == 400
    errors = bad.json()["errors"]
    assert errors["title"] == ["عنوان ریسک را بنویسید."]
    assert errors["paths.3"] == ["شرح این مسیر تحقق را بنویسید."]
    assert errors["owner_unit"] == ["مالک ریسک را انتخاب کنید."]
    assert "category" in errors
    assert client.patch(api(f"{draft.pk}/"), {"title": "x" * 121}, content_type="application/json").json()[
        "errors"
    ] == {"title": ["حداکثر ۱۲۰ نویسه."]}

    reply = client.patch(
        api(f"{draft.pk}/"),
        {
            "title": "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک و دیتاسنتر",
            "paths": [{"number": 1, "text": "قطعی لینک اصلی"}, {"number": 3, "text": "خرابی تجهیزات"}],
            "category": category.pk,
            "owner_unit": other.pk,
            "owner": None,
        },
        content_type="application/json",
    )
    assert reply.status_code == 200, reply.json()
    data = reply.json()
    assert data["edited"] is True
    assert data["suggested"]["title"] == draft.ai_original["title"]
    assert [item["text"] for item in data["paths"]] == ["قطعی لینک اصلی", "خرابی تجهیزات"]
    assert (data["owner_unit"]["name"], data["owner"], data["category"]["id"]) == ("زیرساخت", None, category.pk)
    draft.refresh_from_db()
    assert draft.status == P.PENDING

    history = client.get(f"/api/questionnaire-responses/{draft.response_id}/history/").json()["events"]
    assert history[0]["text"] == "ریسک پیشنهادی «توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک و دیتاسنتر» ویرایش شد"
    assert history[0]["actor"]["name"] == "سارا محمدی"


def test_save_and_approve_applies_the_changes_first(client, sara, drafts):
    draft = drafts[0]
    client.force_login(sara)
    reply = client.post(api(f"{draft.pk}/approve/"), {"title": "عنوان تازه"}, content_type="application/json")
    assert reply.status_code == 200
    assert Risk.objects.get().title == "عنوان تازه"


def test_only_risk_experts_decide_and_only_while_the_response_waits(client, respondent, sara, response, drafts):
    draft = drafts[0]
    client.force_login(respondent)
    assert client.post(api(f"{draft.pk}/approve/"), {}, content_type="application/json").status_code == 403
    assert client.patch(api(f"{draft.pk}/"), {"title": "x"}, content_type="application/json").status_code == 403

    client.force_login(sara)
    Response.objects.filter(pk=response.pk).update(status=Response.Status.RETURNED)
    reply = client.post(api(f"{draft.pk}/approve/"), {}, content_type="application/json")
    assert reply.status_code == 409
    assert not Risk.objects.exists()


def test_options_and_comparison(client, sara, respondent, unit, response, drafts):
    draft = drafts[0]
    existing = Risk.objects.create(
        title="قطع درگاه پرداخت بر اثر خرابی لینک",
        description="—",
        channel=Risk.Channel.IDENTIFICATION,
        org_unit=unit,
        initiator="لینک ارتباطی تک",
        realization_path="خرابی لینک\nخرابی سوئیچ",
        intake={"event": "قطع درگاه", "harm": "تراکنش ناموفق"},
    )
    draft.similar_risks = [{"id": existing.pk, "code": existing.code, "title": existing.title, "similarity": 0.78}]
    draft.save()
    client.force_login(sara)

    options = client.get(f"/api/questionnaire-responses/{response.pk}/decision-options/").json()
    assert options["respondent_unit"] == unit.pk
    assert {"id": unit.pk, "name": "پرداخت الکترونیک", "owner": respondent.pk} in options["units"]
    assert {"id": respondent.pk, "name": "مریم صادقی"} in options["people"]
    assert len(options["categories"]) == RiskCategory.objects.filter(is_active=True).count()

    data = client.get(api(f"{draft.pk}/similar/?risk={existing.pk}")).json()
    assert data["percent"] == 78
    assert data["suggested"]["title"] == draft.title
    assert data["existing"]["code"] == existing.code
    assert data["existing"]["paths"] == ["خرابی لینک", "خرابی سوئیچ"]
    assert (data["existing"]["target_event"], data["existing"]["impact"]) == ("قطع درگاه", "تراکنش ناموفق")
    other = Risk.objects.create(title="دیگر", description="—", channel=Risk.Channel.IDENTIFICATION, org_unit=unit)
    assert client.get(api(f"{draft.pk}/similar/?risk={other.pk}")).status_code == 404
