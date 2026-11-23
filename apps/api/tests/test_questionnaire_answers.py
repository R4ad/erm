"""«پاسخ به پرسشنامه‌ها»: مدیر واحد شش پرسش شناسایی را بی انتخاب خدمت پاسخ می‌دهد و ارسالش ریسک نمی‌سازد؛ ورودی
«در حال شناسایی» می‌شود، مدیر دیگر آن را تغییر نمی‌دهد و عضو GRC در «شناسایی ریسک» همه‌ی این ورودی‌ها را می‌بیند،
خدمت را انتخاب و ریسک را ثبت می‌کند. پیش‌نویس شخصی هر کس فقط برای خودش است."""

import json
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_service, make_user
from apps.organization.models import OrgUnit
from apps.risks.models import IdentificationDraft, Risk

pytestmark = pytest.mark.django_db

URL = "/api/questionnaire-answers/"
IDENTIFY = "/api/identification/"


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="پرداخت")


@pytest.fixture
def manager(unit):
    user = make_user("manager", Role.UNIT_MANAGER, first_name="حسین", last_name="نوری")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="نسترن", last_name="امینی")


@pytest.fixture
def service(unit, manager):
    return make_service("SRV-SATNA", org_unit=unit, owner=manager, name="ساتنا")


def login(client, user):
    client.force_login(user)
    return client


def answers(**changes):
    """پاسخ‌های مدیر واحد: بدون خدمت (target)، موضوع آزاد."""
    return {
        "org_unit": "",
        "target": "",
        "mission": "پردازش و تسویه‌ی دستورهای پرداخت",
        "subject": "سامانه‌ی ساتنا در محیط تولید",
        "objective": "پردازش دستورها در پنجره‌ی SLA",
        "conditions": "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
        "customer": "بانک ملت و داتین",
        "event": "اعمال تغییر نامعتبر در تولید",
        "harm": "توقف پردازش حدود ۹۰ دقیقه",
        "impact": "",
        "dependencies": "",
        "evidence": "۲۰ بسته‌ی نامعتبر از ۱۰۰۰ بسته",
        "category": "",
        "tags": [],
        "source": "",
        "scenario": "",
        "evidence_items": [],
        **changes,
    }


def send(client, **fields):
    return client.post(URL, {"values": answers(), "submit": True, **fields}, content_type="application/json")


def identifying(user, unit=None, subject="خدمت نامعلوم", submitted_at=None):
    """ورودی‌ای که مدیر واحد ارسال کرده و منتظر عضو GRC است."""
    return IdentificationDraft.objects.create(
        created_by=user,
        org_unit=unit,
        data=answers(subject=subject),
        status=IdentificationDraft.Status.IDENTIFYING,
        submitted_at=submitted_at or timezone.now(),
    )


def test_the_menu_offers_the_page_to_unit_managers_right_after_my_work(client, manager, grc):
    def desk(user):
        items = login(client, user).get(reverse("api:session")).json()["navigation"]["desk"]["items"]
        return [item["key"] for item in items]

    keys = desk(manager)
    assert keys[:2] == ["actions:my_work", "desk:questionnaire_answers"]
    items = login(client, manager).get(reverse("api:session")).json()["navigation"]["desk"]["items"]
    assert items[1] | {"count": None} == {
        "key": "desk:questionnaire_answers",
        "label": "پاسخ به پرسشنامه‌ها",
        "href": "/app/questionnaire-answers",
        "route": "/questionnaire-answers",
        "count": None,
        "tone": None,
    }
    assert "desk:questionnaire_answers" not in desk(grc)
    assert "desk:questionnaire_answers" not in desk(make_user("admin", Role.SYSTEM_ADMIN))
    # مدیر واحدی که هنوز واحدی ندارد چیزی برای پاسخ ندارد.
    assert "desk:questionnaire_answers" not in desk(make_user("new", Role.UNIT_MANAGER))
    # کاربری که هر دو نقش را دارد هر دو صفحه را می‌بیند.
    both = make_user("both", Role.UNIT_MANAGER, Role.GRC_MEMBER)
    both.managed_units.add(OrgUnit.objects.create(name="تسویه"))
    assert "desk:questionnaire_answers" in desk(both)


