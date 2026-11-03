from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models
from django.db.models import F, Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.jalali import jalali_year
from apps.core.models import TimeStampedModel
from apps.core.services import next_code


class TreatmentPlan(TimeStampedModel):
    """طرح مواجهه (بخش ۱۹ و ۲۰ سند v5): تصمیم مواجهه با یک ریسک بر اساس یک ارزیابی جاری تأییدشده، با یکی از چهار
    گزینه و اقدام‌هایش. هر ارزیابی جاری یک طرح دارد و دور تازه‌ی ارزیابی طرح تازه می‌خواهد. مالک ریسک طرح را در
    سامانه تأیید می‌کند (جواب س۳۶)؛ بعد از تأیید، خود طرح ویرایش نمی‌شود و فقط اقدام تازه می‌گیرد که آن هم تأیید
    مالک می‌خواهد. طرح حذف نمی‌شود."""

    class Option(models.TextChoices):
        REDUCE = "reduce", "کاهش"
        AVOID = "avoid", "اجتناب"
        TRANSFER = "transfer", "انتقال یا اشتراک"
        ACCEPT = "accept", "پذیرش"

    risk = models.ForeignKey(
        "risks.Risk", verbose_name="ریسک", on_delete=models.PROTECT, related_name="treatment_plans"
    )
    assessment = models.OneToOneField(
        "assessments.Assessment",
        verbose_name="ارزیابی مبنا",
        on_delete=models.PROTECT,
        related_name="treatment_plan",
        editable=False,
        help_text="ارزیابی جاری تأییدشده‌ای که طرح بر اساس سطح تصمیم آن است.",
    )
    option = models.CharField("گزینه", max_length=20, choices=Option.choices)
    rationale = models.TextField(
        "دلیل و گزینه‌های بررسی‌شده", help_text="چرا این گزینه، و گزینه‌های دیگر چرا کنار گذاشته شدند."
    )
    option_details = models.TextField(
        "شرط‌های گزینه",
        blank=True,
        help_text="برای انتقال: مسئولیت باقیمانده، استثناهای پوشش و قابلیت وصول. برای اجتناب: پیامد توقف خدمت و "
        "ریسک جایگزین (بخش ۲۰).",
    )
    target_assessment = models.ForeignKey(
        "assessments.Assessment",
        verbose_name="ارزیابی هدف",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="A، B، پنج بُعد پیامد و سطح هدف با فرض‌های صریح (بخش ۲۰).",
    )
    decision_due = models.DateField("مهلت طرح", editable=False)
    owner_approved_at = models.DateTimeField("زمان تأیید مالک", null=True, editable=False)
    owner_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تأییدکننده",
        on_delete=models.PROTECT,
        null=True,
        editable=False,
        related_name="+",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+", editable=False
    )

    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")
    history = HistoricalRecords()

    class Meta:
        verbose_name = "طرح مواجهه"
        verbose_name_plural = "طرح‌های مواجهه"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=~Q(rationale=""), name="plan_has_rationale"),
            models.CheckConstraint(
                condition=Q(owner_approved_at__isnull=True, owner_approved_by__isnull=True)
                | Q(owner_approved_at__isnull=False, owner_approved_by__isnull=False),
                name="plan_owner_approval_complete",
            ),
        ]

    def __str__(self):
        return f"طرح مواجهه‌ی {self.risk.code} ({self.get_option_display()})"

    def get_absolute_url(self):
        return reverse("actions:plan_detail", args=[self.pk])

    @property
    def level(self):
        return self.assessment.decision_level

    @property
    def is_owner_approved(self):
        return self.owner_approved_at is not None

    @property
    def needs_actions(self):
        return self.option != self.Option.ACCEPT

    @property
    def is_overdue(self):
        return not self.is_owner_approved and self.decision_due < timezone.localdate()


