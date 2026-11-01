import datetime

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Customer, ServiceCustomer

from .factories import make_service, make_user


@pytest.fixture
def service(db):
    return make_service("SRV-1")


@pytest.fixture
def mellat(db):
    return Customer.objects.create(name="بانک ملت", is_key=True)


@pytest.fixture
def grc(db):
    return make_user("grc", Role.GRC_MEMBER)


def link_data(customer, **changes):
    data = {
        "customer": customer.pk,
        "rto_minutes": "240",
        "mtpd_minutes": "1440",
        "rpo_minutes": "15",
        "bia_reference": "BIA-1405",
        "tolerance_notes": "",
        "valid_from": "1405/01/01",
        "valid_until": "",
    }
    return data | changes


@pytest.mark.parametrize("rto, mtpd", [(240, 240), (300, 240)])
def test_rto_must_be_less_than_mtpd(service, mellat, rto, mtpd):
    link = ServiceCustomer(service=service, customer=mellat, rto_minutes=rto, mtpd_minutes=mtpd)

    with pytest.raises(ValidationError) as error:
        link.full_clean()

    assert error.value.messages == ["RTO باید کمتر از MTPD باشد."]


def test_database_itself_refuses_rto_not_less_than_mtpd(service, mellat):
    # حتی اگر کسی بدون فرم و full_clean ذخیره کند، قاعده در PostgreSQL هم هست.
    with pytest.raises(IntegrityError):
        ServiceCustomer.objects.create(service=service, customer=mellat, rto_minutes=300, mtpd_minutes=240)


def test_times_may_be_left_empty_until_the_bia_is_done(service, mellat):
    ServiceCustomer(service=service, customer=mellat, rto_minutes=240).full_clean()


def test_rto_of_zero_is_rejected_but_rpo_of_zero_means_no_data_loss(service, mellat):
    with pytest.raises(ValidationError) as error:
        ServiceCustomer(service=service, customer=mellat, rto_minutes=0, rpo_minutes=0).full_clean()

    assert set(error.value.message_dict) == {"rto_minutes"}


def test_valid_until_may_not_be_before_valid_from(service, mellat):
    link = ServiceCustomer(
        service=service,
        customer=mellat,
        valid_from=datetime.date(2026, 5, 1),
        valid_until=datetime.date(2026, 4, 1),
    )

    with pytest.raises(ValidationError) as error:
        link.full_clean()

    assert error.value.messages == ["«اعتبار تا» نباید پیش از «اعتبار از» باشد."]


def test_link_with_a_past_valid_until_is_expired(service, mellat):
    link = ServiceCustomer(service=service, customer=mellat, valid_until=datetime.date(2020, 1, 1))

    assert link.is_expired
    assert not ServiceCustomer(service=service, customer=mellat).is_expired


def test_grc_adds_a_bank_to_a_service_with_history(client, service, mellat, grc):
    client.force_login(grc)

    response = client.post(reverse("catalog:service_customer_create", args=[service.pk]), link_data(mellat))

    assert response.status_code == 302
    assert response.url == service.get_absolute_url()
    link = service.customer_links.get()
    assert (link.customer, link.rto_minutes, link.mtpd_minutes, link.rpo_minutes) == (mellat, 240, 1440, 15)
    assert link.valid_from == datetime.date(2026, 3, 21)  # 1405/01/01
    assert link.history.first().history_user == grc
    assert list(service.customers.all()) == [mellat]  # همان رابطه از راه ManyToMany


def test_form_shows_the_rto_error_in_persian(client, service, mellat, grc):
    client.force_login(grc)

    response = client.post(
        reverse("catalog:service_customer_create", args=[service.pk]),
        link_data(mellat, rto_minutes="1440", mtpd_minutes="240"),
    )

    assert response.status_code == 200
    assert response.context["form"].non_field_errors() == ["RTO باید کمتر از MTPD باشد."]
    assert not ServiceCustomer.objects.exists()


def test_a_bank_already_on_the_service_and_inactive_banks_are_not_offered(client, service, mellat, grc):
    ServiceCustomer.objects.create(service=service, customer=mellat)
    closed = Customer.objects.create(name="بانک قدیمی", is_active=False)
    tejarat = Customer.objects.create(name="بانک تجارت")
    client.force_login(grc)

    response = client.get(reverse("catalog:service_customer_create", args=[service.pk]))
    assert list(response.context["form"].fields["customer"].queryset) == [tejarat]

    response = client.post(reverse("catalog:service_customer_create", args=[service.pk]), link_data(mellat))
    assert "customer" in response.context["form"].errors
    assert closed not in response.context["form"].fields["customer"].queryset


def test_editing_a_link_keeps_its_own_bank_even_if_that_bank_is_now_inactive(client, service, mellat, grc):
    link = ServiceCustomer.objects.create(service=service, customer=mellat, rto_minutes=60, mtpd_minutes=120)
    mellat.is_active = False
    mellat.save()
    client.force_login(grc)

    response = client.post(
        reverse("catalog:service_customer_update", args=[link.pk]), link_data(mellat, rto_minutes="30")
    )

    assert response.status_code == 302
    link.refresh_from_db()
    assert link.rto_minutes == 30


def test_only_editors_add_banks_to_a_service(client, service):
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(service.org_unit)
    client.force_login(manager)

    assert client.get(reverse("catalog:service_customer_create", args=[service.pk])).status_code == 403
    assert client.get(service.get_absolute_url()).context["can_edit"] is False


def test_service_page_shows_times_in_days_and_hours(client, service, mellat, grc):
    ServiceCustomer.objects.create(
        service=service,
        customer=mellat,
        rto_minutes=240,
        mtpd_minutes=1500,
        rpo_minutes=0,
        valid_until=datetime.date(2020, 1, 1),
    )
    client.force_login(grc)

    page = client.get(service.get_absolute_url()).content.decode()

    assert "4 ساعت" in page
    assert "1 روز و 1 ساعت" in page
    assert "0 دقیقه" in page  # RPO صفر خالی نشان داده نمی‌شود
    assert "منقضی" in page
