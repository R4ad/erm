import pytest
from django.contrib.auth.models import Group
from django.core.exceptions import PermissionDenied
from django.test import RequestFactory

from apps.accounts.models import User
from apps.accounts.permissions import role_required
from apps.accounts.roles import Role
from apps.organization.models import OrgUnit


@role_required(Role.GRC_MEMBER)
def grc_only_view(request):
    return "ok"


def call_as(user):
    request = RequestFactory().get("/")
    request.user = user
    return grc_only_view(request)


@pytest.mark.django_db
def test_all_role_groups_exist_after_migrate():
    assert set(Group.objects.values_list("name", flat=True)) >= set(Role.ALL)


@pytest.mark.django_db
def test_user_with_role_passes_and_others_get_403():
    grc = User.objects.create_user("ali", personnel_code="1001")
    grc.groups.add(Group.objects.get(name=Role.GRC_MEMBER))
    viewer = User.objects.create_user("sara", personnel_code="1002")
    viewer.groups.add(Group.objects.get(name=Role.VIEWER))

    assert call_as(grc) == "ok"
    with pytest.raises(PermissionDenied):
        call_as(viewer)


@pytest.mark.django_db
def test_system_admin_passes_every_role_check():
    admin = User.objects.create_user("admin")
    admin.groups.add(Group.objects.get(name=Role.SYSTEM_ADMIN))

    assert admin.is_system_admin
    assert call_as(admin) == "ok"


@pytest.mark.django_db
def test_manager_of_two_units_covers_both_subtrees_only():
    finance = OrgUnit.objects.create(name="مالی", code="1")
    treasury = OrgUnit.objects.create(name="خزانه", code="1-1", parent=finance)
    it = OrgUnit.objects.create(name="فناوری", code="2")
    hr = OrgUnit.objects.create(name="منابع انسانی", code="3")
    manager = User.objects.create_user("reza")
    manager.managed_units.add(finance, it)

    assert manager.managed_unit_ids() == {finance.pk, treasury.pk, it.pk}
    assert hr.pk not in manager.managed_unit_ids()
