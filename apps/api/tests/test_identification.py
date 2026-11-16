"""«شناسایی ریسک» (فیگما ۱۱): پیش‌نویس جدا از رجیستر، ارسال با پرسش‌های اجباری، ساختن ریسک با مالک واحد،
سناریوی پیوندشده یا «مورد جدید»، و ورودی‌های اخیر."""

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Commitment, Customer
from apps.catalog.tests.factories import make_service, make_user
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
        "target": f"{service.pk}:{commitment.pk}",
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


def test_the_page_offers_units_targets_categories_sources_and_library(client, manager, unit, service, commitment):
    scenario = RiskScenario.objects.create(
        title="اعمال بسته‌ی انتشار نامعتبر",
        event="ر",
        conditions="ش",
        consequence="پ",
        category=RiskCategory.objects.get(code="T2"),
        service=service,
    )
    data = login(client, manager).get(URL).json()

    assert data["can_identify"] is True
    assert data["choices"]["org_unit"] == [
        {"value": str(unit.pk), "label": "پرداخت · حسین نوری", "owner": {"id": manager.pk, "name": "حسین نوری"}}
    ]
    targets = {item["value"]: item for item in data["choices"]["target"]}
    assert targets[str(service.pk)]["label"] == "ساتنا · همه‌ی مشتریان"
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
    library = next(item for item in data["scenarios"] if item["id"] == scenario.pk)
    assert library["code"] == scenario.code and "اعمال بسته‌ی انتشار نامعتبر" in library["text"]
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


def test_only_unit_managers_and_grc_identify_and_only_for_their_units(client, manager, unit, service, commitment):
    viewer = make_user("viewer", Role.VIEWER)
    page = login(client, viewer).get(URL).json()
    assert page["can_identify"] is False and page["choices"] is None
    denied = client.post(URL, {"values": values(unit, service, commitment)}, content_type="application/json")
    assert denied.status_code == 403

    elsewhere = OrgUnit.objects.create(name="تدارکات")
    response = login(client, manager).post(
        URL, {"values": values(elsewhere, service, commitment), "submit": True}, content_type="application/json"
    )
    assert response.status_code == 400 and "org_unit" in response.json()["errors"]


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
