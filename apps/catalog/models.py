from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel


class Customer(TimeStampedModel):
    """بانک یا مشتری دیگر داتین. دیدن داده‌ها بر اساس بانک محدود نمی‌شود؛ بانک برای زمان‌های بازیابی هر خدمت
    و بعدها پیامد ریسک برای هر بانک ثبت می‌شود."""

    name = models.CharField(
        "نام", max_length=200, unique=True, error_messages={"unique": "بانکی با همین نام ثبت شده است."}
    )
    is_key = models.BooleanField("مشتری کلیدی", default=False, help_text="طبق فهرست مصوب مشتریان کلیدی.")
    financial_basis = models.PositiveBigIntegerField(
        "مبنای مالی (ریال)",
        null=True,
        blank=True,
        help_text="مبنای تأییدشده‌ی همین بانک برای سنجش پیامد مالی.",
    )
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "بانک"
        verbose_name_plural = "بانک‌ها"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Service(TimeStampedModel):
    """خدمت یا فرایند داتین؛ واحدی که ریسک‌ها روی آن شناسایی می‌شوند."""

    class Kind(models.TextChoices):
        SERVICE = "service", "خدمت"
        PROCESS = "process", "فرایند"

    class LifecycleStage(models.TextChoices):
        DESIGN = "design", "طراحی"
        IMPLEMENTATION = "implementation", "پیاده‌سازی"
        OPERATION = "operation", "بهره‌برداری"
        RETIREMENT = "retirement", "کنارگذاری"

    class Environment(models.TextChoices):
        DATIN = "datin", "داتین"
        BANK = "bank", "بانک"
        SHARED = "shared", "مشترک"

    code = models.CharField(
        "کد", max_length=20, unique=True, error_messages={"unique": "خدمتی با همین کد ثبت شده است."}
    )
    name = models.CharField("نام", max_length=200)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    description = models.TextField("مأموریت و خروجی", blank=True, help_text="چه نتیجه‌ای برای داتین یا بانک می‌سازد.")
    org_unit = models.ForeignKey(
        "organization.OrgUnit",
        verbose_name="واحد مالک",
        on_delete=models.PROTECT,
        related_name="services",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مالک خدمت",
        on_delete=models.PROTECT,
        related_name="owned_services",
    )
    is_critical = models.BooleanField("حیاتی", default=False, help_text="طبق فهرست مصوب خدمات حیاتی.")
    lifecycle_stage = models.CharField("مرحله‌ی چرخه‌ی عمر", max_length=20, choices=LifecycleStage.choices)
    environment = models.CharField("محیط اجرا", max_length=20, choices=Environment.choices)
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "خدمت"
        verbose_name_plural = "خدمات"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def get_absolute_url(self):
        return reverse("catalog:service_detail", args=[self.pk])

    def clean(self):
        # خدمت فعال باید واحد و مالک فعال داشته باشد؛ خدمت غیرفعال فقط سابقه است و مهم نیست.
        errors = {}
        if self.is_active and self.org_unit_id and not self.org_unit.is_active:
            errors["org_unit"] = "این واحد غیرفعال است؛ خدمت فعال باید مال یک واحد فعال باشد."
        if self.is_active and self.owner_id and not self.owner.is_active:
            errors["owner"] = "این کاربر غیرفعال است؛ برای خدمت فعال مالک دیگری انتخاب کنید."
        if errors:
            raise ValidationError(errors)
