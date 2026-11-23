from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel


class Response(TimeStampedModel):
    """پاسخنامه‌ی یک واحد به هشت پرسش جلسه‌ی شناسایی (ویزارد «پاسخ به پرسشنامه‌ها»). بعد از ارسال فقط وقتی ویرایش
    می‌شود که کارشناس ریسک آن را برای تکمیل بازگرداند. پاسخ گام ۱ و ۲ در ServiceRecord و ServiceObjective، گام ۳ و ۴
    در همین مدل، و مسیرها، رویدادها و پیامدها در RiskPath، RiskInstance و PathConsequence است."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        SUBMITTED = "submitted", "در انتظار بررسی"
        RETURNED = "returned", "بازگشت برای تکمیل اطلاعات"
        IDENTIFIED = "identified", "شناسایی‌شده"
        REVIEWED = "reviewed", "بررسی‌شده"

    EDITABLE_STATUSES = [Status.DRAFT, Status.RETURNED]

    code = models.CharField("کد", max_length=20, unique=True, editable=False)

    org_unit = models.ForeignKey(
        "organization.OrgUnit", verbose_name="واحد", on_delete=models.PROTECT, related_name="questionnaire_responses"
    )
    service = models.ForeignKey(
        "catalog.Service",
        verbose_name="خدمت",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="questionnaire_responses",
        help_text="اگر پاسخ درباره‌ی یک خدمت مشخص است.",
    )
    respondent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="پاسخ‌دهنده",
        on_delete=models.PROTECT,
        related_name="questionnaire_responses",
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.DRAFT)
    conditions = models.TextField("عامل و وضعیت", blank=True)
    responsibility = models.TextField("داتین یا مشتری", blank=True)
    wizard_step = models.PositiveSmallIntegerField("گام ویزارد", default=1)

    submitted_at = models.DateTimeField("زمان ارسال", null=True, blank=True)
    review_due = models.DateField("مهلت بررسی", null=True, blank=True)
    returned_at = models.DateTimeField("زمان بازگرداندن", null=True, blank=True)
    return_due = models.DateField("مهلت تکمیل", null=True, blank=True)
    return_questions = models.JSONField("پرسش‌های تکمیلی", default=list, blank=True)
    return_message = models.TextField("پیام به پاسخ‌دهنده", blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="بررسی‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_at = models.DateTimeField("زمان بررسی", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پاسخنامه"
        verbose_name_plural = "پاسخنامه‌ها"
        ordering = ["-created_at"]

    def __str__(self):
        return self.code

    def get_absolute_url(self):
        return f"/app/identification/responses/{self.pk}"

    @property
    def is_editable(self):
        return self.status in self.EDITABLE_STATUSES


class ServiceRecord(TimeStampedModel):
    """خدمتی که پاسخ‌دهنده در گام ۱ نوشته است، مستقل از فهرست خدمات؛ هر پاسخنامه یکی."""

    response = models.ForeignKey(Response, on_delete=models.CASCADE, related_name="service_records")
    source_key = models.CharField(max_length=80, blank=True)
    name_and_scope = models.TextField("خدمت و محدوده", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["response"], name="one_service_record_per_response")]


class ServiceObjective(TimeStampedModel):
    service = models.ForeignKey(ServiceRecord, on_delete=models.CASCADE, related_name="objectives")
    source_key = models.CharField(max_length=80, blank=True)
    description = models.TextField("انتظار زمانی یا کیفی")


class RiskInstance(TimeStampedModel):
    """یک رویداد مشخص (گام ۶). چند مسیر می‌توانند به یک رویداد برسند و پیامدش (گام ۷) یک بار پرسیده می‌شود؛
    دامنه‌ی پیامد همین‌جاست. source_key کلید پایدار رابط است تا ویرایش بعد از بازگرداندن همان رویداد را نگه دارد."""

    service = models.ForeignKey(ServiceRecord, on_delete=models.CASCADE, related_name="risk_instances")
    source_key = models.CharField(max_length=80, blank=True)
    number = models.PositiveSmallIntegerField("شماره", default=1)
    scope = models.TextField("دامنه", blank=True)
    trigger = models.TextField("آغازگر", blank=True)
    event = models.TextField("رویداد اصلی", blank=True)


class RiskPath(TimeStampedModel):
    """یک مسیر تحقق (گام ۵) با شماره‌ی سراسری در پاسخنامه."""

    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="paths")
    source_key = models.CharField(max_length=80, blank=True)
    number = models.PositiveSmallIntegerField("شماره", default=1)
    description = models.TextField("نحوه پیشروی", blank=True)


class PathConsequence(TimeStampedModel):
    """پیامد یک رویداد (گام ۷): نوع‌ها از بُعدهای پیامد روش (S، D، F، C، R) و شرح کوتاه برای مالک ریسک."""

    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="consequences")
    source_key = models.CharField(max_length=80, blank=True)
    path = models.ForeignKey(RiskPath, on_delete=models.CASCADE, related_name="consequences", null=True, blank=True)
    impact_types = models.JSONField("نوع پیامد", default=list, blank=True)
    description = models.TextField("شرح پیامد", blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["risk_instance"], name="one_consequence_per_event")]


class PendingRisk(TimeStampedModel):
    """ریسک پیشنهادی از یک پاسخنامه که کارشناس ریسک باید تعیین تکلیفش کند؛ یا آن را به ریسک رجیستر تبدیل می‌کند یا
    با دلیل رد می‌کند. حذف نمی‌شود."""

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        CONVERTED = "converted", "ثبت در رجیستر"
        DISMISSED = "dismissed", "کنار گذاشته"

    response = models.ForeignKey(Response, verbose_name="پاسخ", on_delete=models.CASCADE, related_name="pending_risks")
    category = models.ForeignKey(
        "risks.RiskCategory", verbose_name="دسته", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING)
    risk = models.ForeignKey(
        "risks.Risk",
        verbose_name="ریسک ثبت‌شده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="pending_sources",
    )
    dismiss_reason = models.TextField("دلیل کنار گذاشتن", blank=True)
    duplicate_of = models.ForeignKey(
        "risks.Risk",
        verbose_name="تکراری با",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="duplicate_pending",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تعیین‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    decided_at = models.DateTimeField("زمان تعیین تکلیف", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "ریسک در انتظار"
        verbose_name_plural = "ریسک‌های در انتظار"
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="converted") | Q(risk__isnull=False),
                name="pending_risk_converted_needs_risk",
                violation_error_message="ریسک در انتظاری که ثبت شده باید به ریسک رجیستر وصل باشد.",
            ),
            models.CheckConstraint(
                condition=~Q(status="dismissed") | ~Q(dismiss_reason=""),
                name="pending_risk_dismissed_needs_reason",
                violation_error_message="کنار گذاشتن بدون دلیل پذیرفته نمی‌شود.",
            ),
        ]

    def __str__(self):
        return f"ریسک پیشنهادی {self.pk}"

    @property
    def is_pending(self):
        return self.status == self.Status.PENDING
