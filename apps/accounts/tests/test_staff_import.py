from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from openpyxl import Workbook

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.accounts.staff_import import StaffFileError, import_staff, read_staff_file
from apps.organization.models import OrgUnit

HEADER = [
    "کدپرسنلی", "نام", "نام خانوادگی", "وضعیت همکاری", "جایگاه سازمانی",
    "نام مدیر", "مدیر مافوق", "عنوان شغلی", "ساختمان محل همکاری", "شهر محل همکاری",
]


def person(code, first_name, last_name, position, job_title="", manager="", superior=""):
    """یک ردیف فایل با همان ترتیب ستون‌های فایل منابع انسانی."""
    return [code, first_name, last_name, "", position, manager, superior, job_title, "", ""]


def make_file(tmp_path, *rows, header=HEADER):
    """یک فایل Excel ساختگی می‌سازد و مسیرش را برمی‌گرداند."""
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(header)
    for row in rows:
        sheet.append(row)
    path = tmp_path / "staff.xlsx"
    workbook.save(path)
    return path


def import_file(tmp_path, *rows):
    """فایل ساختگی را می‌سازد، می‌خواند و وارد می‌کند."""
    rows, _ = read_staff_file(make_file(tmp_path, *rows))
    return import_staff(rows)


def test_position_becomes_a_path_from_the_root_and_text_is_cleaned(tmp_path):
    arabic_yeh = chr(0x064A)  # ي عربی؛ با کیبورد فارسی تایپ نمی‌شود
    path = make_file(tmp_path, person(12345, f"مر{arabic_yeh}م", " صادقی  نژاد", "پشتیبانی فنی*مدیریت پرداخت * توسعه محصول"))

    rows, errors = read_staff_file(path)

    assert errors == []
    row = rows[0]
    assert row.personnel_code == "12345"
    assert row.first_name == "مریم"  # ي عربی شد ی فارسی
    assert row.last_name == "صادقی نژاد"
    assert row.unit_path == ["توسعه محصول", "مدیریت پرداخت", "پشتیبانی فنی"]


def test_bad_rows_are_reported_and_left_out(tmp_path):
    path = make_file(
        tmp_path,
        person("", "علی", "رضایی", "مالی"),
        person("۱۲الف", "علی", "رضایی", "مالی"),
        person(5, "سارا", "احمدی", ""),
        person(7, "مینا", "کریمی", "مالی"),
        person(7, "مینا", "کریمی", "فنی"),
        person("۸", "رضا", "نوری", "مالی"),
    )

    rows, errors = read_staff_file(path)

    assert [row.personnel_code for row in rows] == ["8"]
    assert len(errors) == 5


def test_file_without_a_needed_column_is_rejected(tmp_path):
    path = make_file(tmp_path, ["1", "سارا"], header=["کد پرسنلی", "نام"])

    with pytest.raises(StaffFileError):
        read_staff_file(path)


@pytest.mark.django_db
def test_import_builds_the_tree_and_running_it_again_changes_nothing(tmp_path):
    rows, _ = read_staff_file(make_file(
        tmp_path,
        person(1, "سارا", "احمدی", "خزانه*مالی*مدیر عامل", "کارشناس خزانه"),
        person(2, "رضا", "نوری", "مالی*مدیر عامل"),
    ))

    report = import_staff(rows)

    assert len(report.new_units) == 3
    assert len(report.new_users) == 2
    sara = User.objects.get(personnel_code="1")
    assert sara.org_unit.name == "خزانه"
    assert sara.org_unit.parent.name == "مالی"
    assert sara.job_title == "کارشناس خزانه"
    assert not sara.has_usable_password()

    again = import_staff(rows)
    assert (again.new_units, again.new_users, again.unchanged_users) == ([], [], 2)


@pytest.mark.django_db
def test_import_moves_people_and_deactivates_only_on_request(tmp_path):
    finance = OrgUnit.objects.create(name="مالی")
    sara = User.objects.create_user("sara", personnel_code="1", first_name="سارا", last_name="احمدی", org_unit=finance)
    gone = User.objects.create_user("gone", personnel_code="2")
    User.objects.create_superuser("admin", personnel_code="3")
    User.objects.create_user("no-code")
    rows, _ = read_staff_file(make_file(tmp_path, person(1, "سارا", "احمدی", "فنی")))

    report = import_staff(rows)
    sara.refresh_from_db()
    gone.refresh_from_db()
    assert sara.org_unit.name == "فنی"
    assert report.updated_users == [(sara, ["org_unit_id"])]
    assert report.missing_users == [gone]
    assert gone.is_active

    import_staff(rows, deactivate_missing=True)
    gone.refresh_from_db()
    assert not gone.is_active


