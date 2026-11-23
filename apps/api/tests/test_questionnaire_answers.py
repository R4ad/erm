"""«پاسخ به پرسشنامه‌ها»: ویزارد هشت‌گامی مدیر واحد روی پاسخنامه (apps/api/questionnaire_answers.py و
apps/questionnaires/answers.py)."""

import datetime

import pytest

from apps.accounts.roles import Role
from apps.audit.models import AuditEvent
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.answers import clean_values, submit_errors
from apps.questionnaires.models import PathConsequence, Response, RiskInstance, RiskPath

pytestmark = pytest.mark.django_db

URL = "/api/questionnaire-answers/"
TYPES = ["S", "D", "F", "C", "R"]


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="عملیات زیرساخت")


@pytest.fixture
def manager(unit):
    user = make_user("manager", Role.UNIT_MANAGER, first_name="سارا", last_name="محمدی")
    user.managed_units.add(unit)
    return user


def answered(**changes):
    """پاسخنامه‌ی کامل فریم 30e: سه مسیر، دو رویداد (مسیر ۳ به رویداد مسیر ۲ می‌رسد) و دو پیامد."""
    values = {
        "service": "انتقال وجه ساتنا",
        "objective": "پردازش دستورهای پرداخت در پنجره‌ی SLA",
        "conditions": "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
        "responsibility": "بانک الف و داتین",
        "paths": [
            {"key": "p1", "description": "بسته‌ی انتشار با تنظیمات مقصد اشتباه نصب می‌شود.", "event": "e1"},
            {"key": "p2", "description": "سرویس ساتنا مقصد معتبری پیدا نمی‌کند.", "event": "e2"},
            {"key": "p3", "description": "اپراتور سرویس را دستی متوقف می‌کند.", "event": "e2"},
        ],
        "events": [
            {"key": "e1", "text": "ارسال تراکنش‌های ساتنا به بانک مقصد نادرست"},
            {"key": "e2", "text": "توقف کامل پردازش پیام‌های ساتنا"},
        ],
        "impacts": [
            {"event": "e1", "types": ["F", "R"], "scope": "برگشت دستی حدود ۱٬۲۰۰ تراکنش", "description": "زیان مالی"},
            {"event": "e2", "types": ["S"], "scope": "بیش از ۹۰ دقیقه برای همه‌ی بانک‌ها", "description": "توقف خدمت"},
        ],
    }
    values.update(changes)
    return values


def save(client, values, **body):
    return client.post(URL, {"values": values, **body}, content_type="application/json")


def test_only_a_unit_manager_with_a_unit_answers(client, unit):
    staff = make_user("staff")
    client.force_login(staff)
    assert client.get(URL).status_code == 403
    assert save(client, answered()).status_code == 403
    assert AuditEvent.objects.filter(event=AuditEvent.Event.PERMISSION_DENIED).exists()


def test_page_has_impact_types_from_the_active_method_and_the_unit(client, manager, unit):
    client.force_login(manager)
    data = client.get(URL).json()
    assert [item["value"] for item in data["impact_types"]] == TYPES
    assert data["impact_types"][0]["label"] == "خدمت و تداوم"
    assert data["unit"] == {"id": unit.pk, "name": "عملیات زیرساخت"}
    assert data["units"] == []
    assert data["response"] is None
    assert data["values"]["paths"] == []
    assert data["limits"] == {"text": 1000, "path": 500, "impact": 120, "paths": 20}


def test_saves_a_partial_draft_with_a_code_and_continues_it(client, manager, unit):
    client.force_login(manager)
    first = save(client, answered(paths=[], events=[], impacts=[], responsibility=""), step=3)
    assert first.status_code == 200, first.json()
    payload = first.json()
    assert payload["message"] == "پیش‌نویس ذخیره شد."
    response = Response.objects.get()
    assert response.code.startswith("QR-14") and response.status == Response.Status.DRAFT
    assert response.org_unit == unit and response.respondent == manager and response.wizard_step == 3
    assert payload["response"]["code"] == response.code
    assert payload["recent"][0]["route"] == f"/questionnaire-answers?response={response.pk}"

    again = client.get(URL, {"response": response.pk}).json()
    assert again["values"]["service"] == "انتقال وجه ساتنا"
    assert again["response"]["step"] == 3


def test_paths_events_and_impacts_keep_their_rows_by_key(client, manager):
    client.force_login(manager)
    save(client, answered(), step=7)
    response = Response.objects.get()
    shared = RiskInstance.objects.get(source_key="e2")
    assert list(RiskPath.objects.order_by("number").values_list("source_key", "risk_instance__source_key")) == [
        ("p1", "e1"),
        ("p2", "e2"),
        ("p3", "e2"),
    ]
    assert PathConsequence.objects.get(risk_instance=shared).impact_types == ["S"]
    assert shared.scope == "بیش از ۹۰ دقیقه برای همه‌ی بانک‌ها"

    # مسیر ۳ رویداد خودش را می‌گیرد و مسیر ۱ حذف می‌شود؛ رویداد ۲ همان ردیف می‌ماند و شماره‌ها از نو.
    values = answered()
    values["paths"] = [
        {"key": "p2", "description": "سرویس ساتنا مقصد معتبری پیدا نمی‌کند.", "event": "e2"},
        {"key": "p3", "description": "اپراتور سرویس را دستی متوقف می‌کند.", "event": "e3"},
    ]
    values["events"] = [*values["events"], {"key": "e3", "text": "توقف دستی"}]
    response_save = save(client, values, response=response.pk, step=7)
    assert response_save.status_code == 200, response_save.json()
    assert RiskInstance.objects.get(source_key="e2").pk == shared.pk
    assert list(RiskInstance.objects.order_by("number").values_list("source_key", "number")) == [("e2", 1), ("e3", 2)]
    assert list(RiskPath.objects.order_by("number").values_list("source_key", "number")) == [("p2", 1), ("p3", 2)]
    assert not PathConsequence.objects.filter(risk_instance__source_key="e1").exists()

    reloaded = client.get(URL, {"response": response.pk}).json()["values"]
    assert [event["key"] for event in reloaded["events"]] == ["e2", "e3"]
    assert reloaded["impacts"][0]["types"] == ["S"]


