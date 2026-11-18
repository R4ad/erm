"""«شناسایی ریسک»: پیش‌نویس جدا از رجیستر (حتی بدون واحد)، ارسال با پرسش‌های اجباری (بی مأموریت و منبع)، انتخاب
خودکار واحد از خدمت پرسش اول، ساختن ریسک با مالک واحد و بدون دسته، فایل شاهد، سناریوی پیوندشده یا «مورد جدید»، و
ورودی‌های اخیر."""

import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Commitment, Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.core.models import Attachment
from apps.organization.models import OrgUnit
from apps.risks.models import Evidence, IdentificationDraft, Risk, RiskCategory, RiskScenario
from apps.workflow.models import RiskQuestion

pytestmark = pytest.mark.django_db

URL = "/api/identification/"


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="پرداخت")


@pytest.fixture
def manager(unit):
    user = make_user("manager", Role.UNIT_MANAGER, first_name="حسین", last_name="نوری")
    user.managed_units.add(unit)
    return user


@pytest.fixture
def service(unit, manager):
    return make_service("SRV-SATNA", org_unit=unit, owner=manager, name="ساتنا")


@pytest.fixture
def commitment(service):
    bank = Customer.objects.create(name="بانک ملت")
    item = Commitment.objects.create(title="SLA پردازش ۹۹٫۵٪", customer=bank)
    item.services.set([service])
    return item


def login(client, user):
    client.force_login(user)
    return client


def values(unit, service, commitment, **changes):
    return {
        "org_unit": str(unit.pk),
        "target": f"{service.pk}:{commitment.pk}" if commitment else str(service.pk),
        "mission": "پردازش و تسویه‌ی دستورهای پرداخت",
        "subject": "ساتنا · محیط تولید",
        "objective": "پردازش دستورها در پنجره‌ی SLA",
        "conditions": "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
        "customer": "بانک ملت و داتین",
        "event": "اعمال تغییر نامعتبر در تولید",
        "harm": "توقف پردازش حدود ۹۰ دقیقه",
        "impact": "جبران SLA",
        "dependencies": "پایپ‌لاین انتشار",
        "evidence": "۲۰ بسته‌ی نامعتبر از ۱۰۰۰ بسته",
        "category": str(RiskCategory.objects.get(code="T2").pk),
        "tags": ["ساخت و انتشار"],
        "source": Risk.Source.CHANGE,
        "scenario": "",
        "evidence_items": [],
        **changes,
    }


def payload(form_values, **fields):
    """بدنه‌ی multipart: مقدارهای فرم در فیلد payload و فایل شاهد کنارش."""
    return json.dumps({"values": form_values, **fields})


def test_the_page_offers_the_six_questions_and_services_with_their_unit(client, manager, unit, service, commitment):
    data = login(client, manager).get(URL).json()

    assert data["can_identify"] is True
    assert data["choices"]["org_unit"] == [
        {"value": str(unit.pk), "label": "پرداخت · حسین نوری", "owner": {"id": manager.pk, "name": "حسین نوری"}}
    ]
    targets = {item["value"]: item for item in data["choices"]["target"]}
    assert targets[str(service.pk)]["label"] == "ساتنا · همه‌ی مشتریان"
    # واحد مالک هر خدمت، تا رابط مالک ریسک را همان‌طور که سرور واحد را انتخاب می‌کند حدس بزند.
    assert targets[str(service.pk)]["unit"] == str(unit.pk)
    sla = targets[f"{service.pk}:{commitment.pk}"]
    assert (sla["label"], sla["customer"], sla["commitment"]) == (
        "ساتنا · بانک ملت · SLA پردازش ۹۹٫۵٪",
        "بانک ملت",
        "SLA پردازش ۹۹٫۵٪",
    )
    assert [item["code"] for item in data["choices"]["category"]][:2] == ["T1", "T2"]
    assert [item["value"] for item in data["choices"]["source"]] == Risk.Source.values
    assert [part["name"] for part in data["parts"]] == [
        "subject",
        "objective",
        "conditions",
        "customer",
        "event",
        "harm",
    ]
    # «سناریوهای مشابه» از صفحه رفته است و کتابخانه دیگر با هر بار باز شدن صفحه خوانده نمی‌شود.
    assert "scenarios" not in data
    assert ".pdf" in data["attachment"]["accept"].split(",") and data["attachment"]["max_size"] > 0
    assert data["values"]["org_unit"] == "" and data["draft"] is None


