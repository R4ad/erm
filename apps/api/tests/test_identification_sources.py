"""«شناسایی ریسک» (11 v2): آمار کارت پاسخنامه‌ها از پاسخنامه‌هایی که کاربر می‌بیند."""

import pytest

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Response

pytestmark = pytest.mark.django_db

URL = "/api/identification/sources/"
S = Response.Status


def response(unit, respondent, status):
    return Response.objects.create(org_unit=unit, respondent=respondent, status=status)


def test_counts_follow_visible_responses(client):
    mine, other = OrgUnit.objects.create(name="پرداخت"), OrgUnit.objects.create(name="خزانه‌داری")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine)
    for status in (S.SUBMITTED, S.SUBMITTED, S.RETURNED, S.IDENTIFIED, S.DRAFT, S.REVIEWED):
        response(mine, manager, status)
    response(other, make_user("someone", Role.UNIT_MANAGER), S.SUBMITTED)

    client.force_login(manager)
    data = client.get(URL).json()
    assert data == {"responses": {"pending": 2, "returned": 1, "identified": 1, "url": "/identification/responses"}}

    client.force_login(make_user("grc", Role.GRC_MEMBER))
    assert client.get(URL).json()["responses"]["pending"] == 3


def test_needs_login(client):
    assert client.get(URL).status_code in (401, 403)
