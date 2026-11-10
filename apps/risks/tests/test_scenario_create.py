import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Service
from apps.catalog.tests.factories import make_service, make_user
from apps.organization.models import OrgUnit
from apps.risks.models import RiskCategory, RiskScenario

pytestmark = pytest.mark.django_db


@pytest.fixture
def data():
    return {
        "conditions": "خرابی سوئیچ",
        "event": "قطع شبکه",
        "objective": "ارائه خدمت پرداخت",
        "customer_text": "بانک الف",
        "consequence": "توقف تراکنش‌ها در شعب",
        "category": RiskCategory.objects.get(code="T1").pk,
    }


def expected(name):
    return (
        f"در خدمت یا فرآیند {name}، به علت یا در شرایط خرابی سوئیچ، ممکن است قطع شبکه رخ دهد "
        "و انجام ارائه خدمت پرداخت برای بانک الف را مختل کند. پیامد قابل مشاهده آن توقف تراکنش‌ها در شعب است."
    )


def test_create_with_existing_service_generates_and_preserves_full_scenario(
    client, data
):
    service = make_service("SRV-SC")
    user = make_user("scenario_grc", Role.GRC_MEMBER)
    client.force_login(user)
    result = client.post(
        reverse("risks:scenario_create"), {**data, "service": service.pk}
    )
    assert result.status_code == 302
    scenario = RiskScenario.objects.get(service=service)
    assert scenario.narrative == expected(service.name)
    assert scenario.title == "قطع شبکه"
    assert scenario.history.first().history_user == user
    assert (
        expected(service.name)
        in client.get(scenario.get_absolute_url()).content.decode()
    )
    service.name = "نام تغییر یافته"
    service.save()
    scenario.refresh_from_db()
    assert scenario.narrative == expected(scenario.service_name_snapshot)
    result = client.post(reverse("risks:scenario_update", args=[scenario.pk]), {
        "title": scenario.title, "event": "قطع سراسری", "conditions": scenario.conditions,
        "consequence": scenario.consequence, "category": scenario.category_id, "is_active": "on",
    })
    assert result.status_code == 302
    scenario.refresh_from_db()
    assert "ممکن است قطع سراسری رخ دهد" in scenario.narrative


def test_create_new_service_validates_and_saves_atomically(client, data):
    user = make_user("scenario_admin", Role.GRC_MEMBER)
    unit = OrgUnit.objects.create(name="واحد سناریو")
    client.force_login(user)
    extra = {
        "new_service": "on",
        "new_service_code": "SRV-NEW",
        "new_service_name": "خدمت نو",
        "new_service_kind": Service.Kind.SERVICE,
        "new_service_org_unit": unit.pk,
        "new_service_owner": user.pk,
        "new_service_lifecycle_stage": Service.LifecycleStage.OPERATION,
        "new_service_environment": Service.Environment.DATIN,
    }
    url = reverse("risks:scenario_create")
    invalid = client.post(url, {**data, **extra, "event": ""})
    assert invalid.status_code == 200
    assert not Service.objects.filter(code="SRV-NEW").exists()
    result = client.post(url, {**data, **extra})
    assert result.status_code == 302, (
        result.context["form"].errors if result.status_code == 200 else result.content
    )
    service = Service.objects.get(code="SRV-NEW")
    assert RiskScenario.objects.get(service=service).narrative == expected("خدمت نو")
    assert service.history.first().history_user == user


def test_missing_or_inactive_service_is_rejected(client, data):
    user = make_user("scenario_editor", Role.GRC_MEMBER)
    client.force_login(user)
    service = make_service("SRV-OFF", is_active=False)
    url = reverse("risks:scenario_create")
    for values in (data, {**data, "service": service.pk}):
        result = client.post(url, values)
        assert result.status_code == 200
        assert "service" in result.context["form"].errors
    assert not RiskScenario.objects.exists()


def test_bridge_creates_scenario_from_entered_values(client, data):
    service = make_service("SRV-BRIDGE")
    user = make_user("scenario_bridge", Role.GRC_MEMBER)
    client.force_login(user)
    url = reverse("api:form_bridge")
    path = reverse("risks:scenario_create")
    page = client.get(url, {"path": path})
    assert page.status_code == 200
    names = {field["name"] for field in page.json()["form"]["fields"]}
    assert {
        "service",
        "new_service",
        "conditions",
        "event",
        "objective",
        "customer_text",
        "consequence",
    } <= names
    result = client.post(
        f"{url}?path={path}",
        {"values": {**data, "service": service.pk}},
        content_type="application/json",
    )
    assert result.status_code == 200, result.content
    assert RiskScenario.objects.get(service=service).narrative == expected(service.name)
