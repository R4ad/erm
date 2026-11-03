from datetime import timedelta

from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.catalog.models import Responsibility
from apps.core.jalali import jalali_year, to_jalali
from apps.core.models import TimeStampedModel
from apps.core.services import next_code

from .effectiveness import TestFacts, Thresholds


class IsoControl(TimeStampedModel):
    """یکی از ۹۳ کنترل پیوست A استاندارد ISO/IEC 27001:2022 (بخش ۸ سند v5 و جواب س۱۶). فهرست با مهاجرت داده
    وارد می‌شود و ساخته یا حذف نمی‌شود؛ فقط عنوان فارسی ویرایش می‌شود تا با نسخه‌ی رسمی سازمان یکی شود. متن خود
    کنترل‌ها در سامانه نیست."""

    class Theme(models.IntegerChoices):
        # شماره‌ی بند استاندارد همان شماره‌ی موضوع است: ۵.۱ تا ۵.۳۷ سازمانی و ...
        ORGANIZATIONAL = 5, "سازمانی"
        PEOPLE = 6, "انسانی"
        PHYSICAL = 7, "فیزیکی"
        TECHNOLOGICAL = 8, "فناورانه"

    code = models.CharField("شماره", max_length=10, unique=True, editable=False)
    theme = models.PositiveSmallIntegerField("موضوع", choices=Theme.choices, editable=False)
    number = models.PositiveSmallIntegerField("ردیف در موضوع", editable=False)
    title = models.CharField(
        "عنوان فارسی", max_length=300, help_text="با عنوان نسخه‌ی رسمی فارسی استاندارد که سازمان دارد تطبیق دهید."
    )
    title_en = models.CharField("عنوان انگلیسی", max_length=300, editable=False)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "کنترل پیوست A"
        verbose_name_plural = "کنترل‌های پیوست A"
        # ترتیب عددی، تا ۵.۲ پیش از ۵.۱۰ بیاید.
        ordering = ["theme", "number"]
        constraints = [
            models.UniqueConstraint(fields=["theme", "number"], name="iso_control_unique_number"),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"

    def get_absolute_url(self):
        return reverse("controls:soa_detail", args=[self.pk])


class Control(TimeStampedModel):
    """کنترل سازمان (بخش ۷ و ۱۶ سند v5): یک سازوکار مشخص با مسئول، که ریسک‌ها به آن تکیه دارند و به کنترل‌های پیوست A
    نگاشت می‌شود. ارزیابی اثربخشی (E) با شاهد آزمون در قدم ۱۷ می‌آید. کنترل حذف نمی‌شود؛ غیرفعال می‌شود."""

    class Kind(models.TextChoices):
        # کنترل پیشگیرانه فقط در مسیر احتمال اعتبار می‌گیرد و کنترل بازیابی فقط در پیامد (بخش ۷).
        PREVENTIVE = "preventive", "پیشگیرانه"
        DETECTIVE = "detective", "کشف"
        CONTAINMENT = "containment", "مهار"
        RECOVERY = "recovery", "بازیابی"

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    title = models.CharField("عنوان", max_length=300)
    objective = models.TextField(
        "هدف و سازوکار", help_text="کنترل جلوی چه چیزی را می‌گیرد یا چه چیزی را آشکار می‌کند، و چطور."
    )
    kind = models.CharField(
        "نوع",
        max_length=20,
        choices=Kind.choices,
        help_text="کنترل دومنظوره دو سازوکار و دو شاهد مستقل دارد و دو کنترل جدا ثبت می‌شود (بخش ۷).",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مسئول کنترل",
        on_delete=models.PROTECT,
        related_name="owned_controls",
        help_text="پاسخ‌گوی اجرا و شواهد کنترل.",
    )
    operated_by = models.CharField("اجراکننده", max_length=20, choices=Responsibility.choices)
    is_key = models.BooleanField(
        "کنترل کلیدی",
        default=False,
        help_text="شاهد کنترل کلیدی زودتر کهنه می‌شود و اثربخشی کنترل‌های کلیدی در گزارش ماهانه می‌آید (بخش ۲۱).",
    )
    iso_controls = models.ManyToManyField(
        IsoControl,
        verbose_name="کنترل‌های پیوست A",
        related_name="controls",
        blank=True,
        help_text="کنترل‌هایی از پیوست A که این کنترل بخشی از اجرای آن‌هاست.",
    )
    is_active = models.BooleanField(
        "فعال", default=True, help_text="کنترل کنارگذاشته غیرفعال می‌شود و پیوندها و سابقه‌اش می‌ماند."
    )

    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")

    # افزودن و برداشتن نگاشت پیوست A هم در تاریخچه می‌ماند.
    history = HistoricalRecords(m2m_fields=[iso_controls])

    class Meta:
        verbose_name = "کنترل"
        verbose_name_plural = "کنترل‌ها"
        ordering = ["code"]

    def __str__(self):
        return f"{self.code} {self.title}"

    def get_absolute_url(self):
        return reverse("controls:control_detail", args=[self.pk])

    def clean(self):
        if self.is_active and self.owner_id and not self.owner.is_active:
            raise ValidationError({"owner": "این کاربر غیرفعال است؛ مسئول دیگری انتخاب کنید."})

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code("CT")
        super().save(*args, **kwargs)


class Applicability(TimeStampedModel):
    """یک ردیف بیانیه‌ی کاربردپذیری (SoA): برای یک کنترل پیوست A، کاربرد دارد یا نه و چرا، و اگر دارد تا کجا اجرا
    شده است (بخش ۸ سند v5). ردیابی به ریسک‌ها جدا ذخیره نمی‌شود و از کنترل‌های سازمان و ریسک‌هایشان می‌آید. کنترل
    پیوست A که ردیف ندارد «تعیین‌نشده» است. ردیف حذف نمی‌شود و هر تغییرش در تاریخچه می‌ماند."""

    class Implementation(models.TextChoices):
        IMPLEMENTED = "implemented", "اجراشده"
        IN_PROGRESS = "in_progress", "در حال اجرا"
        PLANNED = "planned", "برنامه‌ریزی‌شده"

    iso_control = models.OneToOneField(
        IsoControl, verbose_name="کنترل پیوست A", on_delete=models.PROTECT, related_name="applicability"
    )
    applicable = models.BooleanField("کاربرد دارد", default=True)
    justification = models.TextField(
        "دلیل", help_text="علت انتخاب، مثل ریسک، قرارداد یا الزام قانونی؛ یا علت کاربرد نداشتن."
    )
    implementation = models.CharField(
        "وضعیت اجرا",
        max_length=20,
        choices=Implementation.choices,
        blank=True,
        help_text="فقط برای کنترلی که کاربرد دارد.",
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "ردیف بیانیه‌ی کاربردپذیری"
        verbose_name_plural = "بیانیه‌ی کاربردپذیری"
        ordering = ["iso_control__theme", "iso_control__number"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(applicable=True) & ~Q(implementation="")) | Q(applicable=False, implementation=""),
                name="applicability_implementation_matches",
            ),
            models.CheckConstraint(condition=~Q(justification=""), name="applicability_has_justification"),
        ]

    def __str__(self):
        return f"{self.iso_control.code}: {'کاربرد دارد' if self.applicable else 'کاربرد ندارد'}"

    def get_absolute_url(self):
        return self.iso_control.get_absolute_url()


