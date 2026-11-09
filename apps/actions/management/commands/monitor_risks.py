import signal
from threading import Event

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, close_old_connections

from apps.actions.monitoring import run_monitoring


class Command(BaseCommand):
    help = "ثبت بازبینی‌های سررسیدشده، یادآوری و تصعید داخلی ریسک‌ها."

    def add_arguments(self, parser):
        parser.add_argument(
            "--watch", action="store_true", help="اجرای پیوسته برای سرویس پایش"
        )
        parser.add_argument(
            "--interval", type=int, default=3600, help="فاصله اجراها به ثانیه؛ دست‌کم ۶۰"
        )

    def handle(self, *args, **options):
        if options["interval"] < 60:
            raise CommandError("فاصله اجرا دست‌کم ۶۰ ثانیه است.")
        stop = Event()
        if options["watch"]:
            for signum in (signal.SIGINT, signal.SIGTERM):
                signal.signal(signum, lambda *_: stop.set())
        while not stop.is_set():
            if options["watch"]:
                close_old_connections()
            try:
                count = run_monitoring()
            except DatabaseError as error:
                if not options["watch"]:
                    raise
                self.stderr.write(f"پایش ناموفق؛ تلاش دوباره در دور بعد: {error}")
            else:
                self.stdout.write(
                    self.style.SUCCESS(f"پایش انجام شد؛ {count} اعلان تازه ثبت شد.")
                )
            if not options["watch"]:
                break
            stop.wait(options["interval"])
