from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.choices import Confidence
from apps.core.jalali import jalali_year
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


class ABasis(models.TextChoices):
    RATE = "rate", "نرخ سالانه"
    FORWARD = "forward", "شواهد آینده‌نگر"


class Assessment(TimeStampedModel):
    """یک ارزیابی ریسک (بخش ۷ و ۸ سند v5). هر ارزیابی ردیف تازه است و روی قبلی نمی‌نویسد، و با نسخه‌ی روشی که هنگام
    ساختنش فعال بوده محاسبه می‌شود. ارزیابی در جلسه‌ی کارگروه انجام می‌شود و عضو GRC آن را با تاریخ جلسه ثبت می‌کند
    (جواب س۳۳ و س۵۲). ارزیابی پروفایل پیامد (ImpactDetail)، عامل آغازگر (A) و مسیرهای تحقق (Path) دارد؛ نتیجه،
    کنترل کیفیت و تأیید در قدم ۱۸ می‌آید. ارزیابی حذف نمی‌شود."""

    class Kind(models.TextChoices):
        INHERENT = "inherent", "ذاتی"
        CURRENT = "current", "جاری"
        TARGET = "target", "هدف"

    class Status(models.TextChoices):
        # پیش‌نویس به کنترل کیفیت می‌رود؛ کنترل‌کننده تأیید می‌کند، به ارزیاب برمی‌گرداند یا به کارگروه ارجاع می‌دهد
        # (جواب س۳۳ و س۶۲). ارزیابی تأییدشده قفل است.
        DRAFT = "draft", "پیش‌نویس"
        IN_QC = "in_qc", "در کنترل کیفیت"
        REFERRED = "referred", "ارجاع به کارگروه"
        APPROVED = "approved", "تأییدشده"

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

    # عامل آغازگر (بخش ۱۴). تعریف آغازگر، واحد شمارش و دامنه روی خود ریسک است، چون در همه‌ی ارزیابی‌های آن ثابت
    # می‌ماند (بخش ۱۳). مسیر خالی یعنی A هنوز ثبت نشده؛ مسیر با A خالی یعنی «نامعلوم».
    a_basis = models.CharField(
        "مسیر A",
        max_length=20,
        choices=ABasis.choices,
        blank=True,
        help_text="نرخ سالانه برای آغازگر غیرعمدی یا تکرارشونده با داده‌ی قابل مقایسه؛ شواهد آینده‌نگر برای حمله‌ی "
        "هدفمند یا نبود داده‌ی معتبر. دو ستون جمع یا میانگین نمی‌شوند.",
    )
    a_count = models.PositiveIntegerField(
        "تعداد آغازگر یکتا", null=True, blank=True, help_text="با همان واحد شمارش ریسک؛ هشدارهای یک رخداد یکی‌اند."
    )
    a_period_months = models.PositiveSmallIntegerField("دوره‌ی مشاهده (ماه)", null=True, blank=True)
    a_denominator = models.CharField(
        "مخرج", max_length=200, blank=True, help_text="مثلاً «۱۰۰۰ بسته‌ی انتشار بررسی‌شده»، اگر نرخ مخرج دارد."
    )
    a_coverage = models.DecimalField(
        "پوشش ثبت (درصد)",
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="چه درصدی از دامنه‌ی آغازگر در منبع داده ثبت می‌شود.",
    )
    a = models.PositiveSmallIntegerField("A", null=True, blank=True)
    a_high = models.PositiveSmallIntegerField("کران بالای A", null=True, blank=True)
    a_confidence = models.CharField("اطمینان A", max_length=10, choices=Confidence.choices, blank=True)
    a_rationale = models.TextField("دلیل A", blank=True)
    a_evidence = models.ManyToManyField(
        "risks.Evidence", verbose_name="شواهد A", related_name="assessments_for_a", blank=True
    )

    # قاعده‌های تقدم بخش ۱۸. عضو GRC آن‌ها را با دلیل و شاهد ثبت می‌کند؛ امتیاز عوض نمی‌شود و فقط سطح تصمیم.
    ongoing_incident = models.BooleanField(
        "رویداد در حال وقوع", default=False, help_text="پاسخ اضطراری لازم دارد؛ سطح تصمیم بالاترین سطح می‌شود."
    )
    binding_prohibition = models.BooleanField(
        "منع الزام‌آور یا نقض غیرقابل اغماض",
        default=False,
        help_text="احرازشده، با نظر حقوقی؛ «خارج از اختیار پذیرش» و سطح تصمیم بالاترین سطح.",
    )
    customer_tolerance_exceeded = models.BooleanField(
        "عبور از حد تحمل خاص مشتری",
        default=False,
        help_text="یا دستور مصوب سخت‌گیرانه‌تر؛ اختیار پذیرش عمومی محدود می‌شود.",
    )
    escalation_rationale = models.TextField("دلیل قاعده‌ی تقدم", blank=True)
    escalation_evidence = models.ManyToManyField(
        "risks.Evidence", verbose_name="شواهد قاعده‌ی تقدم", related_name="assessments_for_escalation", blank=True
    )

    # نتیجه‌ی تأییدشده. هنگام تأیید با موتور محاسبه و نسخه‌ی روش ارزیابی حساب و ذخیره می‌شود و بعد عوض نمی‌شود؛
    # پیش‌نویس نتیجه را هر بار از ورودی‌ها حساب می‌کند. امتیاز مستقیم ویرایش نمی‌شود (بخش ۲۲).
    b_low = models.PositiveSmallIntegerField("B", null=True, editable=False)
    b_high = models.PositiveSmallIntegerField("کران بالای B", null=True, editable=False)
    likelihood_low = models.PositiveSmallIntegerField("L", null=True, editable=False)
    likelihood_high = models.PositiveSmallIntegerField("کران بالای L", null=True, editable=False)
    impact_low = models.PositiveSmallIntegerField("I", null=True, editable=False)
    impact_high = models.PositiveSmallIntegerField("کران بالای I", null=True, editable=False)
    score_low = models.PositiveSmallIntegerField("امتیاز", null=True, editable=False)
    score_high = models.PositiveSmallIntegerField("کران بالای امتیاز", null=True, editable=False)
    base_level = models.ForeignKey(
        "methodology.RiskLevel",
        verbose_name="سطح پایه",
        on_delete=models.PROTECT,
        null=True,
        editable=False,
        related_name="+",
    )
    decision_level = models.ForeignKey(
        "methodology.RiskLevel",
        verbose_name="سطح تصمیم",
        on_delete=models.PROTECT,
        null=True,
        editable=False,
        related_name="+",
    )
    escalation_reasons = models.JSONField("علت تصعید", default=list, editable=False)
    incomplete_reasons = models.JSONField("علت ناقص بودن", default=list, editable=False)
    confidence = models.CharField("اطمینان کل", max_length=10, choices=Confidence.choices, blank=True, editable=False)
    out_of_acceptance_authority = models.BooleanField("خارج از اختیار پذیرش", default=False, editable=False)
    acceptance_restricted = models.BooleanField("اختیار پذیرش عمومی محدود", default=False, editable=False)
    result_detail = models.JSONField("جزئیات مسیرها هنگام تأیید", default=dict, editable=False)
    approved_at = models.DateTimeField("زمان تأیید", null=True, editable=False)

    history = HistoricalRecords(m2m_fields=[a_evidence, escalation_evidence])

    class Meta:
        verbose_name = "ارزیابی"
        verbose_name_plural = "ارزیابی‌ها"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=Q(horizon_months__gte=1), name="assessment_horizon_positive"),
            models.CheckConstraint(condition=Q(a__isnull=True) | Q(a__range=(1, 5)), name="assessment_a_1_to_5"),
            models.CheckConstraint(
                condition=Q(a_high__isnull=True) | (Q(a__isnull=False) & Q(a_high__gt=F("a")) & Q(a_high__lte=5)),
                name="assessment_a_high_above_a",
            ),
            # A ثبت‌نشده مقدار ندارد و A ثبت‌شده، حتی نامعلوم، دلیل دارد (بخش ۱۴: مسیر انتخابی و دلیلش الزامی است).
            models.CheckConstraint(
                condition=(Q(a_basis="") & Q(a__isnull=True)) | (~Q(a_basis="") & ~Q(a_rationale="")),
                name="assessment_a_recorded_with_rationale",
            ),
            models.CheckConstraint(
                condition=~Q(a_basis="rate") | (Q(a_count__isnull=False) & Q(a_period_months__gte=1)),
                name="assessment_rate_has_count_and_period",
            ),
            models.CheckConstraint(
                condition=Q(a_coverage__isnull=True) | Q(a_coverage__range=(0, 100)),
                name="assessment_coverage_0_to_100",
            ),
        ]

    def __str__(self):
        return f"{self.code} ({self.get_kind_display()})"

    def get_absolute_url(self):
        return reverse("assessments:assessment_detail", args=[self.pk])

    @property
    def is_draft(self):
        return self.status == self.Status.DRAFT

    @property
    def is_approved(self):
        return self.status == self.Status.APPROVED

    @property
    def is_incomplete(self):
        """«ارزیابی ناقص»: کران قابل دفاعی برای دست‌کم یک جزء تعیین‌کننده نیست و پذیرش عادی مسدود است (بخش ۷)."""
        return bool(self.incomplete_reasons)

    @property
    def has_escalation_flag(self):
        return self.ongoing_incident or self.binding_prohibition or self.customer_tolerance_exceeded

    @property
    def a_recorded(self):
        return bool(self.a_basis)

    @property
    def a_display(self):
        if not self.a_recorded:
            return "ثبت‌نشده"
        if self.a is None:
            return "نامعلوم"
        return str(self.a) if self.a_high is None else f"{self.a} تا {self.a_high}"

    @property
    def a_engine_value(self):
        if self.a is None:
            return None
        return self.a if self.a_high is None else (self.a, self.a_high)

    @property
    def a_rate(self):
        """نرخ سالانه‌ی مشاهده‌شده: تعداد آغازگر یکتا تقسیم بر سال‌های مشاهده (بخش ۱۴)."""
        if self.a_count is None or not self.a_period_months:
            return None
        return Decimal(self.a_count) * 12 / Decimal(self.a_period_months)

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


