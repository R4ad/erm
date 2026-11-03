from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField("تاریخ ایجاد", auto_now_add=True)
    updated_at = models.DateTimeField("آخرین ویرایش", auto_now=True)

    class Meta:
        abstract = True


class ValidityPeriod(models.Model):
    """بازه‌ی اعتبار رابطه یا تعهد. چیزی که تمام شده حذف نمی‌شود؛ با «اعتبار تا» بسته می‌شود تا سابقه بماند.
    مدل فرزندی که Meta خودش را دارد باید constraints را از ValidityPeriod.Meta.constraints بردارد."""

    valid_from = models.DateField("اعتبار از", null=True, blank=True)
    valid_until = models.DateField("اعتبار تا", null=True, blank=True)

    class Meta:
        abstract = True
        constraints = [
            # این قاعده در خود پایگاه داده هم چک می‌شود. اگر یکی از دو تاریخ خالی باشد، چیزی را رد نمی‌کند.
            # %(class)s اسم مدل فرزند را در نام قاعده می‌گذارد، چون نام قاعده در کل پروژه باید یکتا باشد.
            models.CheckConstraint(
                condition=Q(valid_from__lte=F("valid_until"))
                | Q(valid_from__isnull=True)
                | Q(valid_until__isnull=True),
                name="%(class)s_valid_from_not_after_valid_until",
                violation_error_message="«اعتبار تا» نباید پیش از «اعتبار از» باشد.",
            ),
        ]

    @property
    def is_expired(self):
        return self.valid_until is not None and self.valid_until < timezone.localdate()


class CodeCounter(models.Model):
    """شمارنده‌ی کدهای خودکار، مثل SC-0012 یا RK-1405-0012. هر پیشوند یک ردیف دارد که شماره‌ی آخرش را نگه
    می‌دارد؛ قفل همین ردیف نمی‌گذارد دو ثبت هم‌زمان یک کد بگیرند."""

    prefix = models.CharField("پیشوند", max_length=30, unique=True)
    last = models.PositiveIntegerField("آخرین شماره", default=0)

    class Meta:
        verbose_name = "شمارنده‌ی کد"
        verbose_name_plural = "شمارنده‌های کد"

    def __str__(self):
        return f"{self.prefix}: {self.last}"
