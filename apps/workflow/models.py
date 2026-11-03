from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel
from apps.risks.models import Risk


class StatusTransition(TimeStampedModel):
    """هر تغییر وضعیت یک ریسک یک ردیف اینجاست. اینکه هر انتقال با کیست و چه شرطی دارد در lifecycle.py است؛ این
    جدول فقط سابقه را نگه می‌دارد تا خط زمانی ریسک و گزارش‌هایی مثل «چند روز در ارزیابی ماند» ساده باشند.
    ردیف‌ها ویرایش و حذف نمی‌شوند."""

    risk = models.ForeignKey(Risk, verbose_name="ریسک", on_delete=models.PROTECT, related_name="transitions")
    from_status = models.CharField("از وضعیت", max_length=20, choices=Risk.Status.choices)
    to_status = models.CharField("به وضعیت", max_length=20, choices=Risk.Status.choices)
    reason = models.TextField("دلیل یا توضیح", blank=True)
    meeting_date = models.DateField("تاریخ جلسه‌ی کارگروه", null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        verbose_name = "انتقال وضعیت"
        verbose_name_plural = "انتقال‌های وضعیت"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=~Q(from_status=F("to_status")), name="transition_changes_status"),
        ]

    def __str__(self):
        return f"{self.risk.code}: {self.get_from_status_display()} ← {self.get_to_status_display()}"


class RiskQuestion(TimeStampedModel):
    """پرسشی که عضو GRC وقتی اطلاعات ارزیابی ناقص است برای یک ریسک طرح می‌کند (انتقال ۴ جدول س۱۵). مدیران واحد
    ریسک در «پاسخ به سؤال‌ها» جواب می‌دهند یا عضو GRC جواب جلسه را به نامشان ثبت می‌کند. حذف نمی‌شود."""

    risk = models.ForeignKey(Risk, verbose_name="ریسک", on_delete=models.PROTECT, related_name="questions")
    text = models.TextField("پرسش")
    asked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="طرح‌کننده", on_delete=models.PROTECT, related_name="+"
    )
    due = models.DateField("مهلت جواب", help_text="پنج روز کاری بعد از طرح پرسش.")
    answer = models.TextField("جواب", blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="جواب‌دهنده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    answered_at = models.DateTimeField("زمان جواب", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پرسش ریسک"
        verbose_name_plural = "پرسش‌های ریسک"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(answered_at__isnull=True) | ~Q(answer=""), name="risk_question_answer_has_text"
            ),
        ]

    def __str__(self):
        return f"{self.risk.code}: {self.text[:60]}"

    @property
    def is_open(self):
        return self.answered_at is None

    @property
    def is_overdue(self):
        """پرسش بی‌جوابی که مهلتش گذشته است. اعلان و تصعید در قدم ۲۲ و ۲۳ می‌آید."""
        return self.is_open and self.due < timezone.localdate()


class ChangeRequest(TimeStampedModel):
    """پیشنهاد ادغام یا تفکیک یک ریسک (بخش ۶ سند v5 و جواب س۵۳). عضو GRC با دلیل پیشنهاد می‌دهد و چون متولی روش
    همان عضو GRC است (س۴)، پیشنهادش تأیید متولی را هم دارد؛ مالک ریسک در سامانه تأیید یا رد می‌کند و با تأیید،
    ادغام یا تفکیک انجام می‌شود. شناسه‌ی مبدأ و سابقه‌اش می‌ماند. حذف نمی‌شود."""

    class Kind(models.TextChoices):
        MERGE = "merge", "ادغام"
        SPLIT = "split", "تفکیک"

    class Status(models.TextChoices):
        PENDING = "pending", "منتظر تأیید مالک"
        APPROVED = "approved", "تأیید و انجام شد"
        REJECTED = "rejected", "رد شد"

    kind = models.CharField("نوع", max_length=10, choices=Kind.choices)
    risk = models.ForeignKey(Risk, verbose_name="ریسک", on_delete=models.PROTECT, related_name="change_requests")
    merge_into = models.ForeignKey(
        Risk,
        verbose_name="ادغام در",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="ریسکی که این ریسک در آن ادغام می‌شود و می‌ماند.",
    )
    parts = models.TextField(
        "بخش‌های تازه",
        blank=True,
        help_text="هر خط عنوان یک ریسک تازه. ریسک مبدأ با همان کد می‌ماند و بخش‌های تازه کد تازه می‌گیرند.",
    )
    reason = models.TextField("دلیل")
    status = models.CharField("وضعیت", max_length=10, choices=Status.choices, default=Status.PENDING)
    proposed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="پیشنهاددهنده", on_delete=models.PROTECT, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تصمیم‌گیرنده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    decided_at = models.DateTimeField("زمان تصمیم", null=True, blank=True)
    decision_note = models.TextField("توضیح تصمیم", blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "درخواست ادغام یا تفکیک"
        verbose_name_plural = "درخواست‌های ادغام و تفکیک"
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(kind="merge", merge_into__isnull=False, parts="") | Q(kind="split", merge_into__isnull=True)
                )
                & ~Q(kind="split", parts=""),
                name="change_request_matches_kind",
            ),
            models.CheckConstraint(condition=~Q(merge_into=F("risk")), name="change_request_not_into_itself"),
            # برای هر ریسک در هر لحظه فقط یک درخواست باز هست.
            models.UniqueConstraint(
                fields=["risk"], condition=Q(status="pending"), name="one_pending_change_request_per_risk"
            ),
            models.CheckConstraint(
                condition=Q(status="pending", decided_at__isnull=True)
                | (~Q(status="pending") & Q(decided_at__isnull=False)),
                name="change_request_decided_at_matches_status",
            ),
        ]

    def __str__(self):
        return f"{self.get_kind_display()} {self.risk.code}"

    def get_absolute_url(self):
        return reverse("workflow:change_request_detail", args=[self.pk])

    @property
    def is_pending(self):
        return self.status == self.Status.PENDING

    def part_titles(self):
        return [line.strip() for line in self.parts.splitlines() if line.strip()]
