"""API رابط React باید همان قاعده‌های صفحه‌های جنگو را داشته باشد: همان دیدن، همان فرم‌ها و همان کارها."""

import datetime

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.audit.models import AuditEvent
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Option, PendingRisk, Question, Questionnaire, Response
from apps.risks.models import Risk, RiskCategory
from apps.workflow.models import RiskQuestion

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
    """کلاینتی که مثل رابط React با نشست وارد می‌شود و JSON می‌فرستد."""

    def login(user):
        client.force_login(user)
        return client

    return login


def make_risk(title, unit, **fields):
    values = {
        "description": "شرح",
        "channel": Risk.Channel.INTERVIEW,
        "category": RiskCategory.objects.get(code="T1"),
        "org_unit": unit,
        **fields,
    }
    return Risk.objects.create(title=title, **values)


def make_questionnaire():
    questionnaire = Questionnaire.objects.create(title="شناسایی ریسک عملیات", is_active=True)
    text = Question.objects.create(
        questionnaire=questionnaire, order=1, text="کدام کار متوقف می‌شود؟", kind=Question.Kind.TEXT, is_required=True
    )
    single = Question.objects.create(
        questionnaire=questionnaire, order=2, text="تغییرات تولید چطور تأیید می‌شود؟", kind=Question.Kind.SINGLE
    )
    safe = Option.objects.create(question=single, order=1, text="با فرم CAB")
    risky = Option.objects.create(question=single, order=2, text="بدون تأیید", indicates_risk=True)
    return questionnaire, text, single, safe, risky


def test_an_api_request_without_login_gets_json_not_the_login_page(client):
    response = client.get(reverse("api:my_work"))

    assert response.status_code == 403
    assert response["Content-Type"] == "application/json"
    assert response.json()["login_url"] == reverse("accounts:login")


def test_the_session_has_the_user_menu_and_a_csrf_cookie(api, manager, system_admin):
    data = api(manager).get(reverse("api:session")).json()

    assert data["user"]["name"] == "مریم کاظمی"
    assert "مدیر واحد" in " ".join(data["user"]["roles"])
    titles = [group["title"] for group in data["navigation"]]
    assert "مدیریت سامانه" not in titles
    routes = {item["route"] for group in data["navigation"] for item in group["items"] if item["route"]}
    assert routes == {"/", "/risks", "/questionnaires", "/questionnaires/risk-questions"}
    assert data["csrf_token"]
    assert data["today"]["weekday"]

    admin_titles = [group["title"] for group in api(system_admin).get(reverse("api:session")).json()["navigation"]]
    assert "مدیریت سامانه" in admin_titles


