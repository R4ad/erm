"""بازگرداندن پاسخنامه برای تکمیل (12e) و ارسال دوباره با شناسایی هوشمند خودکار."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires import returning
from apps.questionnaires.ai import pipeline
from apps.questionnaires.models import AiRun, PendingRisk, Response
from apps.questionnaires.tests.factories import payment_response
from apps.risks.models import Risk
from apps.workcalendar.workdays import is_working_day

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
def run(response, sara):
    run = pipeline.request_identification(response, sara)
    pipeline.run_identification(run)
    run.refresh_from_db()
    run.follow_up_questions = [
        {"question": "سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟", "about": "P1", "reason": "زمان نامعلوم"},
        {"question": "زیان مالی هر ساعت توقف چقدر است؟", "about": "I1", "reason": "مبلغ نامعلوم"},
        {"question": "تصمیم ارتقا با کدام واحد بانک است؟", "about": "Q4", "reason": "مسئولیت مبهم"},
        {"question": "آزمون بار انجام شده است؟", "about": "X9", "reason": "—"},
    ]
    run.save()
    return run


def url(response, tail):
    return f"/api/questionnaire-responses/{response.pk}/{tail}"


def test_options_label_ai_questions_and_offer_working_day_deadlines(client, sara, response, run):
    first, second = response.pending_risks.order_by("pk")
    client.force_login(sara)
    client.post(f"/api/pending-risks/{first.pk}/approve/", {}, content_type="application/json")

    data = client.get(url(response, "return-options/")).json()
    assert data["respondent"]["name"] == "مریم صادقی"
    assert [(item["about"], item["step"]) for item in data["suggestions"]] == [
        ("مسیر تحقق ۱", 5),
        ("پیامد ۱ · مسیرهای ۱ و ۳", 7),
        ("پرسش ۴", 4),
        ("", None),
    ]
    assert data["default_days"] == 3 and len(data["deadlines"]) == 10
    days = [datetime.date.fromisoformat(item["date"]["iso"]) for item in data["deadlines"]]
    assert days == sorted(days) and days[0] > timezone.localdate()
    assert all(day.weekday() not in (3, 4) for day in days)
    assert data["approved"] == [Risk.objects.get().code]
    assert data["pending"] == 1


def test_return_archives_pending_drafts_and_keeps_decisions(client, sara, respondent, response, run):
    first, second = response.pending_risks.order_by("pk")
    client.force_login(sara)
    client.post(f"/api/pending-risks/{first.pk}/approve/", {}, content_type="application/json")
    due = client.get(url(response, "return-options/")).json()["deadlines"][2]["date"]["iso"]

    reply = client.post(
        url(response, "return/"),
        {
            "questions": [
                {"text": "سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟", "ref": "P1", "source": "ai"},
                {"text": "  ", "ref": "", "source": "custom"},
                {"text": "قرارداد پشتیبانی دیتاسنتر تا کی اعتبار دارد؟", "ref": "", "source": "custom"},
            ],
            "message": "لطفاً پرسش‌های زیر را تکمیل کنید.",
            "due_date": due,
        },
        content_type="application/json",
    )
    assert reply.status_code == 200, reply.json()
    response.refresh_from_db()
    assert response.status == Response.Status.RETURNED
    assert response.return_due.isoformat() == due
    assert response.returned_at is not None
    assert response.return_message == "لطفاً پرسش‌های زیر را تکمیل کنید."
    assert response.return_questions == [
        {"text": "سوئیچ به لینک پشتیبان چقدر طول می‌کشد؟", "ref": "P1", "about": "مسیر تحقق ۱", "step": 5, "source": "ai"},
        {"text": "قرارداد پشتیبانی دیتاسنتر تا کی اعتبار دارد؟", "ref": "", "about": "", "step": None, "source": "custom"},
    ]
    first.refresh_from_db()
    second.refresh_from_db()
    assert (first.status, second.status) == (P.CONVERTED, P.ARCHIVED)
    assert second.history.first().history_user == sara
    assert Risk.objects.get().status == Risk.Status.ANALYSIS

    history = client.get(url(response, "history/")).json()["events"]
    assert history[0]["text"] == "برای تکمیل بازگردانده شد · ۲ پرسش"
    assert history[0]["actor"]["name"] == "سارا محمدی"

    client.force_login(respondent)
    wizard = client.get(f"/api/questionnaire-answers/?response={response.pk}").json()
    assert wizard["response"]["returned"]["questions"][0]["about"] == "مسیر تحقق ۱"
    assert wizard["response"]["returned"]["due"]["iso"] == due


def test_return_validates_questions_and_deadline(client, sara, response, run):
    client.force_login(sara)
    friday = timezone.localdate() + datetime.timedelta(days=(4 - timezone.localdate().weekday()) % 7 or 7)
    reply = client.post(
        url(response, "return/"),
        {"questions": [{"text": " "}], "message": "x" * 1001, "due_date": friday.isoformat()},
        content_type="application/json",
    )
    assert reply.status_code == 400
    assert reply.json()["errors"] == {
        "questions": ["دست‌کم یک پرسش انتخاب کنید."],
        "message": ["حداکثر ۱٬۰۰۰ نویسه."],
        "due_date": ["مهلت باید روز کاری بعد از امروز باشد."],
    }
    today = client.post(
        url(response, "return/"),
        {"questions": [{"text": "پرسش"}], "due_date": timezone.localdate().isoformat()},
        content_type="application/json",
    )
    assert today.json()["errors"] == {"due_date": ["مهلت باید روز کاری بعد از امروز باشد."]}
    last = returning.deadline_choices()[-1][1]
    beyond = next(d for d in (last + datetime.timedelta(days=n) for n in range(1, 15)) if is_working_day(d))
    far = client.post(
        url(response, "return/"),
        {"questions": [{"text": "پرسش"}], "due_date": beyond.isoformat()},
        content_type="application/json",
    )
    assert far.json()["errors"] == {"due_date": ["مهلت باید روز کاری بعد از امروز باشد."]}
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED


def test_only_risk_experts_return_and_only_responses_waiting_for_review(client, sara, respondent, response, run):
    client.force_login(respondent)
    assert client.get(url(response, "return-options/")).status_code == 403
    body = {"questions": [{"text": "پرسش"}], "due_date": "2099-01-05"}
    assert client.post(url(response, "return/"), body, content_type="application/json").status_code == 403

    client.force_login(sara)
    Response.objects.filter(pk=response.pk).update(status=Response.Status.IDENTIFIED)
    due = client.get(url(response, "return-options/")).json()["deadlines"][0]["date"]["iso"]
    reply = client.post(url(response, "return/"), {**body, "due_date": due}, content_type="application/json")
    assert reply.status_code == 409
    assert reply.json()["message"] == "فقط پاسخنامه‌ی در انتظار بررسی بازگردانده می‌شود."


def test_return_cancels_a_queued_run(client, sara, response):
    queued = pipeline.request_identification(response, sara)
    client.force_login(sara)
    due = client.get(url(response, "return-options/")).json()["deadlines"][0]["date"]["iso"]
    reply = client.post(
        url(response, "return/"), {"questions": [{"text": "پرسش"}], "due_date": due}, content_type="application/json"
    )
    assert reply.status_code == 200
    queued.refresh_from_db()
    assert queued.status == AiRun.Status.CANCELLED


def test_resubmitting_queues_identification_for_unapproved_impacts(client, sara, respondent, response, run):
    first, second = response.pending_risks.order_by("pk")
    client.force_login(sara)
    client.post(f"/api/pending-risks/{first.pk}/approve/", {}, content_type="application/json")
    due = client.get(url(response, "return-options/")).json()["deadlines"][0]["date"]["iso"]
    client.post(
        url(response, "return/"), {"questions": [{"text": "پرسش"}], "due_date": due}, content_type="application/json"
    )

    client.force_login(respondent)
    values = client.get(f"/api/questionnaire-answers/?response={response.pk}").json()["values"]
    reply = client.post(
        "/api/questionnaire-answers/",
        {"response": response.pk, "values": values, "step": 8, "submit": True},
        content_type="application/json",
    )
    assert reply.status_code == 200, reply.json()
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED
    queued = response.ai_runs.get(status=AiRun.Status.QUEUED)
    assert queued.requested_by == respondent

    pipeline.run_identification(queued)
    fresh = response.pending_risks.filter(status=P.PENDING)
    assert fresh.count() == 1
    assert fresh.get().consequence_id == second.consequence_id

    client.force_login(sara)
    history = [item["text"] for item in client.get(url(response, "history/")).json()["events"]]
    assert "دوباره برای بررسی ارسال شد" in history
