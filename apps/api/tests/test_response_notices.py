"""اعلان‌های شناسایی از پاسخنامه در «اعلان‌های پایش» و کارهای پاسخنامه در «کارهای من»."""

from unittest import mock

import pytest

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.ai import pipeline, providers
from apps.questionnaires.models import AiRun, Response
from apps.questionnaires.tests.factories import payment_response
from apps.questionnaires.tests.test_ai_identification import Scripted

pytestmark = pytest.mark.django_db


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


def identify(response, user):
    run = pipeline.request_identification(response, user)
    pipeline.run_identification(run)
    run.refresh_from_db()
    return run


def inbox(client, user):
    client.force_login(user)
    return client.get("/api/monitoring/inbox/").json()["notices"]


def return_with_question(client, sara, response):
    client.force_login(sara)
    due = client.get(f"/api/questionnaire-responses/{response.pk}/return-options/").json()["deadlines"][2]["date"]
    client.post(
        f"/api/questionnaire-responses/{response.pk}/return/",
        {"questions": [{"text": "قرارداد پشتیبانی تا کی اعتبار دارد؟"}], "due_date": due["iso"]},
        content_type="application/json",
    )
    return due


def test_finished_identification_notifies_the_requesting_expert(client, sara, respondent, response):
    run = identify(response, sara)
    notice = MonitoringNotice.objects.get()
    assert (notice.recipient, notice.response, notice.risk) == (sara, response, None)
    assert notice.event_key == f"ai-run:{run.pk}:succeeded"

    [card] = inbox(client, sara)
    assert card["title"] == f"شناسایی هوشمند پاسخنامه‌ی {response.code} انجام شد · ۲ ریسک پیشنهاد شد"
    assert (card["icon"], card["tone"], card["tab"], card["chips"]) == ("lightning", "info", "other", [response.code])
    assert card["cta"]["route"] == f"/identification/responses/{response.pk}"
    assert card["unread"] is True

    reply = client.post(f"/api/monitoring/inbox/{card['id']}/read/")
    assert reply.json()["read"] == 1
    assert inbox(client, respondent) == []


def test_failed_and_empty_identification_have_their_own_messages(client, sara, unit, respondent):
    failed = payment_response(unit, respondent)
    timeout = providers.ProviderError("مهلت", status=504)
    with mock.patch.object(pipeline, "get_provider", return_value=Scripted(timeout)):
        run = identify(failed, sara)
    empty = Response.objects.create(org_unit=unit, respondent=respondent, status=Response.Status.SUBMITTED)
    identify(empty, sara)

    titles = {card["title"]: card["tone"] for card in inbox(client, sara)}
    assert titles == {
        f"شناسایی هوشمند پاسخنامه‌ی {failed.code} انجام نشد · کد پیگیری {run.error_code}": "danger",
        f"شناسایی هوشمند پاسخنامه‌ی {empty.code} ریسکی نساخت": "neutral",
    }


def test_return_and_resubmission_notify_each_side_and_show_in_my_work(client, sara, respondent, response):
    identify(response, sara)
    due = return_with_question(client, sara, response)

    [card] = inbox(client, respondent)
    jalali = due["jalali"].translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
    assert card["title"] == f"پاسخنامه‌ی {response.code} برای تکمیل اطلاعات بازگردانده شد · مهلت تا {jalali}"
    assert card["cta"]["route"] == f"/questionnaire-answers?response={response.pk}"
    work = client.get("/api/my-work/").json()["tasks"]
    task = next(row for row in work if row["key"] == f"response-{response.pk}")
    assert (task["title"], task["category"], task["route"]) == (
        f"تکمیل پاسخنامه‌ی {response.code}",
        "questions",
        f"/questionnaire-answers?response={response.pk}",
    )
    assert task["due"]["iso"] == due["iso"]
    assert not any(row["key"].startswith("review-response-") for row in work)

    values = client.get(f"/api/questionnaire-answers/?response={response.pk}").json()["values"]
    client.post(
        "/api/questionnaire-answers/",
        {"response": response.pk, "values": values, "step": 8, "submit": True},
        content_type="application/json",
    )
    queued = response.ai_runs.get(status=AiRun.Status.QUEUED)
    pipeline.run_identification(queued)

    titles = [card["title"] for card in inbox(client, sara)]
    assert f"پاسخنامه‌ی {response.code} تکمیل و دوباره ارسال شد" in titles
    assert titles.count(f"شناسایی هوشمند پاسخنامه‌ی {response.code} انجام شد · ۲ ریسک پیشنهاد شد") == 2
    assert not MonitoringNotice.objects.filter(recipient=respondent, event_key__startswith="ai-run:").exists()

    work = client.get("/api/my-work/").json()["tasks"]
    task = next(row for row in work if row["key"] == f"review-response-{response.pk}")
    assert (task["title"], task["cta"], task["rated"]) == (f"بررسی پاسخنامه‌ی {response.code}", "بررسی", False)
    assert task["route"] == f"/identification/responses/{response.pk}"
    response.refresh_from_db()
    assert task["due"]["iso"] == response.review_due.isoformat()


def test_the_review_outcome_notifies_the_respondent(client, sara, respondent, response):
    identify(response, sara)
    first, second = response.pending_risks.order_by("pk")
    client.force_login(sara)
    client.post(f"/api/pending-risks/{first.pk}/approve/", {}, content_type="application/json")
    client.post(f"/api/pending-risks/{second.pk}/reject/", {"reason": "تکراری"}, content_type="application/json")

    [card] = inbox(client, respondent)
    assert card["title"] == f"پاسخنامه‌ی {response.code} بررسی شد و ۱ ریسک شناسایی شد"
    assert card["cta"]["route"] == f"/identification/responses/{response.pk}"


def test_all_rejected_says_no_risk_was_registered(client, sara, respondent, response):
    identify(response, sara)
    client.force_login(sara)
    for draft in response.pending_risks.all():
        client.post(f"/api/pending-risks/{draft.pk}/reject/", {"reason": "نامرتبط"}, content_type="application/json")
    [card] = inbox(client, respondent)
    assert card["title"] == f"پاسخنامه‌ی {response.code} بررسی شد؛ ریسکی از آن ثبت نشد"
