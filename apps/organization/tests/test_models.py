import pytest
from django.core.exceptions import ValidationError

from apps.organization.models import OrgUnit


@pytest.mark.django_db
def test_unit_with_active_children_cannot_be_deactivated():
    finance = OrgUnit.objects.create(name="مالی", code="1")
    OrgUnit.objects.create(name="خزانه", code="1-1", parent=finance)

    finance.is_active = False
    with pytest.raises(ValidationError) as error:
        finance.full_clean()
    assert "is_active" in error.value.message_dict


@pytest.mark.django_db
def test_active_unit_cannot_sit_under_inactive_parent():
    closed = OrgUnit.objects.create(name="واحد منحل", code="9", is_active=False)
    unit = OrgUnit(name="خزانه", code="9-1", parent=closed)

    with pytest.raises(ValidationError) as error:
        unit.full_clean()
    assert "parent" in error.value.message_dict

@pytest.mark.django_db
def test_two_units_under_one_parent_cannot_share_a_name():
    OrgUnit.objects.create(name="مالی")  # بدون بالادست

    with pytest.raises(ValidationError):
        OrgUnit(name="مالی").full_clean()