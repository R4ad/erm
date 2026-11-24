from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.jalali import jalali_year
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


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

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"QR-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)

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


class AiRun(TimeStampedModel):
    """یک اجرای شناسایی هوشمند روی یک پاسخنامه. کارگر run_ai_identification اجراهای صف را برمی‌دارد و مرحله‌ی جاری
    (۱ تا ۵، همان مرحله‌های پنل 12b) را این‌جا می‌نویسد تا رابط با polling نشان دهد. ورودی، هش ورودی، خروجی خام،
    خطاهای اعتبارسنجی، نسخه‌ی پرامپت و مدل برای پیگیری نگه داشته می‌شوند؛ نام پاسخ‌دهنده در ورودی نیست."""

    class Status(models.TextChoices):
        QUEUED = "queued", "در صف"
        RUNNING = "running", "در حال شناسایی"
        SUCCEEDED = "succeeded", "انجام شد"
        EMPTY = "empty", "ریسکی ساخته نشد"
        FAILED = "failed", "انجام نشد"
        CANCELLED = "cancelled", "لغو شد"

    ACTIVE_STATUSES = [Status.QUEUED, Status.RUNNING]
    STAGES = 5

    response = models.ForeignKey(Response, verbose_name="پاسخنامه", on_delete=models.CASCADE, related_name="ai_runs")
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="درخواست‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.QUEUED)
    stage = models.PositiveSmallIntegerField("مرحله", default=0)
    prompt_version = models.CharField("نسخه‌ی پرامپت", max_length=20, blank=True)
    provider = models.CharField("سرویس‌دهنده", max_length=40, blank=True)
    model = models.CharField("مدل", max_length=120, blank=True)
    input_hash = models.CharField("هش ورودی", max_length=64, blank=True)
    input = models.JSONField("ورودی", default=dict, blank=True)
    raw_output = models.TextField("خروجی خام", blank=True)
    validation_errors = models.JSONField("خطاهای اعتبارسنجی", default=list, blank=True)
    attempts = models.PositiveSmallIntegerField("دفعات تلاش", default=0)
    error_code = models.CharField("کد پیگیری", max_length=20, blank=True)
    error_message = models.TextField("شرح خطا", blank=True)
    follow_up_questions = models.JSONField("پرسش‌های تکمیلی پیشنهادی", default=list, blank=True)
    started_at = models.DateTimeField("شروع", null=True, blank=True)
    finished_at = models.DateTimeField("پایان", null=True, blank=True)
    duration_ms = models.PositiveIntegerField("مدت (میلی‌ثانیه)", null=True, blank=True)

    class Meta:
        verbose_name = "اجرای شناسایی هوشمند"
        verbose_name_plural = "اجراهای شناسایی هوشمند"
        ordering = ["-created_at", "-pk"]
        indexes = [models.Index(fields=["status", "created_at"])]

    def __str__(self):
        return f"{self.response} · {self.get_status_display()}"

    @property
    def is_active(self):
        return self.status in self.ACTIVE_STATUSES


class PendingRisk(TimeStampedModel):
    """ریسک پیشنهادی شناسایی هوشمند («پیش‌نویس AI») برای یک پیامد پاسخنامه. کارشناس ریسک آن را ویرایش، تأیید (تبدیل به
    ریسک رجیستر) یا با دلیل رد می‌کند؛ بازگرداندن پاسخنامه یا «تحلیل دوباره» پیش‌نویس بررسی‌نشده را بایگانی می‌کند.
    حذف نمی‌شود. ai_original خروجی خام مدل برای همین ریسک است، برای «بازگرداندن پیشنهاد AI» و برچسب «ویرایش‌شده»."""

    class Status(models.TextChoices):
        PENDING = "pending", "پیش‌نویس AI"
        CONVERTED = "converted", "تأیید شد · آنالیز ریسک"
        DISMISSED = "dismissed", "رد شد"
        ARCHIVED = "archived", "بایگانی"

    class Confidence(models.TextChoices):
        HIGH = "high", "اطمینان بالا"
        MEDIUM = "medium", "اطمینان متوسط"
        LOW = "low", "اطمینان پایین"

    TITLE_LIMIT = 120

    response = models.ForeignKey(Response, verbose_name="پاسخ", on_delete=models.CASCADE, related_name="pending_risks")
    ai_run = models.ForeignKey(
        AiRun, verbose_name="اجرای شناسایی", on_delete=models.PROTECT, null=True, blank=True, related_name="drafts"
    )
    consequence = models.ForeignKey(
        PathConsequence,
        verbose_name="پیامد منبع",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="pending_risks",
    )
    title = models.CharField("عنوان", max_length=TITLE_LIMIT, blank=True)
    initiating_factor = models.TextField("عامل آغازگر", blank=True)
    paths = models.JSONField("مسیرهای تحقق", default=list, blank=True, help_text="[{path_id, number, text}]")
    target_event = models.TextField("رویداد هدف", blank=True)
    impact = models.TextField("پیامد", blank=True)
    impact_type = models.CharField("نوع پیامد", max_length=200, blank=True)
    impact_scope = models.TextField("دامنه‌ی پیامد", blank=True)
    category = models.ForeignKey(
        "risks.RiskCategory", verbose_name="دسته", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    owner_unit = models.ForeignKey(
        "organization.OrgUnit",
        verbose_name="واحد مالک",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مالک ریسک (شخص)",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    confidence = models.CharField("اطمینان", max_length=10, choices=Confidence.choices, blank=True)
    confidence_reason = models.TextField("دلیل اطمینان", blank=True)
    gaps = models.JSONField("کمبودها", default=list, blank=True)
    ai_original = models.JSONField("پیشنهاد AI", default=dict, blank=True)
    similar_risks = models.JSONField("ریسک‌های مشابه", default=list, blank=True)
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
        return self.title or f"ریسک پیشنهادی {self.pk}"

    @property
    def is_pending(self):
        return self.status == self.Status.PENDING