def test_a_draft_stays_out_of_the_register_until_it_is_submitted(client, manager, unit, service, commitment):
    client = login(client, manager)
    saved = client.post(URL, {"values": values(unit, service, commitment, harm="")}, content_type="application/json")

    assert saved.status_code == 200
    draft = IdentificationDraft.objects.get()
    assert saved.json()["draft"]["id"] == draft.pk and not Risk.objects.exists()
    row = saved.json()["recent"][0]
    assert (row["stage"]["label"], row["code"], row["route"]) == ("پیش‌نویس", None, f"/identification?draft={draft.pk}")
    reopened = client.get(URL, {"draft": draft.pk}).json()
    assert reopened["values"]["event"] == "اعمال تغییر نامعتبر در تولید" and reopened["values"]["harm"] == ""

    blocked = client.post(
        URL, {"values": reopened["values"], "submit": True, "draft": draft.pk}, content_type="application/json"
    )
    assert blocked.status_code == 400
    assert set(blocked.json()["errors"]) == {"harm"}
    assert not Risk.objects.exists()

    other = make_user("other", Role.UNIT_MANAGER)
    assert login(client, other).get(URL, {"draft": draft.pk}).status_code == 404


def test_submitting_registers_the_risk_with_the_unit_owner_and_template(client, manager, unit, service, commitment):
    grc = make_user("grc", Role.GRC_MEMBER)
    evidence = Evidence.objects.create(
        kind=Evidence.Kind.INCIDENT,
        title="گزارش رخداد انتشار",
        summary="خ",
        source="س",
        observed_on="2026-10-01",
        reliability=Evidence.Reliability.HIGH,
        owner=grc,
    )
    client = login(client, grc)
    draft = client.post(URL, {"values": values(unit, service, commitment)}, content_type="application/json").json()

    created = client.post(
        URL,
        {
            "values": values(unit, service, commitment, evidence_items=[str(evidence.pk)]),
            "submit": True,
            "draft": draft["draft"]["id"],
        },
        content_type="application/json",
    )

    assert created.status_code == 201
    risk = Risk.objects.get()
    assert created.json()["redirect"] == f"/risks/{risk.pk}"
    assert risk.status == Risk.Status.REGISTERED
    assert (risk.channel, risk.source) == (Risk.Channel.IDENTIFICATION, Risk.Source.CHANGE)
    assert risk.owner == manager  # عضو GRC ثبت کرد، ولی مالک ریسک مدیر همان واحد است
    assert risk.title == "اعمال تغییر نامعتبر در تولید در ساتنا"
    assert risk.description.startswith("در خدمت یا فرآیند ساتنا · محیط تولید، به علت یا در شرایط ثبت اشتباه")
    assert list(risk.customers.values_list("name", flat=True)) == ["بانک ملت"]
    assert risk.intake["commitment"] == "SLA پردازش ۹۹٫۵٪" and risk.intake["impact"] == "جبران SLA"
    assert list(risk.tags.values_list("name", flat=True)) == ["ساخت و انتشار"]
    assert list(evidence.risks.all()) == [risk]
    assert risk.scenario is None
    assert not IdentificationDraft.objects.exists()


def test_linking_a_library_scenario_keeps_its_snapshot(client, manager, unit, service, commitment):
    scenario = RiskScenario.objects.create(
        title="اعمال بسته‌ی انتشار نامعتبر",
        event="ر",
        conditions="ش",
        consequence="پ",
        category=RiskCategory.objects.get(code="T2"),
        service=service,
    )
    client = login(client, manager)
    client.post(
        URL,
        {"values": values(unit, service, commitment, scenario=str(scenario.pk)), "submit": True},
        content_type="application/json",
    )

    risk = Risk.objects.get()
    assert risk.scenario == scenario and risk.scenario_snapshot["code"] == scenario.code


