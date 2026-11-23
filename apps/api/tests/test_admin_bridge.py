"""صفحه‌های مدیریت سامانه در رابط React از راه پل جنگو: کاربران، ورود کارکنان با گزارش آزمایشی و تأیید، تعطیلات و
سوابق ممیزی، همه با همان دسترسی view جنگو."""

import datetime

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.accounts.tests.test_staff_import import make_file, person
from apps.api.routes import spa_route
from apps.audit.models import AuditEvent
from apps.catalog.tests.factories import make_user
from apps.core.jalali import jalali_year, to_jalali
from apps.organization.models import OrgUnit
from apps.workcalendar.models import Holiday

from .test_bridge import form, page, send

pytestmark = pytest.mark.django_db


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture(autouse=True)
def pending_dir(settings, tmp_path):
    """فایل‌های منتظر تأیید در پوشه‌ی موقت همین تست نگه داشته می‌شوند."""
    settings.STAFF_IMPORT_DIR = tmp_path / "pending"
    return settings.STAFF_IMPORT_DIR


def test_admin_pages_open_in_react():
    assert spa_route(reverse("accounts:user_list")) == "/accounts/users"
    assert spa_route(reverse("accounts:staff_import")) == "/accounts/staff-import"
    assert spa_route(reverse("accounts:user_create")) == "/accounts/users/new"
    assert spa_route(reverse("workcalendar:holiday_list")) == "/holidays"
    assert spa_route(reverse("workcalendar:holiday_create")) == "/holidays/new"
    assert spa_route(reverse("workcalendar:holiday_update", args=[3])) == "/holidays/3/edit"
    assert spa_route(f"{reverse('audit:event_list')}?event=login") == "/audit?event=login"
    assert spa_route(reverse("audit:change_list")) == "/audit/changes"
    # خروجی Excel فایل است و همان نشانی جنگو می‌ماند.
    assert spa_route(reverse("audit:event_export")) is None


def test_only_the_system_admin_opens_the_admin_pages(api, system_admin):
    viewer = make_user("viewer", Role.VIEWER)
    for path in [reverse("accounts:user_list"), reverse("workcalendar:holiday_list")]:
        assert page(api(viewer), path).status_code == 403
        assert page(api(system_admin), path).status_code == 200
    assert form(api(viewer), reverse("accounts:staff_import")).status_code == 403
    assert form(api(viewer), reverse("accounts:user_create")).status_code == 403
    assert form(api(viewer), reverse("workcalendar:holiday_create")).status_code == 403
    # سوابق ممیزی را «فقط مشاهده» (ممیز) هم می‌بیند، ولی کاربر بی‌نقش نه.
    assert page(api(viewer), reverse("audit:event_list")).status_code == 200
    assert page(api(viewer), reverse("audit:change_list")).status_code == 200
    assert page(api(make_user("sara")), reverse("audit:event_list")).status_code == 403


def test_the_user_list_shows_roles_and_filters(api, system_admin):
    unit = OrgUnit.objects.create(name="خزانه")
    make_user("reza", Role.GRC_MEMBER, first_name="رضا", last_name="نوری", personnel_code="17", org_unit=unit)
    make_user("old", first_name="مهدی", last_name="قدیمی", is_active=False)

    data = page(api(system_admin), reverse("accounts:user_list")).json()
    assert data["title"] == "کاربران" and data["import_url"] == reverse("accounts:staff_import")
    reza = next(row for row in data["results"] if row["username"] == "reza")
    assert reza == {
        "id": reza["id"],
        "name": "رضا نوری",
        "username": "reza",
        "personnel_code": "17",
        "org_unit": "خزانه",
        "roles": [Role.GRC_MEMBER],
        "is_active": True,
    }
    assert {field["name"] for field in data["filters"]["fields"]} == {"q", "unit", "role", "status"}

    inactive = page(api(system_admin), f"{reverse('accounts:user_list')}?status=inactive").json()
    assert [row["username"] for row in inactive["results"]] == ["old"]


NEW_USER = {
    "username": "n.karimi",
    "password1": "Sabz-Kooh-1405",
    "password2": "Sabz-Kooh-1405",
    "first_name": "نسرین",
    "last_name": "کریمی",
    "personnel_code": "4410",
    "job_title": "ممیز بیرونی",
    "email": "n.karimi@example.com",
}


