import pytest

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="رضا", last_name="مالکی")


@pytest.fixture
def assignee():
    return make_user("assignee", first_name="نیما", last_name="مجری")


@pytest.fixture
def verifier():
    return make_user("verifier", first_name="لیلا", last_name="آزمون")