class ControlAssessment(TimeStampedModel):
    """ارزیابی اثربخشی یک کنترل در یک دامنه‌ی مشخص (بخش ۱۶ و برگه‌ی آزمون کنترل بخش ۲۵ سند v5). یک کنترل در
    دامنه‌های مختلف می‌تواند E متفاوت داشته باشد. عضو GRC آن را ثبت و E را تعیین می‌کند و مسئول کنترل شاهد آزمون را
    پیوست می‌کند (جواب س۵۴). شرط هر سطح در effectiveness.py است. شاهد بعد از «معتبر تا» کهنه است و کنترل معلق یا
    با شاهد کهنه در محاسبه‌ی Bc فقط E1 حساب می‌شود. آزمون تازه یک ردیف تازه است تا ارزیابی‌هایی که به ردیف قبلی
    استناد کرده‌اند همان را ببینند؛ ردیف حذف نمی‌شود."""

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    control = models.ForeignKey(
        Control, verbose_name="کنترل", on_delete=models.PROTECT, related_name="effectiveness_assessments"
    )
    method_version = models.ForeignKey(
        "methodology.MethodVersion",
        verbose_name="نسخه‌ی روش",
        on_delete=models.PROTECT,
        related_name="control_assessments",
        editable=False,
        help_text="آستانه‌های پوشش، نمونه و قدمت شاهد از این نسخه می‌آیند.",
    )
    scope = models.TextField(
        "دامنه", help_text="حساب‌ها، سامانه‌ها، روش‌های دسترسی یا حالت‌های عملیاتی که این ارزیابی پوشش می‌دهد."
    )
    # چهار وضعیت جدای بخش ۱۶
    exists = models.BooleanField("کنترل وجود دارد و اجرا می‌شود", default=False)
    design_ok = models.BooleanField("طراحی کافی است", default=False)
    population = models.CharField(
        "جمعیت کل", max_length=300, blank=True, help_text="مثلاً «۴۲ حساب ممتاز» یا «همه‌ی بسته‌های انتشار»."
    )
    coverage_pct = models.DecimalField(
        "درصد پوشش اجرا", max_digits=5, decimal_places=2, null=True, blank=True, help_text="نسبت به جمعیت کل."
    )
    critical_points = models.TextField("نقاط حیاتی", blank=True, help_text="فهرست نقاط حیاتی دامنه.")
    critical_points_covered = models.BooleanField("همه‌ی نقاط حیاتی پوشش دارند", default=False)
    exceptions = models.TextField(
        "استثناها و انحراف‌ها",
        blank=True,
        help_text="مسیرهای اضطراری و استثناهای بررسی‌شده، و دلیل پذیرش انحراف‌هایی که عملکرد کنترل را نقض نمی‌کنند.",
    )
    known_gap = models.BooleanField(
        "شکست یا شکاف شناخته‌شده",
        default=False,
        help_text="شکست یا شکافی در دامنه‌ی مورد اتکا که عملکرد کنترل را در سناریو نقض می‌کند؛ E3 و بالاتر را می‌بندد.",
    )
    operating_ok = models.BooleanField("آزمون فعلی اثربخشی عملیاتی را نشان می‌دهد", default=False)
    # آزمون
    test_method = models.CharField(
        "روش آزمون", max_length=300, blank=True, help_text="مثلاً بازبینی سوابق، اجرای دوباره یا آزمون فنی."
    )
    test_from = models.DateField("آغاز بازه‌ی آزمون", null=True, blank=True)
    test_to = models.DateField(
        "پایان بازه‌ی آزمون", null=True, blank=True, help_text="قدمت شاهد از این تاریخ حساب می‌شود."
    )
    sample_size = models.PositiveIntegerField("اندازه‌ی نمونه", null=True, blank=True)
    sample_rationale = models.TextField(
        "دلیل تعداد و تنوع نمونه",
        blank=True,
        help_text="با توجه به اهمیت کنترل، گستردگی دامنه و تنوع شرایط اجرا (بخش ۱۶).",
    )
    test_result = models.TextField("نتیجه‌ی آزمون", blank=True)
    failures = models.TextField("شکست‌ها و اقدام اصلاحی", blank=True)
    # شرط‌های E4 و E5
    sustained = models.BooleanField(
        "عملکرد مستمر در دوره‌ی بررسی", default=False, help_text="سوابق معتبر عملکرد پایدار کنترل؛ شرط E4 و E5."
    )
    failure_bypass_tested = models.BooleanField("شرایط خرابی و دورزدن آزمون شده است", default=False)
    monitored = models.BooleanField("پایش مستمر دارد", default=False)
    # نتیجه
    e = models.PositiveSmallIntegerField("E")
    rationale = models.TextField("دلیل انتخاب E")
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تأییدکننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="برای E3 و بالاتر لازم است و کسی جز مسئول کنترل است.",
    )
    valid_until = models.DateField(
        "شاهد معتبر تا", null=True, blank=True, editable=False, help_text="از قدمت مجاز شاهد در نسخه‌ی روش."
    )
    suspended = models.BooleanField(
        "معلق",
        default=False,
        help_text="بعد از شکست کنترل یا تغییر مهم در کنترل یا محیط؛ تا آزمون تازه، کنترل اعتبار کاهش ندارد.",
    )
    evidence = models.ManyToManyField(
        "risks.Evidence", verbose_name="شواهد", related_name="control_assessments", blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+", editable=False
    )

    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")

    history = HistoricalRecords(m2m_fields=[evidence])

    class Meta:
        verbose_name = "ارزیابی اثربخشی کنترل"
        verbose_name_plural = "ارزیابی‌های اثربخشی کنترل"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=Q(e__range=(1, 5)), name="control_assessment_e_1_to_5"),
            models.CheckConstraint(
                condition=Q(coverage_pct__isnull=True) | Q(coverage_pct__range=(0, 100)),
                name="control_assessment_coverage_0_to_100",
            ),
            models.CheckConstraint(
                condition=Q(test_from__isnull=True) | Q(test_to__isnull=True) | Q(test_to__gte=F("test_from")),
                name="control_assessment_test_period_in_order",
            ),
            models.CheckConstraint(condition=~Q(rationale=""), name="control_assessment_has_rationale"),
        ]

    def __str__(self):
        return f"{self.code} {self.control.code} E{self.e}"

    def get_absolute_url(self):
        return reverse("controls:control_assessment_detail", args=[self.pk])

    def credit_problem(self, on=None):
        """چرا این ارزیابی الان اعتبار کاهش ندارد، یا None. کنترل E1 اصلاً اعتبار کاهش ندارد و کهنه نمی‌شود."""
        if self.e == 1:
            return None
        if self.suspended:
            return "معلق است"
        on = on or timezone.localdate()
        if self.valid_until and self.valid_until < on:
            return f"شاهدش از {to_jalali(self.valid_until)} کهنه شده است"
        return None

    def test_facts(self):
        return TestFacts(
            exists=self.exists,
            design_ok=self.design_ok,
            operating_ok=self.operating_ok,
            coverage_pct=self.coverage_pct,
            critical_points_covered=self.critical_points_covered,
            known_gap=self.known_gap,
            test_to=self.test_to,
            sample_size=self.sample_size,
            has_evidence=self.evidence.exists(),
            verifier_id=self.verified_by_id,
            owner_id=self.control.owner_id,
            sustained=self.sustained,
            failure_bypass_tested=self.failure_bypass_tested,
            monitored=self.monitored,
        )

    def effective_e(self, on=None):
        """E که در محاسبه‌ی Bc به کار می‌رود: کنترل معلق یا با شاهد کهنه E1 است (بخش ۱۵: نبود شاهد مجوز کاهش نیست)."""
        return 1 if self.credit_problem(on) else self.e

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"CA-{jalali_year(timezone.localdate())}")
        if self.test_to:
            age = Thresholds.of(self.method_version).evidence_age(self.control.is_key)
            self.valid_until = self.test_to + timedelta(days=age)
        else:
            self.valid_until = None
        super().save(*args, **kwargs)