def test_the_system_admin_adds_a_user_without_the_django_admin(api, system_admin):
    """مدیر سامانه staff نیست و پنل ادمین جنگو را نمی‌بیند؛ «کاربر جدید» فرم خود سامانه است."""
    assert not system_admin.is_staff
    unit = OrgUnit.objects.create(name="خزانه")
    OrgUnit.objects.create(name="بایگانی", is_active=False)
    client = api(system_admin)

    data = form(client, reverse("accounts:user_create")).json()
    assert data["title"] == "کاربر جدید"
    assert data["cancel"]["route"] == "/accounts/users"
    fields = {field["name"]: field for field in data["form"]["fields"]}
    assert list(fields) == [
        "username",
        "password1",
        "password2",
        "first_name",
        "last_name",
        "personnel_code",
        "job_title",
        "org_unit",
        "email",
        "roles",
        "access_expires",
    ]
    assert fields["password1"]["kind"] == "password" and fields["roles"]["kind"] == "multiselect"
    assert [choice["label"] for choice in fields["roles"]["choices"]] == Role.ALL
    assert [choice["label"] for choice in fields["org_unit"]["choices"]] == ["خزانه"]  # واحد غیرفعال نه
    assert fields["access_expires"]["kind"] == "date"

    roles = {choice["label"]: choice["value"] for choice in fields["roles"]["choices"]}
    expires = timezone.localdate() + datetime.timedelta(days=20)
    values = {
        **NEW_USER,
        "org_unit": str(unit.pk),
        "roles": [roles[Role.VIEWER]],
        "access_expires": to_jalali(expires),
    }
    response = send(client, reverse("accounts:user_create"), values)

    assert response.status_code == 200, response.json()
    assert response.json() == {
        "message": "کاربر «n.karimi» تعریف شد.",
        "redirect": {"href": reverse("accounts:user_list"), "route": "/accounts/users"},
    }
    user = User.objects.get(username="n.karimi")
    assert user.check_password("Sabz-Kooh-1405")
    assert user.get_full_name() == "نسرین کریمی" and user.personnel_code == "4410"
    assert user.org_unit == unit and user.access_expires == expires
    assert user.role_names == [Role.VIEWER]
    assert user.source == User.Source.LOCAL and user.is_active
    assert not user.is_staff and not user.is_superuser


def test_the_new_user_form_rejects_a_taken_username_and_mismatched_passwords(api, system_admin):
    make_user("n.karimi")
    client = api(system_admin)

    response = send(
        client, reverse("accounts:user_create"), {**NEW_USER, "password2": "something-else", "first_name": ""}
    )

    assert response.status_code == 400
    errors = response.json()["errors"]
    assert set(errors) == {"username", "password2", "first_name"}
    assert User.objects.filter(username="n.karimi").count() == 1


def upload(client, tmp_path, *rows, deactivate=False):
    with make_file(tmp_path, *rows).open("rb") as file:
        upload = SimpleUploadedFile("staff.xlsx", file.read())
    values = {"file": upload, **({"deactivate_missing": "on"} if deactivate else {})}
    return client.post(f"{reverse('api:form_bridge')}?path={reverse('accounts:staff_import')}", values)


