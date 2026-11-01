import pytest
from django.core.exceptions import ValidationError

from apps.catalog.models import Customer
from apps.organization.models import OrgUnit

from .factories import make_service, make_user


@pytest.mark.django_db
def test_active_service_needs_an_active_unit_and_owner():
    service = make_service("SRV-1")
    service.org_unit.is_active = False
    service.org_unit.save()
    service.owner.is_active = False
    service.owner.save()

    with pytest.raises(ValidationError) as error:
        service.full_clean()

    assert set(error.value.message_dict) == {"org_unit", "owner"}


@pytest.mark.django_db
def test_inactive_service_may_keep_an_inactive_unit_and_owner():
    unit = OrgUnit.objects.create(name="واحد قدیمی", is_active=False)
    owner = make_user("old", is_active=False)
    service = make_service("SRV-1", org_unit=unit, owner=owner, is_active=False)

    service.full_clean()  # خطا نمی‌دهد


@pytest.mark.django_db
def test_customer_name_is_unique_with_a_persian_message():
    Customer.objects.create(name="بانک ملت")

    with pytest.raises(ValidationError) as error:
        Customer(name="بانک ملت").full_clean()

    assert error.value.message_dict["name"] == ["بانکی با همین نام ثبت شده است."]
