import datetime

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import User
from apps.core.jalali import jalali_year, parse_jalali
from apps.workcalendar.models import Holiday


def listed(client, **params):
    response = client.get(reverse("workcalendar:holiday_list"), params)
    return [holiday.title for holiday in response.context["holidays"]]


@pytest.mark.django_db
def test_only_system_admin_manages_holidays(client, system_admin):
    holiday = Holiday.objects.create(date=datetime.date(2027, 2, 11), title="پیروزی انقلاب")
    pages = [
        reverse("workcalendar:holiday_list"),
        reverse("workcalendar:holiday_create"),
        reverse("workcalendar:holiday_update", args=[holiday.pk]),
    ]
    client.force_login(User.objects.create_user("sara"))
    assert pages[0] not in client.get(reverse("core:home")).text
    for page in pages:
        assert client.get(page).status_code == 403
    assert client.post(reverse("workcalendar:holiday_delete", args=[holiday.pk])).status_code == 403

    client.force_login(system_admin)
    assert pages[0] in client.get(reverse("core:home")).text
    for page in pages:
        assert client.get(page).status_code == 200


@pytest.mark.django_db
def test_admin_adds_a_holiday_with_a_jalali_date(client, system_admin):
    client.force_login(system_admin)
    page = reverse("workcalendar:holiday_create")
    response = client.get(page)
    assert "تعطیلی جدید" in response.text
    assert response.context["cancel_url"] == reverse("workcalendar:holiday_list")

    response = client.post(page, {"date": "۱۴۰۵/۱۱/۲۲", "title": "پیروزی انقلاب"})

    assert response.status_code == 302
    holiday = Holiday.objects.get()
    assert holiday.date == datetime.date(2027, 2, 11)
    assert holiday.history.first().history_user == system_admin
    assert "برای این تاریخ پیش‌تر تعطیلی ثبت شده است" in client.post(page, {"date": "1405/11/22", "title": "تکرار"}).text
    assert "تاریخ شمسی درست نیست" in client.post(page, {"date": "1405/12/30", "title": "نادرست"}).text


@pytest.mark.django_db
def test_edit_page_shows_the_date_in_jalali(client, system_admin):
    holiday = Holiday.objects.create(date=datetime.date(2027, 2, 11), title="پیروزی انقلاب")
    client.force_login(system_admin)
    page = reverse("workcalendar:holiday_update", args=[holiday.pk])

    response = client.get(page)
    assert "ویرایش تعطیلی" in response.text
    assert 'value="1405/11/22"' in response.text

    client.post(page, {"date": "1405/11/23", "title": "پیروزی انقلاب"})
    holiday.refresh_from_db()
    assert holiday.date == datetime.date(2027, 2, 12)


@pytest.mark.django_db
def test_list_shows_this_year_unless_another_year_is_chosen(client, system_admin):
    this_year = jalali_year(timezone.localdate())
    Holiday.objects.create(date=parse_jalali(f"{this_year}/01/01"), title="نوروز امسال")
    Holiday.objects.create(date=parse_jalali(f"{this_year + 1}/01/01"), title="نوروز سال بعد")
    client.force_login(system_admin)

    assert listed(client) == ["نوروز امسال"]
    assert listed(client, year=this_year + 1) == ["نوروز سال بعد"]
    assert listed(client, year="") == ["نوروز امسال", "نوروز سال بعد"]
    assert listed(client, page=1) == ["نوروز امسال"]


@pytest.mark.django_db
def test_list_shows_the_weekday_and_delete_needs_post(client, system_admin):
    holiday = Holiday.objects.create(date=datetime.date(2027, 2, 11), title="پیروزی انقلاب")
    client.force_login(system_admin)
    page = reverse("workcalendar:holiday_delete", args=[holiday.pk])

    assert "<td>پنجشنبه</td>" in client.get(reverse("workcalendar:holiday_list"), {"year": 1405}).text
    assert client.get(page).status_code == 405

    response = client.post(page, follow=True)

    assert "تعطیلی «پیروزی انقلاب» حذف شد." in response.text
    assert not Holiday.objects.exists()