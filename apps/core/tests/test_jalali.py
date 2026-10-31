import datetime

import pytest
from django.core.exceptions import ValidationError

from apps.core.forms import JalaliDateField
from apps.core.jalali import jalali_year, jalali_year_range, parse_jalali, to_jalali


@pytest.mark.parametrize("text", ["1405/08/09", "۱۴۰۵/۰۸/۰۹", "1405/8/9", "1405-08-09", " 1405/08/09 "])
def test_common_ways_of_writing_a_date_are_read(text):
    assert parse_jalali(text) == datetime.date(2026, 10, 31)


@pytest.mark.parametrize("text", ["1405/12/30", "1405/13/01", "1405/08", "05/08/09", "1405/08/الف", ""])
def test_wrong_dates_are_rejected(text):
    with pytest.raises(ValueError):
        parse_jalali(text)


def test_leap_day_and_year_boundaries():
    assert to_jalali(parse_jalali("1403/12/30")) == "1403/12/30"  # ۱۴۰۳ کبیسه است
    assert jalali_year_range(1405) == (datetime.date(2026, 3, 21), datetime.date(2027, 3, 21))
    assert jalali_year(datetime.date(2026, 3, 20)) == 1404
    assert jalali_year(datetime.date(2026, 3, 21)) == 1405


def test_date_field_reads_and_shows_jalali():
    field = JalaliDateField()

    assert field.clean("۱۴۰۵/۰۸/۰۹") == datetime.date(2026, 10, 31)
    assert field.prepare_value(datetime.date(2026, 10, 31)) == "1405/08/09"
    assert field.prepare_value("1405/8/") == "1405/8/"
    with pytest.raises(ValidationError, match="تاریخ شمسی درست نیست"):
        field.clean("1405/12/30")