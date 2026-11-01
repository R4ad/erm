import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Customer, Service
from apps.organization.models import OrgUnit

from .factories import make_service, make_user


@pytest.fixture
def grc(db):
    return make_user("grc", Role.GRC_MEMBER)


def service_data(unit, owner, **changes):
    data = {
        "code": "SRV-10",
        "name": "پرداخت",
        "kind": Service.Kind.SERVICE,
        "description": "",
        "org_unit": unit.pk,
        "owner": owner.pk,
        "lifecycle_stage": Service.LifecycleStage.OPERATION,
        "environment": Service.Environment.SHARED,
        "is_active": "on",
    }
    return data | changes


@pytest.mark.django_db
def test_unit_manager_sees_only_own_services_in_list_and_detail(client):
    mine = make_service("SRV-1")
    other = make_service("SRV-2")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit)
    client.force_login(manager)

    response = client.get(reverse("catalog:service_list"))

    assert list(response.context["services"]) == [mine]
    assert client.get(mine.get_absolute_url()).status_code == 200
    assert client.get(other.get_absolute_url()).status_code == 404


@pytest.mark.django_db
def test_only_grc_and_system_admin_open_the_forms(client, grc, system_admin):
    service = make_service("SRV-1")
    customer = Customer.objects.create(name="بانک ملت")
    pages = [
        reverse("catalog:service_create"),
        reverse("catalog:service_update", args=[service.pk]),
        reverse("catalog:customer_create"),
        reverse("catalog:customer_update", args=[customer.pk]),
    ]

    for user, status in [(make_user("viewer", Role.VIEWER), 403), (grc, 200), (system_admin, 200)]:
        client.force_login(user)
        assert [client.get(page).status_code for page in pages] == [status] * 4


@pytest.mark.django_db
def test_new_service_is_saved_with_who_created_it_and_opens_its_page(client, grc):
    unit = OrgUnit.objects.create(name="فنی")
    owner = make_user("ali")
    client.force_login(grc)

    response = client.post(reverse("catalog:service_create"), service_data(unit, owner))

    service = Service.objects.get(code="SRV-10")
    assert response.url == service.get_absolute_url()
    assert service.history.first().history_user == grc


@pytest.mark.django_db
def test_form_offers_only_active_units_and_owners_but_keeps_the_current_ones(client, grc):
    old_unit = OrgUnit.objects.create(name="قدیمی", is_active=False)
    old_owner = make_user("old", is_active=False)
    service = make_service("SRV-1", org_unit=old_unit, owner=old_owner, is_active=False)
    OrgUnit.objects.create(name="بسته", is_active=False)
    make_user("gone", is_active=False)
    client.force_login(grc)

    new_form = client.get(reverse("catalog:service_create")).context["form"]
    edit_form = client.get(reverse("catalog:service_update", args=[service.pk])).context["form"]

    assert old_unit not in new_form.fields["org_unit"].queryset
    assert old_owner not in new_form.fields["owner"].queryset
    assert set(edit_form.fields["org_unit"].queryset.filter(is_active=False)) == {old_unit}
    assert set(edit_form.fields["owner"].queryset.filter(is_active=False)) == {old_owner}


@pytest.mark.django_db
def test_duplicate_service_code_is_rejected(client, grc):
    existing = make_service("SRV-10")
    client.force_login(grc)

    response = client.post(reverse("catalog:service_create"), service_data(existing.org_unit, existing.owner))

    assert response.context["form"].errors["code"] == ["خدمتی با همین کد ثبت شده است."]


@pytest.mark.django_db
def test_unit_filter_includes_subunits(client, grc):
    finance = OrgUnit.objects.create(name="مالی")
    payroll_service = make_service("SRV-2", org_unit=OrgUnit.objects.create(name="حقوق", parent=finance))
    make_service("SRV-3")
    client.force_login(grc)

    response = client.get(reverse("catalog:service_list"), {"unit": finance.pk})

    assert list(response.context["services"]) == [payroll_service]


@pytest.mark.django_db
def test_customer_list_is_open_to_everyone_but_edit_buttons_only_to_editors(client, grc):
    Customer.objects.create(name="بانک ملت", is_key=True, financial_basis=12_000_000_000)
    client.force_login(make_user("sara"))

    response = client.get(reverse("catalog:customer_list"))

    assert response.status_code == 200
    assert response.context["can_edit"] is False
    assert "12,000,000,000" in response.content.decode()
