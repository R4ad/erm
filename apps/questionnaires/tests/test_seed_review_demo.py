"""فرمان پاسخنامه‌ی نمایشی فریم 12a (فقط محیط توسعه)."""

import io

import pytest
from django.core.management import CommandError, call_command
from django.test import override_settings
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.core.jalali import jalali_year
from apps.core.models import CodeCounter
from apps.organization.models import OrgUnit
from apps.questionnaires.ai import grouping
from apps.questionnaires.models import Response

pytestmark = pytest.mark.django_db


@pytest.fixture
def maryam():
    user = make_user("maryam", Role.UNIT_MANAGER)
    user.managed_units.add(OrgUnit.objects.create(name="پرداخت الکترونیک"))
    return user


def test_runs_only_with_debug(maryam):
    with pytest.raises(CommandError):
        call_command("seed_review_demo", stdout=io.StringIO())
    assert not Response.objects.exists()


@override_settings(DEBUG=True)
def test_builds_the_12a_response_once_with_code_109(maryam):
    call_command("seed_review_demo", stdout=io.StringIO())
    prefix = f"QR-{jalali_year(timezone.localdate())}"
    response = Response.objects.get()
    assert response.code == f"{prefix}-0109"
    assert response.status == Response.Status.SUBMITTED and response.review_due
    assert [len(paths) for _, _, paths in grouping.complete_groups(response)] == [2, 1]

    call_command("seed_review_demo", stdout=io.StringIO())
    assert Response.objects.count() == 1
    assert CodeCounter.objects.get(prefix=prefix).last == 109


@override_settings(DEBUG=True)
def test_refuses_when_the_counter_is_past_109(maryam):
    CodeCounter.objects.create(prefix=f"QR-{jalali_year(timezone.localdate())}", last=120)
    with pytest.raises(CommandError):
        call_command("seed_review_demo", stdout=io.StringIO())
    assert not Response.objects.exists()
