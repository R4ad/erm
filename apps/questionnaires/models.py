from django.conf import settings
from django.db import models
from django.db.models import Q
from django.urls import reverse
from django.utils import timezone
from simple_history.models import HistoricalRecords

from apps.core.models import TimeStampedModel


class Questionnaire(TimeStampedModel):
    """پرسشنامه‌ی ورودی (بخش ۴ و ۲۴ سند v5). عضو GRC آن را یک بار تعریف می‌کند و می‌ماند؛ مدیران واحدها هر وقت
    خواستند در «پاسخ به سؤال‌ها» جوابش می‌دهند (س۳۴). پرسشنامه حذف نمی‌شود، فقط غیرفعال می‌شود."""

    title = models.CharField(
        "عنوان", max_length=200, unique=True, error_messages={"unique": "پرسشنامه‌ای با همین عنوان ثبت شده است."}
    )
    description = models.TextField("راهنمای پاسخ‌دهنده", blank=True)
    is_structured = models.BooleanField(default=False, editable=False)
    is_active = models.BooleanField(
        "فعال",
        default=False,
        help_text="فقط پرسشنامه‌ی فعال پاسخ تازه می‌گیرد. تا سؤال‌ها آماده نشده‌اند فعالش نکنید.",
    )

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پرسشنامه"
        verbose_name_plural = "پرسشنامه‌ها"
        ordering = ["title"]

    def __str__(self):
        return self.title

    def get_absolute_url(self):
        return reverse("questionnaires:questionnaire_detail", args=[self.pk])

    def active_questions(self):
        return self.questions.filter(is_active=True).prefetch_related("options")


class Question(TimeStampedModel):
    """یک سؤال مهندسی‌شده‌ی پرسشنامه. سؤالی که جواب گرفته حذف نمی‌شود؛ غیرفعال می‌شود تا جواب‌های قبلی بمانند."""

    class Kind(models.TextChoices):
        TEXT = "text", "متن"
        YES_NO = "yes_no", "بله و خیر"
        SINGLE = "single", "تک‌گزینه‌ای"
        MULTIPLE = "multiple", "چندگزینه‌ای"

    questionnaire = models.ForeignKey(
        Questionnaire, verbose_name="پرسشنامه", on_delete=models.CASCADE, related_name="questions"
    )
    order = models.PositiveSmallIntegerField("ترتیب", default=0, help_text="سؤال با عدد کوچک‌تر بالاتر می‌آید.")
    text = models.TextField("متن سؤال")
    help_text = models.CharField("راهنما", max_length=300, blank=True)
    kind = models.CharField("نوع", max_length=20, choices=Kind.choices)
    stage = models.CharField("بخش پرسشنامه", max_length=20, blank=True, choices=[
        ("service", "خدمت و محدوده"), ("purpose", "کارکرد خدمت"), ("objective", "انتظار خدمت"), ("event", "اتفاق"),
        ("path", "مسیر تحقق"), ("control", "تمهید"), ("recovery", "بازیابی"),
        ("consequence", "پیامد"), ("evidence", "شاهد"),
    ])
    is_required = models.BooleanField("اجباری", default=False, help_text="پاسخ بدون جواب این سؤال ارسال نمی‌شود.")
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "سؤال"
        verbose_name_plural = "سؤال‌ها"
        ordering = ["questionnaire", "order", "pk"]

    def __str__(self):
        return self.text

    @property
    def has_options(self):
        return self.kind != self.Kind.TEXT


