"""API رابط React باید همان قاعده‌های صفحه‌های جنگو را داشته باشد: همان دیدن، همان فرم‌ها و همان کارها."""

import datetime

import pytest
from django.test import Client
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Assessment
from apps.assessments.services import create_assessment
from apps.audit.models import AuditEvent
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.core.jalali import to_jalali
from apps.methodology.models import MethodVersion
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
    assert response.json()["login_url"] == "/app/login/"


def test_the_session_has_the_user_menu_and_a_csrf_cookie(api, manager, system_admin):
    data = api(manager).get(reverse("api:session")).json()

    assert data["user"]["name"] == "مریم کاظمی"
    assert "مدیر واحد" in " ".join(data["user"]["roles"])
    # منوی فیگما: «میز کار» و سه ماژول یک چرخه با گام‌های شماره‌دار.
    nav = data["navigation"]
    assert nav["desk"]["title"] == "میز کار"
    assert [module["key"] for module in nav["modules"]] == ["assessment", "treatment", "config"]
    links = nav["desk"]["items"] + [item for module in nav["modules"] for item in module["items"]]
    routes = {item["route"] for item in links if item["route"]}
    assert {"/", "/risks", "/actions/notices", "/identification", "/analysis", "/evaluation"} <= routes
    assert {"/treatment/required", "/treatment/board", "/treatment/targets", "/units", "/method"} <= routes
    notices = next(item for item in links if item["key"] == "actions:notices")
    assert notices["tone"] == "gold" and notices["count"] is None  # بدون اعلان نخوانده شمارنده نمی‌آید
    keys = [item["key"] for item in links]
    assert "risks:risk_list" in keys and len(keys) == len(set(keys))
    assert "accounts:user_list" not in keys  # «تعریف کاربر و نقش» فقط برای مدیر سامانه
    assert data["cycle"]["year"] >= 1405 and data["cycle"]["assessed"] <= data["cycle"]["total"]
    assert data["logout_url"] == reverse("api:logout")
    assert data["csrf_token"]
    assert data["today"]["weekday"]

    admin_nav = api(system_admin).get(reverse("api:session")).json()["navigation"]
    assert "accounts:user_list" in [item["key"] for item in admin_nav["modules"][2]["items"]]


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


def test_my_work_puts_every_task_in_one_queue_with_kpis(api, grc, manager, unit):
    risk = make_risk("قطع درگاه پرداخت", unit, status=Risk.Status.QUESTIONS)
    RiskQuestion.objects.create(risk=risk, text="آخرین آزمون بازیابی کی بود؟", asked_by=grc, due=datetime.date(2026, 11, 9))

    data = api(manager).get(reverse("api:my_work")).json()

    [task] = data["tasks"]
    assert task["category"] == "questions"
    assert task["code"] == risk.code
    assert task["cta"] == "پاسخ"
    assert task["route"] == "/questionnaires/risk-questions"
    assert {row["key"]: row["count"] for row in data["categories"]} == {
        "actions": 0, "signoff": 0, "assessments": 0, "questions": 1, "acceptances": 0,
    }
    assert data["kpis"]["waiting"]["count"] == 1
    assert data["kpis"]["to_verify"]["count"] == 0
    assert data["plans"] == [] and data["acceptances"] == []

    empty = api(make_user("staff")).get(reverse("api:my_work")).json()
    assert empty["tasks"] == [] and empty["kpis"]["waiting"]["note"] == "کاری منتظر شما نیست"


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
    assert next(item for item in home["questionnaires"] if item["id"] != questionnaire.pk)["question_count"] == 9

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


