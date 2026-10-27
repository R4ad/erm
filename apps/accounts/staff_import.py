import re
from collections import Counter
from dataclasses import dataclass, field

from django.db import transaction
from openpyxl import load_workbook

from apps.organization.models import OrgUnit

from .models import User

COLUMNS = {
    "کد پرسنلی": "personnel_code",
    "نام": "first_name",
    "نام خانوادگی": "last_name",
    "جایگاه سازمانی": "position",
    "عنوان شغلی": "job_title",
}
REQUIRED_COLUMNS = ["کد پرسنلی", "نام", "نام خانوادگی", "جایگاه سازمانی"]

PERSIAN_LETTERS = str.maketrans({
    chr(0x064A): "ی",
    chr(0x0649): "ی",
    chr(0x0643): "ک",
    chr(0x200E): None,
    chr(0x200F): None,
})
LATIN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "0123456789" * 2)
ZWNJ = chr(0x200C)

CHANGE_REASON = "ورود از فایل کارکنان"


class StaffFileError(Exception):
    """فایل را نمی‌شود خواند؛ مثلاً Excel نیست یا ستونی لازم را ندارد."""


@dataclass
class StaffRow:
    line: int
    personnel_code: str
    first_name: str
    last_name: str
    job_title: str
    unit_path: list


def clean_text(value):
    """متن یک خانه را یکدست می‌کند: ی و ک فارسی، بدون فاصله‌ی اضافه و بدون فاصله کنار نیم‌فاصله."""
    if value is None:
        return ""
    text = str(value).translate(PERSIAN_LETTERS)
    text = re.sub(rf"\s*{ZWNJ}\s*", ZWNJ, text)
    return " ".join(text.split())


def clean_code(value):
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    return clean_text(value).translate(LATIN_DIGITS)


def header_key(value):
    """سرستون بدون فاصله و نیم‌فاصله، تا «کدپرسنلی» و «کد پرسنلی» یکی حساب شوند."""
    return clean_text(value).replace(" ", "").replace(ZWNJ, "")


def read_staff_file(file):
    """فایل را می‌خواند و (ردیف‌های درست، پیام خطای ردیف‌های نادرست) را برمی‌گرداند. در پایگاه داده چیزی نمی‌نویسد."""
    try:
        sheet = load_workbook(file, data_only=True).worksheets[0]
    except Exception as error:
        raise StaffFileError(f"فایل Excel خوانده نشد: {error}") from error

    lines = sheet.iter_rows(values_only=True)
    header = [header_key(title) for title in next(lines, ())]
    index_of = {}  # نام هر ستون در کد ← شماره‌ی ستون در فایل
    for title, name in COLUMNS.items():
        key = header_key(title)
        if key in header:
            index_of[name] = header.index(key)
    missing = [title for title in REQUIRED_COLUMNS if COLUMNS[title] not in index_of]
    if missing:
        raise StaffFileError(f"این ستون‌ها در فایل نیست: {'، '.join(missing)}")

    rows, errors = [], []
    for line, values in enumerate(lines, start=2):
        if not any(values):
            continue  # ردیف خالی
        cell = {name: values[index] for name, index in index_of.items()}
        code = clean_code(cell["personnel_code"])
        first_name = clean_text(cell["first_name"])
        last_name = clean_text(cell["last_name"])
        parts = [clean_text(part) for part in clean_text(cell["position"]).split("*")]
        unit_path = [part for part in reversed(parts) if part]

        if not code:
            errors.append(f"ردیف {line}: کد پرسنلی خالی است.")
        elif not re.fullmatch(r"[0-9]{1,20}", code):
            errors.append(f"ردیف {line}: کد پرسنلی «{code}» درست نیست؛ باید فقط رقم باشد، حداکثر ۲۰ رقم.")
        elif not first_name or not last_name:
            errors.append(f"ردیف {line}: نام یا نام خانوادگی خالی است.")
        elif not unit_path:
            errors.append(f"ردیف {line}: جایگاه سازمانی خالی است.")
        else:
            job_title = clean_text(cell.get("job_title"))
            rows.append(StaffRow(line, code, first_name, last_name, job_title, unit_path))

    counts = Counter(row.personnel_code for row in rows)
    for row in rows:
        if counts[row.personnel_code] > 1:
            errors.append(f"ردیف {row.line}: کد پرسنلی {row.personnel_code} در فایل تکراری است.")
    rows = [row for row in rows if counts[row.personnel_code] == 1]

    if not rows and not errors:
        raise StaffFileError("فایل هیچ ردیفی ندارد.")
    return rows, errors

