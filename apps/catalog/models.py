from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel, ValidityPeriod


def check_active_unit_and_owner(record, noun):
    """خدمت یا دارایی فعال باید واحد و مالک فعال داشته باشد؛ رکورد غیرفعال فقط سابقه است و مهم نیست.
    noun اسم رکورد در پیام خطاست، مثل «خدمت»."""
    errors = {}
    if record.is_active and record.org_unit_id and not record.org_unit.is_active:
        errors["org_unit"] = f"این واحد غیرفعال است؛ {noun} فعال باید مال یک واحد فعال باشد."
    if record.is_active and record.owner_id and not record.owner.is_active:
        errors["owner"] = f"این کاربر غیرفعال است؛ برای {noun} فعال مالک دیگری انتخاب کنید."
    if errors:
        raise ValidationError(errors)


class DataClass(models.TextChoices):
    """طبقه‌ی اطلاعات داتین. ریسک (قدم ۱۱) و پیامد داده (قدم ۱۶) هم همین را به کار می‌برند."""

    PUBLIC = "public", "عمومی"
    INTERNAL = "internal", "درون‌سازمانی"
    CONFIDENTIAL = "confidential", "محرمانه"


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
        check_active_unit_and_owner(self, "خدمت")


class ServiceCustomer(ValidityPeriod, TimeStampedModel):
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

    history = HistoricalRecords()

    class Meta:
        verbose_name = "بانک خدمت"
        verbose_name_plural = "بانک‌های خدمت‌ها"
        ordering = ["customer__name"]
        constraints = [
            *ValidityPeriod.Meta.constraints,
            models.UniqueConstraint(
                fields=["service", "customer"],
                name="unique_customer_per_service",
                violation_error_message="این بانک پیش‌تر برای این خدمت ثبت شده است.",
            ),
            # این قاعده در خود پایگاه داده هم چک می‌شود. فرم هم پیش از ذخیره همین را چک می‌کند
            # و پیام فارسی را نشان می‌دهد. اگر یکی از دو مقدار خالی باشد، قاعده چیزی را رد نمی‌کند.
            models.CheckConstraint(
                condition=Q(rto_minutes__lt=F("mtpd_minutes"))
                | Q(rto_minutes__isnull=True)
                | Q(mtpd_minutes__isnull=True),
                name="rto_less_than_mtpd",
                violation_error_message="RTO باید کمتر از MTPD باشد.",
            ),
        ]

    def __str__(self):
        return f"{self.service.code} - {self.customer}"


class Supplier(TimeStampedModel):
    """تأمین‌کننده یا پیمانکار بیرونی. خدمت‌ها از راه وابستگی به آن وصل می‌شوند."""

    name = models.CharField(
        "نام", max_length=200, unique=True, error_messages={"unique": "تأمین‌کننده‌ای با همین نام ثبت شده است."}
    )
    description = models.TextField("خدمت یا کالا", blank=True, help_text="چه چیزی به داتین می‌دهد.")
    is_critical = models.BooleanField("حیاتی", default=False)
    contract_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مسئول قرارداد",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="supplier_contracts",
        help_text="کارمند داتین که قرارداد را پیگیری می‌کند.",
    )
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "تأمین‌کننده"
        verbose_name_plural = "تأمین‌کنندگان"
        ordering = ["name"]

    def __str__(self):
        return self.name

    def get_absolute_url(self):
        return reverse("catalog:supplier_detail", args=[self.pk])

    def clean(self):
        if self.is_active and self.contract_owner_id and not self.contract_owner.is_active:
            raise ValidationError(
                {"contract_owner": "این کاربر غیرفعال است؛ برای تأمین‌کننده‌ی فعال مسئول دیگری انتخاب کنید."}
            )


