"""تعریف پرسشنامه‌ها، بررسی پاسخ‌ها و پایش در رابط React از راه پل جنگو: فهرست‌ها، پرونده‌ها، فرم سؤال با گزینه‌هایش،
برگشت و پایان بررسی، ثبت یا کنار گذاشتن ریسک در انتظار، و اعلان‌ها و بازبینی‌های پایش، همه با همان view جنگو."""

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice, RiskReview
from apps.actions.monitoring import record_trigger
from apps.actions.tests import test_treatment as treatment
from apps.api.routes import spa_route
from apps.catalog.tests.factories import make_service, make_user
from apps.core.jalali import to_jalali
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Answer, Option, PendingRisk, Question, Questionnaire, Response
from apps.questionnaires.services import submit_response
from apps.risks.models import Risk, RiskCategory, RiskScenario

from .test_bridge import form, page, send, values_of

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="عملیات")


@pytest.fixture
def manager(unit):
    user = make_user("manager", Role.UNIT_MANAGER, first_name="مریم", last_name="کاظمی")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def questionnaire():
    return Questionnaire.objects.create(title="شناسایی ریسک عملیات", description="راهنما", is_active=True)


@pytest.fixture
def scenario():
    return RiskScenario.objects.create(
        title="شکست بازیابی", event="ر", conditions="ش", consequence="پ", category=RiskCategory.objects.get(code="T7")
    )


def add_question(questionnaire, text, kind, options=(), **fields):
    question = Question.objects.create(questionnaire=questionnaire, text=text, kind=kind, **fields)
    for order, (option_text, risky) in enumerate(options, start=1):
        Option.objects.create(question=question, order=order, text=option_text, indicates_risk=risky)
    return question


def submitted(questionnaire, unit, respondent, scenario=None, **fields):
    """پاسخ ارسال‌شده با یک جواب «نشانه‌ی ریسک» و «مورد جدید»، پس دو ریسک در انتظار دارد."""
    question = add_question(
        questionnaire, "پشتیبان آزموده شده؟", Question.Kind.YES_NO, [("بله", False), ("خیر", True)], is_required=True
    )
    risky = question.options.get(text="خیر")
    risky.scenario = scenario
    risky.save()
    response = Response.objects.create(
        questionnaire=questionnaire,
        org_unit=unit,
        respondent=respondent,
        recorded_by=respondent,
        channel=Response.Channel.QUESTIONNAIRE,
        new_item="کلید رمز دست یک نفر است.",
        **fields,
    )
    Answer.objects.create(response=response, question=question).options.add(risky)
    submit_response(response)
    return response


def question_values(described, **changes):
    """همه‌ی فیلدهای فرم سؤال و formset گزینه‌ها همان‌طور که رابط React می‌فرستد، با تغییرهای خواسته‌شده."""
    values = values_of(described["form"])
    values.update({field["name"]: field["value"] for field in described["options"]["management"]})
    for row in described["options"]["rows"]:
        values.update(values_of(row))
    values.update(changes)
    return values


def test_questionnaire_pages_open_in_react(grc):
    assert spa_route(reverse("questionnaires:questionnaire_list")) == "/questionnaires/manage"
    assert spa_route(reverse("questionnaires:response_detail", args=[3])) == "/questionnaires/responses/3"
    assert spa_route(reverse("questionnaires:question_update", args=[4])) == "/questionnaires/questions/4/edit"
    assert spa_route(reverse("questionnaires:pending_convert", args=[5])) == "/questionnaires/pending/5/convert"
    assert spa_route(reverse("actions:notices")) == "/actions/notices"
    assert spa_route(reverse("actions:review_detail", args=[6])) == "/actions/reviews/6"
    assert spa_route(reverse("actions:review_create", args=[7])) == "/actions/risks/7/review/new"


