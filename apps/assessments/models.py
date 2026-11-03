from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.jalali import jalali_year
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


class Confidence(models.TextChoices):
    LOW = "low", "کم"
    MEDIUM = "medium", "متوسط"
    HIGH = "high", "زیاد"


class Assessment(TimeStampedModel):
    """یک ارزیابی ریسک (بخش ۷ و ۸ سند v5). هر ارزیابی ردیف تازه است و روی قبلی نمی‌نویسد، و با نسخه‌ی روشی که هنگام
    ساختنش فعال بوده محاسبه می‌شود. ارزیابی در جلسه‌ی کارگروه انجام می‌شود و عضو GRC آن را با تاریخ جلسه ثبت می‌کند
    (جواب س۳۳ و س۵۲). این قدم پروفایل پیامد را دارد؛ احتمال در قدم ۱۷ و نتیجه، کنترل کیفیت و تأیید در قدم ۱۸ می‌آید.
    ارزیابی حذف نمی‌شود."""

    class Kind(models.TextChoices):
        INHERENT = "inherent", "ذاتی"
        CURRENT = "current", "جاری"
        TARGET = "target", "هدف"

    class Status(models.TextChoices):
        # کنترل کیفیت، برگشت و تأیید در قدم ۱۸ اضافه می‌شوند.
        DRAFT = "draft", "پیش‌نویس"

    # ارزیابی ذاتی کنترل‌های کنارگذاشته و ارزیابی هدف اقدام و معیار آزمونش را در فرض‌ها می‌نویسد (بخش ۷).
    KINDS_NEEDING_ASSUMPTIONS = [Kind.INHERENT, Kind.TARGET]

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    risk = models.ForeignKey("risks.Risk", verbose_name="ریسک", on_delete=models.PROTECT, related_name="assessments")
    kind = models.CharField(
        "نوع",
        max_length=20,
        choices=Kind.choices,
        help_text="ذاتی با کنار گذاشتن کنترل‌های مشخص؛ جاری مبنای تصمیم است؛ هدف پیش‌بینی بعد از اقدام است.",
    )
    method_version = models.ForeignKey(
        "methodology.MethodVersion",
        verbose_name="نسخه‌ی روش",
        on_delete=models.PROTECT,
        related_name="assessments",
        editable=False,
    )
    horizon_months = models.PositiveSmallIntegerField("افق (ماه)", help_text="پیش‌فرض از نسخه‌ی روش می‌آید.")
    meeting_date = models.DateField(
        "تاریخ جلسه‌ی کارگروه", null=True, blank=True, help_text="پیش‌نویس پیش از جلسه هم ذخیره می‌شود."
    )
    assumptions = models.TextField(
        "فرض‌ها",
        blank=True,
        help_text="ذاتی: کدام کنترل‌ها کنار گذاشته شده‌اند. هدف: کدام اقدام و با چه معیار آزمونی.",
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.DRAFT, editable=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+", editable=False
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "ارزیابی"
        verbose_name_plural = "ارزیابی‌ها"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=Q(horizon_months__gte=1), name="assessment_horizon_positive"),
        ]

    def __str__(self):
        return f"{self.code} ({self.get_kind_display()})"

    def get_absolute_url(self):
        return reverse("assessments:assessment_detail", args=[self.pk])

    @property
    def is_draft(self):
        return self.status == self.Status.DRAFT

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"AS-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)


class ImpactDetail(TimeStampedModel):
    """سطح یک بُعد پیامد برای یک ذی‌نفع در یک ارزیابی (بخش ۸ و جواب س۵۵): داتین یا یکی از بانک‌های متأثر. سطح خالی
    یعنی «نامعلوم» و با صفر فرق دارد؛ صفر یعنی «اثر ندارد». هر دو دلیل می‌خواهند. وقتی داده کافی نیست، سطح یک بازه
    است و تصمیم بر کران بالایش گرفته می‌شود (بخش ۷)."""

    assessment = models.ForeignKey(Assessment, verbose_name="ارزیابی", on_delete=models.CASCADE, related_name="impacts")
    customer = models.ForeignKey(
        "catalog.Customer",
        verbose_name="ذی‌نفع",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="خالی یعنی خود داتین.",
    )
    scale = models.ForeignKey("methodology.Scale", verbose_name="بُعد", on_delete=models.PROTECT, related_name="+")
    level = models.PositiveSmallIntegerField("سطح", null=True, blank=True, help_text="خالی یعنی نامعلوم.")
    level_high = models.PositiveSmallIntegerField(
        "کران بالا", null=True, blank=True, help_text="فقط وقتی سطح یک بازه است."
    )
    actual_value = models.DecimalField(
        "مقدار واقعی",
        max_digits=20,
        decimal_places=4,
        null=True,
        blank=True,
        help_text="برای S مدت اختلال به دقیقه و برای F زیان ناخالص به ریال؛ برای بقیه با واحدش.",
    )
    unit = models.CharField("واحد", max_length=50, blank=True)
    basis = models.PositiveBigIntegerField(
        "مبنای مالی (ریال)",
        null=True,
        blank=True,
        help_text="برای F: درآمد عملیاتی تأییدشده‌ی ۱۲ ماه اخیر داتین، یا مبنای مالی مورد تأیید همان بانک.",
    )
    rationale = models.TextField("دلیل", blank=True)
    confidence = models.CharField("اطمینان", max_length=10, choices=Confidence.choices, blank=True)
    evidence = models.ManyToManyField("risks.Evidence", verbose_name="شواهد", related_name="impact_details", blank=True)

    history = HistoricalRecords(m2m_fields=[evidence])

    class Meta:
        verbose_name = "سطح پیامد"
        verbose_name_plural = "پروفایل پیامد"
        ordering = ["assessment", "customer__name", "scale__order"]
        constraints = [
            # هر ذی‌نفع برای هر بُعد یک ردیف دارد. ذی‌نفع خالی (داتین) هم یکی است، برای همین nulls_distinct=False.
            models.UniqueConstraint(
                fields=["assessment", "customer", "scale"],
                name="impact_unique_per_stakeholder_and_dimension",
                nulls_distinct=False,
            ),
            models.CheckConstraint(condition=Q(level__isnull=True) | Q(level__lte=5), name="impact_level_0_to_5"),
            models.CheckConstraint(
                condition=Q(level_high__isnull=True) | (Q(level__isnull=False) & Q(level_high__gt=F("level"))),
                name="impact_high_above_level",
            ),
            models.CheckConstraint(
                condition=Q(level_high__isnull=True) | Q(level_high__lte=5), name="impact_high_0_to_5"
            ),
            # نامعلوم و صفر بی‌دلیل پذیرفته نمی‌شوند (بخش ۸).
            models.CheckConstraint(
                condition=~Q(rationale="") | (Q(level__gt=0) & Q(level__isnull=False)),
                name="impact_zero_or_unknown_has_rationale",
            ),
        ]

    def __str__(self):
        return f"{self.scale.code} برای {self.stakeholder_name}"

    @property
    def stakeholder_name(self):
        return self.customer.name if self.customer_id else "داتین"

    @property
    def is_unknown(self):
        return self.level is None

    @property
    def level_display(self):
        if self.level is None:
            return "نامعلوم"
        if self.level_high is None:
            return str(self.level)
        return f"{self.level} تا {self.level_high}"

    @property
    def engine_level(self):
        """سطح به زبان موتور محاسبه: عدد، بازه یا None."""
        if self.level is None:
            return None
        return self.level if self.level_high is None else (self.level, self.level_high)