class Asset(TimeStampedModel):
    """دارایی: سامانه، سخت‌افزار، اطلاعات، مکان یا نیروی انسانی. در v5 دارایی شرط ثبت ریسک نیست؛
    خدمت‌ها از راه وابستگی به آن وصل می‌شوند."""

    class Kind(models.TextChoices):
        SYSTEM = "system", "سامانه و نرم‌افزار"
        HARDWARE = "hardware", "سخت‌افزار و شبکه"
        INFORMATION = "information", "اطلاعات"
        SITE = "site", "مکان"
        PEOPLE = "people", "نیروی انسانی"

    code = models.CharField(
        "کد", max_length=20, unique=True, error_messages={"unique": "دارایی‌ای با همین کد ثبت شده است."}
    )
    name = models.CharField("نام", max_length=200)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    org_unit = models.ForeignKey(
        "organization.OrgUnit",
        verbose_name="واحد مالک",
        on_delete=models.PROTECT,
        related_name="assets",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مالک دارایی",
        on_delete=models.PROTECT,
        related_name="owned_assets",
    )
    data_class = models.CharField("طبقه‌ی اطلاعات", max_length=20, choices=DataClass.choices, blank=True)
    # برچسب‌های CIA طبق بخش ۸ سند v5: کدام ویژگی امنیت اطلاعات برای این دارایی مهم است. امتیاز نیستند.
    cia_c = models.BooleanField("محرمانگی (C)", default=False)
    cia_i = models.BooleanField("صحت (I)", default=False)
    cia_a = models.BooleanField("دسترس‌پذیری (A)", default=False)
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "دارایی"
        verbose_name_plural = "دارایی‌ها"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} - {self.name}"

    def get_absolute_url(self):
        return reverse("catalog:asset_detail", args=[self.pk])

    def clean(self):
        check_active_unit_and_owner(self, "دارایی")

    @property
    def cia_labels(self):
        """برچسب‌های تیک‌خورده، مثل «C، A»."""
        labels = [("C", self.cia_c), ("I", self.cia_i), ("A", self.cia_a)]
        return "، ".join(letter for letter, checked in labels if checked)


class Commitment(ValidityPeriod, TimeStampedModel):
    """بند SLA، قرارداد یا الزام ابلاغی (بخش ۵ سند v5). یک تعهد می‌تواند چند خدمت را بپوشاند.
    جز عنوان همه‌ی فیلدها اختیاری‌اند تا تعهد با اطلاعات ناقص هم ثبت و بعداً کامل شود."""

    class Kind(models.TextChoices):
        SLA = "sla", "SLA"
        CONTRACT = "contract", "قرارداد"
        REGULATORY = "regulatory", "الزام قانونی یا نظارتی"
        INTERNAL = "internal", "الزام داخلی"

    title = models.CharField("عنوان", max_length=200)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, blank=True)
    clause_ref = models.CharField(
        "مرجع بند", max_length=200, blank=True, help_text="شماره‌ی بند قرارداد یا SLA، یا شماره‌ی ابلاغیه."
    )
    description = models.TextField("شرح", blank=True, help_text="مهلت، صحت خروجی یا حد تحمل.")
    services = models.ManyToManyField(Service, verbose_name="خدمت‌ها", related_name="commitments", blank=True)
    customer = models.ForeignKey(
        Customer,
        verbose_name="بانک",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="commitments",
        help_text="خالی یعنی تعهد مال همه‌ی بانک‌های این خدمت‌هاست.",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مسئول اجرا",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="owned_commitments",
    )

    # m2m_fields: افزودن و برداشتن خدمت‌ها هم در تاریخچه ثبت می‌شود، نه فقط فیلدهای خود تعهد.
    history = HistoricalRecords(m2m_fields=[services])

    class Meta:
        verbose_name = "تعهد"
        verbose_name_plural = "تعهدها"
        ordering = ["title", "pk"]
        constraints = ValidityPeriod.Meta.constraints

    def __str__(self):
        return self.title


class Responsibility(models.TextChoices):
    """طرف مسئول در مرز مسئولیت یک وابستگی (بخش ۶ سند v5)."""

    DATIN = "datin", "داتین"
    BANK = "bank", "بانک"
    SUPPLIER = "supplier", "تأمین‌کننده"