def test_the_questionnaire_list_and_detail_show_what_the_django_pages_show(api, grc, manager, questionnaire, scenario):
    question = add_question(questionnaire, "پشتیبان دارید؟", Question.Kind.YES_NO, [("بله", False), ("خیر", True)])
    risky = question.options.get(text="خیر")
    risky.scenario = scenario
    risky.save()
    add_question(questionnaire, "سؤال کنار گذاشته", Question.Kind.TEXT, is_active=False)
    client = api(grc)

    listing = page(client, reverse("questionnaires:questionnaire_list")).json()
    # پرسشنامه‌ی شاخه‌ای مشترک را مهاجرت داده‌ها می‌سازد؛ این‌جا فقط پرسشنامه‌ی همین آزمون بررسی می‌شود.
    row = next(item for item in listing["results"] if item["id"] == questionnaire.pk)
    assert (row["title"], row["question_count"], row["response_count"], row["is_active"]) == (
        "شناسایی ریسک عملیات",
        1,
        0,
        True,
    )
    assert listing["create_url"] == reverse("questionnaires:questionnaire_create")

    detail = page(client, questionnaire.get_absolute_url()).json()
    first, inactive = detail["questions"]
    assert first["kind"] == {"value": "yes_no", "label": "بله و خیر"}
    assert [(option["text"], option["indicates_risk"]) for option in first["options"]] == [
        ("بله", False),
        ("خیر", True),
    ]
    assert first["options"][1]["scenario"] == {"code": scenario.code, "name": scenario.title}
    assert first["edit_url"] == reverse("questionnaires:question_update", args=[question.pk])
    assert inactive["is_active"] is False
    assert detail["add_question_url"] == reverse("questionnaires:question_create", args=[questionnaire.pk])

    # سؤال‌ها محرمانه نیستند و مدیر واحد هم می‌بیند، ولی دکمه‌ی تعریف و ویرایش ندارد.
    client = api(manager)
    assert page(client, reverse("questionnaires:questionnaire_list")).json()["create_url"] is None
    detail = page(client, questionnaire.get_absolute_url()).json()
    assert detail["edit_url"] is None and detail["questions"][0]["edit_url"] is None


def test_a_question_is_saved_with_its_options_through_the_bridge(api, grc, questionnaire, scenario):
    client = api(grc)
    path = reverse("questionnaires:question_create", args=[questionnaire.pk])
    described = form(client, path).json()
    assert described["title"] == f"سؤال جدید در «{questionnaire}»"
    assert described["structured"] is False
    names = [field["name"] for field in described["options"]["management"]]
    assert names == ["options-TOTAL_FORMS", "options-INITIAL_FORMS", "options-MIN_NUM_FORMS", "options-MAX_NUM_FORMS"]
    assert len(described["options"]["rows"]) == 4
    assert [field["name"] for field in described["options"]["rows"][0]["fields"]][:2] == [
        "options-0-order",
        "options-0-text",
    ]

    values = question_values(
        described,
        **{
            "text": "کدام پشتیبان را دارید؟",
            "kind": "single",
            "options-0-text": "روزانه",
            "options-1-text": "هیچ",
            "options-1-indicates_risk": True,
            "options-1-scenario": str(scenario.pk),
        },
    )
    result = send(client, path, values)
    assert result.status_code == 200, result.json()
    assert result.json()["redirect"]["route"] == f"/questionnaires/manage/{questionnaire.pk}"
    question = questionnaire.questions.get()
    assert [(option.text, option.indicates_risk, option.scenario) for option in question.options.all()] == [
        ("روزانه", False, None),
        ("هیچ", True, scenario),
    ]

    # ویرایش: گزینه‌های ذخیره‌شده با شناسه‌شان می‌آیند و چهار ردیف خالی بعد از آن‌ها.
    path = reverse("questionnaires:question_update", args=[question.pk])
    described = form(client, path).json()
    management = {field["name"]: field["value"] for field in described["options"]["management"]}
    assert (management["options-TOTAL_FORMS"], management["options-INITIAL_FORMS"]) == ("6", "2")
    first = {field["name"]: field for field in described["options"]["rows"][0]["fields"]}
    assert first["options-0-id"]["kind"] == "hidden" and first["options-0-text"]["value"] == "روزانه"
    changes = {"options-0-is_active": False, "options-2-text": "هفتگی", "options-2-order": "3"}
    result = send(client, path, question_values(described, **changes))
    assert result.status_code == 200, result.json()
    assert list(question.options.filter(is_active=True).values_list("text", flat=True)) == ["هیچ", "هفتگی"]