def test_the_page_has_the_six_questions_and_no_service_list(client, manager, unit, service):
    data = login(client, manager).get(URL).json()

    assert [part["name"] for part in data["parts"]] == [
        "subject",
        "objective",
        "conditions",
        "customer",
        "event",
        "harm",
    ]
    assert data["choices"]["target"] == []
    assert data["choices"]["org_unit"] == [
        {
            "value": str(unit.pk),
            "name": "پرداخت",
            "owner": {"id": manager.pk, "name": "حسین نوری"},
        }
    ]
    assert (data["can_answer"], data["can_identify"], data["draft"]) == (True, False, None)


def test_only_unit_managers_with_a_unit_answer(client, manager, grc):
    draft = IdentificationDraft.objects.create(created_by=manager, data=answers())
    for user in (grc, make_user("viewer", Role.VIEWER), make_user("new", Role.UNIT_MANAGER)):
        client = login(client, user)
        assert client.get(URL).status_code == 403
        assert send(client).status_code == 403
        assert client.delete(f"{URL}?draft={draft.pk}").status_code == 403
    assert IdentificationDraft.objects.filter(pk=draft.pk).exists() and not Risk.objects.exists()


def test_sending_without_a_service_puts_the_entry_in_identification(client, manager, unit):
    response = send(login(client, manager))

    assert response.status_code == 201, response.json()
    assert response.json()["message"] == "پاسخ‌ها ثبت شد و برای شناسایی به کارشناس ریسک رسید."
    entry = IdentificationDraft.objects.get()
    assert response.json()["entry"] == {"id": entry.pk}
    assert entry.status == IdentificationDraft.Status.IDENTIFYING and entry.submitted_at is not None
    # مدیری که فقط یک واحد دارد برای همان واحد پاسخ می‌دهد.
    assert (entry.org_unit, entry.created_by) == (unit, manager)
    assert not Risk.objects.exists()
    [row] = response.json()["recent"]
    assert row["stage"] == {"value": "identifying", "label": "در حال شناسایی", "tone": "warning"}
    assert (row["service"], row["customer"]) == ("سامانه‌ی ساتنا در محیط تولید", None)
    assert row["owner"] == {"id": manager.pk, "name": "حسین نوری"}
    # پاسخ ارسال‌شده پیوند ویرایش ندارد.
    assert (row["route"], row["href"]) == (None, None)


def test_with_several_units_the_unit_waits_for_the_service(client, manager):
    manager.managed_units.add(OrgUnit.objects.create(name="تسویه"))
    assert send(login(client, manager)).status_code == 201
    assert IdentificationDraft.objects.get().org_unit is None
    row = client.get(URL).json()["recent"][0]
    # مالک تا انتخاب خدمت معلوم نیست؛ همان مدیر پاسخ‌دهنده نشان داده می‌شود.
    assert row["owner"]["id"] == manager.pk


def test_sending_without_a_subject_points_to_the_first_question(client, manager):
    response = send(login(client, manager), values=answers(subject="  "))

    assert response.status_code == 400
    assert response.json()["errors"] == {"subject": ["این پرسش برای ارسال اجباری است."]}
    assert not IdentificationDraft.objects.exists()


def test_a_draft_reopens_on_this_page_and_a_sent_entry_is_locked(client, manager):
    client = login(client, manager)
    saved = client.post(URL, {"values": answers(harm="")}, content_type="application/json")
    assert saved.status_code == 200
    draft_id = saved.json()["draft"]["id"]
    assert saved.json()["draft"]["status"] == {"value": "draft", "label": "پیش‌نویس"}
    row = saved.json()["recent"][0]
    assert (row["stage"]["label"], row["route"]) == ("پیش‌نویس", f"/questionnaire-answers?draft={draft_id}")
    assert client.get(URL, {"draft": draft_id}).json()["values"]["harm"] == ""

    assert send(client, draft=draft_id).status_code == 201
    locked = client.post(
        URL, {"values": answers(event="رویداد دیگر"), "draft": draft_id}, content_type="application/json"
    )
    assert locked.status_code == 403
    assert send(client, draft=draft_id).status_code == 403
    assert client.delete(f"{URL}?draft={draft_id}").status_code == 403
    assert client.get(URL, {"draft": draft_id}).status_code == 404
    entry = IdentificationDraft.objects.get()
    assert entry.data["event"] == "اعمال تغییر نامعتبر در تولید"
    assert entry.status == IdentificationDraft.Status.IDENTIFYING


