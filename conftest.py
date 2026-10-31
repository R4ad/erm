import pytest
from django.contrib.auth.models import Group

from apps.accounts.models import User
from apps.accounts.roles import Role


@pytest.fixture
def system_admin(db):
    user = User.objects.create_user("admin")
    user.groups.add(Group.objects.get(name=Role.SYSTEM_ADMIN))
    return user