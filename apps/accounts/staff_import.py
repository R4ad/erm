import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from django.contrib.auth.models import Group
from django.db import transaction
from openpyxl import load_workbook

from apps.organization.models import OrgUnit

from .models import User
from .roles import Role

COLUMNS = {
    "کد پرسنلی": "personnel_code",
    "نام": "first_name",
    "نام خانوادگی": "last_name",
    "جایگاه سازمانی": "position",
    "عنوان شغلی": "job_title",
    "نام مدیر": "manager_name",
    "مدیر مافوق": "superior_name",
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
    manager_name: str
    superior_name: str


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

def name_key(name):
    """نام برای مقایسه، با همان یکدست‌سازی سرستون‌ها: «علی پور» و «علی‌پور» یک نفرند."""
    return header_key(name)


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
            manager_name = clean_text(cell.get("manager_name"))
            superior_name = clean_text(cell.get("superior_name"))
            rows.append(StaffRow(
                line, code, first_name, last_name, job_title, unit_path, manager_name, superior_name
            ))

    counts = Counter(row.personnel_code for row in rows)
    for row in rows:
        if counts[row.personnel_code] > 1:
            errors.append(f"ردیف {row.line}: کد پرسنلی {row.personnel_code} در فایل تکراری است.")
    rows = [row for row in rows if counts[row.personnel_code] == 1]

    if not rows and not errors:
        raise StaffFileError("فایل هیچ ردیفی ندارد.")
    return rows, errors


@dataclass
class ReportSection:
    """یک بخش گزارش: عنوان و تعداد، و اگر لازم است سطرهای جزئیات."""
    title: str
    count: int
    lines: list = field(default_factory=list)
    level: str = ""  # warning یا danger برای بخش‌هایی که کار دستی لازم دارند


def full_names(users):
    return "، ".join(sorted(user.get_full_name() for user in users))


@dataclass
class ImportReport:
    deactivate_missing: bool = False
    new_units: list = field(default_factory=list)  # مسیر کامل هر واحد تازه
    new_users: list = field(default_factory=list)
    updated_users: list = field(default_factory=list)  # (کاربر، فیلدهایی که عوض شد)
    unchanged_users: int = 0
    missing_users: list = field(default_factory=list)  # کاربرانی که در فایل نیستند
    errors: list = field(default_factory=list)  # ردیف‌هایی که هنگام نوشتن کنار گذاشته شدند
    manager_changes: list = field(default_factory=list)  # (مسیر واحد، مدیرهای تازه، مدیرهایی که کنار رفتند)
    unchanged_managed_units: int = 0
    new_unit_managers: list = field(default_factory=list)  # کسانی که نقش «مدیر واحد» گرفتند
    idle_unit_managers: list = field(default_factory=list)  # نقش «مدیر واحد» دارند ولی مدیر هیچ واحدی نیستند
    manager_problems: list = field(default_factory=list)  # «نام مدیر»هایی که معلوم نشد چه کسی‌اند

    def sections(self):
        """گزارش به شکل فهرست بخش‌ها؛ دستور import_staff و صفحه‌ی ورود کارکنان هر دو همین را نشان می‌دهند."""
        updated = []
        for user, changed in self.updated_users:
            labels = "، ".join(str(User._meta.get_field(name).verbose_name) for name in changed)
            updated.append(f"{user.personnel_code} {user.get_full_name()}: {labels}")
        changes = []
        for path, new, removed in sorted(self.manager_changes, key=lambda change: change[0]):
            line = f"{path}: {full_names(new)}"
            if removed:
                line += f" (به جای {full_names(removed)})"
            changes.append(line)
        action = "غیرفعال شدند" if self.deactivate_missing else "فعال ماندند"

        sections = [
            ReportSection("واحدهای تازه", len(self.new_units), sorted(self.new_units)),
            ReportSection("کاربران تازه", len(self.new_users)),
            ReportSection("کاربران به‌روزشده", len(updated), updated),
            ReportSection("کاربران بدون تغییر", self.unchanged_users),
            ReportSection(
                f"کاربرانی که در فایل نیستند و {action}",
                len(self.missing_users),
                [f"{user.personnel_code} {user.get_full_name()}" for user in self.missing_users],
            ),
            ReportSection("واحدهایی که مدیرشان تعیین یا عوض شد", len(changes), changes),
            ReportSection("واحدهایی که مدیرشان همان ماند", self.unchanged_managed_units),
            ReportSection(
                "نقش «مدیر واحد» داده شد به",
                len(self.new_unit_managers),
                [f"{user.username} {user.get_full_name()}" for user in self.new_unit_managers],
            ),
        ]
        if self.idle_unit_managers:
            sections.append(ReportSection(
                "نقش «مدیر واحد» دارند ولی مدیر هیچ واحدی نیستند",
                len(self.idle_unit_managers),
                [f"{user.username} {user.get_full_name()}" for user in self.idle_unit_managers],
                "warning",
            ))
        if self.manager_problems:
            sections.append(ReportSection(
                "مدیرهایی که معلوم نشدند", len(self.manager_problems), self.manager_problems, "warning"
            ))
        if self.errors:
            sections.append(ReportSection("ردیف‌هایی که وارد نشدند", len(self.errors), self.errors, "danger"))
        return sections


@transaction.atomic
def import_staff(rows, deactivate_missing=False):
    """ردیف‌ها را در پایگاه داده می‌نویسد. اجرای دوباره با همان فایل چیزی را عوض نمی‌کند."""
    report = ImportReport(deactivate_missing=deactivate_missing)
    # همه‌ی واحدها و کاربران را یک بار می‌خوانیم تا برای هر ردیف پرس‌وجوی جدا نزنیم.
    # نام واحدهایی که دستی ساخته شده‌اند هم یکدست می‌شود تا «مالي» و «مالی» یک واحد حساب شوند.
    units = {(unit.parent_id, clean_text(unit.name)): unit for unit in OrgUnit.objects.all()}
    users = {user.personnel_code: user for user in User.objects.exclude(personnel_code=None)}
    imported = []
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
            user._change_reason = CHANGE_REASON
            user.set_unusable_password()
            user.save()
            report.new_users.append(user)
            imported.append((row, user))
            continue

        changed = [name for name, value in values.items() if getattr(user, name) != value]
        if changed:
            for name in changed:
                setattr(user, name, values[name])
            user._change_reason = CHANGE_REASON
            user.save(update_fields=changed)
            report.updated_users.append((user, changed))
        else:
            report.unchanged_users += 1

        imported.append((row, user))
    assign_managers(imported, report)

    # مدیر کل (superuser) هیچ‌وقت غیرفعال نمی‌شود تا کسی از سامانه بیرون نماند.
    missing = (
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(personnel_code=None)
        .exclude(personnel_code__in=[row.personnel_code for row in rows])
    )
    report.missing_users = list(missing)
    if deactivate_missing:
        # با save و نه update()، تا غیرفعال شدن هر نفر در تاریخچه‌ی کاربر (Audit Log) بماند.
        for user in report.missing_users:
            user.is_active = False
            user._change_reason = CHANGE_REASON
            user.save(update_fields=["is_active"])
    return report


def assign_managers(imported, report):
    """هر کس که در «نام مدیر» آمده، مدیر واحد خودش می‌شود و نقش «مدیر واحد» را می‌گیرد."""
    by_name = defaultdict(list)  # نام ← (ردیف، کاربر) همه‌ی کسانی که این نام را دارند
    for row, user in imported:
        by_name[name_key(row.first_name + row.last_name)].append((row, user))

    managers = defaultdict(set)  # شناسه‌ی واحد ← مدیرهایش طبق فایل
    paths = {}  # شناسه‌ی واحد ← مسیرش، برای گزارش
    problems = defaultdict(list)  # پیام ← شماره‌ی ردیف‌هایی که این مشکل را دارند
    for row, _ in imported:
        if not row.manager_name:
            continue
        found = by_name.get(name_key(row.manager_name), [])
        if not found:
            problems[f"«{row.manager_name}» در ردیف‌های واردشده نیست."].append(row.line)
            continue
        if len(found) > 1:
            # هم‌نام‌ها: مدیر درست کسی است که مدیر خودش همان «مدیر مافوق» این ردیف است.
            superior = name_key(row.superior_name)
            found = [
                (candidate_row, candidate)
                for candidate_row, candidate in found
                if superior and name_key(candidate_row.manager_name) == superior
            ]
        if len(found) != 1:
            problems[f"چند نفر «{row.manager_name}» نام دارند و «مدیر مافوق» معلومشان نکرد."].append(row.line)
            continue
        manager_row, manager = found[0]
        managers[manager.org_unit_id].add(manager)
        paths[manager.org_unit_id] = " / ".join(manager_row.unit_path)

    report.manager_problems = [
        f"{message} ردیف: {'، '.join(str(line) for line in lines)}" for message, lines in problems.items()
    ]

    # فقط واحدهایی که فایل برایشان مدیر نشان می‌دهد عوض می‌شوند؛ بقیه دست نمی‌خورند.
    units = OrgUnit.objects.prefetch_related("managers").in_bulk(list(managers))
    for unit_id, new in managers.items():
        old = set(units[unit_id].managers.all())
        if new == old:
            report.unchanged_managed_units += 1
        else:
            units[unit_id].managers.set(new)
            report.manager_changes.append((paths[unit_id], new, old - new))

    # نقش داده می‌شود ولی پس گرفته نمی‌شود؛ کسی که دیگر مدیر نیست فقط گزارش می‌شود.
    group = Group.objects.get(name=Role.UNIT_MANAGER)
    holders = set(group.user_set.all())
    report.new_unit_managers = sorted(set().union(*managers.values()) - holders, key=lambda user: user.username)
    group.user_set.add(*report.new_unit_managers)
    report.idle_unit_managers = list(
        group.user_set.filter(is_active=True, managed_units__isnull=True).order_by("username")
    )


def run_import(file, deactivate_missing=False, dry_run=False):
    """فایل را می‌خواند و وارد می‌کند و گزارش را برمی‌گرداند. با dry_run همه‌چیز انجام و در آخر پس گرفته می‌شود."""
    rows, errors = read_staff_file(file)
    if errors and deactivate_missing:
        # کسی که ردیفش خطا دارد در فایل هست ولی وارد نشده؛ نباید به‌اشتباه غیرفعال شود.
        raise StaffFileError(
            "فایل ردیف نادرست دارد و تا درست نشود کسی غیرفعال نمی‌شود. "
            "بدون غیرفعال کردن اجرا کنید تا ردیف‌های نادرست را در گزارش ببینید."
        )
    with transaction.atomic():
        report = import_staff(rows, deactivate_missing=deactivate_missing)
        if dry_run:
            transaction.set_rollback(True)
    report.errors = errors + report.errors
    return report