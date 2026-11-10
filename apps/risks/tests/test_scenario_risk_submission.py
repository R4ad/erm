import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.controls.models import Control
from apps.risks.models import Risk, RiskCategory, RiskScenario

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup():
    user = make_user("scenario_risk_grc", Role.GRC_MEMBER)
    service = make_service("SRV-SUB")
    scenario = RiskScenario.objects.create(
        service=service,
        service_name_snapshot=service.name,
        title="قطعی",
        event="قطع شبکه",
        conditions="خرابی",
        objective="تراکنش",
        customer_text="بانک الف",
        consequence="وقفه",
        category=RiskCategory.objects.get(code="T1"),
        narrative="متن کامل سناریو در زمان ثبت",
    )
    return user, service, scenario


def url(scenario):
    return f"{reverse('risks:risk_create')}?scenario={scenario.pk}"


def test_form_shows_scenario_and_only_requested_fields(client, setup):
    user, service, scenario = setup
    client.force_login(user)
    result = client.get(url(scenario))
    assert result.status_code == 200
    assert "متن کامل سناریو در زمان ثبت" in result.content.decode()
    form = result.context["form"]
    assert set(form.fields) == {
        "scenario",
        "service",
        "initiator",
        "realization_path",
        "channel",
        "org_unit",
        "customers",
        "owner",
        "category",
        "tag_names",
        "controls",
        "additional_notes",
    }
    assert form.fields["service"].disabled and form.fields["scenario"].disabled
    assert form["service"].value() == service.pk
    page = client.get(reverse("api:form_bridge"), {"path": url(scenario)})
    assert page.status_code == 200
    assert any(
        row["value"] == "متن کامل سناریو در زمان ثبت"
        for row in page.json()["facts"]["rows"]
    )


def test_submit_pins_scenario_service_and_preserves_all_values(client, setup):
    user, service, scenario = setup
    other = make_service("SRV-OTHER")
    bank = Customer.objects.create(name="بانک آزمون")
    control = Control.objects.create(
        title="کنترل",
        objective="پیشگیری",
        kind=Control.Kind.PREVENTIVE,
        owner=user,
        operated_by="datin",
    )
    client.force_login(user)
    data = {
        "scenario": "99999",
        "service": other.pk,
        "initiator": "خطای تنظیم",
        "realization_path": "قطع سوئیچ و اتصال",
        "channel": Risk.Channel.INTERVIEW,
        "org_unit": service.org_unit_id,
        "customers": [bank.pk],
        "owner": user.pk,
        "category": scenario.category_id,
        "tag_names": "شبکه، اختلال",
        "controls": [control.pk],
        "additional_notes": "توضیح بیشتر",
    }
    result = client.post(url(scenario), data)
    assert result.status_code == 302, (
        result.context["form"].errors if result.status_code == 200 else result.content
    )
    risk = Risk.objects.get()
    assert risk.service == service and risk.scenario == scenario
    assert risk.status == Risk.Status.SUBMITTED and not risk.needs_completion
    assert (
        risk.initiator == "خطای تنظیم" and risk.realization_path == "قطع سوئیچ و اتصال"
    )
    assert risk.additional_notes == "توضیح بیشتر"
    assert list(risk.customers.all()) == [bank] and list(risk.controls.all()) == [
        control
    ]
    assert set(risk.tags.values_list("name", flat=True)) == {"شبکه", "اختلال"}
    assert risk.description == "متن کامل سناریو در زمان ثبت"
    assert risk.scenario_snapshot["conditions"] == "خرابی"
    assert risk.scenario_version == scenario.version
    scenario.conditions = "تغییر بعدی"
    scenario.save()
    risk.refresh_from_db()
    assert risk.scenario_snapshot["conditions"] == "خرابی"
    page = client.get(reverse("api:risk_detail", args=[risk.pk])).json()
    assert (
        page["realization_path"] == risk.realization_path
        and page["additional_notes"] == risk.additional_notes
    )
    rows = client.get(reverse("api:risk_list")).json()["results"]
    assert any(
        row["id"] == risk.pk and row["status"]["value"] == "submitted" for row in rows
    )
    edit = client.get(reverse("risks:risk_update", args=[risk.pk]))
    assert "description" not in edit.context["form"].fields


def test_missing_path_and_direct_registration_are_rejected(client, setup):
    user, service, scenario = setup
    client.force_login(user)
    result = client.post(
        url(scenario), {"initiator": "خرابی", "channel": Risk.Channel.INTERVIEW}
    )
    assert (
        result.status_code == 200
        and "realization_path" in result.context["form"].errors
    )
    assert client.get(reverse("risks:risk_create")).url == reverse(
        "risks:scenario_list"
    )
    assert not Risk.objects.exists()


def test_scenario_without_service_cannot_create_risk(client, setup):
    user, _, scenario = setup
    scenario.service = None
    scenario.save()
    client.force_login(user)
    result = client.get(url(scenario), follow=True)
    assert "خدمت فعال ندارد" in result.content.decode()
    assert not Risk.objects.exists()


def test_bridge_submits_from_selected_scenario(client, setup):
    from urllib.parse import urlencode

    user, service, scenario = setup
    client.force_login(user)
    endpoint = reverse("api:form_bridge") + "?" + urlencode({"path": url(scenario)})
    result = client.post(
        endpoint,
        {
            "values": {
                "initiator": "قطع برق",
                "realization_path": "توقف تجهیزات",
                "channel": "interview",
                "tag_names": "",
                "customers": [],
                "controls": [],
                "additional_notes": "اختیاری",
            }
        },
        content_type="application/json",
    )
    assert result.status_code == 200, result.content
    risk = Risk.objects.get()
    assert risk.status == Risk.Status.SUBMITTED and risk.service_id == service.pk
    assert result.json()["redirect"]["href"] == risk.get_absolute_url()