class Path(TimeStampedModel):
    """یک مسیر تحقق (بخش ۱۵): مراحلی که بعد از آغازگر طی می‌شود تا رویداد اصلی رخ دهد. B0 قابلیت پایه‌ی مسیر بدون
    اعتبار کنترل‌هاست و Bc از E کنترل‌های پیشگیرانه‌ی مسیر و قاعده‌های Bc نسخه‌ی روش می‌آید؛ B مسیر کمترِ این دو
    است و B سناریو بیشترین B مسیرها. راه دورزدن یا حساب استثنایی که از همه‌ی موانع عبور می‌کند مسیر جداست
    (جواب س۵۹). استقلال موانع یک نشان روی مسیر است که فقط برای Bc=1 به کار می‌آید (جواب س۵۷)."""

    assessment = models.ForeignKey(Assessment, verbose_name="ارزیابی", on_delete=models.CASCADE, related_name="paths")
    name = models.CharField("نام مسیر", max_length=200, help_text="مثلاً «ورود مستقیم با حساب محلی».")
    description = models.TextField(
        "مراحل مسیر", help_text="مراحل از آغازگر تا رویداد اصلی، و این‌که هر کنترل کدام مرحله‌ی ضروری را قطع می‌کند."
    )
    b0 = models.PositiveSmallIntegerField("B0", null=True, blank=True, help_text="خالی یعنی نامعلوم.")
    b0_high = models.PositiveSmallIntegerField("کران بالای B0", null=True, blank=True)
    b0_rationale = models.TextField("دلیل B0")
    b0_confidence = models.CharField("اطمینان B0", max_length=10, choices=Confidence.choices, blank=True)
    evidence = models.ManyToManyField("risks.Evidence", verbose_name="شواهد", related_name="paths", blank=True)
    control_assessments = models.ManyToManyField(
        "controls.ControlAssessment",
        verbose_name="کنترل‌های پیشگیرانه",
        related_name="paths",
        blank=True,
        help_text="ارزیابی اثربخشی کنترل‌های پیشگیرانه‌ی همین ریسک که یک مرحله‌ی ضروری مسیر را قطع می‌کنند.",
    )
    critical_exception = models.BooleanField(
        "استثنای بحرانی باز",
        default=False,
        help_text="استثنای بحرانی باز، کاهش کنترل را در این مسیر می‌بندد و Bc بیشترین سطح می‌شود (بخش ۲۳).",
    )
    exceptions = models.TextField("استثناها", blank=True)
    independent = models.BooleanField(
        "موانع مستقل‌اند",
        default=False,
        help_text="شکست یا دورزدن یک کنترل دیگری را بی‌اثر نمی‌کند و وابستگی‌های مشترک بررسی شده‌اند؛ فقط برای Bc=1.",
    )
    independence_rationale = models.TextField(
        "دلیل استقلال", blank=True, help_text="حساب مدیریتی، احراز هویت، تنظیمات، زیرساخت و اختیار دورزدن مشترک."
    )

    history = HistoricalRecords(m2m_fields=[evidence, control_assessments])

    class Meta:
        verbose_name = "مسیر تحقق"
        verbose_name_plural = "مسیرهای تحقق"
        ordering = ["assessment", "pk"]
        constraints = [
            models.CheckConstraint(condition=Q(b0__isnull=True) | Q(b0__range=(1, 5)), name="path_b0_1_to_5"),
            models.CheckConstraint(
                condition=Q(b0_high__isnull=True) | (Q(b0__isnull=False) & Q(b0_high__gt=F("b0")) & Q(b0_high__lte=5)),
                name="path_b0_high_above_b0",
            ),
            models.CheckConstraint(condition=~Q(b0_rationale=""), name="path_b0_has_rationale"),
            models.CheckConstraint(
                condition=Q(independent=False) | ~Q(independence_rationale=""), name="path_independence_has_rationale"
            ),
            models.CheckConstraint(
                condition=Q(critical_exception=False) | ~Q(exceptions=""), name="path_critical_exception_described"
            ),
        ]

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return f"{self.assessment.get_absolute_url()}#path-{self.pk}"

    @property
    def b0_display(self):
        if self.b0 is None:
            return "نامعلوم"
        return str(self.b0) if self.b0_high is None else f"{self.b0} تا {self.b0_high}"

    @property
    def b0_engine_value(self):
        if self.b0 is None:
            return None
        return self.b0 if self.b0_high is None else (self.b0, self.b0_high)