def test_staff_import_shows_a_dry_run_then_imports_on_confirm(api, system_admin, tmp_path, pending_dir):
    gone = User.objects.create_user("gone", personnel_code="9")
    client = api(system_admin)

    data = form(client, reverse("accounts:staff_import")).json()
    assert data["title"] == "ورود کارکنان از فایل منابع انسانی"
    assert data["submit"] == "بارگذاری و گزارش آزمایشی" and "گزارش آزمایشی" in data["intro"]
    assert data["form"]["multipart"] is True
    assert [field["name"] for field in data["form"]["fields"]] == ["file", "deactivate_missing"]
    assert data["cancel"]["route"] == "/accounts/users"

    response = upload(client, tmp_path, person(1, "سارا", "احمدی", "خزانه*مالی", manager="سارا احمدی"), deactivate=True)
    assert response.status_code == 200, response.json()
    result = response.json()
    assert result["message"] == "گزارش آزمایشی آماده است؛ هنوز چیزی ذخیره نشده است." and result["redirect"] is None
    assert result["report"]["dry_run"] is True
    sections = {section["title"]: section for section in result["report"]["sections"]}
    assert sections["کاربران تازه"]["count"] == 1
    missing = sections["کاربرانی که در فایل نیستند و غیرفعال شدند"]
    assert missing["count"] == 1 and missing["lines"] == ["9 "] and missing["level"] is None
    assert result["confirm"]["url"] == reverse("accounts:staff_import_confirm")
    assert result["confirm"]["values"]["deactivate_missing"] is True
    # هنوز چیزی ذخیره نشده و فقط همان فایل منتظر تأیید است.
    assert not User.objects.filter(personnel_code="1").exists()
    assert len(list(pending_dir.iterdir())) == 1

    done = send(client, result["confirm"]["url"], {**result["confirm"]["values"], "confirm": ""})
    assert done.status_code == 200, done.json()
    body = done.json()
    assert body["message"] == "کارکنان وارد شدند. گزارش آن‌چه انجام شد:"
    assert body["report"]["dry_run"] is False and body["confirm"] is None
    assert User.objects.get(personnel_code="1").get_full_name() == "سارا احمدی"
    gone.refresh_from_db()
    assert not gone.is_active
    assert list(pending_dir.iterdir()) == []

    # همان شناسه دوباره پذیرفته نمی‌شود: فایل پاک شده است.
    again = send(client, result["confirm"]["url"], {**result["confirm"]["values"], "confirm": ""})
    assert again.status_code == 400
    assert again.json()["message"].startswith("فایل پیدا نشد")
    assert again.json()["redirect"]["route"] == "/accounts/staff-import"


def test_staff_import_cancel_deletes_the_file(api, system_admin, tmp_path, pending_dir):
    client = api(system_admin)
    result = upload(client, tmp_path, person(1, "سارا", "احمدی", "مالی"), person("", "رضا", "نوری", "مالی")).json()
    # ردیفی که وارد نمی‌شود با سطح danger می‌آید تا صفحه آن را باز و پررنگ نشان دهد.
    skipped = next(section for section in result["report"]["sections"] if section["level"])
    assert skipped["title"] == "ردیف‌هایی که وارد نشدند" and skipped["level"] == "danger" and skipped["count"] == 1

    response = send(client, result["confirm"]["url"], {**result["confirm"]["values"], "cancel": ""})

    assert response.status_code == 200
    assert response.json() == {
        "message": "ورود لغو شد و فایل پاک شد.",
        "redirect": {"href": reverse("accounts:staff_import"), "route": "/accounts/staff-import"},
    }
    assert not User.objects.filter(personnel_code="1").exists()
    assert list(pending_dir.iterdir()) == []


def test_staff_import_rejects_a_file_it_cannot_read(api, system_admin, tmp_path, pending_dir):
    client = api(system_admin)
    bad = SimpleUploadedFile("staff.xlsx", b"this is not an Excel file")

    response = client.post(f"{reverse('api:form_bridge')}?path={reverse('accounts:staff_import')}", {"file": bad})

    assert response.status_code == 400
    assert response.json()["errors"]["file"]
    assert not pending_dir.exists() or list(pending_dir.iterdir()) == []


def test_the_holiday_list_shows_this_year_and_deletes_through_django(api, system_admin):
    today = timezone.localdate()
    holiday = Holiday.objects.create(date=today, title="تعطیلی امروز")
    Holiday.objects.create(date=today - datetime.timedelta(days=400), title="تعطیلی پارسال")
    client = api(system_admin)

    data = page(client, reverse("workcalendar:holiday_list")).json()
    assert [row["title"] for row in data["results"]] == ["تعطیلی امروز"]
    row = data["results"][0]
    assert row["date"]["jalali"] == to_jalali(today) and row["weekday"] == holiday.weekday_name
    assert row["edit_url"] == reverse("workcalendar:holiday_update", args=[holiday.pk])
    assert data["create_url"] == reverse("workcalendar:holiday_create")
    assert "پنجشنبه و جمعه" in data["note"]
    # سال پیش‌فرض را خود view می‌گذارد؛ «همه‌ی سال‌ها» یعنی پارامتر خالی، نه نبودن آن.
    assert data["filters"]["defaults"] == {"year": str(jalali_year(today))}
    every_year = page(client, f"{reverse('workcalendar:holiday_list')}?year=").json()
    assert every_year["count"] == 2
    assert every_year["filters"]["defaults"] == {"year": str(jalali_year(today))}

    response = send(client, row["delete_url"], {})
    assert response.status_code == 200
    assert response.json()["message"] == "تعطیلی «تعطیلی امروز» حذف شد."
    assert response.json()["redirect"]["route"] == "/holidays"
    assert not Holiday.objects.filter(pk=holiday.pk).exists()


