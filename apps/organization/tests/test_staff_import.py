from io import StringIO

import pytest
from django.core.management import call_command
from openpyxl import Workbook

from apps.accounts.models import User
from apps.accounts.staff_import import StaffFileError, import_staff, read_staff_file
from apps.organization.models import OrgUnit

HEADER = [
    "کدپرسنلی", "نام", "نام خانوادگی", "وضعیت همکاری", "جایگاه سازمانی",
    "نام مدیر", "مدیر مافوق", "عنوان شغلی", "ساختمان محل همکاری", "شهر محل همکاری",
]


def person(code, first_name, last_name, position, job_title=""):
    """یک ردیف فایل با همان ترتیب ستون‌های فایل منابع انسانی."""
    return [code, first_name, last_name, "", position, "", "", job_title, "", ""]


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


def test_position_becomes_a_path_from_the_root_and_text_is_cleaned(tmp_path):
    arabic_yeh = chr(0x064A)  # ي عربی؛ با کیبورد فارسی تایپ نمی‌شود
    path = make_file(tmp_path, person(81597, f"فر{arabic_yeh}با", " عسکر  حلوائی", "پشتیبانی فنی*مدیریت پرداخت * توسعه محصول"))

    rows, errors = read_staff_file(path)

    assert errors == []
    row = rows[0]
    assert row.personnel_code == "81597"
    assert row.first_name == "فریبا"  # ي عربی شد ی فارسی
    assert row.last_name == "عسکر حلوائی"
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
