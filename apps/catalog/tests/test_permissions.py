import pytest

from apps.accounts.roles import Role
from apps.catalog.permissions import can_edit_catalog, visible_services
from apps.organization.models import OrgUnit

from .factories import make_service, make_user


@pytest.fixture
def services(db):
    """دو واحد، یکی با زیرمجموعه، و یک خدمت در هر کدام."""
    finance = OrgUnit.objects.create(name="مالی")
    payroll = OrgUnit.objects.create(name="حقوق", parent=finance)
    tech = OrgUnit.objects.create(name="فنی")
    return {
        "finance": make_service("SRV-1", org_unit=finance),
        "payroll": make_service("SRV-2", org_unit=payroll),
        "tech": make_service("SRV-3", org_unit=tech),
    }


@pytest.mark.parametrize(
    "role", [Role.SYSTEM_ADMIN, Role.GRC_MEMBER, Role.SECURITY_WORKGROUP, Role.SECURITY_COMMITTEE, Role.VIEWER]
)
def test_these_roles_see_every_service(services, role):
    user = make_user("someone", role)

    assert set(visible_services(user)) == set(services.values())


def test_unit_manager_sees_services_of_managed_units_and_their_subunits(services):
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(services["finance"].org_unit)

    assert set(visible_services(manager)) == {services["finance"], services["payroll"]}


def test_managed_units_without_the_unit_manager_role_show_nothing(services):
    user = make_user("someone")
    user.managed_units.add(services["finance"].org_unit)

    assert list(visible_services(user)) == []


def test_owner_sees_own_service_even_without_a_role(services):
    owner = services["tech"].owner

    assert list(visible_services(owner)) == [services["tech"]]


def test_only_grc_and_system_admin_edit(db):
    assert can_edit_catalog(make_user("grc", Role.GRC_MEMBER))
    assert can_edit_catalog(make_user("admin", Role.SYSTEM_ADMIN))
    assert not can_edit_catalog(make_user("manager", Role.UNIT_MANAGER))
    assert not can_edit_catalog(make_user("viewer", Role.VIEWER))