def test_grc_never_sees_a_managers_personal_draft(client, manager, grc):
    draft = IdentificationDraft.objects.create(created_by=manager, data=answers())
    client = login(client, grc)

    assert client.get(IDENTIFY, {"draft": draft.pk}).status_code == 404
    assert all(row["key"] != f"draft-{draft.pk}" for row in client.get(IDENTIFY).json()["recent"])
    assert client.post(IDENTIFY, {"values": answers(), "draft": draft.pk}, content_type="application/json").status_code == 404
    assert client.delete(f"{IDENTIFY}?draft={draft.pk}").status_code == 404
    # عضو GRC دیگر هم پیش‌نویس شخصی همکارش را نمی‌بیند.
    own = IdentificationDraft.objects.create(created_by=grc, data=answers())
    assert login(client, make_user("grc2", Role.GRC_MEMBER)).get(IDENTIFY, {"draft": own.pk}).status_code == 404


def test_identification_lists_every_identifying_entry_for_grc_and_only_their_own_for_a_manager(
    client, manager, grc, unit
):
    other = make_user("other", Role.UNIT_MANAGER, first_name="مینا", last_name="راد")
    other.managed_units.add(OrgUnit.objects.create(name="تسویه"))
    now = timezone.now()
    mine = [identifying(manager, unit, f"موضوع {index}", submitted_at=now - timedelta(hours=index)) for index in range(4)]
    theirs = [identifying(other, None, f"دیگری {index}", submitted_at=now - timedelta(hours=10 + index)) for index in range(3)]
    IdentificationDraft.objects.create(created_by=grc, data=answers(event="پیش‌نویس عضو GRC"))

    data = login(client, grc).get(IDENTIFY).json()
    rows = data["recent"]
    entries = mine + theirs
    # بیش از سقف ورودی‌های اخیر: هر هفت ورودی، به ترتیب ارسال، بالای جدول.
    assert [row["key"] for row in rows[:7]] == [f"draft-{entry.pk}" for entry in entries]
    assert {row["stage"]["label"] for row in rows[:7]} == {"در حال شناسایی"}
    assert rows[0]["route"] == f"/identification?draft={mine[0].pk}"
    assert (rows[0]["service"], rows[0]["owner"]["name"]) == ("موضوع 0", "حسین نوری")
    assert rows[6]["owner"]["name"] == "مینا راد"
    assert rows[7]["title"] == "پیش‌نویس عضو GRC" and rows[7]["route"].startswith("/identification?draft=")

    data = login(client, manager).get(IDENTIFY).json()
    assert (data["can_identify"], data["can_answer"], data["choices"]) == (False, True, None)
    # ورودی‌های خود مدیر به ترتیب آخرین تغییر؛ ورودی مدیر دیگر و پیش‌نویس عضو GRC نیست.
    assert {row["key"] for row in data["recent"]} == {f"draft-{entry.pk}" for entry in mine}
    assert {row["route"] for row in data["recent"]} == {None}
    assert client.post(IDENTIFY, {"values": answers(), "submit": True}, content_type="application/json").status_code == 403
    assert client.post(IDENTIFY, {"values": answers(), "draft": mine[0].pk}, content_type="application/json").status_code == 403


def test_a_manager_keeps_seeing_every_sent_answer_above_newer_drafts(client, manager, unit):
    now = timezone.now()
    sent = [identifying(manager, unit, f"ارسالی {index}", submitted_at=now - timedelta(days=index)) for index in range(2)]
    for index in range(6):
        IdentificationDraft.objects.create(created_by=manager, data=answers(event=f"پیش‌نویس {index}"))

    rows = login(client, manager).get(URL).json()["recent"]
    # جدول تنها جایی است که مدیر وضعیت پاسخ ارسال‌شده را می‌بیند؛ پیش‌نویس‌های تازه‌تر آن را از سقف بیرون نمی‌برند.
    assert [row["key"] for row in rows[:2]] == [f"draft-{entry.pk}" for entry in sent]
    assert [row["stage"]["label"] for row in rows[2:]] == ["پیش‌نویس"] * 5