def test_submit_needs_every_answer_and_names_each_field(client, manager):
    client.force_login(manager)
    values = answered(objective="")
    values["paths"][1]["description"] = ""
    values["events"][0]["text"] = ""
    values["impacts"][1]["types"] = []
    reply = save(client, values, submit=True)
    assert reply.status_code == 400
    errors = reply.json()["errors"]
    assert errors == {
        "objective": ["این پرسش را پاسخ دهید."],
        "paths.p2": ["شرح این مسیر تحقق را بنویسید."],
        "paths.p1.event": ["برای این مسیر یک رویداد بنویسید یا از رویدادهای قبلی انتخاب کنید."],
        "impacts.e2.types": ["دست‌کم یک نوع پیامد انتخاب کنید."],
    }
    assert reply.json()["message"] == "۴ پرسش اجباری بی‌پاسخ مانده است؛ پیش از ارسال آن‌ها را کامل کنید."
    assert not Response.objects.exists()


def test_submit_sends_for_review_with_a_three_working_day_deadline(client, manager):
    client.force_login(manager)
    draft = save(client, answered(), step=8).json()["response"]
    reply = save(client, answered(), response=draft["id"], submit=True)
    assert reply.status_code == 200, reply.json()
    response = Response.objects.get()
    assert response.status == Response.Status.SUBMITTED
    assert response.submitted_at and response.review_due > datetime.date.today()
    data = reply.json()
    assert data["message"] == f"پاسخنامه‌ی {response.code} برای کارشناس ریسک فرستاده شد."
    assert data["summary"] == {"paths": 3, "events": 2, "impacts": 2}
    row = data["recent"][0]
    assert row["status"] == {"value": "submitted", "label": "در انتظار بررسی", "tone": "info"}
    assert row["summary"] == {"paths": 3, "events": 2, "impacts": 2}
    assert row["route"] == f"/identification/responses/{response.pk}"
    # ارسال‌شده دیگر ادامه یا ذخیره نمی‌شود.
    assert client.get(URL, {"response": response.pk}).status_code == 404
    assert save(client, answered(), response=response.pk).status_code == 404


def test_another_users_draft_is_not_reachable(client, manager, unit):
    client.force_login(manager)
    draft = save(client, answered()).json()["response"]
    other = make_user("other", Role.UNIT_MANAGER)
    other.managed_units.add(unit)
    client.force_login(other)
    assert client.get(URL, {"response": draft["id"]}).status_code == 404
    assert save(client, answered(), response=draft["id"]).status_code == 404


def test_a_manager_of_two_units_picks_the_unit_of_a_new_response(client, manager):
    second = OrgUnit.objects.create(name="پرداخت الکترونیک")
    manager.managed_units.add(second)
    client.force_login(manager)
    data = client.get(URL).json()
    assert data["unit"] is None and {item["label"] for item in data["units"]} == {"عملیات زیرساخت", "پرداخت الکترونیک"}
    assert save(client, answered()).json()["errors"] == {"org_unit": ["واحد را انتخاب کنید."]}
    outside = OrgUnit.objects.create(name="بیرون")
    assert save(client, answered(), org_unit=outside.pk).status_code == 400
    assert save(client, answered(), org_unit=second.pk).status_code == 200
    assert Response.objects.get().org_unit == second


def test_clean_values_drops_bad_keys_unused_events_and_unknown_types():
    values, errors = clean_values(
        {
            "service": "  خدمت  ",
            "paths": [
                {"key": "p1", "description": "x" * 501, "event": "e1"},
                {"key": "p1", "description": "تکراری", "event": "e1"},
                {"key": "bad key!", "description": "نادرست"},
                {"key": "p2", "description": "بی رویداد"},
            ],
            "events": [{"key": "e1", "text": "رویداد"}, {"key": "e9", "text": "بی مسیر"}],
            "impacts": [{"event": "e1", "types": ["Z", "S"], "description": "y" * 121}, {"event": "e9"}],
        },
        TYPES,
    )
    assert values["service"] == "خدمت"
    assert [path["key"] for path in values["paths"]] == ["p1", "p2"]
    assert values["paths"][1]["event"] == "p2-event"
    assert [event["key"] for event in values["events"]] == ["e1", "p2-event"]
    assert values["impacts"][0]["types"] == ["S"]
    assert errors == {"paths.p1": ["حداکثر ۵۰۰ نویسه."], "impacts.e1.description": ["حداکثر ۱۲۰ نویسه."]}


def test_paths_beyond_the_limit_are_ignored():
    paths = [{"key": f"p{number}", "description": "مسیر"} for number in range(25)]
    values, errors = clean_values({"paths": paths}, TYPES)
    assert len(values["paths"]) == 20 and errors == {}


def test_submit_errors_ask_for_at_least_one_path():
    values, _ = clean_values(answered(paths=[], events=[], impacts=[]), TYPES)
    assert submit_errors(values) == {"paths": ["دست‌کم یک مسیر تحقق اضافه کنید."]}
