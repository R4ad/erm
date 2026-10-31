import re

import pytest
from django.contrib.auth.models import Group
from django.urls import reverse

from apps.accounts.models import User
from apps.accounts.roles import Role
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
    pages = [reverse("accounts:user_list"), reverse("accounts:staff_import")]
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


def listed(client, **params):
    """نام کاربری کسانی که فهرست کاربران با این جست‌وجو و فیلترها نشان می‌دهد."""
    response = client.get(reverse("accounts:user_list"), params)
    return sorted(person.username for person in response.context["users"])


@pytest.fixture
def staff(system_admin):
    finance = OrgUnit.objects.create(name="مالی")
    treasury = OrgUnit.objects.create(name="خزانه", parent=finance)
    it = OrgUnit.objects.create(name="فناوری")
    zwnj = chr(0x200C)
    User.objects.create_user("sara", personnel_code="1001", first_name="سارا", last_name="احمدی نژاد", org_unit=treasury)
    mahdi = User.objects.create_user(
        "1002", personnel_code="1002", first_name="مهدی", last_name=f"علی{zwnj}پور", org_unit=finance
    )
    mahdi.groups.add(Group.objects.get(name=Role.UNIT_MANAGER))
    User.objects.create_user("2001", personnel_code="2001", first_name="رضا", last_name="نوری", org_unit=it)
    User.objects.create_user("2002", personnel_code="2002", first_name="مینا", last_name="کریمی", is_active=False)
    return {"finance": finance, "it": it}


@pytest.mark.django_db
def test_search_finds_every_word_in_names_and_codes(client, system_admin, staff):
    client.force_login(system_admin)
    zwnj, arabic_yeh = chr(0x200C), chr(0x064A)

    assert listed(client, q="سارا احمدی") == ["sara"]
    assert listed(client, q="علی پور") == ["1002"]  # نام با نیم‌فاصله ثبت شده
    assert listed(client, q=f"احمدی{zwnj}نژاد") == ["sara"]  # نام با فاصله ثبت شده
    assert listed(client, q=f"عل{arabic_yeh}") == ["1002"]
    assert listed(client, q="۱۰۰") == ["1002", "sara"]  # رقم فارسی در کد پرسنلی
    assert listed(client, q="sara") == ["sara"]
    assert listed(client, q="سارا نوری") == []


@pytest.mark.django_db
def test_filters_by_unit_with_its_sub_units_role_and_status(client, system_admin, staff):
    client.force_login(system_admin)

    assert listed(client, unit=staff["finance"].pk) == ["1002", "sara"]
    assert listed(client, unit=staff["it"].pk) == ["2001"]
    assert listed(client, role=Role.UNIT_MANAGER) == ["1002"]
    assert listed(client, status="inactive") == ["2002"]
    assert listed(client, status="active", q="20") == ["2001"]
    assert listed(client, role="نقش ناموجود") == []


@pytest.mark.django_db
def test_page_links_keep_the_search(client, system_admin):
    for number in range(30):
        User.objects.create_user(f"77{number:02}", personnel_code=f"77{number:02}")
    client.force_login(system_admin)

    response = client.get(reverse("accounts:user_list"), {"q": "77"})

    assert response.context["paginator"].count == 30
    assert len(response.context["users"]) == 25
    assert "?q=77&amp;page=2" in response.text