def test_only_unit_managers_and_grc_identify(client, manager, unit, service, commitment):
    viewer = make_user("viewer", Role.VIEWER)
    page = login(client, viewer).get(URL).json()
    assert page["can_identify"] is False and page["choices"] is None
    denied = client.post(URL, {"values": values(unit, service, commitment)}, content_type="application/json")
    assert denied.status_code == 403


def test_a_manager_with_one_unit_identifies_for_that_unit_whatever_the_service(client, manager, unit):
    """واحد پرسیده نمی‌شود: مدیری که فقط یک واحد دارد همیشه برای همان واحد ثبت می‌کند، حتی اگر خدمت مال واحد دیگری
    باشد، و واحدی که رابط فرستاده (مثلاً از پیش‌نویس قدیمی) نادیده گرفته می‌شود."""
    elsewhere = OrgUnit.objects.create(name="تدارکات")
    other_service = make_service("SRV-PROC", org_unit=elsewhere, name="تدارکات")
    response = login(client, manager).post(
        URL,
        {"values": values(elsewhere, other_service, None, target=str(other_service.pk)), "submit": True},
        content_type="application/json",
    )

    assert response.status_code == 201
    risk = Risk.objects.get()
    assert (risk.org_unit, risk.owner, risk.service) == (unit, manager, other_service)


def test_with_several_units_the_unit_comes_from_the_chosen_service(client, manager, unit):
    second = OrgUnit.objects.create(name="تسویه")
    second_manager = make_user("second", Role.UNIT_MANAGER, first_name="مینا", last_name="راد")
    second_manager.managed_units.add(second)
    manager.managed_units.add(second)
    settlement = make_service("SRV-SETTLE", org_unit=second, name="تسویه")
    response = login(client, manager).post(
        URL,
        {"values": values(unit, settlement, None, target=str(settlement.pk), org_unit=""), "submit": True},
        content_type="application/json",
    )

    assert response.status_code == 201
    risk = Risk.objects.get()
    # ثبت‌کننده مدیر همین واحد هم هست، پس مالک ریسک خود اوست.
    assert (risk.org_unit, risk.owner) == (second, manager)


def test_submitting_points_back_to_the_first_question_when_no_unit_of_the_user_fits(client, manager, unit):
    manager.managed_units.add(OrgUnit.objects.create(name="تسویه"))
    foreign = make_service("SRV-HR", org_unit=OrgUnit.objects.create(name="منابع انسانی"), name="حقوق و دستمزد")
    response = login(client, manager).post(
        URL,
        {"values": values(unit, foreign, None, target=str(foreign.pk)), "submit": True},
        content_type="application/json",
    )

    assert response.status_code == 400
    errors = response.json()["errors"]
    assert list(errors) == ["subject"]
    assert "منابع انسانی" in errors["subject"][0] and "حقوق و دستمزد" in errors["subject"][0]
    assert not Risk.objects.exists()


def test_a_draft_is_saved_even_when_no_unit_can_be_chosen(client, manager, unit):
    manager.managed_units.add(OrgUnit.objects.create(name="تسویه"))
    foreign = make_service("SRV-HR", org_unit=OrgUnit.objects.create(name="منابع انسانی"), name="حقوق و دستمزد")
    client = login(client, manager)

    unknown = client.post(
        URL, {"values": values(unit, foreign, None, target=str(foreign.pk))}, content_type="application/json"
    )
    blank = client.post(URL, {"values": values(unit, foreign, None, target="")}, content_type="application/json")

    assert (unknown.status_code, blank.status_code) == (200, 200)
    assert list(IdentificationDraft.objects.values_list("org_unit", flat=True)) == [None, None]
    row = blank.json()["recent"][0]
    assert row["stage"]["label"] == "پیش‌نویس" and row["owner"] is None


