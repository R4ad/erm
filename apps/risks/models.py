from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.catalog.models import DataClass
from apps.core.jalali import jalali_year, to_jalali
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


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


class Tag(TimeStampedModel):
    """برچسب فرعی ریسک، کنار دسته‌ی اصلی؛ مثل «پرداخت» یا «ابری». برچسب‌ها از فرم ریسک ساخته می‌شوند."""

    name = models.CharField(
        "نام", max_length=50, unique=True, error_messages={"unique": "برچسبی با همین نام ثبت شده است."}
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "برچسب"
        verbose_name_plural = "برچسب‌ها"
        ordering = ["name"]

    def __str__(self):
        return self.name


class RiskScenario(TimeStampedModel):
    """سناریوی مرجع؛ نمونه‌های تازه به خدمت وصل‌اند و سناریوهای قدیمی بدون خدمت باقی می‌مانند."""

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    version = models.PositiveSmallIntegerField(
        "نسخه", default=1, editable=False, help_text="با هر تغییر اساسی یکی بالا می‌رود."
    )
    title = models.CharField("عنوان", max_length=300)
    service = models.ForeignKey(
        "catalog.Service", verbose_name="خدمت یا فرایند", on_delete=models.PROTECT,
        null=True, blank=True, related_name="scenarios",
    )
    service_name_snapshot = models.CharField("نام خدمت در زمان ثبت", max_length=200, blank=True)
    objective = models.TextField("هدف یا تعهد", blank=True)
    customer_text = models.TextField("داتین یا مشتری", blank=True)
    narrative = models.TextField("متن سناریو", blank=True)
    event = models.TextField("رویداد اصلی")
    conditions = models.TextField("شرایط", help_text="علت یا شرط تحقق رویداد.")
    consequence = models.TextField("پیامد")
    category = models.ForeignKey(
        RiskCategory, verbose_name="دسته‌ی اصلی", on_delete=models.PROTECT, related_name="scenarios"
    )
    is_active = models.BooleanField(
        "فعال", default=True, help_text="از سناریوی غیرفعال ریسک تازه ساخته نمی‌شود، ولی ریسک‌های قبلی می‌مانند."
    )
    # کتابخانه‌ی سناریو (فیگما ۲۱): سناریوی ادغام‌شده غیرفعال می‌ماند و به سناریوی مقصد اشاره می‌کند؛ حذف فیزیکی ممنوع است
    merged_into = models.ForeignKey(
        "self",
        verbose_name="ادغام‌شده در",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        editable=False,
        related_name="merged_from",
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "سناریوی مرجع"
        verbose_name_plural = "سناریوهای مرجع"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.title}"

    def build_narrative(self):
        return (
            f"در خدمت یا فرآیند {self.service_name_snapshot}، به علت یا در شرایط {self.conditions}، "
            f"ممکن است {self.event} رخ دهد و انجام {self.objective} برای {self.customer_text} را مختل کند. "
            f"پیامد قابل مشاهده آن {self.consequence} است."
        )

    def get_absolute_url(self):
        return reverse("risks:scenario_detail", args=[self.pk])

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code("SC")
        super().save(*args, **kwargs)


class ScenarioProposal(TimeStampedModel):
    """پیشنهاد ادغام یا تفکیک سناریوی مرجع (بخش ۶ روش، فیگما ۲۱): با دلیل ثبت و با دلیل تصمیم‌گیری می‌شود."""

    class Kind(models.TextChoices):
        MERGE = "merge", "ادغام"
        SPLIT = "split", "تفکیک"

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار تصمیم"
        ACCEPTED = "accepted", "پذیرفته"
        REJECTED = "rejected", "ردشده"

    kind = models.CharField("نوع", max_length=10, choices=Kind.choices)
    scenario = models.ForeignKey(
        RiskScenario, verbose_name="سناریو", on_delete=models.PROTECT, related_name="proposals"
    )
    target = models.ForeignKey(
        RiskScenario,
        verbose_name="سناریوی مقصد",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="incoming_proposals",
    )
    similarity = models.PositiveSmallIntegerField("شباهت (درصد)", null=True, blank=True)
    reason = models.TextField("دلیل پیشنهاد")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decided_at = models.DateTimeField("زمان تصمیم", null=True, blank=True)
    decision_reason = models.TextField("دلیل تصمیم", blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پیشنهاد ادغام یا تفکیک سناریو"
        verbose_name_plural = "پیشنهادهای ادغام یا تفکیک سناریو"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(kind="merge") | models.Q(target__isnull=False), name="merge_proposal_has_target"
            ),
            models.CheckConstraint(condition=~models.Q(target=models.F("scenario")), name="proposal_target_differs"),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.scenario.code}"


