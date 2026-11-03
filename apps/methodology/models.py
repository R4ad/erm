"""نسخه‌ی روش ارزیابی: همه‌ی عددها، معیارها و جدول‌های روش در MethodVersion و هفت جدول فرزندش است.
موتور محاسبه (قدم ۹) هیچ عددی را از جای دیگری نمی‌خواند؛ برای همین هر ارزیابی قدیمی با نسخه‌ی خودش
دوباره قابل محاسبه است."""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import RegexValidator
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel

# راهنمای فیلدهای متنی بلند در پنل مدیریت. صفحه‌ی روش این متن‌ها را با فیلتر paragraphs بند به بند نشان می‌دهد.
PARAGRAPHS_HELP = "بندها را با یک خط خالی از هم جدا کنید. بندی که با «## » شروع شود، عنوان نشان داده می‌شود."


def plain_number(number):
    """عدد اعشاری بدون صفرهای اضافه: 12.0000 → «12» و 0.2500 → «0.25»."""
    return format(number.normalize(), "f")


class PeriodUnit(models.TextChoices):
    """واحد مهلت‌ها و دوره‌ها، همان واحدی که سند v5 گفته است. ماه، ماه تقویم شمسی است."""

    HOUR = "hour", "ساعت"
    DAY = "day", "روز تقویمی"
    WORKING_DAY = "working_day", "روز کاری"
    WEEK = "week", "هفته"
    MONTH = "month", "ماه"


