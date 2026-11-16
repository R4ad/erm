"""جلسه‌ی کمیته‌ی امنیت (فیگما ۲۳): صاحب اختیار تصمیم ریسک بالا و بحرانی (بخش ۱۹ روش). جلسه حاضران و حد نصاب،
دستور جلسه با پرونده‌ی تصمیم هر مورد، گزینه‌های بررسی‌شده، رأی و مصوبه و امضای مصوبه دارد. مالک ریسک در رأی‌گیری
پرونده‌ی خود شرکت نمی‌کند و تأیید او برای طرح و ریسک باقیمانده جداگانه گرفته می‌شود. جلسه و مصوبه حذف نمی‌شوند."""

from django.conf import settings
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.jalali import jalali_year
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


class Meeting(TimeStampedModel):
    class Kind(models.TextChoices):
        REGULAR = "regular", "عادی"
        EXTRAORDINARY = "extraordinary", "فوق‌العاده"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "برنامه‌ریزی‌شده"
        OPEN = "open", "در حال برگزاری"
        CLOSED = "closed", "بسته‌شده"

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    title = models.CharField("عنوان", max_length=200, default="جلسه‌ی کمیته‌ی امنیت")
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices, default=Kind.REGULAR)
    reason = models.CharField(
        "دلیل تشکیل", max_length=300, blank=True, help_text="برای جلسه‌ی فوق‌العاده، مثلاً «ریسک بحرانی RK-…»."
    )
    date = models.DateField("تاریخ")
    starts_at = models.TimeField("ساعت آغاز")
    ends_at = models.TimeField("ساعت پایان")
    location = models.CharField("محل", max_length=200, blank=True)
    secretary = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="دبیر", on_delete=models.PROTECT, related_name="+", null=True, blank=True
    )
    quorum = models.PositiveSmallIntegerField("حد نصاب", default=4, help_text="کمترین شمار اعضای رأی‌دهنده‌ی حاضر.")
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    minutes = models.TextField("یادداشت صورت‌جلسه", blank=True)
    closed_at = models.DateTimeField("زمان بستن", null=True, blank=True, editable=False)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="بسته‌شده توسط",
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
        editable=False,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "جلسه‌ی کمیته"
        verbose_name_plural = "جلسه‌های کمیته"
        ordering = ["-date", "-starts_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=Q(ends_at__gt=models.F("starts_at")), name="meeting_ends_after_start"),
            models.CheckConstraint(condition=Q(quorum__gte=1), name="meeting_quorum_positive"),
        ]

    def __str__(self):
        return f"{self.title} {self.code}"

    def get_absolute_url(self):
        return reverse("committee:meeting", args=[self.pk])

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"MT-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)


class Attendee(models.Model):
    """عضو یا مدعو جلسه. ناظر رأی ندارد؛ مالک ریسک فقط در پرونده‌ی خودش رأی ندارد (تعارض منافع)."""

    class Role(models.TextChoices):
        CHAIR = "chair", "رئیس کمیته"
        SECRETARY = "secretary", "دبیر"
        MEMBER = "member", "عضو"
        OBSERVER = "observer", "ناظر بدون رأی"

    meeting = models.ForeignKey(Meeting, verbose_name="جلسه", on_delete=models.CASCADE, related_name="attendees")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, verbose_name="کاربر", on_delete=models.PROTECT, related_name="+")
    role = models.CharField("نقش", max_length=20, choices=Role.choices, default=Role.MEMBER)
    position = models.CharField("سمت", max_length=150, blank=True, help_text="مثلاً «معاون فناوری».")
    present = models.BooleanField("حاضر", default=True)

    class Meta:
        verbose_name = "حاضر جلسه"
        verbose_name_plural = "حاضران جلسه"
        ordering = ["meeting", "pk"]
        constraints = [models.UniqueConstraint(fields=["meeting", "user"], name="attendee_unique_user")]

    def __str__(self):
        return f"{self.user} ({self.get_role_display()})"

    @property
    def votes(self):
        return self.role != self.Role.OBSERVER