def test_option_and_question_errors_come_back_next_to_their_fields(api, grc, questionnaire, scenario):
    client = api(grc)
    path = reverse("questionnaires:question_create", args=[questionnaire.pk])
    described = form(client, path).json()

    one_option = question_values(described, text="کدام؟", kind="single", **{"options-0-text": "فقط یکی"})
    body = send(client, path, one_option).json()
    assert "دست‌کم دو گزینه‌ی فعال" in " ".join(body["errors"]["__all__"])

    scenario_without_risk = question_values(
        described,
        text="کدام؟",
        kind="single",
        **{"options-0-text": "یک", "options-1-text": "دو", "options-1-scenario": str(scenario.pk)},
    )
    body = send(client, path, scenario_without_risk).json()
    assert body["errors"]["options-1-indicates_risk"] == ["سناریو و دسته فقط برای گزینه‌ی «نشانه‌ی ریسک» است."]
    assert not questionnaire.questions.exists()


def test_the_response_list_uses_the_django_filters_and_pending_counts(api, grc, manager, questionnaire, unit):
    response = submitted(questionnaire, unit, manager)
    draft = Response.objects.create(
        questionnaire=Questionnaire.objects.create(title="پرسشنامه‌ی دوم", is_active=True),
        org_unit=unit,
        respondent=manager,
        recorded_by=grc,
        channel=Response.Channel.INTERVIEW,
    )
    client = api(grc)

    listing = page(client, reverse("questionnaires:response_list")).json()
    assert listing["count"] == 2
    assert listing["queue_url"] == f"{reverse('questionnaires:response_list')}?status=submitted"
    assert [field["name"] for field in listing["filters"]["fields"]] == ["status", "questionnaire", "unit", "pending"]

    queue = page(client, f"{reverse('questionnaires:response_list')}?status=submitted").json()
    (row,) = queue["results"]
    assert (row["id"], row["pending_count"], row["status"]["value"]) == (response.pk, 2, "submitted")
    assert row["submitted_at"]["jalali"] == to_jalali(response.submitted_at.date())

    without = page(client, f"{reverse('questionnaires:response_list')}?pending=no").json()
    assert [item["id"] for item in without["results"]] == [draft.pk]
    assert without["results"][0]["interview"] is True


def test_the_review_page_shows_answers_pending_risks_and_review_actions(
    api, grc, manager, questionnaire, unit, scenario
):
    response = submitted(questionnaire, unit, manager, scenario=scenario)
    client = api(grc)

    detail = page(client, response.get_absolute_url()).json()
    assert detail["response"]["status"]["value"] == "submitted"
    assert detail["response"]["questionnaire"]["href"] == questionnaire.get_absolute_url()
    (answer,) = detail["answers"]
    assert answer["options"] == [{"text": "خیر", "indicates_risk": True}]
    assert detail["new_item"] == "کلید رمز دست یک نفر است."
    assert len(detail["fixed"]) == len(Response.FIXED_ITEMS)
    from_option, from_new_item = detail["pending_risks"]
    assert from_option["scenario"] == {"code": scenario.code, "name": scenario.title}
    assert from_option["convert_url"] == reverse("questionnaires:pending_convert", args=[from_option["id"]])
    assert from_new_item["source"] == "مورد جدید"
    assert detail["review"] == {
        "pending_create_url": reverse("questionnaires:pending_create", args=[response.pk]),
        "return_url": reverse("questionnaires:response_return", args=[response.pk]),
        "reviewed_url": reverse("questionnaires:response_reviewed", args=[response.pk]),
        "undecided": True,
    }
    assert detail["answer_url"] is None  # پاسخ ارسال‌شده تا برگشت نخورد ویرایش نمی‌شود

    # پاسخ‌دهنده پاسخ خودش را می‌بیند، بی کارهای عضو GRC.
    detail = page(api(manager), response.get_absolute_url()).json()
    assert detail["review"] is None
    assert all(item["convert_url"] is None and item["dismiss_url"] is None for item in detail["pending_risks"])
    assert page(api(make_user("stranger")), response.get_absolute_url()).status_code == 404


