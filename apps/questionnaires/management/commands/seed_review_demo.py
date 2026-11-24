"""پاسخنامه‌ی نمایشی QR-{سال}-0109 فریم 12a برای محیط توسعه: سه مسیر تحقق، دو رویداد و دو پیامد، در انتظار بررسی.

فقط با DEBUG اجرا می‌شود. شمارنده‌ی کد پاسخنامه‌های امسال را تا ۱۰۸ جلو می‌برد تا این پاسخنامه کد ۱۰۹ بگیرد؛ اگر شمارنده
از آن گذشته باشد یا پاسخنامه‌ی ۱۰۹ از قبل باشد، چیزی ساخته نمی‌شود.
"""

import datetime

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.jalali import jalali_year
from apps.core.models import CodeCounter
from apps.questionnaires.answers import submit_response
from apps.questionnaires.models import (
    PathConsequence,
    Response,
    RiskInstance,
    RiskPath,
    ServiceObjective,
    ServiceRecord,
)
from apps.risks.identification import answer_unit

NUMBER = 109


class Command(BaseCommand):
    help = "پاسخنامه‌ی نمایشی فریم 12a (فقط محیط توسعه)."

    def add_arguments(self, parser):
        parser.add_argument("--respondent", default="maryam", help="نام کاربری مدیر واحد پاسخ‌دهنده.")

    @transaction.atomic
    def handle(self, *args, respondent, **options):
        if not settings.DEBUG:
            raise CommandError("این فرمان فقط در محیط توسعه (DEBUG) اجرا می‌شود.")
        user = get_user_model().objects.filter(username=respondent).first()
        if user is None:
            raise CommandError(f"کاربر {respondent} پیدا نشد.")
        unit = answer_unit(user)
        if unit is None:
            raise CommandError(f"{respondent} باید مدیر دقیقاً یک واحد باشد.")

        prefix = f"QR-{jalali_year(timezone.localdate())}"
        code = f"{prefix}-{NUMBER:04d}"
        if Response.objects.filter(code=code).exists():
            self.stdout.write(f"پاسخنامه‌ی {code} از قبل هست.")
            return
        counter, _ = CodeCounter.objects.select_for_update().get_or_create(prefix=prefix)
        if counter.last >= NUMBER:
            raise CommandError(f"شمارنده‌ی {prefix} از {NUMBER} گذشته است؛ کد {code} دیگر داده نمی‌شود.")
        counter.last = NUMBER - 1
        counter.save(update_fields=["last"])

        response = Response.objects.create(
            org_unit=unit,
            respondent=user,
            conditions="وابستگی کامل ارتباط با شاپرک به یک دیتاسنتر و یک لینک ارتباطی اصلی",
            responsibility="مشترک — زیرساخت در اختیار داتین است و تصمیم ارتقا با بانک",
        )
        record = ServiceRecord.objects.create(
            response=response, name_and_scope="پرداخت اینترنتی (درگاه پرداخت شاپرک)"
        )
        ServiceObjective.objects.create(
            service=record,
            description="پردازش تراکنش‌های پرداخت اینترنتی با دسترس‌پذیری ۹۹٫۹٪ طبق توافق سطح خدمت با بانک‌ها",
        )
        stop = RiskInstance.objects.create(
            service=record,
            source_key="e1",
            number=1,
            event="توقف کامل پردازش تراکنش‌های پرداخت اینترنتی",
            scope="همه‌ی بانک‌های طرف قرارداد",
        )
        slow = RiskInstance.objects.create(
            service=record,
            source_key="e2",
            number=2,
            event="کندی شدید و خطای زمان‌پایان در تراکنش‌ها",
            scope="سه بانک بزرگ",
        )
        paths = [
            (stop, "قطعی لینک ارتباطی اصلی با شاپرک و سوئیچ‌نشدن خودکار به لینک پشتیبان"),
            (slow, "افزایش ناگهانی بار تراکنش در مناسبت‌ها و پاسخ‌گو نبودن سرورها"),
            (stop, "خرابی تجهیزات شبکه‌ی دیتاسنتر اصلی و نبود افزونگی سخت‌افزاری"),
        ]
        for number, (instance, text) in enumerate(paths, start=1):
            RiskPath.objects.create(
                risk_instance=instance, source_key=f"p{number}", number=number, description=text
            )
        PathConsequence.objects.create(
            risk_instance=stop,
            impact_types=["F", "R"],
            description="دسترسی‌نداشتن مشتریان به پرداخت، جریمه‌ی توافق سطح خدمت و آسیب به اعتبار",
        )
        PathConsequence.objects.create(
            risk_instance=slow, impact_types=["S"], description="تراکنش‌های ناموفق و افزایش شکایت مشتریان"
        )
        submit_response(response)
        Response.objects.filter(pk=response.pk).update(submitted_at=timezone.now() - datetime.timedelta(hours=2))
        self.stdout.write(f"پاسخنامه‌ی {response.code} ساخته شد.")
