from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.jalali import to_jalali
from apps.core.models import TimeStampedModel


class RiskCategory(TimeStampedModel):
    """دسته‌ی اصلی ریسک (بخش ۵ سند v5)، مثل T1 امنیت اطلاعات و سایبری. دسته برای تخصیص مالک و گزارش است و امتیاز را
    عوض نمی‌کند؛ برای همین نسخه‌دار نیست و جزو نسخه‌ی روش نیست. دسته حذف نمی‌شود، فقط غیرفعال می‌شود."""

    code = models.CharField(
        "کد", max_length=10, unique=True, error_messages={"unique": "دسته‌ای با همین کد ثبت شده است."}
    )
    name = models.CharField(
        "نام", max_length=200, unique=True, error_messages={"unique": "دسته‌ای با همین نام ثبت شده است."}
    )
    is_active = models.BooleanField(
        "فعال", default=True, help_text="دسته‌ی غیرفعال در جدول پوشش نمی‌آید، ولی سابقه‌اش می‌ماند."
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "دسته‌ی ریسک"
        verbose_name_plural = "دسته‌های ریسک"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.name}"


class Coverage(TimeStampedModel):
    """یک خانه‌ی جدول پوشش جهان ریسک: «خدمت × دسته‌ی ریسک» (بخش ۵ سند v5). خانه‌ای که هنوز ردیفی ندارد «در انتظار
    بررسی» است؛ پس خدمت یا دسته‌ی تازه بی‌هیچ کاری با خانه‌های در انتظار در جدول می‌آید."""

    class Status(models.TextChoices):
        REVIEWED = "reviewed", "بررسی‌شده"
        NOT_RELEVANT = "not_relevant", "نامرتبط"
        PENDING = "pending", "در انتظار بررسی"

    service = models.ForeignKey(
        "catalog.Service", verbose_name="خدمت", on_delete=models.CASCADE, related_name="coverage_cells"
    )
    category = models.ForeignKey(
        RiskCategory, verbose_name="دسته", on_delete=models.PROTECT, related_name="coverage_cells"
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING)
    reason = models.TextField(
        "دلیل", blank=True, help_text="برای «نامرتبط» اجباری است: چرا این دسته به این خدمت مربوط نیست."
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="بررسی‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_on = models.DateField("تاریخ بررسی", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پوشش جهان ریسک"
        verbose_name_plural = "پوشش جهان ریسک"
        ordering = ["service__code", "category__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["service", "category"],
                name="unique_coverage_per_service_and_category",
                violation_error_message="وضعیت این دسته برای این خدمت پیش‌تر ثبت شده است.",
            ),
            # «نامرتبط» بدون دلیل مستند پذیرفته نمی‌شود (بخش ۵)؛ این در خود پایگاه داده هم چک می‌شود.
            models.CheckConstraint(
                condition=~Q(status="not_relevant") | ~Q(reason=""),
                name="coverage_not_relevant_needs_reason",
                violation_error_message="برای «نامرتبط» دلیل لازم است.",
            ),
        ]

    def __str__(self):
        return f"{self.service.code} × {self.category.code}: {self.get_status_display()}"

    @property
    def is_pending(self):
        return self.status == self.Status.PENDING

    @property
    def summary(self):
        """یک خط برای توضیح زیر خانه‌ی جدول: دسته، دلیل، و چه کسی و کی بررسی کرده."""
        text = str(self.category)
        if self.reason:
            text += f": {self.reason}"
        if self.reviewed_on:
            reviewer = self.reviewed_by.get_full_name() or self.reviewed_by.username
            text += f" ({reviewer}، {to_jalali(self.reviewed_on)})"
        return text
