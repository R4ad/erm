"""«بررسی یک پاسخنامه» (12a تا 12c): سربرگ و زنجیره‌ها، اجرای شناسایی هوشمند، لغو، ریسک‌های پیشنهادی و تاریخچه."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.ai import pipeline
from apps.questionnaires.models import AiRun, PendingRisk, Response
from apps.questionnaires.tests.factories import payment_response
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db

S = Response.Status


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


def url(response, tail=""):
    return f"/api/questionnaire-responses/{response.pk}/{tail}"


def run_now(response, user):
    run = pipeline.request_identification(response, user)
    pipeline.run_identification(run)
    return run


def test_detail_has_the_header_and_each_path_chain(client, sara, response):
    client.force_login(sara)
    data = client.get(url(response)).json()

    assert data["code"] == response.code
    assert data["status"]["label"] == "در انتظار بررسی"
    assert data["service"] == "پرداخت اینترنتی (درگاه پرداخت شاپرک)"
    assert (data["org_unit"], data["respondent"]["name"]) == ("پرداخت الکترونیک", "مریم صادقی")
    assert data["can_review"] is True
    answers = data["answers"]
    assert (answers["questions"], answers["paths"], answers["impacts"]) == (7, 3, 2)
    assert [item["key"] for item in answers["basics"]] == ["service", "objective", "conditions", "responsibility"]
    first, second, third = answers["chains"]
    assert first["event"] == {"number": 1, "text": "توقف کامل پردازش تراکنش‌های پرداخت اینترنتی", "shared_with": None}
    assert first["impact"]["number"] == 1 and "مالی" in first["impact"]["type"]
    assert first["impact"]["scope"] == "همه‌ی بانک‌ها"
    assert second["event"]["number"] == 2 and second["impact"]["number"] == 2
    # مسیر ۳ رویداد ۱ را دوباره استفاده می‌کند؛ پیامدش همان پیامد ۱ است.
    assert third["event"]["shared_with"] == 1 and third["impact"] is None
    assert data["run"] is None
    assert data["facts"] == {"answers": 7, "paths": 3, "impacts": 2, "risks": 2, "registry": Risk.objects.count()}


def test_next_goes_through_the_queue_in_order(client, sara, unit, respondent, response):
    now = timezone.now()
    older = payment_response(unit, respondent, submitted_at=now - datetime.timedelta(days=2))
    response.submitted_at = now - datetime.timedelta(days=1)
    response.save()
    newest = payment_response(unit, respondent, submitted_at=now)
    client.force_login(sara)
    assert client.get(url(older)).json()["next"]["id"] == response.pk
    assert client.get(url(response)).json()["next"]["id"] == newest.pk
    assert client.get(url(newest)).json()["next"]["id"] == older.pk


def test_drafts_and_other_units_are_not_found_and_managers_only_view(client, unit, respondent, response):
    draft = payment_response(unit, respondent, status=S.DRAFT)
    client.force_login(respondent)
    assert client.get(url(draft)).status_code == 404
    data = client.get(url(response)).json()
    assert (data["can_review"], data["next"]) == (False, None)
    assert client.post(url(response, "ai-identification/")).status_code == 403

    other = make_user("reza", Role.UNIT_MANAGER)
    other.managed_units.add(OrgUnit.objects.create(name="کارت"))
    client.force_login(other)
    assert client.get(url(response)).status_code == 404


def test_request_queues_one_run_and_polls_its_stage(client, sara, response):
    client.force_login(sara)
    answer = client.post(url(response, "ai-identification/"))
    assert answer.status_code == 202
    run_id = answer.json()["run_id"]
    assert client.post(url(response, "ai-identification/")).json()["run_id"] == run_id

    run = client.get(f"/api/ai-runs/{run_id}/").json()
    assert (run["status"], run["active"], run["stage"], run["stages"]) == ("queued", True, 0, 5)
    assert run["facts"]["risks"] == 2

    pipeline.run_identification(AiRun.objects.get(pk=run_id))
    run = client.get(f"/api/ai-runs/{run_id}/").json()
    assert (run["status"], run["active"], run["stage"]) == ("succeeded", False, 5)
    assert client.get(url(response)).json()["run"]["id"] == run_id


def test_only_a_submitted_response_is_identified(client, sara, unit, respondent):
    reviewed = payment_response(unit, respondent, status=S.REVIEWED)
    client.force_login(sara)
    assert client.post(url(reviewed, "ai-identification/")).status_code == 400


def test_cancel_stops_the_run_before_its_result(client, sara, response):
    client.force_login(sara)
    run_id = client.post(url(response, "ai-identification/")).json()["run_id"]
    assert client.post(f"/api/ai-runs/{run_id}/cancel/").json()["status"] == "cancelled"
    assert pipeline.next_queued() is None
    assert not response.pending_risks.exists()
    # اجرای تمام‌شده دوباره لغو نمی‌شود.
    done = run_now(response, sara)
    assert client.post(f"/api/ai-runs/{done.pk}/cancel/").json()["status"] == "succeeded"


def test_risks_have_their_source_and_decision_counts(client, sara, unit, response):
    Risk.objects.create(
        title="توقف کامل پردازش تراکنش‌های پرداخت اینترنتی بر اثر قطعی لینک ارتباطی اصلی با شاپرک",
        description="—",
        channel=Risk.Channel.IDENTIFICATION,
        org_unit=unit,
    )
    run_now(response, sara)
    first, second = response.pending_risks.order_by("pk")
    approved = Risk.objects.create(
        title="کندی", description="—", channel=Risk.Channel.QUESTIONNAIRE, org_unit=unit
    )
    second.status, second.risk, second.decided_by = PendingRisk.Status.CONVERTED, approved, sara
    second.decided_at = timezone.now()
    second.save()

    client.force_login(sara)
    data = client.get(url(response, "risks/")).json()
    assert data["counts"] == {"total": 2, "approved": 1, "dismissed": 0, "pending": 1}
    assert data["analysed_at"] is not None
    card = data["risks"][0]
    assert card["status"] == {"value": "pending", "label": "پیش‌نویس AI"}
    assert card["source"] == {"paths": [1, 3], "event": 1, "impact": 1}
    assert [path["number"] for path in card["paths"]] == [1, 3]
    assert card["category_suggested"] is True
    assert card["owner_unit"]["name"] == "پرداخت الکترونیک"
    assert card["similar"][0]["percent"] > 0
    assert card["edited"] is False
    assert data["risks"][1]["risk"]["code"] == approved.code

    first.title = "توقف پرداخت اینترنتی بر اثر قطع ارتباط با شاپرک و دیتاسنتر"
    first.save()
    assert client.get(url(response, "risks/")).json()["risks"][0]["edited"] is True


def test_history_lists_the_events_newest_first(client, sara, respondent, response):
    client.force_login(sara)
    response.status = S.DRAFT
    response.save()
    response.status = S.SUBMITTED
    response.save()
    run_now(response, sara)
    draft = response.pending_risks.order_by("pk").first()
    draft.status, draft.dismiss_reason, draft.decided_by = PendingRisk.Status.DISMISSED, "تکراری", sara
    draft.decided_at = timezone.now()
    draft.save()

    events = client.get(url(response, "history/")).json()["events"]
    texts = [item["text"] for item in events]
    assert texts[0] == f"ریسک پیشنهادی «{draft.title}» رد شد"
    assert texts[1] == "شناسایی هوشمند · ۲ ریسک پیشنهاد شد"
    assert "برای بررسی ارسال شد" in texts
    assert texts[-1] == "پیش‌نویس ایجاد شد"
    assert events[0]["actor"]["name"] == "سارا محمدی"
    assert events[1]["tone"] == "tangerine"