def test_grc_returns_a_response_and_the_respondent_continues_it(api, grc, manager, questionnaire, unit):
    response = submitted(questionnaire, unit, manager)
    client = api(grc)
    path = reverse("questionnaires:response_return", args=[response.pk])
    described = form(client, path).json()
    assert described["submit"] == "برگشت با سؤال"

    assert send(client, path, {"question": ""}).json()["errors"]["question"] == ["این مقدار لازم است."]
    result = send(client, path, {"question": "کدام سامانه؟"}).json()
    response.refresh_from_db()
    assert f"مهلت جواب تا {to_jalali(response.return_due)}" in result["message"]
    assert result["redirect"]["route"] == f"/questionnaires/responses/{response.pk}"

    detail = page(api(manager), response.get_absolute_url()).json()
    assert detail["response"]["return_question"] == "کدام سامانه؟"
    assert detail["response"]["return_due"]["days_left"] > 0
    assert detail["answer_url"] == reverse("questionnaires:response_answer", args=[response.pk])
    # فرم برگشت فقط روی پاسخ ارسال‌شده باز می‌شود.
    blocked = form(api(grc), path)
    assert blocked.status_code == 409
    assert blocked.json()["message"] == "این کار فقط روی پاسخ ارسال‌شده انجام می‌شود."


def test_the_review_finishes_only_after_every_pending_risk_is_decided(api, grc, manager, questionnaire, unit):
    response = submitted(questionnaire, unit, manager)
    client = api(grc)
    reviewed = reverse("questionnaires:response_reviewed", args=[response.pk])

    refused = send(client, reviewed, {})
    assert refused.status_code == 400
    assert refused.json()["message"] == "اول همه‌ی ریسک‌های در انتظار این پاسخ را ثبت کنید یا کنار بگذارید."

    for pending in response.pending_risks.all():
        path = reverse("questionnaires:pending_dismiss", args=[pending.pk])
        described = form(client, path).json()
        facts = {row["label"]: row["value"] for row in described["facts"]["rows"]}
        assert facts["شرح"] == pending.description
        assert send(client, path, {"dismiss_reason": ""}).json()["errors"]["dismiss_reason"] == ["این مقدار لازم است."]
        assert send(client, path, {"dismiss_reason": "در کنترل‌های فعلی پوشش دارد"}).status_code == 200

    detail = page(client, response.get_absolute_url()).json()
    assert detail["review"]["undecided"] is False
    assert detail["pending_risks"][0]["status"]["value"] == "dismissed"
    assert send(client, reviewed, {}).json()["message"] == "بررسی این پاسخ تمام شد."
    response.refresh_from_db()
    assert (response.status, response.reviewed_by) == ("reviewed", grc)
    assert page(client, response.get_absolute_url()).json()["review"] is None


def test_a_pending_risk_is_registered_from_a_chosen_scenario(api, grc, manager, questionnaire, unit):
    service = make_service("SRV-1", org_unit=unit)
    category = RiskCategory.objects.get(code="T4")
    response = submitted(questionnaire, unit, manager, service=service)
    pending = response.pending_risks.get(source=PendingRisk.Source.NEW_ITEM)
    scenario = RiskScenario.objects.create(
        title="سناریوی تسویه",
        service=service,
        category=category,
        conditions="خرابی",
        event="قطع تسویه",
        consequence="وقفه",
    )
    client = api(grc)
    path = reverse("questionnaires:pending_convert", args=[pending.pk])

    picker = form(client, path).json()
    assert picker["title"] == "انتخاب سناریو برای ثبت ریسک"
    assert picker["form"] is None
    assert picker["cancel"]["route"] == f"/questionnaires/responses/{response.pk}"
    assert [item["code"] for item in picker["scenarios"]] == [scenario.code]
    assert picker["pending"]["description"] == pending.description

    path = f"{path}?scenario={scenario.pk}"
    described = form(client, path).json()
    assert described["title"] == "ثبت ریسک در انتظار در رجیستر"
    assert described["submit"] == "ثبت در رجیستر"
    assert described["facts"]["title"] == "جزئیات سناریو"
    values = values_of(described["form"])
    assert values["channel"] == "questionnaire"
    values.update(initiator="خرابی", realization_path="وقفه در اتصال")
    result = send(client, path, values)
    assert result.status_code == 200, result.json()
    risk = Risk.objects.get()
    pending.refresh_from_db()
    assert result.json()["redirect"]["href"] == risk.get_absolute_url()
    assert (pending.status, pending.risk) == ("converted", risk)
    assert page(client, response.get_absolute_url()).json()["pending_risks"][1]["risk"] == {
        "code": risk.code,
        "href": risk.get_absolute_url(),
    }


