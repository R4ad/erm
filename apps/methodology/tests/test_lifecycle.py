"""چرخه‌ی عمر نسخه: کپی به پیش‌نویس، بررسی، ثبت تصویب و فعال‌سازی (س۱۲ قدم ۸)."""

import datetime

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.methodology.models import MethodVersion, RiskLevel, ScaleLevel
from apps.methodology.services import (
    activate_version,
    check_version,
    copy_version,
    record_approval,
)

from .factories import make_version

pytestmark = pytest.mark.django_db

IDS = {"id", "version_id", "scale_id", "min_level_id"}


def contents(rows):
    """ردیف‌ها بدون شناسه‌ها، تا جدول‌های دو نسخه با هم مقایسه شوند."""
    return [{name: value for name, value in row.items() if name not in IDS} for row in rows.values()]


def test_copy_has_every_table_of_the_source_and_starts_as_a_draft(v1, recorder):
    copy = copy_version(v1, recorder)

    assert (copy.number, copy.status, copy.based_on) == (2, MethodVersion.Status.DRAFT, v1)
    assert (copy.approved_on, copy.activated_at, copy.change_notes) == (None, None, "")
    assert (copy.title, copy.decision_guidance) == (v1.title, v1.decision_guidance)
    for name in ["scales", "likelihood_cells", "risk_levels", "bc_rules", "parameters"]:
        assert contents(getattr(copy, name).all()) == contents(getattr(v1, name).all()), name
    assert contents(ScaleLevel.objects.filter(scale__version=copy)) == contents(
        ScaleLevel.objects.filter(scale__version=v1)
    )
    # کف‌ها به سطح‌های خود نسخه‌ی تازه اشاره می‌کنند، نه به سطح‌های نسخه‌ی ۱
    assert list(copy.impact_floors.values_list("min_impact", "min_level__rank", "min_level__version")) == [
        (4, 2, copy.pk),
        (5, 3, copy.pk),
    ]


def test_copy_numbers_continue_after_the_largest_number(v1, recorder):
    second = copy_version(v1, recorder)
    third = copy_version(second, recorder)

    assert (second.number, third.number) == (2, 3)
    assert third.based_on == second


def test_copy_is_recorded_in_history_with_the_user_and_reason(v1, recorder):
    copy = copy_version(v1, recorder)

    level = ScaleLevel.objects.filter(scale__version=copy).first()
    for record in [copy.history.get(), level.history.get()]:
        assert (record.history_user, record.history_change_reason) == (recorder, "کپی از نسخه‌ی 1")


def test_version_1_passes_every_check(v1):
    assert check_version(v1) == []


@pytest.mark.parametrize(
    "break_it, problem",
    [
        (lambda v: v.scales.get(code="Bc").delete(), "مقیاس Bc نیست."),
        (lambda v: v.scales.get(code="E").levels.get(value=5).delete(), "سطح‌های مقیاس E باید دقیقاً ۱ تا ۵ باشند."),
        (lambda v: v.scales.get(code="S").levels.get(value=0).delete(), "سطح‌های مقیاس S باید دقیقاً ۰ تا ۵ باشند."),
        (
            lambda v: ScaleLevel.objects.filter(scale__version=v, scale__code="A", value=3).update(lower=2),
            "مرز سطح 2 و 3 مقیاس A به هم نمی‌رسد.",
        ),
        (
            lambda v: v.scales.filter(code="F").update(bound_rule=""),
            "مقیاس F مرز عددی دارد ولی قاعده‌ی مرزش (کدام سر بازه بسته است) تعیین نشده است.",
        ),
        (lambda v: v.likelihood_cells.get(a=5, b=5).delete(), "این خانه‌های جدول احتمال خالی‌اند: A5 و B5."),
        (
            lambda v: v.likelihood_cells.filter(a=3, b=3).update(likelihood=1),
            "در جدول احتمال، L خانه‌ی A3 و B3 از خانه‌ی پیش از خودش کمتر است.",
        ),
        (
            lambda v: v.risk_levels.filter(rank=3).update(min_score=11),
            "بازه‌ی «بالا» درست بعد از بازه‌ی «متوسط» شروع نمی‌شود.",
        ),
        (
            lambda v: v.risk_levels.filter(rank=4).update(max_score=24),
            "بازه‌ی سطح‌های ریسک باید از امتیاز ۱ شروع شود و به ۲۵ برسد.",
        ),
        (
            lambda v: v.impact_floors.filter(min_impact=5).update(
                min_level=RiskLevel.objects.get(version__number=1, rank=3)
            ),
            "کف پیامد 5 به سطحی از نسخه‌ی دیگر اشاره می‌کند.",
        ),
        (lambda v: v.parameters.get(key="horizon").delete(), "این پارامترها مقدار ندارند: افق پیش‌فرض ارزیابی."),
        (
            lambda v: MethodVersion.objects.filter(pk=v.pk).update(change_notes=" "),
            "شرح تغییرات نسبت به نسخه‌ی قبلی خالی است؛ مقدار، دلیل و مرجع هر تغییر را بنویسید (بخش ۳۲).",
        ),
    ],
)
def test_check_finds_what_would_leave_the_engine_without_an_answer(draft, break_it, problem):
    assert check_version(draft) == []

    break_it(draft)
    draft.refresh_from_db()

    assert problem in check_version(draft)


