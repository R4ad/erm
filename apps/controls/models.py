from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.urls import reverse
from simple_history.models import HistoricalRecords

from apps.catalog.models import Responsibility
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


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
