import datetime

import pytest
from django.utils import timezone

from apps.catalog.tests.factories import make_user
from apps.methodology.models import MethodVersion
from apps.methodology.services import copy_version


@pytest.fixture
def v1(db):
    """نسخه‌ی ۱ که migration داده از سند v5 ساخته است: فعال و آزمایشی."""
    return MethodVersion.objects.get(number=1)


@pytest.fixture
def recorder(db):
    """کسی که کپی، تصویب یا فعال‌سازی را ثبت می‌کند. در قدم ۸ مدیر سامانه است، به درخواست GRC."""
    return make_user("recorder")


@pytest.fixture
def draft(v1, recorder):
    """کپی نسخه‌ی ۱ با شرح تغییرات؛ همه‌ی بررسی‌ها را می‌گذراند."""
    copy = copy_version(v1, recorder)
    copy.change_notes = "آزمایش"
    copy.save()
    return copy


@pytest.fixture
def yesterday():
    return timezone.localdate() - datetime.timedelta(days=1)
