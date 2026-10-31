from django.core.management.base import BaseCommand, CommandError

from apps.accounts.staff_import import StaffFileError, run_import


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
            report = run_import(options["path"], options["deactivate_missing"], options["dry_run"])
        except StaffFileError as error:
            raise CommandError(error) from error

        if options["dry_run"]:
            self.stdout.write(self.style.WARNING("اجرای آزمایشی: چیزی ذخیره نشد."))
        styles = {"warning": self.style.WARNING, "danger": self.style.ERROR}
        for section in report.sections():
            style = styles.get(section.level, str)
            self.stdout.write(style(f"{section.title}: {section.count}"))
            for line in section.lines:
                self.stdout.write(f"  {line}")