@pytest.mark.django_db
def test_nobody_is_put_in_an_inactive_unit(tmp_path):
    OrgUnit.objects.create(name="واحد منحل", is_active=False)
    rows, _ = read_staff_file(make_file(tmp_path, person(1, "سارا", "احمدی", "خزانه*واحد منحل")))

    report = import_staff(rows)

    assert len(report.errors) == 1
    assert not User.objects.filter(personnel_code="1").exists()
    assert not OrgUnit.objects.filter(name="خزانه").exists()


@pytest.mark.django_db
def test_dry_run_saves_nothing(tmp_path):
    path = make_file(tmp_path, person(1, "سارا", "احمدی", "مالی"))
    out = StringIO()

    call_command("import_staff", str(path), "--dry-run", stdout=out)

    assert not User.objects.filter(personnel_code="1").exists()
    assert not OrgUnit.objects.exists()
    assert "کاربران تازه: 1" in out.getvalue()


@pytest.mark.django_db
def test_each_manager_becomes_manager_of_their_own_unit(tmp_path):
    zwnj = chr(0x200C)  # نیم‌فاصله
    rows = [
        person(1, "نادر", "شریفی", "مدیر عامل", manager="نادر شریفی"),
        person(2, "مهدی", f"علی{zwnj}پور", "مالی*مدیر عامل", manager="نادر شریفی"),
        person(3, "سارا", "احمدی", "خزانه*مالی*مدیر عامل", manager="مهدی علی پور"),  # با فاصله
    ]

    report = import_file(tmp_path, *rows)

    mahdi = User.objects.get(personnel_code="2")
    assert [unit.name for unit in mahdi.managed_units.all()] == ["مالی"]
    assert mahdi.has_role(Role.UNIT_MANAGER)
    assert not OrgUnit.objects.get(name="خزانه").managers.exists()
    assert sorted(path for path, new, removed in report.manager_changes) == ["مدیر عامل", "مدیر عامل / مالی"]
    assert report.manager_problems == []

    again = import_file(tmp_path, *rows)
    assert (again.manager_changes, again.unchanged_managed_units, again.new_unit_managers) == ([], 2, [])


@pytest.mark.django_db
def test_same_name_managers_are_told_apart_by_the_superior(tmp_path):
    import_file(
        tmp_path,
        person(1, "علی", "رضایی", "مالی", manager="مینا کریمی"),
        person(2, "علی", "رضایی", "فنی", manager="رضا نوری"),
        person(3, "سارا", "احمدی", "فنی", manager="علی رضایی", superior="رضا نوری"),
    )

    assert not User.objects.get(personnel_code="1").managed_units.exists()
    assert [unit.name for unit in User.objects.get(personnel_code="2").managed_units.all()] == ["فنی"]


@pytest.mark.django_db
def test_unknown_and_ambiguous_managers_are_reported(tmp_path):
    report = import_file(
        tmp_path,
        person(1, "علی", "رضایی", "مالی", manager="مینا کریمی"),
        person(2, "علی", "رضایی", "فنی"),
        person(3, "سارا", "احمدی", "فنی", manager="علی رضایی"),
        person(4, "رضا", "نوری", "فنی", manager="مینا کریمی"),
    )

    assert report.manager_problems == [
        "«مینا کریمی» در ردیف‌های واردشده نیست. ردیف: 2، 5",
        "چند نفر «علی رضایی» نام دارند و «مدیر مافوق» معلومشان نکرد. ردیف: 4",
    ]
    assert not OrgUnit.objects.filter(managers__isnull=False).exists()


@pytest.mark.django_db
def test_only_units_named_in_the_file_get_new_managers(tmp_path):
    finance = OrgUnit.objects.create(name="مالی")
    archive = OrgUnit.objects.create(name="بایگانی")
    old = User.objects.create_user("old")
    old.managed_units.set([finance, archive])

    report = import_file(tmp_path, person(1, "سارا", "احمدی", "مالی", manager="سارا احمدی"))

    sara = User.objects.get(personnel_code="1")
    assert list(finance.managers.all()) == [sara]
    assert list(archive.managers.all()) == [old]
    assert report.manager_changes == [("مالی", {sara}, {old})]


@pytest.mark.django_db
def test_the_role_is_never_taken_away_only_reported(tmp_path):
    idle = User.objects.create_user("idle")
    idle.groups.add(Group.objects.get(name=Role.UNIT_MANAGER))

    report = import_file(tmp_path, person(1, "سارا", "احمدی", "مالی"))

    assert report.idle_unit_managers == [idle]
    assert idle.has_role(Role.UNIT_MANAGER)


@pytest.mark.django_db
def test_report_shows_each_unit_with_its_manager(tmp_path):
    path = make_file(tmp_path, person(1, "سارا", "احمدی", "خزانه*مالی", manager="سارا احمدی"))
    out = StringIO()

    call_command("import_staff", str(path), "--dry-run", stdout=out)

    assert "مالی / خزانه: سارا احمدی" in out.getvalue()