class AssessmentReview(TimeStampedModel):
    """هر قدم کنترل کیفیت یک ردیف: ارسال، تأیید، برگشت، ارجاع به کارگروه و تصمیم کارگروه (جواب س۳۳ و س۶۲). ردیف‌ها
    ویرایش و حذف نمی‌شوند."""

    class Action(models.TextChoices):
        SUBMIT = "submit", "ارسال برای کنترل کیفیت"
        APPROVE = "approve", "تأیید"
        RETURN = "return", "برگشت به ارزیاب"
        REFER = "refer", "ارجاع به کارگروه امنیت"
        WORKGROUP_APPROVE = "workgroup_approve", "تأیید با تصمیم کارگروه"
        WORKGROUP_RETURN = "workgroup_return", "برگشت به ارزیاب با تصمیم کارگروه"

    assessment = models.ForeignKey(Assessment, verbose_name="ارزیابی", on_delete=models.PROTECT, related_name="reviews")
    action = models.CharField("کار", max_length=20, choices=Action.choices)
    notes = models.TextField("توضیح", blank=True)
    meeting_date = models.DateField("تاریخ جلسه‌ی کارگروه", null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="انجام‌دهنده", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        verbose_name = "قدم کنترل کیفیت"
        verbose_name_plural = "سابقه‌ی کنترل کیفیت"
        ordering = ["-created_at", "-pk"]

    def __str__(self):
        return f"{self.assessment.code}: {self.get_action_display()}"
