"""قفل نسخه در خود پایگاه داده (migration 0003): حتی update() و SQL مستقیم هم نسخه‌ای را که پیش‌نویس نیست
عوض نمی‌کند، تا هر ارزیابی با نسخه‌ی خودش دوباره قابل محاسبه بماند."""

import pytest
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.methodology.models import BcRule, MethodVersion, ScaleLevel
from apps.methodology.services import record_approval

from .factories import make_version

pytestmark = pytest.mark.django_db

LOCKED_PART = "جدول‌های نسخه‌ای که پیش‌نویس نیست عوض نمی‌شوند."


def test_content_of_a_version_that_is_not_a_draft_does_not_change(v1):
    v1.title = "عنوان دیگر"
    with pytest.raises(DatabaseError, match="نسخه‌ی 1 پیش‌نویس نیست و محتوایش عوض نمی‌شود."), transaction.atomic():
        v1.save()
    with pytest.raises(DatabaseError), transaction.atomic():
        MethodVersion.objects.filter(pk=v1.pk).update(decision_guidance="")

    v1.refresh_from_db()
    assert v1.title == "روش v5"


@pytest.mark.parametrize(
    "change",
    [
        lambda v1, draft: v1.risk_levels.filter(rank=1).update(color="#000000"),
        lambda v1, draft: v1.likelihood_cells.get(a=1, b=1).delete(),
        lambda v1, draft: ScaleLevel.objects.filter(scale__version=v1, value=1).update(criteria="معیار دیگر"),
        lambda v1, draft: ScaleLevel.objects.create(scale=v1.scales.get(code="B0"), value=0),
        lambda v1, draft: BcRule.objects.create(version=v1, bc=5, min_e=1),
        # ردیف نه از نسخه‌ی قفل بیرون برده می‌شود و نه به آن
        lambda v1, draft: v1.parameters.filter(key="horizon").update(version=draft),
        lambda v1, draft: BcRule.objects.filter(pk=BcRule.objects.create(version=draft, bc=5, min_e=1).pk).update(
            version=v1
        ),
    ],
)
def test_tables_of_a_version_that_is_not_a_draft_do_not_change(v1, draft, change):
    with pytest.raises(DatabaseError, match=LOCKED_PART), transaction.atomic():
        change(v1, draft)


def test_even_direct_sql_cannot_change_a_locked_version(v1):
    with pytest.raises(DatabaseError, match=LOCKED_PART), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("UPDATE methodology_risklevel SET name = 'x'")

    assert v1.risk_levels.get(rank=1).name == "پایین"


def test_no_version_is_ever_deleted(v1):
    empty = make_version(2)  # حتی پیش‌نویس خالی

    with pytest.raises(DatabaseError, match="نسخه‌ی روش حذف نمی‌شود."), transaction.atomic():
        empty.delete()
    with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
        cursor.execute("DELETE FROM methodology_methodversion")

    assert MethodVersion.objects.count() == 2


def test_a_draft_stays_editable(draft):
    draft.title = "روش v5 با تغییر"
    draft.save()
    level = ScaleLevel.objects.filter(scale__version=draft).first()
    level.criteria = "معیار تازه"
    level.save()
    draft.likelihood_cells.get(a=1, b=1).delete()
    draft.impact_floors.all().delete()

    assert draft.likelihood_cells.count() == 24
    assert not draft.impact_floors.exists()


def test_status_only_moves_forward(v1):
    with pytest.raises(DatabaseError, match="نسخه‌ی 1 از وضعیت active به draft نمی‌رود."), transaction.atomic():
        MethodVersion.objects.filter(pk=v1.pk).update(status="draft", activated_at=None)


def test_recorded_approval_and_activation_time_do_not_change(v1, recorder, yesterday):
    record_approval(v1, "۱۲۳/۴۵", yesterday, recorder)

    with pytest.raises(DatabaseError, match="تصویب ثبت‌شده‌ی نسخه‌ی 1 عوض نمی‌شود."), transaction.atomic():
        MethodVersion.objects.filter(pk=v1.pk).update(approval_ref="۶۷۸")
    with pytest.raises(DatabaseError, match="زمان فعال شدن نسخه‌ی 1 فقط هنگام فعال شدن ثبت می‌شود."), transaction.atomic():
        MethodVersion.objects.filter(pk=v1.pk).update(activated_at=timezone.now())
