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
    path = models.ForeignKey(
        "assessments.Path",
        verbose_name="مسیر تحقق",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="treatment_actions",
        help_text="برای سازوکار B: مسیری از ارزیابی مبنا که اقدام امکان تحققش را کم می‌کند.",
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
    test_setting = models.CharField(
        "شرایط آزمون",
        max_length=300,
        blank=True,
        help_text="محیط و پنجره‌ی آزمون یا مانور، مثلاً «مانور در پنجره‌ی تغییر شبانه · محیط تولید با ترافیک کنترل‌شده».",
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
            models.CheckConstraint(condition=Q(path=None) | Q(mechanism="b"), name="action_path_only_for_b"),
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


class ActionCriterion(models.Model):
    """یک معیار قبولی سنجش‌پذیر اقدام (فیگما ۲۴): هدف، نتیجه‌ی اندازه‌گیری و وضعیت. معیار «خارج از دامنه» نتیجه‌ی
    اقدام را مخدوش نمی‌کند و برایش اقدام پیگیری جدا ساخته می‌شود. معیاری که «سنجه‌ی اثر» است (مثل زمان بازگردانی)
    مقدار پیش از اقدام را هم دارد تا اثر اقدام بر بُعد پیامد کنار ارزیابی مبنا دیده شود."""

    class Status(models.TextChoices):
        PENDING = "pending", "سنجیده نشده"
        PASSED = "passed", "قبول"
        FAILED = "failed", "رد"
        OUT_OF_SCOPE = "out_of_scope", "خارج از دامنه"

    action = models.ForeignKey(TreatmentAction, verbose_name="اقدام", on_delete=models.CASCADE, related_name="criteria")
    title = models.CharField("معیار قبولی", max_length=200)
    target = models.CharField("هدف", max_length=200, blank=True, help_text="مثلاً «حداکثر ۲۰ دقیقه».")
    result = models.CharField("نتیجه‌ی اندازه‌گیری", max_length=200, blank=True)
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING)
    note = models.TextField("توضیح", blank=True, help_text="برای «خارج از دامنه»: چرا، و پیگیری‌اش چیست.")
    measures_effect = models.BooleanField(
        "سنجه‌ی اثر", default=False, help_text="سنجه‌ای که اثر اقدام بر بُعد پیامد را نشان می‌دهد."
    )
    baseline = models.CharField("مقدار پیش از اقدام", max_length=100, blank=True, help_text="مثلاً «۷۵ دقیقه».")

    class Meta:
        verbose_name = "معیار قبولی اقدام"
        verbose_name_plural = "معیارهای قبولی اقدام"
        ordering = ["action", "pk"]

    def __str__(self):
        return self.title

    @property
    def in_scope(self):
        return self.status != self.Status.OUT_OF_SCOPE


class ActionTestRun(TimeStampedModel):
    """یک اجرای آزمون یا مانور اقدام. اجرای ناموفق پاک نمی‌شود تا تاریخچه‌ی آزمون و اقدام اصلاحی دیده شود."""

    action = models.ForeignKey(
        TreatmentAction, verbose_name="اقدام", on_delete=models.CASCADE, related_name="test_runs"
    )
    performed_on = models.DateField("تاریخ اجرا")
    passed = models.BooleanField("موفق")
    outcome = models.CharField("نتیجه", max_length=100, blank=True, help_text="مثلاً «۱۷ دقیقه».")
    description = models.TextField("شرح", help_text="چه اجرا شد، چه دیده شد و ناظر.")
    evidence = models.ForeignKey(
        "risks.Evidence", verbose_name="گزارش اجرا", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        verbose_name = "اجرای آزمون اقدام"
        verbose_name_plural = "اجراهای آزمون اقدام"
        ordering = ["action", "performed_on", "pk"]

    def __str__(self):
        return f"{self.action.code} · {self.performed_on}"


class RiskAcceptance(TimeStampedModel):
    """پذیرش زمان‌دار ریسک باقیمانده (بخش ۱۹ و برگه‌ی پذیرش بخش ۲۵ سند v5). پذیرش به یک ارزیابی جاری تأییدشده
    بسته است و تاریخ پایان دارد که از سقف اعتبار سطح تصمیم بیشتر نیست. وقتی معتبر می‌شود که مالک ریسک و هر صاحب
    اختیاری که سطح و نشان‌های ارزیابی می‌خواهند امضا کرده باشند؛ متن تصمیم فقط بعد از همین امضاها نوشته می‌شود.
    تمدید خودکار ندارد: پذیرش تازه رکورد تازه است. پذیرش حذف نمی‌شود."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PENDING = "pending", "منتظر امضا"
        ACTIVE = "active", "معتبر"
        EXPIRED = "expired", "منقضی"
        REJECTED = "rejected", "ردشده"
        REVOKED = "revoked", "لغوشده"

    code = models.CharField("کد", max_length=20, unique=True, editable=False)
    risk = models.ForeignKey("risks.Risk", verbose_name="ریسک", on_delete=models.PROTECT, related_name="acceptances")
    assessment = models.ForeignKey(
        "assessments.Assessment",
        verbose_name="ارزیابی",
        on_delete=models.PROTECT,
        related_name="acceptances",
        editable=False,
        help_text="نسخه‌ی ارزیابی‌ای که ریسک باقیمانده‌اش پذیرفته می‌شود.",
    )
    plan = models.ForeignKey(
        TreatmentPlan,
        verbose_name="طرح مواجهه",
        on_delete=models.PROTECT,
        null=True,
        related_name="acceptances",
        editable=False,
    )
    renews = models.ForeignKey(
        "self",
        verbose_name="به جای پذیرش",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="renewals",
        help_text="اگر این پذیرش بعد از پذیرش قبلی همین ریسک می‌آید. تمدید خودکار نیست و همه‌ی امضاها دوباره لازم است.",
    )
    scope = models.TextField("دامنه", help_text="خدمت، بانک‌ها، سامانه‌ها یا مسیرهایی که پذیرش شاملشان می‌شود.")
    reason = models.TextField("ضرورت و دلیل اقتصادی یا عملیاتی")
    alternatives = models.TextField(
        "گزینه‌های بررسی‌شده", help_text="گزینه‌های جایگزین و نتیجه‌ی بررسی هزینه و پیامد هر کدام."
    )
    compensating_controls = models.TextField(
        "کنترل جبرانی", help_text="کنترل‌هایی که تا پایان پذیرش جای شکاف را می‌گیرند؛ اگر نیست، بنویسید چرا."
    )
    controls = models.ManyToManyField(
        "controls.Control", verbose_name="کنترل‌های جبرانی", related_name="acceptances", blank=True
    )
    conditions = models.TextField("شروط ادامه")
    customer_constraints = models.TextField(
        "محدودیت مشتری", help_text="قواعد خاص مشتری، قرارداد و مقررات که بررسی شد، و نتیجه‌ی بررسی."
    )
    monitoring = models.TextField("شاخص پایش")
    revocation_triggers = models.TextField("شرط لغو یا تصعید")
    start_date = models.DateField("آغاز اعتبار")
    end_date = models.DateField("پایان اعتبار")
    evidence_due = models.DateField(
        "مهلت جمع‌آوری شاهد",
        null=True,
        blank=True,
        help_text="برای پذیرش غیرعادی: ارزیابی ناقص یا با اطمینان کم (بخش ۱۹).",
    )
    follow_up_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="مسئول پیگیری",
        on_delete=models.PROTECT,
        related_name="followed_acceptances",
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.DRAFT, editable=False)
    submitted_at = models.DateTimeField("زمان ارسال برای امضا", null=True, editable=False)
    decided_at = models.DateTimeField("زمان تصمیم", null=True, editable=False)
    decision_text = models.TextField("متن تصمیم", blank=True, editable=False)
    closed_reason = models.TextField("دلیل رد یا لغو", blank=True, editable=False)
    closed_at = models.DateTimeField("زمان رد یا لغو", null=True, editable=False)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ردکننده یا لغوکننده",
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
    history = HistoricalRecords(m2m_fields=[controls])

    class Meta:
        verbose_name = "پذیرش ریسک"
        verbose_name_plural = "پذیرش‌های ریسک"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=Q(end_date__gt=F("start_date")), name="acceptance_ends_after_start"),
            models.CheckConstraint(
                condition=Q(evidence_due__isnull=True) | Q(evidence_due__lte=F("end_date")),
                name="acceptance_evidence_due_within_validity",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["draft", "pending"]) | ~Q(decision_text="") | Q(closed_at__isnull=False),
                name="decided_acceptance_has_text_or_close",
            ),
            models.CheckConstraint(
                condition=Q(status__in=["rejected", "revoked"], closed_at__isnull=False) & ~Q(closed_reason="")
                | ~Q(status__in=["rejected", "revoked"]),
                name="closed_acceptance_has_reason",
            ),
        ]

    def __str__(self):
        return f"{self.code} پذیرش {self.risk.code}"

    def get_absolute_url(self):
        return reverse("actions:acceptance_detail", args=[self.pk])

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = next_code(f"AC-{jalali_year(timezone.localdate())}")
        super().save(*args, **kwargs)

    @property
    def level(self):
        return self.assessment.decision_level

    @property
    def is_expired(self):
        return self.status == self.Status.EXPIRED or (
            self.status == self.Status.ACTIVE and self.end_date < timezone.localdate()
        )

    @property
    def is_in_force(self):
        today = timezone.localdate()
        return self.status == self.Status.ACTIVE and self.start_date <= today <= self.end_date

    @property
    def state_label(self):
        return "منقضی" if self.is_expired else self.get_status_display()

    @property
    def days_left(self):
        return (self.end_date - timezone.localdate()).days


class AcceptanceSignature(TimeStampedModel):
    """امضای یک صاحب اختیار روی پذیرش: تأیید یا رد، با توضیح. امضای مدیریت ارشد را عضو GRC با شماره و تاریخ نامه و
    فایل نامه ثبت می‌کند (جواب س۵) و تصمیم کمیته امنیت را کاربر نقش کمیته با شماره یا تاریخ صورت‌جلسه (جواب س۶۴).
    امضا ویرایش و حذف نمی‌شود."""

    class Authority(models.TextChoices):
        OWNER = "owner", "مالک ریسک"
        UNIT_MANAGER = "unit_manager", "مدیر واحد"
        COMMITTEE = "committee", "کمیته امنیت"
        SENIOR_MANAGEMENT = "senior_management", "مدیریت ارشد"

    class Decision(models.TextChoices):
        APPROVE = "approve", "تأیید"
        REJECT = "reject", "رد"

    acceptance = models.ForeignKey(
        RiskAcceptance, verbose_name="پذیرش", on_delete=models.PROTECT, related_name="signatures"
    )
    authority = models.CharField("صاحب اختیار", max_length=30, choices=Authority.choices)
    decision = models.CharField("تصمیم", max_length=10, choices=Decision.choices)
    note = models.TextField("توضیح", blank=True)
    reference = models.CharField("شماره‌ی صورت‌جلسه یا نامه", max_length=100, blank=True)
    reference_date = models.DateField("تاریخ صورت‌جلسه یا نامه", null=True, blank=True)
    letter = models.ForeignKey(
        "core.Attachment", verbose_name="فایل نامه", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        verbose_name = "امضای پذیرش"
        verbose_name_plural = "امضاهای پذیرش"
        ordering = ["created_at", "pk"]
        constraints = [
            models.UniqueConstraint(fields=["acceptance", "authority"], name="one_signature_per_authority"),
            models.CheckConstraint(condition=~Q(decision="reject") | ~Q(note=""), name="rejected_signature_has_note"),
            models.CheckConstraint(
                condition=~Q(authority="committee") | ~Q(reference="") | Q(reference_date__isnull=False),
                name="committee_signature_has_minutes",
            ),
            models.CheckConstraint(
                condition=~Q(authority="senior_management")
                | (~Q(reference="") & Q(reference_date__isnull=False) & Q(letter__isnull=False)),
                name="senior_signature_has_letter",
            ),
        ]

    def __str__(self):
        return f"{self.acceptance.code}: {self.get_authority_display()} {self.get_decision_display()}"

    @property
    def is_approval(self):
        return self.decision == self.Decision.APPROVE


class Reassessment(TimeStampedModel):
    """بازسنجی یک طرح مواجهه (رکورد الزامی بخش ۲۰): تاریخ و مسئول، ارزیابی جاری تازه بعد از اقدام‌ها، مقایسه با
    ارزیابی هدف و تصمیم پذیرش یا ادامه‌ی اصلاح. طرح بعد از بازسنجی بسته است و تصمیم، گزینه‌ی طرح دور تازه را تعیین
    می‌کند. بازسنجی ویرایش و حذف نمی‌شود."""

    class Decision(models.TextChoices):
        # پایش فعال (فیگما ۲۵): هدف طرح محقق شده و ریسک در سطح هدف با بازبینی دوره‌ای سطحش پایش می‌شود؛ مثل
        # پذیرش، طرح دور تازه گزینه‌ی پذیرش دارد.
        MONITOR = "monitor", "پایش فعال"
        ACCEPT = "accept", "پذیرش ریسک باقیمانده"
        CONTINUE = "continue", "ادامه‌ی اصلاح"

    plan = models.OneToOneField(
        TreatmentPlan, verbose_name="طرح مواجهه", on_delete=models.PROTECT, related_name="reassessment", editable=False
    )
    assessment = models.ForeignKey(
        "assessments.Assessment",
        verbose_name="ارزیابی جاری تازه",
        on_delete=models.PROTECT,
        related_name="reassessments",
        editable=False,
    )
    performed_on = models.DateField("تاریخ بازسنجی")
    responsible = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="مسئول بازسنجی", on_delete=models.PROTECT, related_name="+"
    )
    target_met = models.BooleanField(
        "هدف محقق شد", null=True, editable=False, help_text="خالی یعنی طرح ارزیابی هدف نداشت."
    )
    method_changed = models.BooleanField("روش ارزیابی عوض شده", default=False, editable=False)
    decision = models.CharField("تصمیم", max_length=20, choices=Decision.choices)
    note = models.TextField("دلیل تصمیم", help_text="مقایسه با هدف، اقدام‌های باز و آنچه در دور تازه لازم است.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, verbose_name="ثبت‌کننده", on_delete=models.PROTECT, related_name="+", editable=False
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "بازسنجی"
        verbose_name_plural = "بازسنجی‌ها"
        ordering = ["-created_at", "-pk"]
        constraints = [models.CheckConstraint(condition=~Q(note=""), name="reassessment_has_note")]

    def __str__(self):
        return f"بازسنجی {self.plan}"


class RiskReview(TimeStampedModel):
    """کار بازبینی بخش ۲۱؛ ثبت نتیجه ارزیابی تاریخی را بازنویسی نمی‌کند."""

    class Trigger(models.TextChoices):
        PERIODIC = "periodic", "بازبینی دوره‌ای"
        ANNUAL = "annual", "ارزیابی کامل سالانه"
        INCIDENT = "incident", "رخداد مهم یا بهره‌برداری فعال"
        CONTROL = "control", "شکست یا حذف کنترل کلیدی"
        EVIDENCE = "evidence", "انقضای شاهد کنترل"
        ACCEPTANCE = "acceptance", "انقضای پذیرش"
        CHANGE = "change", "تغییر مهم معماری یا خدمت"
        DEPENDENCY = "dependency", "تغییر تأمین‌کننده یا وابستگی"
        CUSTOMER = "customer", "تغییر مشتری، SLA یا طبقه داده"
        REQUIREMENT = "requirement", "الزام جدید یا تهدید تازه"

    risk = models.ForeignKey("risks.Risk", on_delete=models.PROTECT, related_name="monitoring_reviews")
    assessment = models.ForeignKey(
        "assessments.Assessment", on_delete=models.PROTECT, null=True, blank=True, related_name="monitoring_reviews"
    )
    trigger = models.CharField("محرک", max_length=20, choices=Trigger.choices)
    reason = models.TextField("منبع، دامنه و دلیل بازبینی")
    due = models.DateField("مهلت آغاز بررسی")
    responsible = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="risk_reviews")
    event_key = models.CharField(max_length=160, unique=True, null=True, editable=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+")
    result = models.TextField("نتیجه بررسی و اقدام بعدی", blank=True)
    completed_at = models.DateTimeField("زمان ثبت نتیجه", null=True, editable=False)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, editable=False, related_name="+"
    )
    history = HistoricalRecords()

    class Meta:
        verbose_name = "بازبینی ریسک"
        verbose_name_plural = "بازبینی‌های ریسک"
        ordering = ["due", "pk"]

    def get_absolute_url(self):
        return reverse("actions:review_detail", args=[self.pk])


class MonitoringNotice(TimeStampedModel):
    """اعلان داخلی پایدار؛ کلید یکتا مانع تکرار در اجرای زمان‌بند است. موضوع اعلان یک ریسک است یا (برای شناسایی از
    پاسخنامه، پیش از آن‌که ریسکی باشد) یک پاسخنامه."""

    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="risk_notices")
    risk = models.ForeignKey(
        "risks.Risk", on_delete=models.PROTECT, related_name="monitoring_notices", null=True, blank=True
    )
    response = models.ForeignKey(
        "questionnaires.Response",
        on_delete=models.PROTECT,
        related_name="notices",
        null=True,
        blank=True,
        verbose_name="پاسخنامه",
    )
    event_key = models.CharField(max_length=180)
    message = models.TextField("پیام")
    href = models.CharField("پیوند", max_length=250)
    read_at = models.DateTimeField("زمان مشاهده", null=True, editable=False)
    history = HistoricalRecords()

    class Meta:
        verbose_name = "اعلان پایش"
        verbose_name_plural = "اعلان‌های پایش"
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.UniqueConstraint(fields=["recipient", "event_key"], name="monitor_notice_once"),
            models.CheckConstraint(
                condition=Q(risk__isnull=False) | Q(response__isnull=False), name="monitor_notice_has_subject"
            ),
        ]


class NoticePreference(models.Model):
    """کانال‌های دریافت اعلان پایش هر کاربر (فیگما ۲۰). اعلان درون سامانه همیشه ثبت می‌شود؛ ایمیل و پیامک و یادآوری
    به جانشین ترجیح کاربر است و با پیکربندی درگاه ارسال به کار می‌رود."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notice_preference", verbose_name="کاربر"
    )
    email = models.BooleanField("ایمیل سازمانی (خلاصه‌ی روزانه)", default=True)
    sms = models.BooleanField("پیامک (فقط محرک فوری و بحرانی)", default=True)
    delegate = models.BooleanField("یادآوری به جانشین هنگام تفویض", default=False)

    class Meta:
        verbose_name = "ترجیح اعلان"
        verbose_name_plural = "ترجیح‌های اعلان"

    def __str__(self):
        return f"ترجیح اعلان {self.user}"