def test_notices_are_listed_for_their_recipient_and_marked_read(api, grc):
    owner = make_user("owner", first_name="رضا", last_name="مالکی")
    risk = treatment.make_risk(owner)
    record_trigger(risk, grc, "incident", "رخداد نیازمند پاسخ فوری")
    notice = MonitoringNotice.objects.filter(recipient=owner).first()
    client = api(owner)

    notices = page(client, reverse("actions:notices")).json()["notices"]
    item = next(entry for entry in notices if entry["id"] == notice.pk)
    assert item["risk"]["code"] == risk.code
    assert (item["read"], item["read_url"]) == (False, reverse("actions:notice_read", args=[notice.pk]))

    result = send(client, item["read_url"], {}).json()
    assert result["message"] == "اعلان خوانده شد."
    notice.refresh_from_db()
    assert notice.read_at
    item = next(
        entry for entry in page(client, reverse("actions:notices")).json()["notices"] if entry["id"] == notice.pk
    )
    assert (item["read"], item["read_url"]) == (True, None)

    stranger = api(make_user("stranger"))
    assert all(entry["id"] != notice.pk for entry in page(stranger, reverse("actions:notices")).json()["notices"])
    assert send(stranger, reverse("actions:notice_read", args=[notice.pk]), {}).status_code == 404


def test_a_review_trigger_is_recorded_and_its_result_completes_it(api, grc):
    owner = make_user("owner", first_name="رضا", last_name="مالکی")
    risk = treatment.make_risk(owner)
    client = api(grc)
    path = reverse("actions:review_create", args=[risk.pk])
    described = form(client, path).json()
    assert described["title"] == f"محرک بازبینی {risk.code}"
    assert [field["name"] for field in described["form"]["fields"]] == ["trigger", "reason", "due", "control"]

    refused = send(client, path, {"trigger": "change", "reason": "تغییر معماری"}).json()
    assert refused["errors"]["__all__"] == ["تاریخ بررسی پیش از تصویب تولید یا پذیرش تعهد را تعیین کنید."]
    result = send(client, path, {"trigger": "incident", "reason": "رخداد نیازمند پاسخ فوری"})
    assert result.status_code == 200, result.json()
    review = RiskReview.objects.get()
    assert result.json()["redirect"]["route"] == f"/actions/reviews/{review.pk}"

    detail = page(api(owner), review.get_absolute_url()).json()
    assert detail["review"]["trigger"]["label"] == "رخداد مهم یا بهره‌برداری فعال"
    assert detail["review"]["responsible"]["name"] == "رضا مالکی"
    assert detail["complete"]["url"] == review.get_absolute_url()
    assert detail["complete"]["result"]["name"] == "result"

    client = api(owner)
    assert send(client, review.get_absolute_url(), {"result": ""}).json()["errors"]["result"] == ["این مقدار لازم است."]
    done = send(client, review.get_absolute_url(), {"result": "ارجاع به مدیریت رخداد"}).json()
    assert done["message"] == "نتیجه بازبینی ثبت شد."
    detail = page(client, review.get_absolute_url()).json()
    assert detail["complete"] is None
    assert detail["review"]["result"] == "ارجاع به مدیریت رخداد"
    assert detail["review"]["completed_by"]["name"] == "رضا مالکی"
    assert page(api(make_user("stranger")), review.get_absolute_url()).status_code == 404
