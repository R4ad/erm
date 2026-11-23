"""پیش‌نمایش روزانه‌ی همگام‌سازی AD (فیگما ۲۸)؛ با زمان‌بندی سرور در ساعت تعیین‌شده‌ی اتصال اجرا می‌شود.

با --file برداشت تازه از خروجی CSV حساب‌های AD جایگزین برداشت قبلی می‌شود (ستون‌ها در directory.COLUMNS). خود
پیش‌نمایش روی کاربران اثری ندارد؛ اعمال تغییرها با مدیر سامانه در صفحه‌ی همگام‌سازی است."""

from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from apps.accounts import directory
from apps.accounts.models import DirectorySync


class Command(BaseCommand):
    help = "برداشت حساب‌های AD را (اختیاری) بارگذاری و پیش‌نمایش همگام‌سازی را ثبت می‌کند."

    def add_arguments(self, parser):
        parser.add_argument("--file", help="خروجی CSV حساب‌های AD با ستون‌های username و ou و بقیه.")

    def handle(self, *args, **options):
        conn = directory.connection()
        if conn is None:
            raise CommandError("اتصال Active Directory پیکربندی نشده است.")
        if options["file"]:
            try:
                count = directory.load_entries(Path(options["file"]).read_text(encoding="utf-8"))
            except (OSError, UnicodeDecodeError, directory.DirectoryError) as error:
                DirectorySync.objects.create(status=DirectorySync.Status.FAILED, note=str(error)[:300])
                raise CommandError(str(error)) from error
            self.stdout.write(f"{count} حساب از برداشت AD خوانده شد.")
        plan = directory.preview(conn)
        self.stdout.write(f"پیش‌نمایش ثبت شد: {plan.pending} مورد در انتظار، {len(plan.applicable)} تغییر قابل اعمال.")