@dataclass
class ImportReport:
    new_units: list = field(default_factory=list)  # مسیر کامل هر واحد تازه
    new_users: list = field(default_factory=list)
    updated_users: list = field(default_factory=list)  # (کاربر، فیلدهایی که عوض شد)
    unchanged_users: int = 0
    missing_users: list = field(default_factory=list)  # کاربرانی که در فایل نیستند
    errors: list = field(default_factory=list)  # ردیف‌هایی که هنگام نوشتن کنار گذاشته شدند


@transaction.atomic
def import_staff(rows, deactivate_missing=False):
    """ردیف‌ها را در پایگاه داده می‌نویسد. اجرای دوباره با همان فایل چیزی را عوض نمی‌کند."""
    report = ImportReport()
    # همه‌ی واحدها و کاربران را یک بار می‌خوانیم تا برای هر ردیف پرس‌وجوی جدا نزنیم.
    # نام واحدهایی که دستی ساخته شده‌اند هم یکدست می‌شود تا «مالي» و «مالی» یک واحد حساب شوند.
    units = {(unit.parent_id, clean_text(unit.name)): unit for unit in OrgUnit.objects.all()}
    users = {user.personnel_code: user for user in User.objects.exclude(personnel_code=None)}

    for row in rows:
        unit = None
        for depth, name in enumerate(row.unit_path):
            parent = unit
            unit = units.get((parent.pk if parent else None, name))
            if unit is None:
                unit = OrgUnit(name=name, parent=parent)
                unit._change_reason = CHANGE_REASON
                unit.save()
                units[(unit.parent_id, name)] = unit
                report.new_units.append(" / ".join(row.unit_path[: depth + 1]))
            elif not unit.is_active:
                break
        if not unit.is_active:
            # همان قانون فرم واحد: کسی در واحد غیرفعال یا زیر آن نمی‌نشیند. مدیر سامانه تصمیم می‌گیرد.
            report.errors.append(f"ردیف {row.line}: واحد «{unit.name}» غیرفعال است؛ این ردیف وارد نشد.")
            continue

        values = {
            "first_name": row.first_name,
            "last_name": row.last_name,
            "job_title": row.job_title,
            "org_unit_id": unit.pk,
        }
        user = users.get(row.personnel_code)
        if user is None:
            # نام کاربری فعلاً همان کد پرسنلی است. کاربر رمز ندارد تا مدیر سامانه برایش رمز بگذارد (بعداً AD).
            user = User(username=row.personnel_code, personnel_code=row.personnel_code, **values)
            user.set_unusable_password()
            user.save()
            report.new_users.append(user)
            continue

        changed = [name for name, value in values.items() if getattr(user, name) != value]
        if changed:
            for name in changed:
                setattr(user, name, values[name])
            user.save(update_fields=changed)
            report.updated_users.append((user, changed))
        else:
            report.unchanged_users += 1

    # مدیر کل (superuser) هیچ‌وقت غیرفعال نمی‌شود تا کسی از سامانه بیرون نماند.
    missing = (
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(personnel_code=None)
        .exclude(personnel_code__in=[row.personnel_code for row in rows])
    )
    report.missing_users = list(missing)
    if deactivate_missing:
        missing.update(is_active=False)
    return report