class AgendaItem(TimeStampedModel):
    """یک مورد دستور جلسه: تصمیم درباره‌ی یک ریسک یا یک موضوع روش‌شناختی. ترتیب نمایش از سطح ریسک، شدت پیامد و
    گسترش بین مشتریان می‌آید، نه از ترتیب ثبت."""

    class Kind(models.TextChoices):
        EXPOSURE = "exposure", "تصمیم مواجهه"
        PLAN = "plan", "تأیید طرح"
        EXCEPTION = "exception", "استثنا"
        ACCEPTANCE = "acceptance", "پذیرش موقت"
        PROGRESS = "progress", "گزارش پیشرفت طرح"
        METHOD = "method", "تصویب روش‌شناختی"

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        REVIEW = "review", "در حال بررسی"
        APPROVED = "approved", "مصوب شد"
        DEFERRED = "deferred", "ارجاع به جلسه‌ی بعد"

    DECIDED = [Status.APPROVED, Status.DEFERRED]

    meeting = models.ForeignKey(Meeting, verbose_name="جلسه", on_delete=models.PROTECT, related_name="items")
    risk = models.ForeignKey(
        "risks.Risk",
        verbose_name="ریسک",
        on_delete=models.PROTECT,
        related_name="committee_items",
        null=True,
        blank=True,
    )
    title = models.CharField("موضوع", max_length=300, blank=True, help_text="برای مورد بدون ریسک، مثل تغییر روش.")
    reference = models.CharField("مرجع", max_length=100, blank=True, help_text="مثلاً شناسه‌ی مجموعه‌ی پارامتر.")
    kind = models.CharField("نوع تصمیم", max_length=20, choices=Kind.choices)
    detail = models.CharField("جزئیات تصمیم", max_length=150, blank=True, help_text="مثلاً «فوری» یا «۹۰ روزه».")
    presenter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ارائه‌دهنده",
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
        help_text="برای مورد بدون ریسک؛ مورد ریسک را مالک آن ارائه می‌کند.",
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING)
    chosen = models.ForeignKey(
        "AgendaOption",
        verbose_name="گزینه‌ی مصوب",
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
        editable=False,
    )
    votes_for = models.PositiveSmallIntegerField("موافق", default=0, editable=False)
    votes_against = models.PositiveSmallIntegerField("مخالف", default=0, editable=False)
    votes_abstain = models.PositiveSmallIntegerField("ممتنع", default=0, editable=False)
    resolution = models.TextField("متن مصوبه یا دلیل ارجاع", blank=True, editable=False)
    decided_at = models.DateTimeField("زمان تصمیم", null=True, blank=True, editable=False)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ثبت‌کننده‌ی تصمیم",
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
        editable=False,
    )
    follow_up_due = models.DateField("مهلت اجرای مصوبه", null=True, blank=True)
    follow_up_done_at = models.DateTimeField("زمان انجام مصوبه", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "مورد دستور جلسه"
        verbose_name_plural = "موردهای دستور جلسه"
        ordering = ["meeting", "pk"]
        constraints = [
            models.CheckConstraint(condition=Q(risk__isnull=False) | ~Q(title=""), name="agenda_item_has_subject")
        ]

    def __str__(self):
        return self.subject

    @property
    def subject(self):
        return self.risk.title if self.risk_id and not self.title else self.title

    @property
    def decision_label(self):
        label = self.get_kind_display()
        return f"{label} · {self.detail}" if self.detail else label

    @property
    def owner(self):
        return self.risk.owner if self.risk_id else self.presenter

    def get_absolute_url(self):
        return f"{self.meeting.get_absolute_url()}?item={self.pk}"


class AgendaOption(models.Model):
    """گزینه‌ای که برای یک مورد بررسی می‌شود؛ یکی می‌تواند پیشنهاد مالک باشد. یادداشت‌ها برچسب‌های کوتاه‌اند، مثل
    «یادآوری ۷ روزه» یا «اثر بر SLA پشتیبانی» با رنگ (neutral، warning، danger)."""

    item = models.ForeignKey(AgendaItem, verbose_name="مورد", on_delete=models.CASCADE, related_name="options")
    title = models.CharField("عنوان", max_length=200)
    description = models.TextField("شرح")
    owner_proposal = models.BooleanField("پیشنهاد مالک", default=False)
    cost = models.CharField("هزینه", max_length=100, blank=True)
    target_level = models.ForeignKey(
        "methodology.RiskLevel",
        verbose_name="سطح هدف",
        on_delete=models.PROTECT,
        related_name="+",
        null=True,
        blank=True,
    )
    target_score = models.PositiveSmallIntegerField("امتیاز هدف", null=True, blank=True)
    due = models.DateField("مهلت طرح", null=True, blank=True)
    expires = models.DateField("انقضا", null=True, blank=True)
    notes = models.JSONField("برچسب‌ها", default=list, blank=True)

    class Meta:
        verbose_name = "گزینه‌ی تصمیم"
        verbose_name_plural = "گزینه‌های تصمیم"
        ordering = ["item", "-owner_proposal", "pk"]

    def __str__(self):
        return self.title


class ResolutionSignature(models.Model):
    """امضای یک مصوبه: رئیس و دبیر کمیته، و مالک ریسک برای پذیرش طرح و ریسک باقیمانده."""

    item = models.ForeignKey(AgendaItem, verbose_name="مصوبه", on_delete=models.CASCADE, related_name="signatures")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="امضاکننده", on_delete=models.PROTECT, related_name="+"
    )
    role = models.CharField("سمت در مصوبه", max_length=150)
    signed_at = models.DateTimeField("زمان امضا", null=True, blank=True)

    class Meta:
        verbose_name = "امضای مصوبه"
        verbose_name_plural = "امضاهای مصوبه"
        ordering = ["item", "pk"]
        constraints = [models.UniqueConstraint(fields=["item", "user"], name="signature_unique_user")]

    def __str__(self):
        return f"{self.user} · {self.role}"
