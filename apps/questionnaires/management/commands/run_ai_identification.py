import signal
from threading import Event

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, close_old_connections

from apps.questionnaires.ai.pipeline import next_queued, run_identification


class Command(BaseCommand):
    help = "اجرای شناسایی هوشمند پاسخنامه‌های در صف (AiRun)؛ با --watch به‌عنوان سرویس ai."

    def add_arguments(self, parser):
        parser.add_argument("--watch", action="store_true", help="اجرای پیوسته برای سرویس ai")
        parser.add_argument("--interval", type=float, default=2, help="فاصله‌ی بررسی صف به ثانیه؛ دست‌کم ۰٫۵")

    def handle(self, *args, **options):
        if options["interval"] < 0.5:
            raise CommandError("فاصله‌ی بررسی صف دست‌کم ۰٫۵ ثانیه است.")
        stop = Event()
        if options["watch"]:
            for signum in (signal.SIGINT, signal.SIGTERM):
                signal.signal(signum, lambda *_: stop.set())
        while not stop.is_set():
            if options["watch"]:
                close_old_connections()
            done = 0
            try:
                while not stop.is_set() and (run := next_queued()) is not None:
                    run_identification(run)
                    done += 1
                    self.stdout.write(f"{run.response} · {run.get_status_display()} {run.error_code}".rstrip())
            except DatabaseError as error:
                if not options["watch"]:
                    raise
                self.stderr.write(f"شناسایی هوشمند ناموفق؛ تلاش دوباره در دور بعد: {error}")
            if not options["watch"]:
                self.stdout.write(self.style.SUCCESS(f"{done} اجرای شناسایی هوشمند انجام شد."))
                break
            stop.wait(options["interval"])