def test_each_page_keeps_its_own_drafts_for_a_user_with_both_roles(client, unit):
    dual = make_user("dual", Role.GRC_MEMBER, Role.UNIT_MANAGER, first_name="سارا", last_name="کیانی")
    dual.managed_units.add(unit)
    client = login(client, dual)
    identified = client.post(IDENTIFY, {"values": answers(event="پیش‌نویس شناسایی")}, content_type="application/json")
    answered = client.post(URL, {"values": answers(event="پیش‌نویس پاسخ")}, content_type="application/json")
    identified_id, answered_id = identified.json()["draft"]["id"], answered.json()["draft"]["id"]

    # هر پیش‌نویس از جدول هر دو صفحه به همان صفحه‌ای می‌رود که در آن نوشته شده است.
    for page in (URL, IDENTIFY):
        routes = {row["key"]: row["route"] for row in client.get(page).json()["recent"]}
        assert routes[f"draft-{identified_id}"] == f"/identification?draft={identified_id}"
        assert routes[f"draft-{answered_id}"] == f"/questionnaire-answers?draft={answered_id}"
    # پیش‌نویس با خدمت «شناسایی ریسک» در «پاسخ به پرسشنامه‌ها» باز نمی‌شود تا ارسالش بی‌صدا ورودی در حال شناسایی نشود.
    assert client.get(URL, {"draft": identified_id}).status_code == 404
    assert send(client, draft=identified_id).status_code == 404
    assert client.get(IDENTIFY, {"draft": answered_id}).status_code == 404
    assert client.get(URL, {"draft": answered_id}).status_code == 200


def test_the_grc_queue_does_not_query_per_entry(client, manager, grc, unit, service):
    def entry(index):
        # هر ورودی از مدیر دیگری در واحد دیگری، تا مالک هر ردیف جدا حساب شود.
        responder_unit = OrgUnit.objects.create(name=f"واحد {index}")
        responder = make_user(f"manager{index}", Role.UNIT_MANAGER)
        responder.managed_units.add(responder_unit)
        created = identifying(responder, responder_unit, f"موضوع {index}")
        created.data |= {"target": str(service.pk)}
        created.save()

    def own_draft(index):
        IdentificationDraft.objects.create(created_by=grc, data=answers(event=f"پیش‌نویس {index}"))

    entry(0)
    own_draft(0)
    client = login(client, grc)

    def queries():
        with CaptureQueriesContext(connection) as captured:
            assert client.get(IDENTIFY).status_code == 200
        return len(captured)

    one = queries()
    for index in range(1, 7):
        entry(index)
    for index in range(1, 4):
        own_draft(index)
    # صف سقف ندارد؛ دسته، خدمت، مالک و پیوند ردیف‌ها یک‌جا حساب می‌شوند، نه برای هر ورودی یا پیش‌نویس.
    assert queries() == one


