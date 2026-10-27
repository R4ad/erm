from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.accounts.staff_import import StaffFileError, import_staff, read_staff_file


class Command(BaseCommand):
    help = "کارکنان و واحدهای سازمانی را از فایل Excel منابع انسانی وارد می‌کند."

    def add_arguments(self, parser):
        parser.add_argument("path", help="مسیر فایل xlsx")
        parser.add_argument("--dry-run", action="store_true", help="فقط گزارش بده و چیزی ذخیره نکن.")
        parser.add_argument(
            "--deactivate-missing",
            action="store_true",
            help="کاربرانی را که کد پرسنلی دارند ولی در فایل نیستند غیرفعال کن.",
        )

    def handle(self, *args, **options):
        try:
            rows, errors = read_staff_file(options["path"])
        except StaffFileError as error:
            raise CommandError(error) from error
        if errors and options["deactivate_missing"]:
            # کسی که ردیفش خطا دارد در فایل هست ولی وارد نشده؛ نباید به‌اشتباه غیرفعال شود.
            raise CommandError("فایل ردیف نادرست دارد. تا درست نشود کسی غیرفعال نمی‌شود.")

        with transaction.atomic():
            report = import_staff(rows, deactivate_missing=options["deactivate_missing"])
            if options["dry_run"]:
                transaction.set_rollback(True)  # همه‌چیز انجام شد ولی پس گرفته می‌شود

        self.print_report(report, errors + report.errors, options)

    def print_report(self, report, errors, options):
        write = self.stdout.write
        if options["dry_run"]:
            write(self.style.WARNING("اجرای آزمایشی: چیزی ذخیره نشد."))

        write(f"واحدهای تازه: {len(report.new_units)}")
        for path in sorted(report.new_units):
            write(f"  {path}")
        write(f"کاربران تازه: {len(report.new_users)}")
        write(f"کاربران به‌روزشده: {len(report.updated_users)}")
        for user, changed in report.updated_users:
            labels = "، ".join(str(User._meta.get_field(name).verbose_name) for name in changed)
            write(f"  {user.personnel_code} {user.get_full_name()}: {labels}")
        write(f"کاربران بدون تغییر: {report.unchanged_users}")

        action = "غیرفعال شدند" if options["deactivate_missing"] else "فعال ماندند"
        write(f"کاربرانی که در فایل نیستند و {action}: {len(report.missing_users)}")
        for user in report.missing_users:
            write(f"  {user.personnel_code} {user.get_full_name()}")

        if errors:
            write(self.style.ERROR(f"ردیف‌هایی که وارد نشدند: {len(errors)}"))
            for error in errors:
                write(f"  {error}")