class MethodVersion(TimeStampedModel):
    """یک نسخه از روش ارزیابی. فقط یک نسخه فعال است و ارزیابی‌های تازه با همان انجام می‌شوند."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        APPROVED = "approved", "تصویب‌شده"
        ACTIVE = "active", "فعال"
        ARCHIVED = "archived", "بایگانی"

    class LikelihoodStrategy(models.TextChoices):
        PATHS_V5 = "paths_v5", "مسیرمحور v5"

    class ImpactStrategy(models.TextChoices):
        MAX = "max", "بیشترین سطح"

    number = models.PositiveIntegerField(
        "شماره", unique=True, error_messages={"unique": "نسخه‌ای با همین شماره ثبت شده است."}
    )
    title = models.CharField("عنوان", max_length=200)
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.DRAFT)
    based_on = models.ForeignKey(
        "self",
        verbose_name="کپی‌شده از",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="copies",
    )
    likelihood_strategy = models.CharField(
        "راهبرد احتمال", max_length=20, choices=LikelihoodStrategy.choices, default=LikelihoodStrategy.PATHS_V5
    )
    impact_strategy = models.CharField(
        "راهبرد پیامد", max_length=20, choices=ImpactStrategy.choices, default=ImpactStrategy.MAX
    )
    source = models.CharField("منبع", max_length=300, blank=True, help_text="سندی که مقدارها از آن آمده‌اند.")
    change_notes = models.TextField(
        "شرح تغییرات",
        blank=True,
        help_text=f"مقدار، دلیل و مرجع هر تغییر نسبت به نسخه‌ی قبلی (بخش ۳۲ سند v5). {PARAGRAPHS_HELP}",
    )
    impact_guidance = models.TextField("اصول ارزیابی پیامد", blank=True, help_text=PARAGRAPHS_HELP)
    decision_guidance = models.TextField("قواعد امتیاز و سطح تصمیم", blank=True, help_text=PARAGRAPHS_HELP)
    acceptance_guidance = models.TextField("اشتهای ریسک و پذیرش", blank=True, help_text=PARAGRAPHS_HELP)
    approval_ref = models.CharField("شماره‌ی نامه‌ی تصویب", max_length=100, blank=True)
    approved_on = models.DateField("تاریخ نامه‌ی تصویب", null=True, blank=True)
    approval_recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ثبت‌کننده‌ی تصویب",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    activated_at = models.DateTimeField("زمان فعال شدن", null=True, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="فعال‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )

    history = HistoricalRecords()

    # فیلدهای چرخه‌ی عمر نسخه را فقط سرویس‌های services.py عوض می‌کنند، حتی بعد از پیش‌نویس.
    # بقیه‌ی فیلدها محتوای نسخه‌اند و فقط در پیش‌نویس عوض می‌شوند؛ این را خود پایگاه داده چک می‌کند (migration 0003).
    LIFECYCLE_FIELDS = ["status", "approval_ref", "approved_on", "approval_recorded_by", "activated_at", "activated_by"]

    class Meta:
        verbose_name = "نسخه‌ی روش"
        verbose_name_plural = "نسخه‌های روش"
        ordering = ["-number"]
        constraints = [
            # شرط «فقط یک نسخه‌ی فعال» در خود پایگاه داده: یکتایی status فقط بین ردیف‌هایی که فعال‌اند.
            models.UniqueConstraint(
                fields=["status"],
                condition=Q(status="active"),
                name="methodversion_single_active",
                violation_error_message="فقط یک نسخه‌ی روش می‌تواند فعال باشد.",
            ),
            models.CheckConstraint(
                condition=Q(approval_ref="", approved_on__isnull=True)
                | (~Q(approval_ref="") & Q(approved_on__isnull=False)),
                name="methodversion_approval_ref_and_date_together",
                violation_error_message="شماره و تاریخ نامه‌ی تصویب با هم ثبت می‌شوند.",
            ),
            models.CheckConstraint(
                condition=~Q(status="approved") | Q(approved_on__isnull=False),
                name="methodversion_approved_needs_approval",
                violation_error_message="نسخه‌ی تصویب‌شده باید شماره و تاریخ نامه‌ی تصویب داشته باشد.",
            ),
            models.CheckConstraint(
                condition=~Q(status="draft") | Q(approved_on__isnull=True),
                name="methodversion_draft_not_approved",
                violation_error_message="پیش‌نویس هنوز تصویب نشده است و نامه‌ی تصویب ندارد.",
            ),
            # زمان فعال شدن فقط برای نسخه‌ای ثبت می‌شود که به کار رفته (فعال یا بایگانی)، و برای آن لازم است.
            models.CheckConstraint(
                condition=Q(status__in=["draft", "approved"], activated_at__isnull=True)
                | Q(status__in=["active", "archived"], activated_at__isnull=False),
                name="methodversion_activation_time_only_when_used",
                violation_error_message="زمان فعال شدن فقط برای نسخه‌ی فعال یا بایگانی ثبت می‌شود و برای آن‌ها لازم است.",
            ),
        ]

    def __str__(self):
        return f"نسخه‌ی {self.number}: {self.title}"

    def get_absolute_url(self):
        return reverse("methodology:version_detail", args=[self.number])

    @property
    def is_draft(self):
        return self.status == self.Status.DRAFT

    @property
    def is_trial(self):
        """نسخه‌ای که بدون تصویب به کار رفته است. فقط نسخه‌ی ۱ می‌تواند چنین باشد (س۱۲ قدم ۸)."""
        return self.status in (self.Status.ACTIVE, self.Status.ARCHIVED) and self.approved_on is None

    @property
    def can_record_approval(self):
        """تصویب پیش‌نویس ثبت می‌شود، و تصویب نسخه‌ی آزمایشی فعال اگر بی‌تغییر تصویب شده باشد (س۱۲ قدم ۸)."""
        return self.is_draft or (self.status == self.Status.ACTIVE and self.is_trial)


class Scale(models.Model):
    """یک مقیاس روش: A، B0، E، Bc و L برای احتمال، و هر بُعد پیامد (S، D، F، C و R) با سطح‌های صفر تا پنج."""

    class Kind(models.TextChoices):
        LIKELIHOOD = "likelihood", "احتمال"
        IMPACT = "impact", "پیامد"

    class BoundRule(models.TextChoices):
        NONE = "", "بدون مرز عددی"
        LOWER_CLOSED = "lower_closed", "از کران پایین تا کمتر از کران بالا"
        UPPER_CLOSED = "upper_closed", "بیش از کران پایین تا کران بالا"

    version = models.ForeignKey(MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="scales")
    code = models.CharField("نماد", max_length=4)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    name = models.CharField("نام", max_length=100)
    scope = models.TextField("دامنه یا پرسش اصلی", blank=True)
    description = models.TextField("متن پیش از جدول", blank=True, help_text=PARAGRAPHS_HELP)
    guidance = models.TextField(
        "متن پس از جدول", blank=True, help_text=f"قاعده‌هایی که در سند زیر جدول آمده‌اند. {PARAGRAPHS_HELP}"
    )
    unit = models.CharField("واحد مرز عددی", max_length=50, blank=True)
    bound_rule = models.CharField(
        "قاعده‌ی مرز عددی", max_length=20, choices=BoundRule.choices, blank=True, default=BoundRule.NONE
    )
    order = models.PositiveSmallIntegerField("ترتیب")

    history = HistoricalRecords()

    class Meta:
        verbose_name = "مقیاس"
        verbose_name_plural = "مقیاس‌ها"
        ordering = ["version", "order"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "code"],
                name="scale_unique_code_per_version",
                violation_error_message="مقیاسی با همین نماد در این نسخه هست.",
            ),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"

    # این دو برای این‌اند که صفحه‌ی روش ستون نام یا مرز عددی را فقط برای مقیاسی نشان دهد که آن را دارد.
    # levels.all() از prefetch_related صفحه خوانده می‌شود و پرس‌وجوی تازه نمی‌زند.
    @property
    def has_level_names(self):
        return any(level.name for level in self.levels.all())

    @property
    def has_bounds(self):
        return any(level.has_bounds for level in self.levels.all())

    def level_for(self, number):
        """سطحی که این عدد در مرزهایش می‌افتد، یا None اگر در هیچ سطحی نیفتد."""
        for level in self.levels.all():
            if level.contains(number):
                return level
        return None


class ScaleLevel(models.Model):
    """یک سطح از یک مقیاس با معیارش. A و F مرز عددی هم دارند: نرخ سالانه‌ی آغازگر و درصد زیان."""

    scale = models.ForeignKey(Scale, verbose_name="مقیاس", on_delete=models.CASCADE, related_name="levels")
    value = models.PositiveSmallIntegerField("سطح")
    name = models.CharField("نام", max_length=200, blank=True)
    criteria = models.TextField("معیار", blank=True)
    lower = models.DecimalField("کران پایین", max_digits=12, decimal_places=4, null=True, blank=True)
    upper = models.DecimalField("کران بالا", max_digits=12, decimal_places=4, null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "سطح مقیاس"
        verbose_name_plural = "سطح‌های مقیاس"
        ordering = ["scale", "value"]
        constraints = [
            models.UniqueConstraint(
                fields=["scale", "value"],
                name="scalelevel_unique_value_per_scale",
                violation_error_message="این سطح در همین مقیاس هست.",
            ),
            models.CheckConstraint(
                condition=Q(value__lte=5),
                name="scalelevel_value_0_to_5",
                violation_error_message="سطح باید بین ۰ و ۵ باشد.",
            ),
            models.CheckConstraint(
                condition=Q(lower__isnull=True) | Q(upper__isnull=True) | Q(lower__lt=F("upper")),
                name="scalelevel_lower_below_upper",
                violation_error_message="کران پایین باید کمتر از کران بالا باشد.",
            ),
        ]

    def __str__(self):
        return f"{self.scale.code}{self.value}"

    @property
    def has_bounds(self):
        return self.lower is not None or self.upper is not None

    def contains(self, number):
        """آیا این عدد در مرزهای این سطح است؟ قاعده‌ی مرز (کدام سر بسته است) را مقیاس تعیین می‌کند."""
        if not self.has_bounds:
            return False
        rule = self.scale.bound_rule
        if rule == Scale.BoundRule.LOWER_CLOSED:  # [پایین، بالا)
            return (self.lower is None or number >= self.lower) and (self.upper is None or number < self.upper)
        if rule == Scale.BoundRule.UPPER_CLOSED:  # (پایین، بالا]
            return (self.lower is None or number > self.lower) and (self.upper is None or number <= self.upper)
        return False

    def bounds_display(self):
        """مرز عددی به زبان سند، مثل «از 0.1 تا کمتر از 1 بار در سال». بدون مرز، رشته‌ی خالی."""
        if not self.has_bounds:
            return ""
        unit = f" {self.scale.unit}" if self.scale.unit else ""
        lower = None if self.lower is None else plain_number(self.lower)
        upper = None if self.upper is None else plain_number(self.upper)
        if self.scale.bound_rule == Scale.BoundRule.LOWER_CLOSED:
            if lower is None:
                return f"کمتر از {upper}{unit}"
            if upper is None:
                return f"{lower}{unit} یا بیشتر"
            return f"از {lower} تا کمتر از {upper}{unit}"
        if lower is None:
            return f"حداکثر {upper}{unit}"
        if upper is None:
            return f"بیش از {lower}{unit}"
        return f"بیش از {lower} تا {upper}{unit}"


class LikelihoodCell(models.Model):
    """یک خانه‌ی جدول احتمال بخش ۱۷: احتمال نهایی L برای هر A و B."""

    version = models.ForeignKey(
        MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="likelihood_cells"
    )
    a = models.PositiveSmallIntegerField("A")
    b = models.PositiveSmallIntegerField("B")
    likelihood = models.PositiveSmallIntegerField("L")

    history = HistoricalRecords()

    class Meta:
        verbose_name = "خانه‌ی جدول احتمال"
        verbose_name_plural = "خانه‌های جدول احتمال"
        ordering = ["version", "a", "b"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "a", "b"],
                name="likelihoodcell_unique_per_version",
                violation_error_message="این خانه‌ی جدول در همین نسخه هست.",
            ),
            models.CheckConstraint(
                condition=Q(a__range=(1, 5), b__range=(1, 5), likelihood__range=(1, 5)),
                name="likelihoodcell_values_1_to_5",
                violation_error_message="A، B و L باید بین ۱ و ۵ باشند.",
            ),
        ]

    def __str__(self):
        return f"A{self.a} × B{self.b} = L{self.likelihood}"


class RiskLevel(models.Model):
    """سطح ریسک با بازه‌ی امتیاز و قاعده‌هایش: جدول بخش ۱۹ و دوره‌های بازبینی بخش ۲۱."""

    class CoApprover(models.TextChoices):
        NONE = "none", "هیچ‌کس؛ فقط مالک ریسک"
        UPPER_MANAGER = "upper_manager", "مدیر بالادست"
        SECURITY_COMMITTEE = "security_committee", "کمیته امنیت"

    version = models.ForeignKey(MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="risk_levels")
    rank = models.PositiveSmallIntegerField("رتبه", help_text="۱ برای پایین‌ترین سطح.")
    name = models.CharField("نام", max_length=50)
    color = models.CharField(
        "رنگ",
        max_length=7,
        validators=[RegexValidator(r"^#[0-9a-fA-F]{6}$", "رنگ را به شکل #RRGGBB بنویسید، مثل #198754.")],
    )
    min_score = models.PositiveSmallIntegerField("کمترین امتیاز")
    max_score = models.PositiveSmallIntegerField("بیشترین امتیاز")
    decision_rule = models.TextField("تصمیم و مرجع مجاز")
    co_approver = models.CharField("امضای کنار مالک ریسک", max_length=30, choices=CoApprover.choices)
    containment_value = models.PositiveSmallIntegerField("مهلت مهار", null=True, blank=True)
    containment_unit = models.CharField("واحد مهلت مهار", max_length=20, choices=PeriodUnit.choices, blank=True)
    plan_value = models.PositiveSmallIntegerField("مهلت طرح", help_text="برای سطح پایین، مهلت ثبت تصمیم.")
    plan_unit = models.CharField("واحد مهلت طرح", max_length=20, choices=PeriodUnit.choices)
    acceptance_value = models.PositiveSmallIntegerField("حداکثر اعتبار پذیرش")
    acceptance_unit = models.CharField("واحد اعتبار پذیرش", max_length=20, choices=PeriodUnit.choices)
    review_value = models.PositiveSmallIntegerField("دوره‌ی بازبینی")
    review_unit = models.CharField("واحد دوره‌ی بازبینی", max_length=20, choices=PeriodUnit.choices)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "سطح ریسک"
        verbose_name_plural = "سطح‌های ریسک"
        ordering = ["version", "rank"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "rank"],
                name="risklevel_unique_rank_per_version",
                violation_error_message="سطحی با همین رتبه در این نسخه هست.",
            ),
            # رنگ در صفحه‌ی روش داخل style می‌نشیند؛ این قاعده در پایگاه داده هم جلوی هر مقدار دیگری را می‌گیرد.
            models.CheckConstraint(
                condition=Q(color__regex=r"^#[0-9a-fA-F]{6}$"),
                name="risklevel_color_is_hex",
                violation_error_message="رنگ را به شکل #RRGGBB بنویسید، مثل #198754.",
            ),
            models.CheckConstraint(
                condition=Q(min_score__gte=1, max_score__lte=25, min_score__lte=F("max_score")),
                name="risklevel_score_range_1_to_25",
                violation_error_message="بازه‌ی امتیاز باید درون ۱ تا ۲۵ باشد و کمترین از بیشترین بزرگ‌تر نباشد.",
            ),
            # در SQL مقایسه با NULL نه درست است نه نادرست، و CHECK آن را رد نمی‌کند؛ برای همین در شاخه‌ی دوم
            # isnull=False هم لازم است، وگرنه مهلت خالی با واحد «ساعت» پذیرفته می‌شد.
            models.CheckConstraint(
                condition=Q(containment_value__isnull=True, containment_unit="")
                | (Q(containment_value__isnull=False, containment_value__gte=1) & ~Q(containment_unit="")),
                name="risklevel_containment_value_and_unit_together",
                violation_error_message="مهلت مهار و واحدش با هم ثبت می‌شوند.",
            ),
            models.CheckConstraint(
                condition=Q(plan_value__gte=1, acceptance_value__gte=1, review_value__gte=1),
                name="risklevel_periods_at_least_one",
                violation_error_message="مهلت طرح، اعتبار پذیرش و دوره‌ی بازبینی دست‌کم ۱ هستند.",
            ),
        ]

    def __str__(self):
        return self.name

    @property
    def text_color(self):
        """رنگ نوشته روی زمینه‌ی این سطح: سیاه روی رنگ روشن (زرد و نارنجی) و سفید روی رنگ تیره."""
        red, green, blue = (int(self.color[index : index + 2], 16) for index in (1, 3, 5))
        brightness = (red * 299 + green * 587 + blue * 114) / 1000  # فرمول روشنایی W3C
        return "#000" if brightness > 150 else "#fff"


class ImpactFloor(models.Model):
    """کف سطح تصمیم: پیامد min_impact یا بیشتر، دست‌کم سطح min_level دارد، هر چه امتیاز باشد (بخش ۱۸)."""

    version = models.ForeignKey(
        MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="impact_floors"
    )
    min_impact = models.PositiveSmallIntegerField("از پیامد")
    min_level = models.ForeignKey(RiskLevel, verbose_name="دست‌کم سطح", on_delete=models.PROTECT, related_name="+")

    history = HistoricalRecords()

    class Meta:
        verbose_name = "کف سطح تصمیم"
        verbose_name_plural = "کف‌های سطح تصمیم"
        ordering = ["version", "min_impact"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "min_impact"],
                name="impactfloor_unique_per_version",
                violation_error_message="برای این پیامد در همین نسخه کف دیگری هست.",
            ),
            models.CheckConstraint(
                condition=Q(min_impact__range=(1, 5)),
                name="impactfloor_impact_1_to_5",
                violation_error_message="پیامد باید بین ۱ و ۵ باشد.",
            ),
        ]

    def __str__(self):
        return f"I{self.min_impact} و بیشتر: دست‌کم {self.min_level}"

    def clean(self):
        if self.min_level_id and self.version_id and self.min_level.version_id != self.version_id:
            raise ValidationError({"min_level": "سطح باید از همین نسخه باشد."})


class BcRule(models.Model):
    """قاعده‌ی Bc جدول بخش ۱۵: اگر دست‌کم min_count کنترل با E برابر min_e یا بیشتر باشد، Bc این مقدار است.
    از قاعده‌های برقرار، کمترین Bc انتخاب می‌شود و اگر هیچ‌کدام برقرار نباشد Bc برابر ۵ است (س۱۱)."""

    version = models.ForeignKey(MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="bc_rules")
    bc = models.PositiveSmallIntegerField("Bc")
    min_e = models.PositiveSmallIntegerField("کمترین E")
    min_count = models.PositiveSmallIntegerField("کمترین تعداد کنترل", default=1)
    needs_independence = models.BooleanField("کنترل‌ها مستقل باشند", default=False)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "قاعده‌ی Bc"
        verbose_name_plural = "قاعده‌های Bc"
        ordering = ["version", "-bc"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "bc"],
                name="bcrule_unique_bc_per_version",
                violation_error_message="برای این Bc در همین نسخه قاعده‌ی دیگری هست.",
            ),
            models.CheckConstraint(
                condition=Q(bc__range=(1, 5), min_e__range=(1, 5), min_count__gte=1),
                name="bcrule_values_in_range",
                violation_error_message="Bc و E باید بین ۱ و ۵ باشند و تعداد کنترل دست‌کم ۱.",
            ),
        ]

    def __str__(self):
        return f"Bc {self.bc}: {self.condition_display()}"

    def condition_display(self):
        count = "یک کنترل" if self.min_count == 1 else f"{self.min_count} کنترل"
        text = f"دست‌کم {count} با E{self.min_e} یا بالاتر"
        return f"{text}، مستقل از هم" if self.needs_independence else text


class MethodParameter(models.Model):
    """عددهای تکی روش. کلیدها و واحدشان در کد ثابت‌اند، چون کدی که هر کدام را به کار می‌برد واحدش را می‌داند."""

    class Key(models.TextChoices):
        HORIZON = "horizon", "افق پیش‌فرض ارزیابی"
        INPUT_RETURN = "input_return", "مهلت پیشنهادی جواب ورودی مبهم"
        A_DATA_PERIOD = "a_data_period", "کمترین دوره‌ی داده برای نرخ A"
        A_DATA_COVERAGE = "a_data_coverage", "کمترین پوشش ثبت دامنه‌ی آغازگر"
        S_RTO_FRACTION = "s_rto_fraction", "کسر RTO در معیارهای S"
        S_PROVISIONAL_LEVEL = "s_provisional_level", "کمترین سطح موقت S بدون RTO یا MTPD مصوب"
        REMINDER_FIRST = "reminder_first", "یادآوری اول پیش از انقضای پذیرش"
        REMINDER_SECOND = "reminder_second", "یادآوری دوم پیش از انقضای پذیرش"
        FULL_ASSESSMENT = "full_assessment", "فاصله‌ی ارزیابی کامل"
        REASSESS_INCIDENT = "reassess_incident", "آغاز بازسنجی پس از رخداد مهم یا شکست کنترل کلیدی"
        REASSESS_REQUIREMENT = "reassess_requirement", "شروع بررسی الزام جدید یا تهدید تازه"
        CONTROL_COVERAGE = "control_coverage", "پوشش لازم کنترل"
        CONTROL_SAMPLE = "control_sample", "اندازه‌ی نمونه‌ی آزمون کنترل"
        KEY_EVIDENCE_AGE = "key_evidence_age", "حداکثر قدمت شاهد کنترل کلیدی"
        OTHER_EVIDENCE_AGE = "other_evidence_age", "حداکثر قدمت شاهد کنترل‌های دیگر"
        CALIBRATION_CASES = "calibration_cases", "کمترین تعداد پرونده‌ی کالیبراسیون"
        CALIBRATION_EXACT = "calibration_exact", "توافق دقیق سطح تصمیم در کالیبراسیون"
        CALIBRATION_WITHIN_ONE = "calibration_within_one", "اختلاف حداکثر یک سطح در کالیبراسیون"

    version = models.ForeignKey(MethodVersion, verbose_name="نسخه", on_delete=models.PROTECT, related_name="parameters")
    key = models.CharField("پارامتر", max_length=40, choices=Key.choices)
    value = models.DecimalField("مقدار", max_digits=12, decimal_places=4)
    note = models.CharField("منبع یا توضیح", max_length=300, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پارامتر روش"
        verbose_name_plural = "پارامترهای روش"
        ordering = ["version", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["version", "key"],
                name="methodparameter_unique_key_per_version",
                violation_error_message="این پارامتر در همین نسخه هست.",
            ),
        ]

    def __str__(self):
        return f"{self.get_key_display()}: {self.value_display} {self.unit}"

    @property
    def unit(self):
        return PARAMETER_UNITS[self.key]

    @property
    def value_display(self):
        return plain_number(self.value)


# واحد هر پارامتر. پارامتری که این‌جا واحد نداشته باشد خطا می‌دهد و تست آن را می‌گیرد.
PARAMETER_UNITS = {
    MethodParameter.Key.HORIZON: PeriodUnit.MONTH.label,
    MethodParameter.Key.INPUT_RETURN: PeriodUnit.WORKING_DAY.label,
    MethodParameter.Key.A_DATA_PERIOD: PeriodUnit.MONTH.label,
    MethodParameter.Key.A_DATA_COVERAGE: "درصد",
    MethodParameter.Key.S_RTO_FRACTION: "برابر RTO",
    MethodParameter.Key.S_PROVISIONAL_LEVEL: "سطح",
    MethodParameter.Key.REMINDER_FIRST: PeriodUnit.DAY.label,
    MethodParameter.Key.REMINDER_SECOND: PeriodUnit.DAY.label,
    MethodParameter.Key.FULL_ASSESSMENT: PeriodUnit.MONTH.label,
    MethodParameter.Key.REASSESS_INCIDENT: PeriodUnit.WORKING_DAY.label,
    MethodParameter.Key.REASSESS_REQUIREMENT: PeriodUnit.WORKING_DAY.label,
    MethodParameter.Key.CONTROL_COVERAGE: "درصد",
    MethodParameter.Key.CONTROL_SAMPLE: "نمونه",
    MethodParameter.Key.KEY_EVIDENCE_AGE: PeriodUnit.DAY.label,
    MethodParameter.Key.OTHER_EVIDENCE_AGE: PeriodUnit.DAY.label,
    MethodParameter.Key.CALIBRATION_CASES: "پرونده",
    MethodParameter.Key.CALIBRATION_EXACT: "درصد",
    MethodParameter.Key.CALIBRATION_WITHIN_ONE: "درصد",
}