class TreatmentAction(TimeStampedModel):
    """اقدام طرح مواجهه (رکورد الزامی بخش ۲۰): خروجی قابل آزمون، سازوکار اثر بر A یا B یا یک بُعد پیامد، یک مالک
    پاسخ‌گو، مجری و تأییدکننده‌ی نتیجه، زمان و منابع، وابستگی‌ها و معیار قبولی. وضعیت فقط از راه گزارش پیشرفت عوض
    می‌شود و «عقب‌افتاده» از سررسید حساب می‌شود، نه ذخیره. اقدام حذف نمی‌شود."""

    class Mechanism(models.TextChoices):
        A = "a", "A: عامل آغازگر"
        B = "b", "B: امکان تحقق"
        IMPACT = "impact", "یک بُعد پیامد"

    class Status(models.TextChoices):
        PLANNED = "planned", "برنامه‌ریزی"
        APPROVED = "approved", "مصوب"
        IN_PROGRESS = "in_progress", "در اجرا"
        BLOCKED = "blocked", "مسدود"
        READY = "ready", "آماده‌ی آزمون"
        VERIFIED = "verified", "تأییدشده"
        FAILED = "failed", "ناموفق"

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    plan = models.ForeignKey(TreatmentPlan, verbose_name="طرح", on_delete=models.PROTECT, related_name="actions")
    title = models.CharField("عنوان", max_length=300)
    deliverable = models.TextField(
        "خروجی قابل آزمون",
        help_text="مثلاً «پوشش همه‌ی حساب‌های ممتاز تولید با احراز هویت مصوب و ثبت استثناهای اضطراری». «تقویت "
        "امنیت» بدون دامنه و معیار قبولی اقدام کامل نیست (بخش ۲۰).",
    )
    mechanism = models.CharField("سازوکار اثر", max_length=10, choices=Mechanism.choices)
    dimension = models.ForeignKey(
        "methodology.Scale",
        verbose_name="بُعد پیامد",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
        help_text="فقط وقتی اقدام یک بُعد پیامد را تغییر می‌دهد.",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="مالک اقدام", on_delete=models.PROTECT, related_name="owned_actions"
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="مجری", on_delete=models.PROTECT, related_name="assigned_actions"
    )
    verifier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تأییدکننده‌ی نتیجه",
        on_delete=models.PROTECT,
        related_name="verified_actions",
    )
    start_date = models.DateField("آغاز")
    due_date = models.DateField("سررسید")
    cost = models.DecimalField("هزینه (ریال)", max_digits=20, decimal_places=0, null=True, blank=True)
    person_hours = models.PositiveIntegerField("نفرساعت", null=True, blank=True)
    depends_on = models.ManyToManyField(
        "self", verbose_name="وابسته به", symmetrical=False, blank=True, related_name="dependents"
    )
    controls = models.ManyToManyField(
        "controls.Control",
        verbose_name="کنترل‌های مرتبط",
        blank=True,
        related_name="treatment_actions",
        help_text="کنترلی که این اقدام می‌سازد یا بهتر می‌کند، تا طرح به بیانیه‌ی کاربردپذیری وصل شود (بخش ۲۰).",
    )
    description = models.TextField("شرح", blank=True, help_text="وابستگی بیرونی، پنجره‌ی تغییر و توضیح دیگر.")
    acceptance_criteria = models.TextField(
        "معیار قبولی", help_text="گزارش اجرا، آزمون پوشش، نتیجه‌ی مانور یا تست مسیر، و آستانه‌ی قبول."
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PLANNED, editable=False)
    evidence = models.ManyToManyField(
        "risks.Evidence", verbose_name="شاهد اجرا", blank=True, related_name="treatment_actions"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+", editable=False
    )

    attachments = GenericRelation("core.Attachment")
    comments = GenericRelation("core.Comment")
    history = HistoricalRecords(m2m_fields=[evidence, controls])

    class Meta:
        verbose_name = "اقدام"
        verbose_name_plural = "اقدام‌ها"
        ordering = ["due_date", "pk"]
        constraints = [
            models.CheckConstraint(condition=Q(due_date__gte=F("start_date")), name="action_due_after_start"),
            models.CheckConstraint(
                condition=Q(mechanism="impact", dimension__isnull=False) | (~Q(mechanism="impact") & Q(dimension=None)),
                name="action_dimension_only_for_impact",
            ),
            models.CheckConstraint(condition=~Q(verifier=F("assignee")), name="action_verifier_not_assignee"),
            models.CheckConstraint(condition=~Q(verifier=F("owner")), name="action_verifier_not_owner"),
            models.CheckConstraint(condition=~Q(deliverable="") & ~Q(acceptance_criteria=""), name="action_testable"),
        ]

    def __str__(self):
        return f"{self.code} {self.title}"

    def get_absolute_url(self):
        return reverse("actions:action_detail", args=[self.pk])

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"TR-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)

    @property
    def is_open(self):
        return self.status != self.Status.VERIFIED

    @property
    def is_overdue(self):
        return self.is_open and self.due_date < timezone.localdate()

    @property
    def people_ids(self):
        return {self.owner_id, self.assignee_id, self.verifier_id}


class ActionUpdate(TimeStampedModel):
    """گزارش پیشرفت یک اقدام: هر تغییر وضعیت یا یادداشت پیشرفت با انجام‌دهنده و زمان. ویرایش و حذف نمی‌شود."""

    action = models.ForeignKey(TreatmentAction, verbose_name="اقدام", on_delete=models.PROTECT, related_name="updates")
    from_status = models.CharField("از وضعیت", max_length=20, choices=TreatmentAction.Status.choices, blank=True)
    to_status = models.CharField("به وضعیت", max_length=20, choices=TreatmentAction.Status.choices)
    note = models.TextField("توضیح", blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        verbose_name = "گزارش پیشرفت اقدام"
        verbose_name_plural = "گزارش‌های پیشرفت اقدام"
        ordering = ["-created_at", "-pk"]

    def __str__(self):
        return f"{self.action.code}: {self.get_to_status_display()}"

    @property
    def changes_status(self):
        return self.from_status != self.to_status
