import pytest

from apps.core.jalali import parse_jalali as j
from apps.workcalendar.models import Holiday
from apps.workcalendar.workdays import add_working_days, is_working_day, working_days_between

# هفته‌ی نمونه: ۱۴۰۵/۰۸/۰۹ شنبه است، ۰۸/۱۴ پنجشنبه و ۰۸/۱۵ جمعه.
HOLIDAYS = {j("1405/08/11")}  # یک دوشنبه‌ی تعطیل ساختگی


def test_thursday_friday_and_holidays_are_not_working_days():
    assert is_working_day(j("1405/08/09"), HOLIDAYS)
    assert not is_working_day(j("1405/08/11"), HOLIDAYS)
    assert not is_working_day(j("1405/08/14"), HOLIDAYS)
    assert not is_working_day(j("1405/08/15"), HOLIDAYS)


@pytest.mark.parametrize(
    "start, days, deadline",
    [
        ("1405/08/09", 1, "1405/08/10"),  # شنبه، یک روز بعد یکشنبه
        ("1405/08/10", 1, "1405/08/12"),  # دوشنبه‌ی تعطیل شمرده نمی‌شود
        ("1405/08/13", 1, "1405/08/16"),  # چهارشنبه، یک روز بعد شنبه
        ("1405/08/15", 1, "1405/08/16"),  # شروع در جمعه
        ("1405/08/09", 4, "1405/08/16"),
        ("1405/08/09", 0, "1405/08/09"),
    ],
)
def test_deadline_in_working_days(start, days, deadline):
    assert add_working_days(j(start), days, HOLIDAYS) == j(deadline)


@pytest.mark.parametrize("start", ["1405/08/09", "1405/08/11", "1405/08/13", "1405/08/15"])
def test_counting_back_gives_the_same_number_of_days(start):
    for days in range(30):
        deadline = add_working_days(j(start), days, HOLIDAYS)
        assert working_days_between(j(start), deadline, HOLIDAYS) == days
    assert working_days_between(j("1405/08/16"), j(start), HOLIDAYS) == 0


@pytest.mark.django_db
def test_saved_holidays_are_used_when_no_list_is_given():
    Holiday.objects.create(date=j("1405/08/11"), title="تعطیلی ساختگی")

    assert not is_working_day(j("1405/08/11"))
    assert is_working_day(j("1405/08/12"))
    assert add_working_days(j("1405/08/10"), 1) == j("1405/08/12")
    assert working_days_between(j("1405/08/09"), j("1405/08/16")) == 4