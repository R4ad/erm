import os
import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords


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


def attachment_path(attachment, filename):
    """نام تصادفی روی دیسک، با پسوند اصلی؛ نام اصلی فقط در پایگاه داده می‌ماند و در دانلود برمی‌گردد."""
    extension = os.path.splitext(filename)[1].lower()
    return f"attachments/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{extension}"


class Attachment(TimeStampedModel):
    """فایل پیوست هر رکوردی که پیوست می‌پذیرد (شاهد، ریسک و بعدها اقدام و پذیرش). با GenericForeignKey به رکورد
    وصل می‌شود. پیوست حذف یا عوض نمی‌شود؛ فایل تازه پیوست تازه است."""

    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT)
    object_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    file = models.FileField("فایل", upload_to=attachment_path)
    original_name = models.CharField("نام فایل", max_length=255)
    size = models.PositiveIntegerField("اندازه (بایت)")
    description = models.CharField("شرح", max_length=300, blank=True, help_text="مثلاً «گزارش تست نفوذ».")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="بارگذاری‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پیوست"
        verbose_name_plural = "پیوست‌ها"
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["content_type", "object_id"])]

    def __str__(self):
        return self.original_name

    def get_absolute_url(self):
        return reverse("core:attachment_download", args=[self.pk])


class Comment(TimeStampedModel):
    """نظر روی هر رکوردی که نظر می‌پذیرد. نظر حذف نمی‌شود و ویرایشش در تاریخچه می‌ماند."""

    content_type = models.ForeignKey(ContentType, on_delete=models.PROTECT)
    object_id = models.PositiveBigIntegerField()
    content_object = GenericForeignKey("content_type", "object_id")
    text = models.TextField("متن")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="نویسنده", on_delete=models.PROTECT, related_name="+"
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "نظر"
        verbose_name_plural = "نظرها"
        ordering = ["created_at"]
        indexes = [models.Index(fields=["content_type", "object_id"])]

    def __str__(self):
        return self.text[:60]

    @property
    def was_edited(self):
        return (self.updated_at - self.created_at).total_seconds() > 1