def test_the_app_page_opens_without_login_and_locks_down_scripts(client, settings, tmp_path):
    # صفحه فقط پوسته‌ی React است و صفحه‌ی ورود هم در آن است؛ داده‌ها را API فقط به کاربر واردشده می‌دهد.
    settings.SPA_DIST = tmp_path
    (tmp_path / "index.html").write_text('<script nonce="__CSP_NONCE__" src="/a.js"></script>', encoding="utf-8")

    response = client.get(reverse("spa_path", args=["login/"]))
    again = client.get(reverse("spa_path", args=["login/"]))

    assert response.status_code == 200
    policy = response["Content-Security-Policy"]
    nonce = response.content.decode().split('nonce="')[1].split('"')[0]
    assert nonce != "__CSP_NONCE__" and len(nonce) >= 20
    assert f"script-src 'self' 'nonce-{nonce}'" in policy
    assert nonce not in again["Content-Security-Policy"]  # هر بار nonce تازه
    assert "frame-ancestors 'none'" in policy
    assert "require-trusted-types-for 'script'" in policy
    assert client.get(reverse("api:my_work")).status_code == 403


def csrf_client():
    """کلاینتی که مثل مرورگر توکن CSRF را چک می‌کند؛ کلاینت عادی تست این چک را خاموش دارد."""
    client = Client(enforce_csrf_checks=True)
    token = client.get(reverse("api:csrf")).json()["csrf_token"]
    return client, token


def post_json(client, url, data, token=None):
    headers = {"HTTP_X_CSRFTOKEN": token} if token else {}
    return client.post(url, data, content_type="application/json", **headers)


def test_the_csrf_endpoint_sets_the_cookie_and_says_who_is_logged_in(client, manager):
    response = client.get(reverse("api:csrf"))
    assert response.status_code == 200
    assert response.json()["authenticated"] is False
    assert "csrftoken" in response.cookies

    client.force_login(manager)
    assert client.get(reverse("api:csrf")).json()["authenticated"] is True


def test_login_needs_the_csrf_token_even_before_login(manager):
    manager.set_password("pass-1405-safe")
    manager.save()
    client, token = csrf_client()
    data = {"username": "manager", "password": "pass-1405-safe"}

    assert post_json(client, reverse("api:login"), data).status_code == 403
    assert client.get(reverse("api:csrf")).json()["authenticated"] is False

    assert post_json(client, reverse("api:login"), data, token).status_code == 200
    assert client.get(reverse("api:csrf")).json()["authenticated"] is True


def test_a_wrong_password_is_refused_and_written_to_the_audit_log(manager):
    client, token = csrf_client()

    response = post_json(client, reverse("api:login"), {"username": "manager", "password": "guess"}, token)

    assert response.status_code == 400
    assert response.json()["message"]
    assert "__all__" in response.json()["errors"]
    event = AuditEvent.objects.get(event=AuditEvent.Event.LOGIN_FAILED)
    assert (event.user, event.username) == (None, "manager")
    assert "guess" not in str(event.details)


def test_login_sends_the_user_on_only_to_this_site(manager):
    manager.set_password("pass-1405-safe")
    manager.save()
    cases = {
        "/risks/?status=questions": "/risks/?status=questions",
        "/app/risks/12": "/app/risks/12",
        "https://evil.example/app/": "/app/",
        "//evil.example/": "/app/",
        "javascript:alert(1)": "/app/",
        "": "/app/",
    }
    for asked, expected in cases.items():
        client, token = csrf_client()
        data = {"username": "manager", "password": "pass-1405-safe", "next": asked}
        response = post_json(client, reverse("api:login"), data, token)
        assert response.json()["next"] == expected, asked

    login = AuditEvent.objects.filter(event=AuditEvent.Event.LOGIN, user=manager)
    assert login.count() == len(cases)


def test_logout_needs_the_csrf_token_and_ends_the_session(manager):
    manager.set_password("pass-1405-safe")
    manager.save()
    client, token = csrf_client()
    post_json(client, reverse("api:login"), {"username": "manager", "password": "pass-1405-safe"}, token)
    token = client.cookies["csrftoken"].value  # ورود توکن را عوض می‌کند

    assert post_json(client, reverse("api:logout"), {}).status_code == 403
    response = post_json(client, reverse("api:logout"), {}, token)

    assert response.status_code == 200
    assert response.json()["login_url"] == "/app/login/"
    assert client.get(reverse("api:csrf")).json()["authenticated"] is False
    assert AuditEvent.objects.filter(event=AuditEvent.Event.LOGOUT, user=manager).exists()