def test_mission_source_and_category_are_not_needed_to_submit(client, manager, unit, service, commitment):
    response = login(client, manager).post(
        URL,
        {"values": values(unit, service, commitment, mission="", source="", category="", tags=[]), "submit": True},
        content_type="application/json",
    )

    assert response.status_code == 201, response.json()
    risk = Risk.objects.get()
    assert risk.category is None and risk.source == ""
    assert risk.intake["mission"] == ""


def test_submitting_without_a_service_asks_for_it_on_the_first_question(client, manager, unit, service, commitment):
    response = login(client, manager).post(
        URL, {"values": values(unit, service, commitment, target=""), "submit": True}, content_type="application/json"
    )

    assert response.status_code == 400
    assert set(response.json()["errors"]) == {"target"}


def test_an_evidence_file_waits_on_the_draft_and_moves_to_the_risk(client, manager, unit, service, commitment):
    client = login(client, manager)
    report = SimpleUploadedFile("گزارش رخداد.txt", "بیست بسته‌ی نامعتبر".encode(), content_type="text/plain")
    saved = client.post(URL, {"payload": payload(values(unit, service, commitment)), "evidence_file": report})

    assert saved.status_code == 200, saved.json()
    draft = IdentificationDraft.objects.get()
    [attached] = saved.json()["draft"]["attachments"]
    assert attached["name"] == "گزارش رخداد.txt" and attached["size"] == report.size
    assert list(draft.attachments.values_list("original_name", flat=True)) == ["گزارش رخداد.txt"]
    reopened = client.get(URL, {"draft": draft.pk}).json()
    assert reopened["draft"]["attachments"] == [attached]

    created = client.post(
        URL,
        {"payload": json.dumps({"values": values(unit, service, commitment), "submit": True, "draft": draft.pk})},
    )

    assert created.status_code == 201, created.json()
    risk = Risk.objects.get()
    assert list(risk.attachments.values_list("original_name", flat=True)) == ["گزارش رخداد.txt"]
    assert not IdentificationDraft.objects.exists()


def test_a_removed_draft_file_does_not_reach_the_risk_and_a_bad_file_is_refused(
    client, manager, unit, service, commitment
):
    client = login(client, manager)
    first = SimpleUploadedFile("اول.txt", b"one", content_type="text/plain")
    saved = client.post(URL, {"payload": payload(values(unit, service, commitment)), "evidence_file": first})
    draft_id = saved.json()["draft"]["id"]
    [attached] = saved.json()["draft"]["attachments"]

    fake = SimpleUploadedFile("نامه.pdf", b"not a pdf at all", content_type="application/pdf")
    refused = client.post(
        URL,
        {"payload": payload(values(unit, service, commitment), draft=draft_id), "evidence_file": fake},
    )
    assert refused.status_code == 400 and list(refused.json()["errors"]) == ["evidence_file"]

    client.post(
        URL,
        {
            "payload": json.dumps(
                {
                    "values": values(unit, service, commitment),
                    "submit": True,
                    "draft": draft_id,
                    "remove_attachments": [attached["id"]],
                }
            )
        },
    )
    risk = Risk.objects.get()
    assert not risk.attachments.exists() and not Attachment.objects.exists()


def test_recent_entries_show_the_identification_stage_and_question_due(client, manager, unit, service):
    risk = Risk.objects.create(
        title="خروج اطلاعات از مسیر پشتیبانی",
        description="ش",
        channel=Risk.Channel.IDENTIFICATION,
        source=Risk.Source.PERIODIC,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit,
        service=service,
        owner=manager,
    )
    Risk.objects.filter(pk=risk.pk).update(status=Risk.Status.QUESTIONS)
    question = RiskQuestion.objects.create(risk=risk, text="کدام نقش‌ها؟", asked_by=manager, due="2026-12-01")

    row = login(client, manager).get(URL).json()["recent"][0]

    assert row["stage"] == {"value": "returned", "label": "بازگشت برای تکمیل", "tone": "warning"}
    assert row["source"] == "ارزیابی دوره‌ای"
    assert row["due"]["iso"] == question.due
    assert row["customer"] == "همه" and row["scenario"] is None
    assert row["href"] == reverse("risks:risk_detail", args=[risk.pk])
