import pytest
from django.contrib.auth.models import Group
from django.urls import reverse

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.organization.models import OrgUnit


@pytest.fixture
def system_admin(db):
    user = User.objects.create_user("admin")
    user.groups.add(Group.objects.get(name=Role.SYSTEM_ADMIN))
    return user


@pytest.mark.django_db
def test_everyone_sees_the_tree_but_only_system_admin_adds(client, system_admin):
    OrgUnit.objects.create(name="مالی", code="1")
    client.force_login(User.objects.create_user("sara"))

    assert client.get(reverse("organization:unit_list")).status_code == 200
    assert client.get(reverse("organization:unit_create")).status_code == 403

    client.force_login(system_admin)
    assert client.get(reverse("organization:unit_create")).status_code == 200


@pytest.mark.django_db
def test_new_unit_is_saved_with_who_created_it(client, system_admin):
    client.force_login(system_admin)

    response = client.post(
        reverse("organization:unit_create"),
        {"code": "1", "name": "مالی", "parent": "", "is_active": "on"},
    )

    assert response.status_code == 302
    unit = OrgUnit.objects.get(code="1")
    assert unit.history.first().history_user == system_admin


@pytest.mark.django_db
def test_parent_choices_exclude_the_unit_and_its_subtree(client, system_admin):
    root = OrgUnit.objects.create(name="مدیریت", code="1")
    OrgUnit.objects.create(name="مالی", code="1-1", parent=root)
    tech = OrgUnit.objects.create(name="فنی", code="2")
    client.force_login(system_admin)

    response = client.get(reverse("organization:unit_update", args=[root.pk]))

    assert list(response.context["form"].fields["parent"].queryset) == [tech]