def test_the_django_login_page_hands_over_to_the_new_login_once_it_is_built(client, settings, tmp_path):
    settings.SPA_DIST = tmp_path
    url = reverse("accounts:login")

    # تا npm run build اجرا نشده، همان فرم جنگو.
    assert client.get(url).status_code == 200

    (tmp_path / "index.html").write_text('<div id="root"></div>', encoding="utf-8")
    response = client.get(url, {"next": "/risks/?status=questions"})
    assert response.status_code == 302
    assert response.url == "/app/login/?next=%2Frisks%2F%3Fstatus%3Dquestions"
    assert client.get(url).url == "/app/login/"

    # راه برگشت اگر رابط تازه مشکلی داشت.
    classic = client.get(url, {"classic": "1"})
    assert classic.status_code == 200
    assert b"csrfmiddlewaretoken" in classic.content


def level(name):
    return MethodVersion.objects.get(number=1).risk_levels.get(name=name)


def approve(risk, user, level_name):
    status = risk.status
    risk.status = Risk.Status.ASSESSMENT
    risk.save()
    assessment = create_assessment(risk, user, "current", horizon_months=12)
    risk.status = status
    risk.save()
    Assessment.objects.filter(pk=assessment.pk).update(
        status=Assessment.Status.APPROVED, decision_level=level(level_name), approved_at=timezone.now()
    )


def test_the_register_sorts_by_code_and_by_current_level(api, grc, unit):
    low = make_risk("قطع درگاه پرداخت", unit)
    unrated = make_risk("نشت داده", unit)
    critical = make_risk("از کار افتادن مرکز داده", unit)
    approve(low, grc, "پایین")
    approve(critical, grc, "بحرانی")

    def codes(ordering):
        data = api(grc).get(reverse("api:risk_list"), {"ordering": ordering}).json()
        return [row["code"] for row in data["results"]], data["ordering"]

    assert codes("level") == ([critical.code, low.code, unrated.code], "level")
    assert codes("-level") == ([low.code, critical.code, unrated.code], "-level")
    assert codes("code") == (sorted([low.code, unrated.code, critical.code]), "code")
    assert codes("nonsense") == ([critical.code, unrated.code, low.code], "newest")


def test_the_register_shows_active_risks_with_pipeline_and_tab_counts(api, grc, unit):
    owner = make_user("owner", first_name="رضا", last_name="مالکی")
    mine = make_risk("قطع درگاه پرداخت", unit, owner=grc)
    planning = make_risk("نشت داده", unit, owner=owner, status=Risk.Status.TREATMENT_PLAN)
    # عامل آغازگر و مسیر تحقق نوشته نشده، پس هر سه ریسک فعال «نیازمند تکمیل»اند.
    incomplete = make_risk("ریسک بی‌مالک فعال", unit, owner=make_user("gone", is_active=False))
    closed = make_risk("ریسک بسته", unit, status=Risk.Status.CLOSED)
    make_risk("ریسک ردشده", unit, status=Risk.Status.REJECTED)

    data = api(grc).get(reverse("api:risk_list")).json()
    assert {row["code"] for row in data["results"]} == {mine.code, planning.code, incomplete.code}
    assert data["active"] == 3
    assert data["closed"] == 2
    assert data["tabs"] == {
        "all": 3, "mine": 1, "assessment": 0, "treatment_plan": 1, "incomplete": 3, "unowned": 1,
    }
    pipeline = {step["status"]: step["count"] for step in data["pipeline"]}
    assert pipeline["registered"] == 2
    assert pipeline["closed"] == 1
    assert data["can_send_to_assessment"] is True

    rows = {row["code"]: row for row in data["results"]}
    assert rows[incomplete.code]["owner"] is None
    assert rows[incomplete.code]["next_action"]["label"] == "بدون مالک فعال"
    assert rows[planning.code]["next_action"]["label"] == "نوشتن طرح مواجهه"
    assert rows[planning.code]["next_action"]["tone"] == "danger"
    assert rows[mine.code]["next_action"]["label"] == "تکمیل اطلاعات ریسک"
    assert rows[mine.code]["scenario"] is None

    data = api(grc).get(reverse("api:risk_list"), {"status": Risk.Status.CLOSED}).json()
    assert [row["code"] for row in data["results"]] == [closed.code]
    assert data["results"][0]["next_action"] is None