class Dependency(ValidityPeriod, TimeStampedModel):
    """وابستگی یک خدمت به خدمت دیگر، تأمین‌کننده یا دارایی، با مرز مسئولیت داتین، بانک و تأمین‌کننده
    (بخش ۶ سند v5). از سه ستون «به چه» دقیقاً یکی پر می‌شود."""

    TARGET_FIELDS = ["upstream_service", "supplier", "asset"]
    BOUNDARY_FIELDS = ["infra_owner", "control_operator", "evidence_provider", "change_authority", "incident_contact"]

    service = models.ForeignKey(
        Service, verbose_name="خدمت", on_delete=models.CASCADE, related_name="dependencies"
    )
    upstream_service = models.ForeignKey(
        Service,
        verbose_name="خدمت بالادستی",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="dependents",
    )
    supplier = models.ForeignKey(
        Supplier, verbose_name="تأمین‌کننده", on_delete=models.PROTECT, null=True, blank=True, related_name="dependents"
    )
    asset = models.ForeignKey(
        Asset, verbose_name="دارایی", on_delete=models.PROTECT, null=True, blank=True, related_name="dependents"
    )
    description = models.TextField("شرح", blank=True, help_text="خدمت برای چه کاری به آن وابسته است.")
    alternative = models.TextField("جایگزین", blank=True, help_text="اگر از کار بیفتد، مسیر جایگزین چیست.")
    is_shared_point = models.BooleanField(
        "نقطه‌ی شکست مشترک", default=False, help_text="از کار افتادنش چند خدمت را با هم مختل می‌کند."
    )
    # مرز مسئولیت: چه کسی هر کار را برای این وابستگی انجام می‌دهد. همه اختیاری‌اند تا بعداً کامل شوند.
    infra_owner = models.CharField("مالک زیرساخت", max_length=20, choices=Responsibility.choices, blank=True)
    control_operator = models.CharField(
        "اجراکننده‌ی کنترل", max_length=20, choices=Responsibility.choices, blank=True
    )
    evidence_provider = models.CharField(
        "ارائه‌دهنده‌ی شاهد", max_length=20, choices=Responsibility.choices, blank=True
    )
    change_authority = models.CharField("تصمیم‌گیر تغییر", max_length=20, choices=Responsibility.choices, blank=True)
    incident_contact = models.CharField(
        "مخاطب اعلام رخداد", max_length=200, blank=True, help_text="نام یا نقش؛ ممکن است بیرون از داتین باشد."
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "وابستگی"
        verbose_name_plural = "وابستگی‌ها"
        ordering = ["upstream_service__code", "supplier__name", "asset__code"]
        constraints = [
            *ValidityPeriod.Meta.constraints,
            models.CheckConstraint(
                condition=Q(upstream_service__isnull=False, supplier__isnull=True, asset__isnull=True)
                | Q(upstream_service__isnull=True, supplier__isnull=False, asset__isnull=True)
                | Q(upstream_service__isnull=True, supplier__isnull=True, asset__isnull=False),
                name="dependency_has_exactly_one_target",
                violation_error_message="وابستگی باید دقیقاً به یکی از این‌ها باشد: خدمت دیگر، تأمین‌کننده یا دارایی.",
            ),
            models.CheckConstraint(
                condition=~Q(upstream_service=F("service")),
                name="dependency_not_on_itself",
                violation_error_message="خدمت نمی‌تواند به خودش وابسته باشد.",
            ),
            # ستون خالی (NULL) در قاعده‌ی یکتایی با هیچ ردیفی برابر نیست؛ پس این سه قاعده فقط جفت‌های پر را
            # یکتا می‌کنند و خدمت می‌تواند به چند تأمین‌کننده و چند دارایی وابسته باشد.
            models.UniqueConstraint(
                fields=["service", "upstream_service"],
                name="unique_upstream_service_per_service",
                violation_error_message="وابستگی به این خدمت پیش‌تر ثبت شده است.",
            ),
            models.UniqueConstraint(
                fields=["service", "supplier"],
                name="unique_supplier_per_service",
                violation_error_message="وابستگی به این تأمین‌کننده پیش‌تر ثبت شده است.",
            ),
            models.UniqueConstraint(
                fields=["service", "asset"],
                name="unique_asset_per_service",
                violation_error_message="وابستگی به این دارایی پیش‌تر ثبت شده است.",
            ),
        ]

    def __str__(self):
        return f"{self.service.code} وابسته به {self.target}"

    @property
    def target_field(self):
        """نام ستونی از سه ستون «به چه» که پر است، مثل supplier."""
        return next((name for name in self.TARGET_FIELDS if getattr(self, f"{name}_id")), None)

    @property
    def target(self):
        """خدمت، تأمین‌کننده یا دارایی‌ای که این خدمت به آن وابسته است."""
        return getattr(self, self.target_field) if self.target_field else None

    @property
    def target_kind(self):
        """نوع هدف برای نمایش: «خدمت بالادستی»، «تأمین‌کننده» یا «دارایی»."""
        return self._meta.get_field(self.target_field).verbose_name if self.target_field else ""

    @property
    def has_boundary(self):
        """دست‌کم یکی از پنج پرسش مرز مسئولیت جواب دارد."""
        return any(getattr(self, name) for name in self.BOUNDARY_FIELDS)
