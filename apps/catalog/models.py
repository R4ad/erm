from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
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
    customers = models.ManyToManyField(
        Customer,
        verbose_name="بانک‌ها",
        through="ServiceCustomer",
        related_name="services",
        blank=True,
    )
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


class ServiceCustomer(TimeStampedModel):
    """جدول واسط خدمت و بانک: این خدمت به این بانک ارائه می‌شود، با زمان‌های بازیابی همین جفت.
    RTO و MTPD روی خدمت نیستند، چون یک خدمت برای هر بانک می‌تواند زمان متفاوتی داشته باشد.
    زمان‌ها همه به دقیقه‌اند تا بعداً با مدت اختلال در سنجش پیامد ساده مقایسه شوند."""

    service = models.ForeignKey(
        Service, verbose_name="خدمت", on_delete=models.CASCADE, related_name="customer_links"
    )
    customer = models.ForeignKey(
        Customer, verbose_name="بانک", on_delete=models.PROTECT, related_name="service_links"
    )
    rto_minutes = models.PositiveIntegerField(
        "RTO (دقیقه)",
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text="حداکثر زمانی که خدمت پس از اختلال باید دوباره برقرار شود.",
    )
    mtpd_minutes = models.PositiveIntegerField(
        "MTPD (دقیقه)",
        null=True,
        blank=True,
        validators=[MinValueValidator(1)],
        help_text="حداکثر مدت اختلالی که بانک می‌تواند تحمل کند.",
    )
    rpo_minutes = models.PositiveIntegerField(
        "RPO (دقیقه)",
        null=True,
        blank=True,
        help_text="حداکثر بازه‌ای که از دست رفتن داده‌هایش قابل تحمل است؛ 0 یعنی هیچ داده‌ای نباید از دست برود.",
    )
    bia_reference = models.CharField("مرجع BIA", max_length=200, blank=True, help_text="شماره یا نسخه‌ی مصوب BIA.")
    tolerance_notes = models.TextField(
        "حد تحمل خاص بانک", blank=True, help_text="محدودیت یا دستور سخت‌گیرانه‌تری که خود بانک داده است."
    )
    valid_from = models.DateField("اعتبار از", null=True, blank=True)
    valid_until = models.DateField("اعتبار تا", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "بانک خدمت"
        verbose_name_plural = "بانک‌های خدمت‌ها"
        ordering = ["customer__name"]
        constraints = [
            models.UniqueConstraint(
                fields=["service", "customer"],
                name="unique_customer_per_service",
                violation_error_message="این بانک پیش‌تر برای این خدمت ثبت شده است.",
            ),
            # این دو قاعده در خود پایگاه داده هم چک می‌شوند. فرم هم پیش از ذخیره همین‌ها را چک می‌کند
            # و پیام فارسی را نشان می‌دهد. اگر یکی از دو مقدار خالی باشد، قاعده چیزی را رد نمی‌کند.
            models.CheckConstraint(
                condition=Q(rto_minutes__lt=F("mtpd_minutes"))
                | Q(rto_minutes__isnull=True)
                | Q(mtpd_minutes__isnull=True),
                name="rto_less_than_mtpd",
                violation_error_message="RTO باید کمتر از MTPD باشد.",
            ),
            models.CheckConstraint(
                condition=Q(valid_from__lte=F("valid_until"))
                | Q(valid_from__isnull=True)
                | Q(valid_until__isnull=True),
                name="valid_from_not_after_valid_until",
                violation_error_message="«اعتبار تا» نباید پیش از «اعتبار از» باشد.",
            ),
        ]

    def __str__(self):
        return f"{self.service.code} - {self.customer}"

    @property
    def is_expired(self):
        return self.valid_until is not None and self.valid_until < timezone.localdate()
