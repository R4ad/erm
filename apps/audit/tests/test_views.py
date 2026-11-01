import datetime
from io import BytesIO

import pytest
from django.contrib.auth.models import Group
from django.urls import reverse
from django.utils import timezone
from openpyxl import load_workbook

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.accounts.tests.test_staff_import import person

# pending_dir فیکسچر autouse است و با import در این فایل هم فایل‌های بارگذاری را به پوشه‌ی موقت می‌برد.
from apps.accounts.tests.test_views import confirm, pending_dir, upload  # noqa: F401
from apps.audit.models import AuditEvent
from apps.catalog.models import Commitment
from apps.catalog.tests.factories import make_service
from apps.workcalendar.models import Holiday

PAGES = ["audit:event_list", "audit:change_list", "audit:event_export"]


@pytest.fixture
def viewer(db):
    user = User.objects.create_user("auditor")
    user.groups.add(Group.objects.get(name=Role.VIEWER))
    return user


def event(name, username, when, **details):
    return AuditEvent.objects.create(event=name, username=username, at=when, details=details)


def tehran(*args):
    return timezone.make_aware(datetime.datetime(*args))


@pytest.mark.django_db
def test_only_system_admin_and_viewer_see_the_audit_log(client, system_admin, viewer):
    client.force_login(User.objects.create_user("sara"))
    assert reverse("audit:event_list") not in client.get(reverse("core:home")).text
    for page in PAGES:
        assert client.get(reverse(page)).status_code == 403

    for user in [system_admin, viewer]:
        client.force_login(user)
        assert reverse("audit:event_list") in client.get(reverse("core:home")).text
        for page in PAGES:
            assert client.get(reverse(page)).status_code == 200


@pytest.mark.django_db
def test_event_list_filters_by_user_event_and_jalali_dates(client, viewer):
    event(AuditEvent.Event.LOGIN_FAILED, "ali", tehran(2026, 10, 20, 23, 30))  # 1405/07/28
    event(AuditEvent.Event.LOGIN_FAILED, "sara", tehran(2026, 10, 21, 0, 30))  # 1405/07/29
    event(AuditEvent.Event.EXPORT, "sara", tehran(2026, 10, 22, 9, 0), report="گزارش", rows=3)  # 1405/07/30
    client.force_login(viewer)

    def listed(**params):
        response = client.get(reverse("audit:event_list"), params)
        return [(e.event, e.username) for e in response.context["events"] if e.username != "auditor"]

    assert listed(q="sara") == [("export", "sara"), ("login_failed", "sara")]
    assert listed(event="login_failed") == [("login_failed", "sara"), ("login_failed", "ali")]
    # روز با وقت تهران حساب می‌شود: ۲۳:۳۰ هنوز ۲۸ مهر است و ۰۰:۳۰ روز بعد.
    assert listed(start="1405/07/29", end="1405/07/29") == [("login_failed", "sara")]
    reversed_range = client.get(reverse("audit:event_list"), {"start": "1405/07/30", "end": "1405/07/28"})
    assert "end" in reversed_range.context["filter_form"].errors  # بازه‌ی وارونه خطاست
    page = client.get(reverse("audit:event_list"), {"event": "export"}).text
    assert "گزارش (3 ردیف)" in page


@pytest.mark.django_db
def test_export_gives_the_filtered_events_in_excel_and_logs_itself(client, viewer):
    event(AuditEvent.Event.LOGIN_FAILED, "ali", tehran(2026, 10, 20, 9, 0))
    event(AuditEvent.Event.LOGIN, "sara", tehran(2026, 10, 21, 9, 0))
    client.force_login(viewer)

    response = client.get(reverse("audit:event_export"), {"event": "login_failed"})

    assert response["Content-Disposition"].startswith('attachment; filename="audit-events-')
    sheet = load_workbook(BytesIO(response.content)).active
    rows = list(sheet.values)
    assert rows[0][:4] == ("زمان", "نام", "نام کاربری", "رویداد")
    assert [row[1:4] for row in rows[1:]] == [(None, "ali", "ورود ناموفق")]
    assert rows[1][0] == "1405/07/28 09:00"

    logged = AuditEvent.objects.filter(event=AuditEvent.Event.EXPORT).get()
    assert logged.user == viewer
    assert logged.details == {"report": "رویدادهای Audit Log", "filters": {"event": "login_failed"}, "rows": 1}


@pytest.mark.django_db
def test_export_with_bad_filters_goes_back_to_the_list(client, viewer):
    client.force_login(viewer)
    response = client.get(reverse("audit:event_export"), {"start": "دیروز"})
    assert response.status_code == 302
    assert not AuditEvent.objects.filter(event=AuditEvent.Event.EXPORT).exists()


@pytest.mark.django_db
def test_change_list_shows_who_changed_what(client, system_admin, viewer):
    client.force_login(system_admin)
    holiday = Holiday.objects.create(date=datetime.date(2027, 2, 11), title="انقلاب")
    client.post(
        reverse("workcalendar:holiday_update", args=[holiday.pk]), {"date": "1405/11/22", "title": "پیروزی انقلاب"}
    )

    client.force_login(viewer)
    response = client.get(reverse("audit:change_list"), {"model": "workcalendar.holiday"})

    rows = response.context["rows"]
    assert [row["type"] for row in rows] == ["ویرایش", "ایجاد"]
    assert rows[0]["record"].history_user == system_admin  # کاربر را میان‌افزار simple-history گذاشته
    assert rows[0]["changes"] == [("مناسبت", "انقلاب", "پیروزی انقلاب")]
    assert rows[1]["record"].history_user is None  # بدون درخواست ساخته شد
    assert "پیروزی انقلاب" in response.text

    assert client.get(reverse("audit:change_list"), {"model": "workcalendar.holiday", "history_type": "+"}).context[
        "rows"
    ][0]["type"] == "ایجاد"
    assert client.get(reverse("audit:change_list"), {"model": "no.such"}).context["rows"] == []


@pytest.mark.django_db
def test_change_list_shows_which_services_were_added_to_a_commitment(client, viewer):
    commitment = Commitment.objects.create(title="SLA پرداخت")
    commitment.services.add(make_service("SRV-1", name="پرداخت"))
    client.force_login(viewer)

    response = client.get(reverse("audit:change_list"), {"model": "catalog.commitment"})

    assert response.context["rows"][0]["changes"] == [("خدمت‌ها", "—", "SRV-1 - پرداخت")]
    assert "SLA پرداخت" in response.text


@pytest.mark.django_db
def test_staff_import_from_the_page_is_logged_with_the_admin_as_actor(client, system_admin, tmp_path):
    gone = User.objects.create_user("gone", personnel_code="9")
    client.force_login(system_admin)

    confirm(client, upload(client, tmp_path, person(1, "سارا", "احمدی", "مالی", manager="سارا احمدی"), deactivate=True))

    sara = User.objects.get(personnel_code="1")
    roles = AuditEvent.objects.filter(event=AuditEvent.Event.ROLES_CHANGED).latest("pk")
    assert (roles.user, roles.details["items"], roles.details["action"]) == (system_admin, [Role.UNIT_MANAGER], "added")
    assert AuditEvent.objects.get(event=AuditEvent.Event.MANAGED_UNITS_CHANGED).user == system_admin
    # غیرفعال شدن کسی که در فایل نبود هم در تاریخچه‌اش هست، با دلیل
    last = gone.history.first()
    assert (last.is_active, last.history_user, last.history_change_reason) == (
        False, system_admin, "ورود از فایل کارکنان"
    )
    assert sara.history.first().history_change_reason == "ورود از فایل کارکنان"