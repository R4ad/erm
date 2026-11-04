"""مهاجرت داده‌ی 0007: ریسک‌هایی که وضعیت قبل از جدول چرخه‌ی عمر س۱۵ را دارند، وضعیت تازه می‌گیرند."""

import importlib

import pytest
from django.apps import apps

from apps.organization.models import OrgUnit
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db

status_migration = importlib.import_module("apps.risks.migrations.0007_map_statuses_from_first_0003")


def make_risk(title, old_status):
    risk = Risk.objects.create(
        title=title,
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=OrgUnit.objects.get_or_create(name="عملیات")[0],
    )
    Risk.objects.filter(pk=risk.pk).update(status=old_status)  # مثل ردیفی که روی پایگاه قدیمی ساخته شده
    return risk


def test_old_statuses_move_to_the_lifecycle_of_q15():
    draft = make_risk("پیش‌نویس قدیمی", "draft")
    retired = make_risk("بازنشسته‌ی قدیمی", "retired")
    current = make_risk("ریسک تازه", Risk.Status.ASSESSMENT)

    status_migration.map_statuses(apps, None)

    statuses = dict(Risk.objects.values_list("pk", "status"))
    assert statuses[draft.pk] == Risk.Status.REGISTERED
    assert statuses[retired.pk] == Risk.Status.CLOSED
    assert statuses[current.pk] == Risk.Status.ASSESSMENT


def test_every_old_status_maps_to_a_current_one():
    current = set(Risk.Status.values)
    assert set(status_migration.OLD_TO_NEW.values()) <= current
    assert not set(status_migration.OLD_TO_NEW) & current