def test_approval_turns_a_draft_into_an_approved_version(draft, recorder, yesterday):
    approved = record_approval(draft, " ۱۲۳/۴۵ ", yesterday, recorder)

    assert approved.status == MethodVersion.Status.APPROVED
    assert (approved.approval_ref, approved.approved_on, approved.approval_recorded_by) == ("۱۲۳/۴۵", yesterday, recorder)
    assert approved.history.first().history_change_reason == "ثبت تصویب"


@pytest.mark.parametrize(
    "approval_ref, days_from_today, message",
    [
        ("", -1, "شماره و تاریخ نامه‌ی تصویب هر دو لازم‌اند."),
        ("۱۲۳", None, "شماره و تاریخ نامه‌ی تصویب هر دو لازم‌اند."),
        ("۱۲۳", 1, "تاریخ نامه‌ی تصویب نمی‌تواند بعد از امروز باشد."),
    ],
)
def test_approval_needs_a_letter_number_and_a_date_that_has_come(draft, recorder, approval_ref, days_from_today, message):
    approved_on = None if days_from_today is None else timezone.localdate() + datetime.timedelta(days=days_from_today)

    with pytest.raises(ValidationError) as error:
        record_approval(draft, approval_ref, approved_on, recorder)

    assert error.value.messages == [message]
    draft.refresh_from_db()
    assert draft.is_draft


def test_draft_with_problems_is_not_approved(draft, recorder, yesterday):
    draft.likelihood_cells.get(a=5, b=5).delete()

    with pytest.raises(ValidationError) as error:
        record_approval(draft, "۱۲۳", yesterday, recorder)

    assert error.value.messages == ["این خانه‌های جدول احتمال خالی‌اند: A5 و B5."]
    draft.refresh_from_db()
    assert draft.is_draft


def test_trial_version_records_its_approval_once_and_stays_active(v1, recorder, yesterday):
    approved = record_approval(v1, "۱۲۳/۴۵", yesterday, recorder)

    assert approved.status == MethodVersion.Status.ACTIVE
    assert not approved.is_trial
    with pytest.raises(ValidationError) as error:
        record_approval(v1, "۶۷۸", yesterday, recorder)
    assert error.value.messages == ["تصویب فقط برای پیش‌نویس، یا نسخه‌ی آزمایشی فعال، ثبت می‌شود."]


@pytest.mark.parametrize("status", [MethodVersion.Status.APPROVED, MethodVersion.Status.ARCHIVED])
def test_approved_and_archived_versions_take_no_new_approval(recorder, yesterday, status):
    version = make_version(3, status)

    with pytest.raises(ValidationError):
        record_approval(version, "۶۷۸", yesterday, recorder)


def test_activation_archives_the_previous_version(v1, draft, recorder, yesterday):
    approved = record_approval(draft, "۱۲۳/۴۵", yesterday, recorder)

    active = activate_version(approved, recorder)

    v1.refresh_from_db()
    assert (active.status, active.activated_by) == (MethodVersion.Status.ACTIVE, recorder)
    assert active.activated_at is not None
    assert v1.status == MethodVersion.Status.ARCHIVED
    assert v1.history.first().history_change_reason == "بایگانی با فعال شدن نسخه‌ی 2"
    assert list(MethodVersion.objects.filter(status=MethodVersion.Status.ACTIVE)) == [active]


def test_only_an_approved_version_is_activated(v1, draft, recorder):
    with pytest.raises(ValidationError) as error:
        activate_version(draft, recorder)

    assert error.value.messages == ["فقط نسخه‌ی تصویب‌شده فعال می‌شود."]
    v1.refresh_from_db()
    assert v1.status == MethodVersion.Status.ACTIVE


def test_approved_version_with_problems_is_not_activated(v1, recorder):
    empty = make_version(3, MethodVersion.Status.APPROVED)  # تصویب‌شده ولی بی‌جدول؛ فقط از راه کد ساخته می‌شود

    with pytest.raises(ValidationError) as error:
        activate_version(empty, recorder)

    assert "مقیاس A نیست." in error.value.messages
    v1.refresh_from_db()
    assert v1.status == MethodVersion.Status.ACTIVE