def test_the_register_filters_by_level_owner_and_several_categories(api, grc, unit):
    t2 = RiskCategory.objects.exclude(code="T1").order_by("code").first()
    rated = make_risk("قطع درگاه پرداخت", unit, owner=grc)
    other = make_risk("نشت داده", unit, owner=grc, category=t2)
    orphan = make_risk("ریسک بی‌مالک", unit)
    approve(rated, grc, "بحرانی")

    def codes(params):
        response = api(grc).get(reverse("api:risk_list"), params)
        assert response.status_code == 200, response.json()
        return {row["code"] for row in response.json()["results"]}

    critical = str(level("بحرانی").rank)
    assert codes({"level": critical}) == {rated.code}
    assert codes({"level": "none"}) == {other.code, orphan.code}
    assert codes({"owner": "none"}) == {orphan.code}
    assert codes({"owner": str(grc.pk)}) == {rated.code, other.code}
    t1 = RiskCategory.objects.get(code="T1")
    assert codes({"category": [str(t2.pk)]}) == {other.code}
    assert codes({"category": [str(t1.pk), str(t2.pk)]}) == {rated.code, other.code, orphan.code}

    filters = api(grc).get(reverse("api:risk_filters")).json()
    assert {"value": critical, "label": level("بحرانی").name} in filters["level"]["choices"]
    assert filters["owner"]["choices"][0]["value"] in ("", "none")
    assert len(filters["category"]["choices"]) == RiskCategory.objects.count()


def test_the_register_exports_the_filtered_or_selected_risks(api, grc, unit):
    first = make_risk("قطع درگاه پرداخت", unit)
    make_risk("نشت داده", unit)

    response = api(grc).get(reverse("api:risk_export"))
    assert response.status_code == 200
    assert response["Content-Disposition"] == 'attachment; filename="risk-register.xlsx"'
    assert response.content[:2] == b"PK"

    from io import BytesIO

    from openpyxl import load_workbook

    selected = api(grc).get(reverse("api:risk_export"), {"ids": [str(first.pk)]})
    sheet = load_workbook(BytesIO(selected.content)).active
    assert sheet.sheet_view.rightToLeft is True
    assert [row[0].value for row in sheet.iter_rows(min_row=2)] == [first.code]


def test_the_register_sends_selected_risks_to_assessment(api, grc, unit, manager):
    owner = make_user("owner")
    service = make_service("SRV-1", org_unit=unit)
    ready = make_risk("قطع درگاه پرداخت", unit, owner=owner, service=service)
    ready.customers.add(Customer.objects.create(name="بانک ملت"))
    missing = make_risk("نشت داده", unit)
    wrong = make_risk("ریسک در ارزیابی", unit, status=Risk.Status.ASSESSMENT)
    url = reverse("api:risk_bulk_transition")

    response = api(grc).post(
        url,
        {"transition": "send_to_assessment", "ids": [ready.pk, missing.pk, wrong.pk], "reason": "فرض قابل آزمون"},
        content_type="application/json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["done"] == [ready.code]
    failed = {row["code"]: row["problems"] for row in data["failed"]}
    assert set(failed) == {missing.code, wrong.code}
    assert "خدمت ریسک تعیین نشده است." in failed[missing.code]
    ready.refresh_from_db()
    assert ready.status == Risk.Status.ASSESSMENT

    rejected = api(grc).post(url, {"transition": "reject", "ids": [wrong.pk]}, content_type="application/json")
    assert rejected.status_code == 400

    # مدیر واحد این انتقال را ندارد؛ همه‌ی ریسک‌ها با دلیل برمی‌گردند و چیزی تغییر نمی‌کند.
    assert api(manager).get(reverse("api:risk_list")).json()["can_send_to_assessment"] is False
    data = api(manager).post(
        url, {"transition": "send_to_assessment", "ids": [missing.pk]}, content_type="application/json"
    ).json()
    assert data["done"] == []