class Option(TimeStampedModel):
    """گزینه‌ی سؤال بله و خیر یا گزینه‌ای. گزینه‌ی «نشانه‌ی ریسک» با انتخاب شدن، «ریسک در انتظار» می‌سازد (س۴۷)."""

    question = models.ForeignKey(Question, verbose_name="سؤال", on_delete=models.CASCADE, related_name="options")
    order = models.PositiveSmallIntegerField("ترتیب", default=0)
    text = models.CharField("متن گزینه", max_length=300)
    indicates_risk = models.BooleanField("نشانه‌ی ریسک", default=False)
    scenario = models.ForeignKey(
        "risks.RiskScenario",
        verbose_name="سناریوی مرجع",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    category = models.ForeignKey(
        "risks.RiskCategory",
        verbose_name="دسته",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    is_active = models.BooleanField("فعال", default=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "گزینه"
        verbose_name_plural = "گزینه‌ها"
        ordering = ["question", "order", "pk"]
        constraints = [
            # سناریو و دسته فقط برای گزینه‌ی نشانه‌ی ریسک معنی دارند.
            models.CheckConstraint(
                condition=Q(indicates_risk=True) | Q(scenario__isnull=True, category__isnull=True),
                name="option_scenario_and_category_only_for_risk",
                violation_error_message="سناریو و دسته فقط برای گزینه‌ی «نشانه‌ی ریسک» است.",
            ),
        ]

    def __str__(self):
        return self.text


class Response(TimeStampedModel):
    """پاسخ یک واحد به یک پرسشنامه، در صورت نیاز درباره‌ی یک خدمت همان واحد. بالای آن کارکردهای واحد و پرسش‌های
    جلسه‌ی بخش ۴ است، بعد جواب سؤال‌ها و در آخر «مورد جدید». بعد از ارسال فقط وقتی ویرایش می‌شود که عضو GRC آن را با
    سؤال مشخص برگرداند (س۴۹)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        SUBMITTED = "submitted", "ارسال‌شده"
        RETURNED = "returned", "برگشت‌خورده"
        REVIEWED = "reviewed", "بررسی‌شده"

    class Channel(models.TextChoices):
        # همان مقدارهای کانال ورود ریسک، تا ریسکی که از این پاسخ ساخته می‌شود کانالش را بگیرد.
        QUESTIONNAIRE = "questionnaire", "پرسشنامه"
        INTERVIEW = "interview", "مصاحبه"

    EDITABLE_STATUSES = [Status.DRAFT, Status.RETURNED]

    questionnaire = models.ForeignKey(
        Questionnaire, verbose_name="پرسشنامه", on_delete=models.PROTECT, related_name="responses"
    )
    org_unit = models.ForeignKey(
        "organization.OrgUnit", verbose_name="واحد", on_delete=models.PROTECT, related_name="questionnaire_responses"
    )
    service = models.ForeignKey(
        "catalog.Service",
        verbose_name="خدمت",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="questionnaire_responses",
        help_text="اگر پاسخ درباره‌ی یک خدمت مشخص است.",
    )
    respondent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="پاسخ‌دهنده",
        on_delete=models.PROTECT,
        related_name="questionnaire_responses",
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="ثبت‌کننده",
        on_delete=models.PROTECT,
        related_name="+",
        help_text="در مصاحبه، عضو GRC که جواب‌ها را به نام پاسخ‌دهنده ثبت کرده است.",
    )
    channel = models.CharField("کانال", max_length=20, choices=Channel.choices)
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.DRAFT)
    structured_data = models.JSONField(default=list, blank=True)

    # قلم‌های ثابت پرسشنامه: کارکردهای واحد و هشت پرسش جلسه‌ی شناسایی بخش ۴ سند v5 (جواب س۴۸). برچسب هر قلم همان
    # پرسش جلسه است و راهنمایش خروجی مورد انتظار آن. فهرست دارایی و نام تهدید شرط جواب دادن نیست.
    functions = models.TextField(
        "کارکردهای اصلی و تعهدهای واحد",
        blank=True,
        help_text="سه تا پنج کارکرد اصلی و تعهدهای قابل مشاهده‌ی واحد. پرسش‌های بعدی درباره‌ی همین‌هاست.",
    )
    mission = models.TextField(
        "چه نتیجه‌ای لازم است برای شرکت یا مشتری ایجاد شود؟", blank=True, help_text="مأموریت، خروجی و ذی‌نفع."
    )
    commitments = models.TextField(
        "چه تعهد زمانی یا کیفی داریم؟", blank=True, help_text="SLA، مهلت، صحت خروجی و حدود تحمل."
    )
    disruptive_event = models.TextField(
        "چه اتفاقی می‌تواند مانع انجام آن شود؟", blank=True, help_text="رویداد مخل، به زبان کسب‌وکار."
    )
    conditions = models.TextField(
        "در چه شرایطی این اتفاق ممکن می‌شود؟",
        blank=True,
        help_text="علت یا شرط قابل بررسی؛ لازم نیست نام تهدید را بدانید.",
    )
    consequence = models.TextField(
        "اگر رخ دهد چه کسی و چگونه آسیب می‌بیند؟", blank=True, help_text="پیامد داخلی، مشتری و اثر زنجیره‌ای."
    )
    dependencies = models.TextField(
        "به چه افراد یا خدماتی وابسته‌ایم؟", blank=True, help_text="وابستگی داخلی، مشتری، تأمین‌کننده و جایگزین."
    )
    evidence = models.TextField(
        "چه شاهد، تجربه یا تغییر تازه‌ای داریم؟", blank=True, help_text="رخداد، نزدیک‌به‌رخداد، تیکت، تغییر یا آزمون."
    )
    current_controls = models.TextField(
        "امروز چه چیزی جلوی وقوع یا خسارت را می‌گیرد؟", blank=True, help_text="کنترل فعلی و محل شواهد آن."
    )
    new_item = models.TextField(
        "مورد جدید",
        blank=True,
        help_text="هر ریسک دیگری که در پرسش‌ها نیامده، با شرح آزاد. الگو: «در خدمت یا فرآیند [نام]، به علت یا در "
        "شرایط [عامل و وضعیت]، ممکن است [رویداد مشخص] رخ دهد و انجام [هدف یا تعهد] برای [داتین یا مشتری] را "
        "مختل کند؛ پیامد قابل مشاهده‌ی آن [نوع و دامنه‌ی پیامد] است.»",
    )

    FIXED_ITEMS = [
        "functions",
        "mission",
        "commitments",
        "disruptive_event",
        "conditions",
        "consequence",
        "dependencies",
        "evidence",
        "current_controls",
    ]

    submitted_at = models.DateTimeField("زمان ارسال", null=True, blank=True)
    return_question = models.TextField("سؤال برگشت", blank=True)
    returned_at = models.DateTimeField("زمان برگشت", null=True, blank=True)
    return_due = models.DateField("مهلت برگشت", null=True, blank=True, help_text="پنج روز کاری بعد از برگشت.")
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="بررسی‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    reviewed_at = models.DateTimeField("زمان بررسی", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "پاسخ پرسشنامه"
        verbose_name_plural = "پاسخ‌های پرسشنامه"
        ordering = ["-created_at"]

    def __str__(self):
        target = self.service.code if self.service_id else self.org_unit.name
        return f"{self.questionnaire}: {target}"

    def get_absolute_url(self):
        return reverse("questionnaires:response_detail", args=[self.pk])

    @property
    def is_editable(self):
        return self.status in self.EDITABLE_STATUSES

    @property
    def is_overdue(self):
        """برگشت‌خورده‌ای که مهلت پنج روز کاری‌اش گذشته است. اعلان و تصعید در قدم ۲۲ و ۲۳ می‌آید."""
        return (
            self.status == self.Status.RETURNED
            and self.return_due is not None
            and self.return_due < timezone.localdate()
        )

    def fixed_items(self):
        """قلم‌های ثابت با برچسبشان، برای نمایش."""
        return [(self._meta.get_field(name).verbose_name, getattr(self, name)) for name in self.FIXED_ITEMS]


class Answer(TimeStampedModel):
    """جواب یک سؤال در یک پاسخ: متن برای سؤال متنی و گزینه‌ها برای بقیه."""

    response = models.ForeignKey(Response, verbose_name="پاسخ", on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, verbose_name="سؤال", on_delete=models.PROTECT, related_name="answers")
    text = models.TextField("متن", blank=True)
    options = models.ManyToManyField(Option, verbose_name="گزینه‌ها", related_name="answers", blank=True)

    # m2m_fields: جوابی که بعد از برگشت عوض شود، گزینه‌های قبلی‌اش در تاریخچه می‌ماند.
    history = HistoricalRecords(m2m_fields=[options])

    class Meta:
        verbose_name = "جواب"
        verbose_name_plural = "جواب‌ها"
        ordering = ["question__order", "question__pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["response", "question"],
                name="unique_answer_per_response_and_question",
                violation_error_message="این سؤال در همین پاسخ پیش‌تر جواب گرفته است.",
            ),
        ]

    def __str__(self):
        return f"{self.response}: {self.question}"


class ServiceRecord(TimeStampedModel):
    """خدمتی که پاسخ‌دهنده در یک پاسخ توصیف کرده است، مستقل از فهرست خدمات."""

    response = models.ForeignKey(Response, on_delete=models.CASCADE, related_name="service_records")
    source_key = models.CharField(max_length=80, blank=True)
    name_and_scope = models.TextField("خدمت و محدوده", blank=True)
    purpose = models.TextField("کارکرد خدمت", blank=True)


class ServiceObjective(TimeStampedModel):
    service = models.ForeignKey(ServiceRecord, on_delete=models.CASCADE, related_name="objectives")
    source_key = models.CharField(max_length=80, blank=True)
    description = models.TextField("انتظار زمانی یا کیفی")


class RiskInstance(TimeStampedModel):
    service = models.ForeignKey(ServiceRecord, on_delete=models.CASCADE, related_name="risk_instances")
    source_key = models.CharField(max_length=80, blank=True)
    scope = models.TextField("دامنه", blank=True)
    trigger = models.TextField("آغازگر", blank=True)
    event = models.TextField("رویداد اصلی", blank=True)


class RiskPath(TimeStampedModel):
    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="paths")
    source_key = models.CharField(max_length=80, blank=True)
    description = models.TextField("نحوه پیشروی", blank=True)
    recovery = models.TextField("بازیابی", blank=True)


class PathControl(TimeStampedModel):
    """تمهید ثبت‌شده در پاسخ؛ می‌تواند چند مسیر از همان نمونه را پوشش دهد."""

    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="controls")
    source_key = models.CharField(max_length=80, blank=True)
    description = models.TextField("تمهید", blank=True)
    paths = models.ManyToManyField(RiskPath, related_name="controls", blank=True)


class PathConsequence(TimeStampedModel):
    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="consequences")
    source_key = models.CharField(max_length=80, blank=True)
    path = models.ForeignKey(RiskPath, on_delete=models.CASCADE, related_name="consequences", null=True, blank=True)
    description = models.TextField("پیامد", blank=True)


class InitialEvidence(TimeStampedModel):
    """شاهد اولیه به یک اتفاق، مسیر، تمهید یا پیامد مشخص وصل می‌شود."""

    risk_instance = models.ForeignKey(RiskInstance, on_delete=models.CASCADE, related_name="evidence")
    source_key = models.CharField(max_length=80, blank=True)
    path = models.ForeignKey(RiskPath, on_delete=models.CASCADE, null=True, blank=True, related_name="evidence")
    control = models.ForeignKey(PathControl, on_delete=models.CASCADE, null=True, blank=True, related_name="evidence")
    consequence = models.ForeignKey(
        PathConsequence, on_delete=models.CASCADE, null=True, blank=True, related_name="evidence"
    )
    description = models.TextField("شاهد", blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(path__isnull=True, control__isnull=True, consequence__isnull=True)
                    | Q(path__isnull=False, control__isnull=True, consequence__isnull=True)
                    | Q(path__isnull=True, control__isnull=False, consequence__isnull=True)
                    | Q(path__isnull=True, control__isnull=True, consequence__isnull=False)
                ),
                name="questionnaire_evidence_one_target",
            ),
        ]


class PendingRisk(TimeStampedModel):
    """«ریسک در انتظار»: نشانه‌ی ریسکی که از یک پاسخ آمده و عضو GRC باید تعیین تکلیفش کند؛ یا آن را به ریسک
    «ثبت‌شده در رجیستر» تبدیل می‌کند یا با دلیل کنار می‌گذارد (س۵۰). حذف نمی‌شود."""

    class Source(models.TextChoices):
        OPTION = "option", "گزینه‌ی نشانه‌ی ریسک"
        NEW_ITEM = "new_item", "مورد جدید"
        MANUAL = "manual", "بررسی GRC"

    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار"
        CONVERTED = "converted", "ثبت در رجیستر"
        DISMISSED = "dismissed", "کنار گذاشته"

    response = models.ForeignKey(Response, verbose_name="پاسخ", on_delete=models.CASCADE, related_name="pending_risks")
    source = models.CharField("منبع", max_length=20, choices=Source.choices)
    option = models.ForeignKey(
        Option, verbose_name="گزینه", on_delete=models.PROTECT, null=True, blank=True, related_name="pending_risks"
    )
    description = models.TextField("شرح")
    scenario = models.ForeignKey(
        "risks.RiskScenario",
        verbose_name="سناریوی مرجع",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    category = models.ForeignKey(
        "risks.RiskCategory", verbose_name="دسته", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    status = models.CharField("وضعیت", max_length=20, choices=Status.choices, default=Status.PENDING)
    risk = models.ForeignKey(
        "risks.Risk",
        verbose_name="ریسک ثبت‌شده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="pending_sources",
    )
    dismiss_reason = models.TextField("دلیل کنار گذاشتن", blank=True)
    duplicate_of = models.ForeignKey(
        "risks.Risk",
        verbose_name="تکراری با",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="duplicate_pending",
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        verbose_name="تعیین‌کننده",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    decided_at = models.DateTimeField("زمان تعیین تکلیف", null=True, blank=True)

    history = HistoricalRecords()

    class Meta:
        verbose_name = "ریسک در انتظار"
        verbose_name_plural = "ریسک‌های در انتظار"
        ordering = ["pk"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(status="converted") | Q(risk__isnull=False),
                name="pending_risk_converted_needs_risk",
                violation_error_message="ریسک در انتظاری که ثبت شده باید به ریسک رجیستر وصل باشد.",
            ),
            models.CheckConstraint(
                condition=~Q(status="dismissed") | ~Q(dismiss_reason=""),
                name="pending_risk_dismissed_needs_reason",
                violation_error_message="کنار گذاشتن بدون دلیل پذیرفته نمی‌شود.",
            ),
        ]

    def __str__(self):
        return self.description.splitlines()[0][:80] if self.description else f"ریسک در انتظار {self.pk}"

    @property
    def is_pending(self):
        return self.status == self.Status.PENDING