def test_a_holiday_is_saved_through_the_django_form(api, system_admin):
    client = api(system_admin)
    data = form(client, reverse("workcalendar:holiday_create")).json()
    assert data["title"] == "تعطیلی جدید" and data["cancel"]["route"] == "/holidays"

    response = send(client, reverse("workcalendar:holiday_create"), {"date": "1405/01/01", "title": "نوروز"})

    assert response.status_code == 200, response.json()
    assert response.json()["message"] == "تعطیلی «نوروز» ثبت شد."
    assert to_jalali(Holiday.objects.get(title="نوروز").date) == "1405/01/01"


def test_audit_events_keep_the_filters_for_the_excel_export(api, system_admin):
    reza = make_user("reza", first_name="رضا", last_name="نوری")
    AuditEvent.objects.create(user=reza, username="reza", event=AuditEvent.Event.LOGIN, ip_address="10.0.0.5")
    AuditEvent.objects.create(username="hacker", event=AuditEvent.Event.LOGIN_FAILED)
    client = api(system_admin)

    data = page(client, reverse("audit:event_list")).json()
    assert data["title"] == "سوابق ممیزی"
    assert [tab["href"] for tab in data["tabs"]] == [reverse("audit:event_list"), reverse("audit:change_list")]
    rows = {row["username"]: row for row in data["results"]}
    failed, login = rows["hacker"], rows["reza"]
    assert failed["user"] is None and failed["username"] == "hacker" and failed["warning"] is True
    assert failed["event"] == {"value": "login_failed", "label": "ورود ناموفق"}
    assert login["user"] == "رضا نوری" and login["ip_address"] == "10.0.0.5" and login["warning"] is False
    assert data["export_url"] == reverse("audit:event_export")
    assert "defaults" not in data["filters"]  # فهرست بی‌پیش‌فرض همان شکل قبلی را دارد

    filtered = page(client, f"{reverse('audit:event_list')}?q=reza&event=login").json()
    assert [row["username"] for row in filtered["results"]] == ["reza"]
    assert filtered["export_url"] == f"{reverse('audit:event_export')}?q=reza&event=login"

    # فیلتر نادرست: نه ردیفی، نه خروجی.
    wrong = page(client, f"{reverse('audit:event_list')}?start=1405/02/01&end=1405/01/01").json()
    assert wrong["results"] == [] and wrong["export_url"] is None
    assert any(field["errors"] for field in wrong["filters"]["fields"])

    # دیدن فهرست خودش رویدادی نمی‌سازد؛ فقط خروجی گرفتن ثبت می‌شود.
    assert AuditEvent.objects.filter(event=AuditEvent.Event.EXPORT).count() == 0


def test_data_changes_show_what_changed(api, system_admin):
    holiday = Holiday.objects.create(date=datetime.date(2026, 3, 21), title="نوروز")
    holiday.title = "عید نوروز"
    holiday.save()
    client = api(make_user("viewer", Role.VIEWER))

    data = page(client, f"{reverse('audit:change_list')}?model=workcalendar.holiday").json()
    edit, create = data["results"]
    assert edit["type"] == {"value": "~", "label": "ویرایش"}
    assert edit["changes"] == [{"label": "مناسبت", "old": "نوروز", "new": "عید نوروز"}]
    assert edit["hidden_edit"] is False and edit["record"] == str(holiday)
    assert create["type"]["label"] == "ایجاد" and create["changes"] == [] and create["user"] is None
    assert {field["name"] for field in data["filters"]["fields"]} == {"model", "q", "history_type", "start", "end"}
    assert set(data["filters"]["defaults"]) == {"model"}
