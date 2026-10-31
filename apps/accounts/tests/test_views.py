import re

import pytest
from django.urls import reverse

from apps.accounts.models import User
from apps.organization.models import OrgUnit

from .test_staff_import import make_file, person


@pytest.fixture(autouse=True)
def pending_dir(settings, tmp_path):
    """فایل‌های منتظر تأیید در پوشه‌ی موقت همین تست نگه داشته می‌شوند."""
    settings.STAFF_IMPORT_DIR = tmp_path / "pending"
    return settings.STAFF_IMPORT_DIR


def upload(client, tmp_path, *rows, deactivate=False):
    with make_file(tmp_path, *rows).open("rb") as file:
        return client.post(reverse("accounts:staff_import"), {"file": file, "deactivate_missing": deactivate})


def confirm(client, upload_response, button="confirm"):
    """همان کاری که دکمه‌ی «تأیید و ذخیره» یا «انصراف» می‌کند: فیلدهای پنهان صفحه را می‌فرستد."""
    hidden = dict(re.findall(r'type="hidden" name="(\w+)" value="([^"]*)"', upload_response.text))
    return client.post(reverse("accounts:staff_import_confirm"), {**hidden, button: ""}, follow=True)


def imported_users():
    return User.objects.exclude(personnel_code=None)


@pytest.mark.django_db
def test_only_system_admin_can_use_the_pages_and_see_their_menu_links(client, system_admin):
    pages = [reverse("accounts:staff_import")]
    client.force_login(User.objects.create_user("sara"))
    home = client.get(reverse("core:home")).text
    for page in pages:
        assert client.get(page).status_code == 403
        assert page not in home
    assert client.post(reverse("accounts:staff_import_confirm")).status_code == 403

    client.force_login(system_admin)
    home = client.get(reverse("core:home")).text
    for page in pages:
        assert client.get(page).status_code == 200
        assert page in home


@pytest.mark.django_db
def test_upload_shows_a_dry_run_and_confirm_imports_it(client, system_admin, tmp_path, pending_dir):
    gone = User.objects.create_user("gone", personnel_code="9")
    client.force_login(system_admin)

    response = upload(
        client, tmp_path, person(1, "سارا", "احمدی", "خزانه*مالی", manager="سارا احمدی"), deactivate=True
    )

    assert "مالی / خزانه: سارا احمدی" in response.text
    assert "کاربرانی که در فایل نیستند و غیرفعال شدند: 1" in response.text
    assert not User.objects.filter(personnel_code="1").exists()
    assert len(list(pending_dir.iterdir())) == 1

    response = confirm(client, response)

    assert "کارکنان وارد شدند" in response.text
    sara = User.objects.get(personnel_code="1")
    assert [unit.name for unit in sara.managed_units.all()] == ["خزانه"]
    assert OrgUnit.objects.get(name="خزانه").history.first().history_user == system_admin
    gone.refresh_from_db()
    assert not gone.is_active
    assert list(pending_dir.iterdir()) == []


@pytest.mark.django_db
def test_cancel_deletes_the_file_and_saves_nothing(client, system_admin, tmp_path, pending_dir):
    client.force_login(system_admin)
    response = upload(client, tmp_path, person(1, "سارا", "احمدی", "مالی"), person("", "رضا", "نوری", "مالی"))
    assert "ردیف‌هایی که وارد نشدند: 1" in response.text

    response = confirm(client, response, button="cancel")

    assert "ورود لغو شد" in response.text
    assert not imported_users().exists()
    assert list(pending_dir.iterdir()) == []


@pytest.mark.django_db
def test_only_the_latest_upload_can_be_confirmed(client, system_admin, tmp_path):
    client.force_login(system_admin)
    first = upload(client, tmp_path, person(1, "سارا", "احمدی", "مالی"))
    upload(client, tmp_path, person(2, "رضا", "نوری", "مالی"))

    response = confirm(client, first)

    assert "فایل پیدا نشد" in response.text
    assert not imported_users().exists()


@pytest.mark.django_db
def test_a_file_that_cannot_be_read_is_rejected_and_not_kept(client, system_admin, tmp_path, pending_dir):
    client.force_login(system_admin)
    path = tmp_path / "staff.xlsx"
    path.write_text("this is not an Excel file")

    with path.open("rb") as file:
        response = client.post(reverse("accounts:staff_import"), {"file": file})

    assert "فایل Excel خوانده نشد" in response.context["form"].errors["file"][0]
    assert list(pending_dir.iterdir()) == []


@pytest.mark.django_db
def test_nobody_is_deactivated_while_the_file_has_bad_rows(client, system_admin, tmp_path):
    client.force_login(system_admin)

    response = upload(
        client, tmp_path, person("", "سارا", "احمدی", "مالی"), person(2, "رضا", "نوری", "مالی"), deactivate=True
    )

    assert "تا درست نشود کسی غیرفعال نمی‌شود" in response.context["form"].errors["file"][0]
    assert not imported_users().exists()