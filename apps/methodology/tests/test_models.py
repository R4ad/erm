from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.methodology.models import (
    ImpactFloor,
    MethodVersion,
    RiskLevel,
    Scale,
    ScaleLevel,
    plain_number,
)

from .factories import make_level, make_version


@pytest.mark.django_db
def test_only_one_version_can_be_active():
    second = MethodVersion(number=2, title="دوم", status=MethodVersion.Status.ACTIVE, activated_at=timezone.now())

    with pytest.raises(ValidationError) as error:
        second.full_clean()
    assert "فقط یک نسخه‌ی روش می‌تواند فعال باشد." in error.value.messages

    # پایگاه داده هم، بدون full_clean، نسخه‌ی فعال دوم را نمی‌پذیرد
    with pytest.raises(IntegrityError), transaction.atomic():
        second.save()


ACTIVATION_TIME_RULE = "زمان فعال شدن فقط برای نسخه‌ی فعال یا بایگانی ثبت می‌شود و برای آن‌ها لازم است."


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fields, message",
    [
        ({"approval_ref": "۱۲۳"}, "شماره و تاریخ نامه‌ی تصویب با هم ثبت می‌شوند."),
        ({"approved_on": "2026-11-01"}, "شماره و تاریخ نامه‌ی تصویب با هم ثبت می‌شوند."),
        ({"status": "approved"}, "نسخه‌ی تصویب‌شده باید شماره و تاریخ نامه‌ی تصویب داشته باشد."),
        ({"approval_ref": "۱۲۳", "approved_on": "2026-11-01"}, "پیش‌نویس هنوز تصویب نشده است و نامه‌ی تصویب ندارد."),
        ({"status": "archived"}, ACTIVATION_TIME_RULE),
        ({"activated_at": "2026-11-01 10:00+03:30"}, ACTIVATION_TIME_RULE),  # پیش‌نویس هنوز فعال نشده
    ],
)
def test_approval_and_activation_rules_of_a_version(fields, message):
    with pytest.raises(ValidationError) as error:
        MethodVersion(number=2, title="دوم", **fields).full_clean()

    assert message in error.value.messages


@pytest.mark.django_db
def test_trial_means_used_without_approval():
    approved = make_version(2, MethodVersion.Status.APPROVED)
    archived = make_version(3, MethodVersion.Status.ARCHIVED)

    assert MethodVersion.objects.get(number=1).is_trial
    assert archived.is_trial  # بایگانی بدون تصویب هم آزمایشی به کار رفته است
    assert not approved.is_trial
    assert not make_version(4).is_trial


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fields, message",
    [
        ({"min_score": 5, "max_score": 4}, "بازه‌ی امتیاز باید درون ۱ تا ۲۵ باشد و کمترین از بیشترین بزرگ‌تر نباشد."),
        ({"max_score": 26}, "بازه‌ی امتیاز باید درون ۱ تا ۲۵ باشد و کمترین از بیشترین بزرگ‌تر نباشد."),
        ({"containment_value": 24}, "مهلت مهار و واحدش با هم ثبت می‌شوند."),
        ({"containment_unit": "hour"}, "مهلت مهار و واحدش با هم ثبت می‌شوند."),
        ({"plan_value": 0}, "مهلت طرح، اعتبار پذیرش و دوره‌ی بازبینی دست‌کم ۱ هستند."),
        ({"color": "red"}, "رنگ را به شکل #RRGGBB بنویسید، مثل #198754."),
    ],
)
def test_risk_level_rules(fields, message):
    level = RiskLevel(
        version=make_version(2),
        rank=1,
        name="پایین",
        color="#198754",
        min_score=1,
        max_score=4,
        decision_rule="مالک ریسک",
        co_approver="none",
        plan_value=30,
        plan_unit="day",
        acceptance_value=12,
        acceptance_unit="month",
        review_value=6,
        review_unit="month",
    )
    for name, value in fields.items():
        setattr(level, name, value)

    with pytest.raises(ValidationError) as error:
        level.full_clean()

    assert message in error.value.messages


@pytest.mark.django_db
def test_database_rejects_a_color_that_is_not_hex():
    level = make_level(make_version(2), 1, 1, 4)

    # update() از full_clean و save رد می‌شود؛ این‌جا فقط قاعده‌ی خود پایگاه داده جلویش را می‌گیرد
    with pytest.raises(IntegrityError), transaction.atomic():
        RiskLevel.objects.filter(pk=level.pk).update(color="#12345g")


@pytest.mark.django_db
@pytest.mark.parametrize(
    "fields, message",
    [
        ({"value": 6}, "سطح باید بین ۰ و ۵ باشد."),
        ({"lower": Decimal(1), "upper": Decimal(1)}, "کران پایین باید کمتر از کران بالا باشد."),
    ],
)
def test_scale_level_rules(fields, message):
    scale = Scale.objects.create(version=make_version(2), code="X", kind="impact", name="آزمایشی", order=1)

    with pytest.raises(ValidationError) as error:
        ScaleLevel(scale=scale, **{"value": 1, **fields}).full_clean()

    assert message in error.value.messages


@pytest.mark.django_db
def test_floor_must_point_to_a_level_of_the_same_version():
    level_of_version_1 = RiskLevel.objects.get(version__number=1, rank=3)
    floor = ImpactFloor(version=make_version(2), min_impact=5, min_level=level_of_version_1)

    with pytest.raises(ValidationError) as error:
        floor.full_clean()

    assert error.value.message_dict["min_level"] == ["سطح باید از همین نسخه باشد."]


def bounds(scale, lower, upper):
    level = ScaleLevel(
        scale=scale,
        lower=None if lower is None else Decimal(lower),
        upper=None if upper is None else Decimal(upper),
    )
    return level.bounds_display()


def test_bounds_are_shown_in_the_words_of_the_document():
    rate = Scale(bound_rule=Scale.BoundRule.LOWER_CLOSED, unit="بار در سال")
    loss = Scale(bound_rule=Scale.BoundRule.UPPER_CLOSED, unit="درصد")

    assert bounds(rate, None, "0.1") == "کمتر از 0.1 بار در سال"
    assert bounds(rate, "0.1", "1") == "از 0.1 تا کمتر از 1 بار در سال"
    assert bounds(rate, "100", None) == "100 بار در سال یا بیشتر"
    assert bounds(loss, "0", "0.01") == "بیش از 0 تا 0.01 درصد"
    assert bounds(loss, "2", None) == "بیش از 2 درصد"
    assert bounds(loss, None, None) == ""


def test_plain_number_drops_extra_zeros():
    assert plain_number(Decimal("12.0000")) == "12"
    assert plain_number(Decimal("100.0000")) == "100"
    assert plain_number(Decimal("0.2500")) == "0.25"


@pytest.mark.parametrize("color, text", [("#198754", "#fff"), ("#ffc107", "#000"), ("#fd7e14", "#000"), ("#dc3545", "#fff")])
def test_text_on_each_level_color_is_readable(color, text):
    assert RiskLevel(color=color).text_color == text