def test_grc_completes_the_entry_into_a_registered_risk_owned_by_the_responding_manager(
    client, manager, grc, unit, service
):
    OrgUnit.objects.create(name="تسویه")
    report = SimpleUploadedFile("گزارش رخداد.txt", "بیست بسته‌ی نامعتبر".encode(), content_type="text/plain")
    sent = login(client, manager).post(
        URL, {"payload": json.dumps({"values": answers(), "submit": True}), "evidence_file": report}
    )
    assert sent.status_code == 201, sent.json()
    entry_id = sent.json()["entry"]["id"]

    client = login(client, grc)
    page = client.get(IDENTIFY, {"draft": entry_id}).json()
    assert page["values"]["subject"] == "سامانه‌ی ساتنا در محیط تولید"
    assert page["draft"]["status"] == {"value": "identifying", "label": "در حال شناسایی"}
    assert [item["name"] for item in page["draft"]["attachments"]] == ["گزارش رخداد.txt"]
    # مالک هر واحد نسبت به مدیر پاسخ‌دهنده سنجیده می‌شود، همان‌طور که سرور ریسک را ثبت می‌کند.
    owners = {item["value"]: item["owner"] for item in page["choices"]["org_unit"]}
    assert owners[str(unit.pk)] == {"id": manager.pk, "name": "حسین نوری"}

    # ذخیره‌ی بی‌خدمت: ورودی در حال شناسایی می‌ماند و واحد و ثبت‌کننده‌اش پاک نمی‌شود.
    saved = client.post(
        IDENTIFY, {"values": page["values"] | {"objective": "SLA پردازش"}, "draft": entry_id}, content_type="application/json"
    )
    assert saved.status_code == 200, saved.json()
    assert saved.json()["message"] == "تغییرها ذخیره شد؛ ورودی همچنان در حال شناسایی است."
    entry = IdentificationDraft.objects.get(pk=entry_id)
    assert (entry.status, entry.created_by, entry.org_unit) == (IdentificationDraft.Status.IDENTIFYING, manager, unit)
    assert entry.data["objective"] == "SLA پردازش"
    assert entry.data["org_unit"] == unit.pk  # داده‌ی پیش‌نویس هم همان واحد ورودی را دارد

    created = client.post(
        IDENTIFY,
        {"values": page["values"] | {"target": str(service.pk)}, "submit": True, "draft": entry_id},
        content_type="application/json",
    )
    assert created.status_code == 201, created.json()
    risk = Risk.objects.get()
    assert risk.status == Risk.Status.REGISTERED and risk.channel == Risk.Channel.IDENTIFICATION
    assert (risk.service, risk.org_unit, risk.owner) == (service, unit, manager)
    assert list(risk.attachments.values_list("original_name", flat=True)) == ["گزارش رخداد.txt"]
    assert not IdentificationDraft.objects.exists()


def test_a_completed_entry_from_another_unit_goes_to_that_units_manager(client, manager, grc):
    second = OrgUnit.objects.create(name="تسویه")
    second_manager = make_user("second", Role.UNIT_MANAGER, first_name="مینا", last_name="راد")
    second_manager.managed_units.add(second)
    settlement = make_service("SRV-SETTLE", org_unit=second, name="تسویه")
    entry = identifying(manager, manager.managed_units.get())

    created = login(client, grc).post(
        IDENTIFY,
        {"values": answers(target=str(settlement.pk)), "submit": True, "draft": entry.pk},
        content_type="application/json",
    )

    assert created.status_code == 201, created.json()
    risk = Risk.objects.get()
    assert (risk.org_unit, risk.owner) == (second, second_manager)


def test_clearing_the_service_of_an_identifying_entry_returns_it_to_the_managers_unit(client, manager, grc, unit):
    settlement = make_service("SRV-SETTLE", org_unit=OrgUnit.objects.create(name="تسویه"), name="تسویه")
    entry = identifying(manager, unit)
    client = login(client, grc)

    def save(target):
        response = client.post(
            IDENTIFY, {"values": answers(target=target), "draft": entry.pk}, content_type="application/json"
        )
        assert response.status_code == 200, response.json()
        entry.refresh_from_db()
        return entry.org_unit

    assert save(str(settlement.pk)) == settlement.org_unit
    # بی خدمت، واحد همان واحد پاسخ مدیر است، نه واحد خدمتی که عضو GRC پیش‌تر انتخاب و بعد برداشته بود.
    assert save("") == unit
    assert entry.data["org_unit"] == unit.pk


def test_grc_does_not_delete_an_identifying_entry(client, manager, grc, unit):
    entry = identifying(manager, unit)
    response = login(client, grc).delete(f"{IDENTIFY}?draft={entry.pk}")
    assert response.status_code == 403
    assert IdentificationDraft.objects.filter(pk=entry.pk).exists()


def test_an_older_draft_keeps_its_service_without_showing_it(client, manager, service):
    draft = IdentificationDraft.objects.create(created_by=manager, data=answers(target=str(service.pk)))
    client = login(client, manager)

    assert client.get(URL, {"draft": draft.pk}).json()["values"]["target"] == ""
    # رابط هرچه بفرستد، خدمت از خود ورودی می‌آید.
    saved = client.post(
        URL, {"values": answers(target="999", harm="دامنه‌ی تازه"), "draft": draft.pk}, content_type="application/json"
    )
    assert saved.status_code == 200, saved.json()
    draft.refresh_from_db()
    assert (draft.data["target"], draft.data["harm"]) == (str(service.pk), "دامنه‌ی تازه")