def test_writes_need_the_csrf_token_like_django_forms(client, manager, unit):
    client = client.__class__(enforce_csrf_checks=True)
    client.force_login(manager)
    questionnaire, *_ = make_questionnaire()
    url = reverse("api:response_start", args=[questionnaire.pk])

    assert client.post(url, {"org_unit": unit.pk}, content_type="application/json").status_code == 403

    token = client.get(reverse("api:session")).json()["csrf_token"]
    response = client.post(url, {"org_unit": unit.pk}, content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert response.status_code == 201


def test_a_denied_api_request_is_written_to_the_audit_log(api, unit):
    staff = make_user("staff")
    questionnaire, *_ = make_questionnaire()

    response = api(staff).post(
        reverse("api:response_start", args=[questionnaire.pk]), {"org_unit": unit.pk}, content_type="application/json"
    )

    assert response.status_code == 403
    assert "login_url" not in response.json()
    event = AuditEvent.objects.get(event=AuditEvent.Event.PERMISSION_DENIED)
    assert event.user == staff
    assert event.details["path"] == reverse("api:response_start", args=[questionnaire.pk])
    assert event.details["method"] == "POST"


def test_the_register_lists_only_risks_the_user_sees(api, manager, unit, grc):
    mine = make_risk("قطع درگاه پرداخت", unit)
    other = make_risk("نشت داده", OrgUnit.objects.create(name="مالی"))

    data = api(manager).get(reverse("api:risk_list")).json()
    assert [row["code"] for row in data["results"]] == [mine.code]
    assert data["can_create"] is False
    assert api(manager).get(reverse("api:risk_detail", args=[other.pk])).status_code == 404

    data = api(grc).get(reverse("api:risk_list")).json()
    assert {row["code"] for row in data["results"]} == {mine.code, other.code}
    assert data["can_create"] is True


def test_the_register_uses_the_django_filters(api, grc, unit):
    found = make_risk("قطع درگاه پرداخت", unit, status=Risk.Status.QUESTIONS)
    make_risk("نشت داده", unit)

    data = api(grc).get(reverse("api:risk_list"), {"status": Risk.Status.QUESTIONS}).json()
    assert [row["code"] for row in data["results"]] == [found.code]
    assert data["results"][0]["status"] == {"value": "questions", "label": found.get_status_display()}

    response = api(grc).get(reverse("api:risk_list"), {"status": "nonsense"})
    assert response.status_code == 400
    assert "status" in response.json()["errors"]

    filters = api(grc).get(reverse("api:risk_filters")).json()
    assert {"value": "questions", "label": found.get_status_display()} in filters["status"]["choices"]
    assert filters["unit"]["choices"][0]["value"] == str(unit.pk)


def test_the_risk_detail_has_the_dossier_and_jalali_dates(api, grc, manager, unit):
    risk = make_risk("قطع درگاه پرداخت", unit, status=Risk.Status.QUESTIONS, owner=manager)
    RiskQuestion.objects.create(
        risk=risk, text="آخرین آزمون بازیابی کی بود؟", asked_by=grc, due=datetime.date(2026, 11, 9)
    )

    data = api(grc).get(reverse("api:risk_detail", args=[risk.pk])).json()

    assert data["code"] == risk.code
    assert data["owner"]["name"] == "مریم کاظمی"
    assert data["created_at"]["jalali"] == to_jalali(risk.created_at.date())
    question = data["workflow"]["questions"][0]
    assert question["is_open"] is True
    assert question["due"]["jalali"] == to_jalali(datetime.date(2026, 11, 9))
    assert data["actions"]["classic"] == risk.get_absolute_url()
    assert data["actions"]["edit"] == reverse("risks:risk_update", args=[risk.pk])

    owner_view = api(manager).get(reverse("api:risk_detail", args=[risk.pk])).json()
    assert owner_view["actions"]["edit"] is None


def test_my_work_lists_the_risk_questions_waiting_for_the_unit_manager(api, grc, manager, unit):
    risk = make_risk("قطع درگاه پرداخت", unit, status=Risk.Status.QUESTIONS)
    question = RiskQuestion.objects.create(
        risk=risk, text="آخرین آزمون بازیابی کی بود؟", asked_by=grc, due=datetime.date(2026, 11, 9)
    )

    data = api(manager).get(reverse("api:my_work")).json()

    section = next(section for section in data["sections"] if section["key"] == "questions")
    row = section["items"][0]
    assert row["key"] == f"question-{question.pk}"
    assert row["risk"]["code"] == risk.code
    assert row["route"] == "/questionnaires/risk-questions"
    assert all(section["items"] for section in data["sections"])  # بخش خالی نمی‌آید

    staff = make_user("staff")
    assert api(staff).get(reverse("api:my_work")).json()["sections"] == []


def test_a_unit_manager_answers_a_risk_question(api, grc, manager, unit):
    risk = make_risk("قطع درگاه پرداخت", unit, status=Risk.Status.QUESTIONS)
    question = RiskQuestion.objects.create(
        risk=risk, text="آخرین آزمون بازیابی کی بود؟", asked_by=grc, due=datetime.date(2026, 11, 9)
    )
    client = api(manager)

    listed = client.get(reverse("api:risk_question_list")).json()["questions"]
    assert [row["id"] for row in listed] == [question.pk]

    url = reverse("api:risk_question_answer", args=[question.pk])
    response = client.post(url, {"answer": ""}, content_type="application/json")
    assert response.status_code == 400
    assert "answer" in response.json()["errors"]

    response = client.post(url, {"answer": "مهر ۱۴۰۵، موفق"}, content_type="application/json")
    assert response.status_code == 200
    question.refresh_from_db()
    assert question.answer == "مهر ۱۴۰۵، موفق"
    assert question.answered_by == manager
    assert client.post(url, {"answer": "دوباره"}, content_type="application/json").status_code == 404


def test_a_unit_manager_starts_saves_and_submits_a_response(api, manager, unit):
    questionnaire, text, single, _safe, risky = make_questionnaire()
    client = api(manager)

    home = client.get(reverse("api:answer_home")).json()
    assert home["can_answer"] is True
    assert home["questionnaires"][0]["question_count"] == 2

    start = client.get(reverse("api:response_start", args=[questionnaire.pk])).json()
    assert "respondent" not in start["fields"]  # مدیر واحد فقط به نام خودش جواب می‌دهد
    assert start["fields"]["org_unit"]["choices"] == [{"value": str(unit.pk), "label": "عملیات"}]

    created = client.post(
        reverse("api:response_start", args=[questionnaire.pk]), {"org_unit": unit.pk}, content_type="application/json"
    )
    assert created.status_code == 201
    response = Response.objects.get(pk=created.json()["id"])
    assert (response.respondent, response.recorded_by, response.channel) == (
        manager,
        manager,
        Response.Channel.QUESTIONNAIRE,
    )

    url = reverse("api:response_detail", args=[response.pk])
    payload = {"fixed": {"functions": "تسویه‌ی روزانه"}, "answers": {str(single.pk): risky.pk}}
    saved = client.put(url, payload, content_type="application/json")
    assert saved.status_code == 200
    response.refresh_from_db()
    assert response.functions == "تسویه‌ی روزانه"
    assert response.status == Response.Status.DRAFT

    blocked = client.put(url, {**payload, "submit": True}, content_type="application/json")
    assert blocked.status_code == 400
    assert list(blocked.json()["errors"]) == [f"question_{text.pk}"]
    assert Response.objects.get(pk=response.pk).status == Response.Status.DRAFT

    payload["answers"][str(text.pk)] = "تسویه با بانک‌ها"
    submitted = client.put(url, {**payload, "submit": True}, content_type="application/json")
    assert submitted.status_code == 200
    assert "ریسک در انتظار: 1" in submitted.json()["message"]
    response.refresh_from_db()
    assert response.status == Response.Status.SUBMITTED
    assert response.pending_risks.get().status == PendingRisk.Status.PENDING
    assert submitted.json()["response"]["can_edit"] is False
    assert client.put(url, payload, content_type="application/json").status_code == 403


def test_the_start_form_refuses_a_second_open_response_for_the_same_unit(api, manager, unit):
    questionnaire, *_ = make_questionnaire()
    client = api(manager)
    url = reverse("api:response_start", args=[questionnaire.pk])
    client.post(url, {"org_unit": unit.pk}, content_type="application/json")

    response = client.post(url, {"org_unit": unit.pk}, content_type="application/json")

    assert response.status_code == 400
    assert "پاسخ بازی" in response.json()["errors"]["__all__"][0]


def test_a_submitted_response_keeps_showing_an_option_deactivated_later(api, manager, unit):
    questionnaire, text, single, safe, risky = make_questionnaire()
    client = api(manager)
    created = client.post(
        reverse("api:response_start", args=[questionnaire.pk]), {"org_unit": unit.pk}, content_type="application/json"
    )
    url = reverse("api:response_detail", args=[created.json()["id"]])
    payload = {"answers": {str(text.pk): "تسویه", str(single.pk): risky.pk}}

    Option.objects.filter(pk=safe.pk).update(is_active=False)
    editable = client.get(url).json()
    assert [option["id"] for option in editable["questions"][1]["options"]] == [risky.pk]

    client.put(url, {**payload, "submit": True}, content_type="application/json")
    Option.objects.filter(pk=risky.pk).update(is_active=False)
    submitted = client.get(url).json()
    question = submitted["questions"][1]
    assert question["value"] == risky.pk
    assert [option["id"] for option in question["options"]] == [risky.pk]


def test_another_unit_cannot_see_the_response(api, manager, unit):
    questionnaire, *_ = make_questionnaire()
    created = api(manager).post(
        reverse("api:response_start", args=[questionnaire.pk]), {"org_unit": unit.pk}, content_type="application/json"
    )
    stranger = make_user("stranger", Role.UNIT_MANAGER)
    stranger.managed_units.add(OrgUnit.objects.create(name="مالی"))

    assert api(stranger).get(reverse("api:response_detail", args=[created.json()["id"]])).status_code == 404


def test_the_app_page_serves_the_built_index_for_every_route(client, manager, settings, tmp_path):
    client.force_login(manager)
    settings.SPA_DIST = tmp_path

    missing = client.get(reverse("spa"))
    assert missing.status_code == 503
    assert "npm run build" in missing.content.decode()

    (tmp_path / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    for url in (reverse("spa"), reverse("spa_path", args=["risks/12"])):
        response = client.get(url)
        assert response.status_code == 200
        assert response.content == b'<div id="root"></div>'
        assert response["Cache-Control"] == "no-store"
        assert "csrftoken" in response.cookies


def test_the_app_page_needs_login(client):
    response = client.get(reverse("spa_path", args=["risks"]))

    assert response.status_code == 302
    assert response.url.startswith(reverse("accounts:login"))