class Risk(TimeStampedModel):
    """نمونه‌ی ریسک (بخش ۱ و ۶ سند v5): کاربرد یک سناریو در یک خدمت، بانک و دامنه‌ی مشخص، با یک مالک. تعریف عامل
    آغازگر هم اینجاست، چون بخش ۱۳ می‌گوید در همه‌ی ارزیابی‌های یک ریسک ثابت می‌ماند. ریسک حذف نمی‌شود؛ رد،
    بسته یا ادغام می‌شود (قدم ۱۴)."""

    class Status(models.TextChoices):
        # چرخه‌ی عمر ریسک، به ترتیب جدول جواب س۱۵. انتقال‌ها و انجام‌دهنده‌ی هر کدام در قدم ۱۴ ساخته می‌شود.
        # ریسک با «ثبت‌شده در رجیستر» به دنیا می‌آید؛ «در پاسخ به پرسش‌ها» وقتی است که برای ارزیابی پرسش تازه‌ای لازم شود.
        QUESTIONS = "questions", "در پاسخ به پرسش‌ها"
        REGISTERED = "registered", "ثبت‌شده در رجیستر"
        SUBMITTED = "submitted", "ارسال‌شده"
        ASSESSMENT = "assessment", "در ارزیابی"
        REJECTED = "rejected", "ردشده"
        TREATMENT_PLAN = "treatment_plan", "برنامه‌ی درمان"
        TREATMENT = "treatment", "در اجرای درمان"
        REVIEW = "review", "در بازبینی"
        CLOSED = "closed", "بسته‌شده"

    class Channel(models.TextChoices):
        INTERVIEW = "interview", "مصاحبه"
        QUESTIONNAIRE = "questionnaire", "پرسشنامه"
        INCIDENT = "incident", "رخداد"
        CHANGE = "change", "تغییر"
        SCAN = "scan", "اسکن"
        AUDIT = "audit", "ممیزی"
        IDENTIFICATION = "identification", "فرم شناسایی"

    class Source(models.TextChoices):
        # «منبع شناسایی» فیگما ۱۱: ریسک از چه مجرایی اعلام شده است.
        PERIODIC = "periodic", "ارزیابی دوره‌ای ریسک امنیت اطلاعات"
        CHANGE = "change", "ثبت تغییرات نرمال"
        NEW_ASSET = "new_asset", "اضافه شدن دارایی جدید"
        NONCONFORMITY = "nonconformity", "مشاهده‌ی عدم انطباق"
        ENVIRONMENT = "environment", "تغییر شرایط محیطی"
        BEHAVIOR = "behavior", "تحلیل رفتار کاربر"
        THREAT = "threat", "مشاهده‌ی تهدید"

    # ریسک ردشده یا بسته‌شده فقط سابقه است.
    CLOSED_STATUSES = [Status.REJECTED, Status.CLOSED]

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    scenario = models.ForeignKey(
        RiskScenario,
        verbose_name="سناریوی مرجع",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="risks",
        help_text="خالی یعنی «مورد جدید» که سناریوی مرجع ندارد.",
    )
    scenario_version = models.PositiveSmallIntegerField("نسخه‌ی سناریو", null=True, blank=True, editable=False)
    title = models.CharField("عنوان", max_length=300, help_text="می‌تواند نام خدمت یا بانک را داشته باشد.")
    description = models.TextField(
        "شرح",
        help_text="با الگوی بخش ۴: در اثر [علت یا شرط]، ممکن است [رویداد] رخ دهد که به [پیامد] برای [ذی‌نفع] منجر شود.",
    )
    service = models.ForeignKey(
        "catalog.Service",
        verbose_name="خدمت",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="risks",
        help_text="پیش از تأیید ارزیابی اجباری است.",
    )
    customers = models.ManyToManyField(
        "catalog.Customer", verbose_name="بانک‌های متأثر", related_name="risks", blank=True
    )
    scope = models.TextField("دامنه", blank=True, help_text="محیط (تولید، آزمون، بازیابی) و مرز مسئولیت.")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مالک ریسک",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="owned_risks",
        help_text="یک شخص حقیقی؛ پیش از ارسال برای ارزیابی باید تعیین شود.",
    )
    org_unit = models.ForeignKey(
        "organization.OrgUnit", verbose_name="واحد", on_delete=models.PROTECT, related_name="risks"
    )
    category = models.ForeignKey(
        RiskCategory,
        verbose_name="دسته‌ی اصلی",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="risks",
        help_text="فرم شناسایی دسته نمی‌گیرد و عضو GRC آن را تعیین می‌کند؛ پیش از ارسال جهت ارزیابی اجباری است.",
    )
    tags = models.ManyToManyField(Tag, verbose_name="برچسب‌ها", related_name="risks", blank=True)
    data_class = models.CharField("طبقه‌ی اطلاعات", max_length=20, choices=DataClass.choices, blank=True)
    # برچسب‌های CIA طبق بخش ۸ سند v5؛ امتیاز جدا نمی‌گیرند.
    cia_c = models.BooleanField("محرمانگی (C)", default=False)
    cia_i = models.BooleanField("صحت (I)", default=False)
    cia_a = models.BooleanField("دسترس‌پذیری (A)", default=False)
    initiator = models.TextField("عامل آغازگر", blank=True, help_text="چه اتفاقی شروع سناریوست (بخش ۱۳).")
    realization_path = models.TextField("مسیر مشخص تحقق", blank=True)
    additional_notes = models.TextField("توضیحات اضافه", blank=True)
    scenario_snapshot = models.JSONField("جزئیات سناریو هنگام ثبت", default=dict, blank=True)
    count_unit = models.CharField(
        "واحد شمارش", max_length=200, blank=True, help_text="معیار هر وقوع مستقل، مثلاً «هر تلاش ورود ناموفق»."
    )
    count_exclusions = models.TextField("موارد خارج از شمارش", blank=True)
    controls = models.ManyToManyField(
        "controls.Control",
        verbose_name="کنترل‌های فعلی",
        related_name="risks",
        blank=True,
        help_text="کنترل‌هایی که این ریسک به آن‌ها تکیه دارد؛ ردیابی رجیستر به بیانیه‌ی کاربردپذیری از همین‌جاست.",
    )
    channel = models.CharField("کانال ورود", max_length=20, choices=Channel.choices)
    source = models.CharField("منبع شناسایی", max_length=20, choices=Source.choices, blank=True)
    # جواب‌های فرم شناسایی (فیگما ۱۱): مأموریت، اجزای الگوی سناریو، پیامد، وابستگی و شاهد، همان‌طور که واحد نوشت.
    intake = models.JSONField("ورودی شناسایی", default=dict, blank=True)
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.REGISTERED, editable=False)
    needs_completion = models.BooleanField(
        "نیازمند تکمیل",
        default=True,
        editable=False,
        help_text="عامل آغازگر، واحد شمارش یا دامنه هنوز نوشته نشده است.",
    )

    # ادغام و تفکیک (قدم ۱۴): شناسه‌ی مبدأ و سابقه‌اش می‌ماند و فقط این پیوندها ثبت می‌شوند.
    merged_into = models.ForeignKey(
        "self",
        verbose_name="ادغام در",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        editable=False,
        related_name="merged_risks",
    )
    split_from = models.ForeignKey(
        "self",
        verbose_name="تفکیک از",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        editable=False,
        related_name="split_parts",
    )

    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")

    # m2m_fields: افزودن و برداشتن بانک‌ها، برچسب‌ها و کنترل‌ها هم در تاریخچه ثبت می‌شود.
    history = HistoricalRecords(m2m_fields=[customers, tags, controls])

    class Meta:
        verbose_name = "ریسک"
        verbose_name_plural = "ریسک‌ها"
        ordering = ["-created_at"]
        constraints = [
            # ریسکی که در ریسک دیگری ادغام شده بسته است، و هیچ ریسکی در خودش ادغام نمی‌شود.
            models.CheckConstraint(
                condition=Q(merged_into__isnull=True) | Q(status="closed"),
                name="risk_merged_only_when_closed",
            ),
            models.CheckConstraint(condition=~Q(merged_into=F("pk")), name="risk_not_merged_into_itself"),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"

    def get_absolute_url(self):
        return reverse("risks:risk_detail", args=[self.pk])

    @property
    def is_active(self):
        return self.status not in self.CLOSED_STATUSES

    @property
    def scenario_changed(self):
        """سناریوی مرجع بعد از ساختن این ریسک تغییر اساسی کرده است."""
        return bool(self.scenario_id and self.scenario_version and self.scenario.version > self.scenario_version)

    @property
    def cia_labels(self):
        labels = [("C", self.cia_c), ("I", self.cia_i), ("A", self.cia_a)]
        return "، ".join(letter for letter, checked in labels if checked)

    def clean(self):
        errors = {}
        # ریسک فعال باید واحد و مالک فعال داشته باشد، مثل خدمت و دارایی.
        if self.is_active and self.org_unit_id and not self.org_unit.is_active:
            errors["org_unit"] = "این واحد غیرفعال است؛ ریسک فعال باید مال یک واحد فعال باشد."
        if self.is_active and self.owner_id and not self.owner.is_active:
            errors["owner"] = "این کاربر غیرفعال است؛ مالک دیگری انتخاب کنید."
        if errors:
            raise ValidationError(errors)

    def save(self, *args, **kwargs):
        if not self.code:
            # کد با سال شمسی ثبت، مثل RK-1405-0012؛ شماره‌ی هر سال از یک شروع می‌شود.
            self.code = next_code(f"RK-{jalali_year(timezone.localdate())}")
        if self.scenario_id and self.scenario_version is None:
            self.scenario_version = self.scenario.version  # نسخه‌ای از سناریو که ریسک از رویش ساخته شد
        if self.scenario_snapshot:
            self.needs_completion = not (self.initiator.strip() and self.realization_path.strip())
        else:
            self.needs_completion = not (self.initiator.strip() and self.count_unit.strip() and self.scope.strip())
        super().save(*args, **kwargs)


class IdentificationDraft(TimeStampedModel):
    """پیش‌نویس فرم شناسایی (فیگما ۱۱). ریسک فقط با «ارسال برای شناسایی» ساخته می‌شود، تا پیش‌نویس نیمه‌کاره در
    رجیستر، جهان ریسک و گزارش‌ها شمرده نشود. مقدارها همان فیلدهای فرم‌اند و با ارسال، پیش‌نویس پاک می‌شود."""

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.CASCADE, related_name="+"
    )
    org_unit = models.ForeignKey(
        "organization.OrgUnit", verbose_name="واحد", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    data = models.JSONField("مقدارهای فرم", default=dict, blank=True)
    # فایل شاهدی که پیش از ارسال پیوست شده؛ با ارسال به ریسک ساخته‌شده منتقل و با حذف پیش‌نویس پاک می‌شود.
    attachments = GenericRelation("core.Attachment")

    class Meta:
        verbose_name = "پیش‌نویس شناسایی"
        verbose_name_plural = "پیش‌نویس‌های شناسایی"
        ordering = ["-updated_at"]

    def __str__(self):
        return self.data.get("event") or f"پیش‌نویس {self.pk}"


class ExternalLink(TimeStampedModel):
    """شناسه‌ی همین ریسک در سامانه‌های دیگر (بخش ۳)، مثل درخواست تغییر، رخداد یا آسیب‌پذیری. حذف نمی‌شود؛
    پیوند اشتباه ویرایش می‌شود و تاریخچه‌اش می‌ماند."""

    class Kind(models.TextChoices):
        CHANGE = "change", "تغییر"
        INCIDENT = "incident", "رخداد"
        PROBLEM = "problem", "مشکل"
        VULNERABILITY = "vulnerability", "آسیب‌پذیری"
        CONTRACT = "contract", "قرارداد"
        SUPPLIER = "supplier", "تأمین‌کننده"
        CONTINUITY_PLAN = "continuity_plan", "برنامه‌ی تداوم"

    risk = models.ForeignKey(Risk, verbose_name="ریسک", on_delete=models.CASCADE, related_name="links")
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    ref = models.CharField("شناسه", max_length=100, help_text="شناسه در سامانه‌ی مبدأ، مثل CHG-2231.")
    url = models.URLField("نشانی", blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پیوند بیرونی"
        verbose_name_plural = "پیوندهای بیرونی"
        ordering = ["kind", "ref"]
        constraints = [
            models.UniqueConstraint(
                fields=["risk", "kind", "ref"],
                name="unique_external_link_per_risk",
                violation_error_message="این شناسه با همین نوع پیش‌تر برای این ریسک ثبت شده است.",
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.ref}"


class Evidence(TimeStampedModel):
    """شاهد (بخش ۷ سند v5): یک ادعای قابل ردیابی، مثل گزارش رخداد یا نتیجه‌ی آزمون، که چند ریسک و بعدها چند
    ارزیابی و کنترل به آن استناد می‌کنند. فایلش، اگر باشد، پیوست همین رکورد است. شاهد حذف نمی‌شود."""

    class Kind(models.TextChoices):
        INCIDENT = "incident", "رخداد"
        STATISTICS = "statistics", "آمار"
        TEST = "test", "آزمون"
        BIA_CONTRACT = "bia_contract", "BIA یا قرارداد"
        THREAT = "threat", "تهدید یا آسیب‌پذیری"
        INTERVIEW = "interview", "مصاحبه"

    class Reliability(models.TextChoices):
        LOW = "low", "کم"
        MEDIUM = "medium", "متوسط"
        HIGH = "high", "زیاد"

    class AccessClass(models.TextChoices):
        # س۱۷: عادی برای هر کسی که ریسک مرتبط را می‌بیند؛ محرمانه فقط برای مالک ریسک، اعضای GRC و ممیز.
        NORMAL = "normal", "عادی"
        CONFIDENTIAL = "confidential", "محرمانه"

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    title = models.CharField("عنوان", max_length=300)
    summary = models.TextField("خلاصه")
    source = models.CharField("منبع", max_length=300, help_text="سامانه، گزارش یا شخص.")
    observed_on = models.DateField("زمان", help_text="تاریخ خود شاهد، نه تاریخ ثبت.")
    scope = models.TextField("دامنه", blank=True)
    reliability = models.CharField("اعتبار", max_length=20, choices=Reliability.choices)
    valid_until = models.DateField("معتبر تا", null=True, blank=True)
    access_class = models.CharField(
        "طبقه‌ی دسترسی", max_length=20, choices=AccessClass.choices, default=AccessClass.NORMAL
    )
    url = models.URLField("پیوند", blank=True, help_text="اگر فایل جای دیگری است.")
    customer = models.ForeignKey(
        "catalog.Customer", verbose_name="بانک", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="مالک", on_delete=models.PROTECT, related_name="owned_evidence"
    )
    risks = models.ManyToManyField(Risk, verbose_name="ریسک‌های مرتبط", related_name="evidence", blank=True)
    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")

    history = HistoricalRecords(m2m_fields=[risks])

    class Meta:
        verbose_name = "شاهد"
        verbose_name_plural = "شواهد"
        ordering = ["-observed_on", "-pk"]
        constraints = [
            models.CheckConstraint(
                condition=Q(valid_until__isnull=True) | Q(valid_until__gte=models.F("observed_on")),
                name="evidence_valid_until_not_before_observed_on",
                violation_error_message="«معتبر تا» نباید پیش از تاریخ خود شاهد باشد.",
            ),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"

    def get_absolute_url(self):
        return reverse("risks:evidence_detail", args=[self.pk])

    @property
    def is_expired(self):
        return self.valid_until is not None and self.valid_until < timezone.localdate()

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"EV-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)
