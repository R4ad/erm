"""داده‌ی نمایشی برای دیدن صفحه‌های رابط تازه (فایل فیگما) روی یک پایگاه داده‌ی خالی.

فقط برای پایگاه داده‌ی توسعه است: کاربرها همه رمز demo1234 دارند. روی پایگاه داده‌ای که ریسک دارد اجرا نمی‌شود، مگر
با --force. نام‌ها و عنوان‌ها همان نمونه‌های فایل فیگما هستند تا صفحه‌ها را بشود کنار طرح مقایسه کرد.
"""

from datetime import timedelta

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.actions.acceptance import required_authorities, unit_managers
from apps.actions.models import (
    AcceptanceSignature,
    MonitoringNotice,
    RiskAcceptance,
    TreatmentAction,
    TreatmentPlan,
)
from apps.assessments.models import Assessment, AssessmentReview, ImpactDetail, Path
from apps.catalog.models import Commitment, Customer, Dependency, Responsibility, Service, Supplier
from apps.controls.effectiveness import Thresholds
from apps.controls.models import Control, ControlAssessment, IsoControl
from apps.core.choices import Confidence
from apps.core.models import Comment
from apps.methodology.models import MethodVersion
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Option, Question, Questionnaire, Response
from apps.risks.identification import narrative
from apps.risks.models import Coverage, Evidence, ExternalLink, IdentificationDraft, Risk, RiskCategory, RiskScenario
from apps.workcalendar.workdays import add_working_days
from apps.workflow.models import RiskQuestion, StatusTransition

S = Risk.Status
AS = TreatmentAction.Status
PASSWORD = "demo1234"


class Command(BaseCommand):
    help = "داده‌ی نمایشی رابط تازه (فقط پایگاه داده‌ی توسعه؛ رمز همه‌ی کاربرها demo1234)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="حتی اگر ریسکی ثبت شده باشد.")

    @transaction.atomic
    def handle(self, *args, force=False, **options):
        if Risk.objects.exists() and not force:
            raise CommandError("این پایگاه داده ریسک دارد؛ داده‌ی نمایشی فقط روی پایگاه داده‌ی خالی ساخته می‌شود.")
        self.today = timezone.localdate()
        self.version = MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)
        self.levels = {level.rank: level for level in self.version.risk_levels.all()}
        self.people()
        self.organization()
        self.catalog()
        self.risks()
        self.report_history()
        self.dependencies()
        self.identification()
        self.universe()
        self.questionnaire()
        self.stdout.write(self.style.SUCCESS(f"{Risk.objects.count()} ریسک و {User.objects.count()} کاربر ساخته شد."))

    # ───────────── افراد و سازمان ─────────────

    def user(self, username, first, last, *roles, job="", unit=None, superuser=False):
        user, created = User.objects.get_or_create(
            username=username, defaults={"first_name": first, "last_name": last, "job_title": job}
        )
        if created:
            user.set_password(PASSWORD)
            user.is_superuser = superuser
            user.is_staff = superuser
            user.save()
        for role in roles:
            user.groups.add(Group.objects.get(name=role))
        return user

    def people(self):
        self.sara = self.user("sara", "سارا", "محمدی", Role.GRC_MEMBER, Role.SYSTEM_ADMIN, job="کارشناس ارشد ریسک")
        self.ali = self.user("ali", "علی", "رضایی", Role.UNIT_MANAGER, job="مدیر زیرساخت")
        self.maryam = self.user("maryam", "مریم", "صادقی", Role.UNIT_MANAGER, job="مدیر امنیت اطلاعات")
        self.hossein = self.user("hossein", "حسین", "نوری", Role.UNIT_MANAGER, job="مدیر پرداخت")
        self.mehdi = self.user("mehdi", "مهدی", "فرهادی", Role.SECURITY_WORKGROUP, job="کارشناس عملیات")
        self.reza = self.user("reza", "رضا", "کریمی", Role.SECURITY_COMMITTEE, job="عضو کمیته امنیت")
        self.neda = self.user("neda", "ندا", "احمدی", Role.GRC_MEMBER, job="کارشناس ریسک")

    def organization(self):
        root = OrgUnit.objects.create(name="داتین", code="DTN")
        self.units = {
            "infra": OrgUnit.objects.create(name="زیرساخت", code="INF", parent=root),
            "ops": OrgUnit.objects.create(name="عملیات زیرساخت", code="OPS", parent=root),
            "sec": OrgUnit.objects.create(name="امنیت اطلاعات", code="SEC", parent=root),
            "risk": OrgUnit.objects.create(name="واحد ریسک", code="RSK", parent=root),
            "pay": OrgUnit.objects.create(name="پرداخت", code="PAY", parent=root),
            "proc": OrgUnit.objects.create(name="تدارکات", code="PRC", parent=root),
        }
        for user, unit in [(self.ali, "infra"), (self.ali, "ops"), (self.maryam, "sec"), (self.hossein, "pay")]:
            user.managed_units.add(self.units[unit])
        for user, unit in [
            (self.sara, "risk"),
            (self.neda, "risk"),
            (self.ali, "infra"),
            (self.maryam, "sec"),
            (self.hossein, "pay"),
            (self.mehdi, "ops"),
            (self.reza, "sec"),
        ]:
            user.org_unit = self.units[unit]
            user.save(update_fields=["org_unit"])

    def catalog(self):
        self.banks = [
            Customer.objects.create(name=name, is_key=key)
            for name, key in [("بانک ملت", True), ("بانک تجارت", True), ("بانک صادرات", False), ("بانک سپه", False)]
        ]
        specs = [
            ("SRV-SATNA", "انتقال وجه ساتنا", "pay", self.hossein, True),
            ("SRV-PAYA", "پایا", "pay", self.hossein, True),
            ("SRV-IPG", "پرداخت اینترنتی", "pay", self.hossein, True),
            ("SRV-MB", "همراه‌بانک", "pay", self.hossein, True),
            ("SRV-SMS", "سامانه‌ی پیامک", "ops", self.ali, False),
            ("SRV-CORE", "شبکه‌ی مرکزی", "infra", self.ali, True),
            ("SRV-HSM", "HSM و مدیریت کلید", "sec", self.maryam, True),
            ("SRV-ARC", "بایگانی اسناد", "ops", self.ali, False),
            ("SRV-PORTAL", "پرتال پشتیبانی بانک", "ops", self.ali, False),
        ]
        self.services = {}
        for code, name, unit, owner, critical in specs:
            service = Service.objects.create(
                code=code,
                name=name,
                kind=Service.Kind.SERVICE,
                lifecycle_stage=Service.LifecycleStage.OPERATION,
                environment=Service.Environment.DATIN,
                org_unit=self.units[unit],
                owner=owner,
                is_critical=critical,
            )
            service.customers.set(self.banks[:3] if critical else self.banks[:1])
            self.services[code] = service

    def dependencies(self):
        """وابستگی‌های مشترک برای کارت «تمرکز وابستگی و نقطه‌ی شکست مشترک»."""
        dc = Supplier.objects.create(name="مرکز داده‌ی اصلی (آسیاتک)", is_critical=True, contract_owner=self.ali)
        sms = Supplier.objects.create(name="ارائه‌دهنده‌ی پیامک", is_critical=False, contract_owner=self.ali)
        links = [
            ("SRV-CORE", ["SRV-SATNA", "SRV-PAYA", "SRV-IPG", "SRV-MB", "SRV-ARC"], None),
            ("SRV-HSM", ["SRV-SATNA", "SRV-PAYA", "SRV-IPG"], None),
            (None, ["SRV-SMS", "SRV-MB", "SRV-IPG"], sms),
            (None, ["SRV-CORE", "SRV-ARC", "SRV-PORTAL"], dc),
        ]
        for upstream, services, supplier in links:
            for code in services:
                Dependency.objects.create(
                    service=self.services[code],
                    upstream_service=self.services[upstream] if upstream else None,
                    supplier=supplier,
                    is_shared_point=supplier is dc,
                    description="وابستگی عملیاتی روزانه",
                )

    # جهان ریسک فیگما ۰۹، به ترتیب T1 تا T8: R بررسی‌شده، N نامرتبط با دلیل، P در انتظار. تعداد ریسک هر خانه از
    # ریسک‌های واقعی می‌آید؛ خانه‌ای که ریسک فعال دارد نامرتبط یا در انتظار نمی‌شود.
    UNIVERSE = {
        "SRV-SATNA": "RRRRNRRR",
        "SRV-PAYA": "RRRRRPRR",
        "SRV-IPG": "RRRRRRPR",
        "SRV-MB": "RPRPRNPR",
        "SRV-SMS": "RRRRRNRN",
        "SRV-CORE": "RRRRRRRN",
        "SRV-HSM": "RRRRRRPR",
        "SRV-ARC": "RRRRNNRR",
        "SRV-PORTAL": "PPPPPPPP",
    }
    NOT_RELEVANT = {
        "T5": "همه‌ی اجزای این خدمت داخلی است و به ارائه‌دهنده یا پیمانکار بیرونی وابسته نیست.",
        "T6": "اجرای این خدمت خودکار است و به نیروی انسانی کلیدی یا جابه‌جایی کارکنان وابسته نیست.",
        "T8": "این خدمت داده‌ی مشتری نگه نمی‌دارد و الزام انطباق مستقیمی ندارد.",
    }

    def universe(self):
        categories = list(RiskCategory.objects.filter(is_active=True).order_by("code"))
        with_risks = set(
            Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES)
            .filter(service__isnull=False)
            .values_list("service_id", "category_id")
        )
        for index, (code, pattern) in enumerate(self.UNIVERSE.items()):
            service = self.services[code]
            for category, mark in zip(categories, pattern, strict=True):
                busy = (service.pk, category.pk) in with_risks
                if mark == "P" and not busy:
                    Coverage.objects.filter(service=service, category=category).delete()
                    continue
                relevant = mark != "N" or busy
                Coverage.objects.update_or_create(
                    service=service,
                    category=category,
                    defaults={
                        "status": Coverage.Status.REVIEWED if relevant else Coverage.Status.NOT_RELEVANT,
                        "reason": "" if relevant else self.NOT_RELEVANT[category.code],
                        "reviewed_by": self.sara,
                        "reviewed_on": self.today - timedelta(days=12 + 3 * index),
                    },
                )

    # ───────────── پرسشنامه‌ی شناسایی (فیگما ۱۰) ─────────────

    GRC_QUESTIONS = [
        (
            "single",
            "شدیدترین پیامد باورپذیر برای بانک‌ها چیست؟",
            True,
            [
                ("توقف کامل انتقال وجه بیش از ۴ ساعت", True),
                ("تأخیر در تسویه بدون توقف خدمت", True),
                ("افشا یا دستکاری داده‌ی تراکنش", True),
                ("اثر قابل توجهی ندارد", False),
            ],
        ),
        (
            "multiple",
            "این کارکرد به کدام وابستگی‌ها تکیه دارد؟",
            False,
            [
                ("مرکز داده‌ی پشتیبان", False),
                ("پایگاه داده‌ی مرکزی", False),
                ("ماژول HSM", False),
                ("ارائه‌دهنده‌ی پیامک", False),
            ],
        ),
        ("yes_no", "در شش ماه گذشته رخداد یا نزدیک‌به‌رخدادی داشته‌اید؟", True, [("بله", True), ("خیر", False)]),
        ("text", "کدام تغییر مهم در شش ماه آینده برای این خدمت برنامه‌ریزی شده است؟", False, []),
        (
            "single",
            "پشتیبان‌گیری از داده‌های این خدمت چند وقت یک‌بار آزموده می‌شود؟",
            True,
            [("هر ماه", False), ("هر سه ماه", False), ("سالی یک بار", False), ("آزموده نمی‌شود", True)],
        ),
        ("yes_no", "برای این خدمت سایت پشتیبان آماده‌ی جابه‌جایی دارید؟", False, [("بله", False), ("خیر", True)]),
        (
            "multiple",
            "کدام کنترل‌ها امروز برای این خدمت اجرا می‌شوند؟",
            False,
            [
                ("پایش ۲۴ ساعته", False),
                ("احراز هویت دوعاملی", False),
                ("رمزنگاری ارتباط با بانک‌ها", False),
                ("بازبینی دسترسی فصلی", False),
            ],
        ),
        ("text", "کدام فرد کلیدی این خدمت جایگزین ندارد؟", False, []),
        (
            "single",
            "قرارداد تأمین‌کننده‌ی اصلی این خدمت SLA دارد؟",
            False,
            [("دارد و پایش می‌شود", False), ("دارد ولی پایش نمی‌شود", True), ("ندارد", True)],
        ),
        ("yes_no", "داده‌ی شخصی مشتری در این خدمت نگه داشته می‌شود؟", False, [("بله", False), ("خیر", False)]),
        ("text", "آخرین آزمون نفوذ یا بازبینی امنیتی کی انجام شد و چه یافت؟", False, []),
        (
            "single",
            "اگر خدمت یک روز کامل قطع شود، کار به‌صورت دستی ادامه می‌یابد؟",
            True,
            [("بله، کامل", False), ("بخشی", True), ("خیر", True)],
        ),
    ]

    def questionnaire(self):
        """پرسشنامه‌ی کلاسیک فیگما ۱۰ با دوازده سؤال GRC، و پیش‌نویس مصاحبه‌ای که سارا به نام مدیر پرداخت برای ساتنا
        ثبت می‌کند: کارکردها کامل و سه پرسش از هشت پرسش جلسه جواب دارد. مهلت پنج روز کاری، دو روز مانده."""
        questionnaire = Questionnaire.objects.create(
            title="پرسشنامه‌ی شناسایی ریسک ۱۴۰۵",
            is_active=True,
            description="کارکردها، هشت پرسش جلسه‌ی شناسایی و سؤال‌های GRC؛ هر پاسخ برای یک واحد و در صورت نیاز یک خدمت.",
        )
        for order, (kind, text, required, options) in enumerate(self.GRC_QUESTIONS, 1):
            question = Question.objects.create(
                questionnaire=questionnaire, order=order, text=text, kind=kind, is_required=required
            )
            for index, (label, risky) in enumerate(options, 1):
                Option.objects.create(question=question, order=index, text=label, indicates_risk=risky)
        response = Response.objects.create(
            questionnaire=questionnaire,
            org_unit=self.units["pay"],
            service=self.services["SRV-SATNA"],
            respondent=self.hossein,
            recorded_by=self.sara,
            channel=Response.Channel.INTERVIEW,
            functions="\n".join(
                [
                    "انتقال وجه بین‌بانکی ساتنا برای بانک‌های مشتری",
                    "تسویه‌ی پایان روز با بانک مرکزی",
                    "گزارش وضعیت تراکنش به بانک‌ها",
                    "پشتیبانی و رفع اشکال تراکنش‌های معلق",
                    "نگهداری سوابق تراکنش برای حسابرسی",
                ]
            ),
            mission="انتقال وجه بانک‌ها در همان روز کاری و تسویه‌ی کامل با بانک مرکزی.",
            commitments="دسترس‌پذیری ۹۹٫۹ درصد در ساعات کاری؛ تسویه پیش از ساعت ۱۶.",
            disruptive_event="خرابی پایگاه داده‌ی اصلی ساتنا یا قطع ارتباط با سایت پشتیبان هنگام تسویه‌ی پایان روز.",
        )
        created = next(
            self.today - timedelta(days=back)
            for back in range(1, 12)
            if (add_working_days(self.today - timedelta(days=back), 5) - self.today).days <= 2
        )
        Response.objects.filter(pk=response.pk).update(
            created_at=timezone.now() - timedelta(days=(self.today - created).days),
            updated_at=timezone.now() - timedelta(minutes=10),
        )

    # ───────────── شناسایی ریسک (فیگما ۱۱) ─────────────

    # سناریوهای کتابخانه: عنوان، خدمت، دسته، رویداد، شرایط، هدف یا تعهد، ذی‌نفع، پیامد.
    LIBRARY = [
        (
            "اعمال بسته‌ی انتشار نامعتبر در تولید",
            "SRV-SATNA",
            "T2",
            "اعمال تغییر نامعتبر در تولید",
            "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
            "پردازش دستورهای پرداخت در پنجره‌ی SLA",
            "بانک‌ها و داتین",
            "توقف پردازش تا بازگردانی نسخه",
        ),
        (
            "خطای پیکربندی در پنجره‌ی تغییر",
            "SRV-CORE",
            "T4",
            "اعمال پیکربندی اشتباه روی تجهیزات شبکه",
            "تغییر بدون بازبینی همتا در پنجره‌ی شبانه",
            "دسترس‌پذیری شبکه‌ی مرکزی",
            "داتین",
            "قطع ارتباط خدمات وابسته",
        ),
        (
            "توقف پردازش ساتنا",
            "SRV-SATNA",
            "T3",
            "توقف پردازش دستورهای ساتنا",
            "خرابی سرور پردازش بدون جایگزین گرم",
            "تسویه‌ی بین‌بانکی روزانه",
            "بانک‌ها",
            "تأخیر تسویه و جریمه‌ی SLA",
        ),
        (
            "قطع خدمت ارتباطی تأمین‌کننده",
            "SRV-CORE",
            "T5",
            "قطع لینک ارتباطی تأمین‌کننده",
            "وابستگی به یک تأمین‌کننده بدون مسیر جایگزین",
            "ارتباط پایدار با بانک‌ها",
            "همه‌ی بانک‌ها",
            "قطع خدمات بین‌بانکی",
        ),
        (
            "خروج اطلاعات از مسیر پشتیبانی",
            "SRV-PORTAL",
            "T1",
            "خروج اطلاعات مشتری از مسیر پشتیبانی",
            "دسترسی گسترده‌ی کارشناسان پشتیبانی به داده",
            "محرمانگی اطلاعات بانک‌ها",
            "بانک‌ها",
            "افشای اطلاعات و شکایت رسمی",
        ),
        (
            "استفاده‌ی نامجاز از دسترسی ممتاز باقی‌مانده",
            "SRV-IPG",
            "T1",
            "استفاده‌ی نامجاز از حساب ممتاز",
            "باقی ماندن دسترسی ممتاز پس از جابه‌جایی کارکنان",
            "صحت تراکنش‌های پرداخت اینترنتی",
            "بانک‌ها",
            "دستکاری تراکنش",
        ),
    ]

    def identification(self):
        """کتابخانه‌ی سناریو، تعهدهای خدمت و ورودی‌های اخیر شناسایی در هر مرحله، به‌اضافه‌ی یک پیش‌نویس سارا."""
        library = {}
        for title, service, category, event, conditions, objective, customer, consequence in self.LIBRARY:
            service = self.services[service]
            scenario = RiskScenario(
                title=title,
                service=service,
                service_name_snapshot=service.name,
                event=event,
                conditions=conditions,
                objective=objective,
                customer_text=customer,
                consequence=consequence,
                category=RiskCategory.objects.get(code=category),
            )
            scenario.narrative = scenario.build_narrative()
            scenario.save()
            library[title] = scenario
        sla = Commitment.objects.create(
            title="SLA پردازش ۹۹٫۵٪",
            kind=Commitment.Kind.SLA,
            customer=self.banks[0],
            owner=self.hossein,
            description="پردازش دستورهای پرداخت در پنجره‌ی زمانی مصوب",
        )
        sla.services.set([self.services["SRV-SATNA"], self.services["SRV-PAYA"]])
        Commitment.objects.create(title="SLA دسترس‌پذیری ۹۹٫۹٪", kind=Commitment.Kind.SLA, owner=self.ali).services.set(
            [self.services["SRV-CORE"]]
        )
        Commitment.objects.create(
            title="گزارش رخداد امنیتی در ۴ ساعت", kind=Commitment.Kind.REGULATORY, owner=self.maryam
        ).services.set([self.services["SRV-PORTAL"], self.services["SRV-IPG"]])

        entries = [
            # جدیدترین آخر ساخته می‌شود تا در «ورودی‌های اخیر» بالاتر بیاید.
            (None, "SRV-PAYA", self.hossein, S.REGISTERED, Risk.Source.NEW_ASSET),
            (
                "استفاده‌ی نامجاز از دسترسی ممتاز باقی‌مانده",
                "SRV-IPG",
                self.hossein,
                S.ASSESSMENT,
                Risk.Source.NONCONFORMITY,
            ),
            ("خروج اطلاعات از مسیر پشتیبانی", "SRV-PORTAL", self.ali, S.QUESTIONS, Risk.Source.THREAT),
            ("قطع خدمت ارتباطی تأمین‌کننده", "SRV-CORE", self.ali, S.REGISTERED, Risk.Source.PERIODIC),
        ]
        for title, code, owner, status, source in entries:
            scenario = library.get(title)
            service = self.services[code]
            intake = (
                {
                    "mission": service.description or f"ارائه‌ی پایدار {service.name}",
                    "subject": f"{service.name} · محیط تولید",
                    "objective": scenario.objective,
                    "conditions": scenario.conditions,
                    "customer": scenario.customer_text,
                    "event": scenario.event,
                    "harm": scenario.consequence,
                    "impact": "",
                    "dependencies": "",
                    "evidence": "گزارش رخداد مشابه",
                }
                if scenario
                else {
                    "mission": "تسویه‌ی دسته‌ای پایا",
                    "subject": "پایا · کلاستر پایگاه داده‌ی تازه",
                    "objective": "تسویه‌ی چرخه‌های پایا",
                    "conditions": "راه‌اندازی کلاستر بدون آزمون بازیابی",
                    "customer": "همه‌ی بانک‌ها",
                    "event": "از دست رفتن داده‌ی چرخه‌ی جاری",
                    "harm": "تکرار چرخه‌ی تسویه",
                    "impact": "",
                    "dependencies": "",
                    "evidence": "فرض قابل آزمون: آزمون بازیابی انجام نشده است",
                }
            )
            risk = Risk.objects.create(
                title=title or "دارایی جدید: کلاستر پایگاه داده‌ی پایا",
                description=narrative(intake),
                channel=Risk.Channel.IDENTIFICATION,
                source=source,
                intake=intake,
                category=scenario.category if scenario else RiskCategory.objects.get(code="T3"),
                org_unit=service.org_unit,
                service=service,
                owner=owner,
                scope=intake["subject"],
                scenario=scenario,
            )
            risk.customers.set(service.customers.all())
            Risk.objects.filter(pk=risk.pk).update(status=status)
            if status == S.QUESTIONS:
                RiskQuestion.objects.create(
                    risk=risk,
                    text="«دسترسی گسترده» دقیقاً کدام نقش‌ها و چه داده‌ای است؟ نمونه‌ی یک تیکت را پیوست کنید.",
                    asked_by=self.sara,
                    due=add_working_days(self.today, 5),
                )

        satna = self.services["SRV-SATNA"]
        IdentificationDraft.objects.create(
            created_by=self.sara,
            org_unit=self.units["pay"],
            data={
                "org_unit": self.units["pay"].pk,
                "target": f"{satna.pk}:{sla.pk}",
                "mission": "پردازش و تسویه‌ی دستورهای پرداخت بین‌بانکی در پنجره‌ی زمانی مصوب",
                "subject": "ساتنا · محیط تولید",
                "objective": "پردازش دستورهای پرداخت در پنجره‌ی SLA",
                "conditions": "ثبت اشتباه تنظیمات مقصد در بسته‌ی انتشار",
                "customer": "بانک ملت و داتین",
                "event": "اعمال تغییر نامعتبر در محیط تولید",
                "harm": "",
                "impact": "جبران SLA و یک شکایت رسمی بانک ملت",
                "dependencies": "پایپ‌لاین انتشار · بدون مسیر جایگزین خودکار",
                "evidence": "۲۰ بسته‌ی نامعتبر یکتا از ۱۰۰۰ بسته در ۱۲ ماه؛ پوشش ثبت ۹۸٪",
                "category": RiskCategory.objects.get(code="T2").pk,
                "tags": ["ساخت و انتشار", "غیرسایبری"],
                "source": Risk.Source.CHANGE,
                "scenario": None,
                "evidence_items": [],
            },
        )

    def report_history(self):
        """ارزیابی جاری قدیمی‌تر برای چند ریسک، تا «تغییر سطح در دوره» و تغییر توزیع سطح نسبت به شش ماه قبل داده داشته
        باشند. ارزیابی قدیمی پیش از آغاز دوره‌ی شش‌ماهه تأیید شده است."""
        currents = Assessment.objects.filter(
            kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED
        ).select_related("risk", "decision_level").order_by("risk__code")
        scores = {1: 3, 2: 6, 3: 12, 4: 20}
        for base, shift in zip(list(currents)[:6], [-1, 1, -1, 1, -1, 1], strict=False):
            rank = min(max(base.decision_level.rank + shift, 1), 4)
            self.assessment(base.risk, rank, scores[rank], days_ago=240)

    # ───────────── ریسک‌ها ─────────────

    def risk(self, title, service, owner, category, status, channel=Risk.Channel.INTERVIEW, ready=True):
        service = self.services[service]
        risk = Risk.objects.create(
            title=title,
            description=f"در اثر ضعف کنترل‌ها، ممکن است «{title}» رخ دهد که به اختلال خدمت برای بانک‌ها منجر شود.",
            channel=channel,
            category=RiskCategory.objects.get(code=category),
            org_unit=service.org_unit,
            service=service,
            owner=owner,
            scope="محیط تولید و سایت پشتیبان",
            initiator="خطای انسانی یا حمله‌ی بیرونی" if ready else "",
            count_unit="هر رخداد قطع بیش از ۱۵ دقیقه" if ready else "",
        )
        risk.customers.set(service.customers.all())
        Risk.objects.filter(pk=risk.pk).update(status=status, needs_completion=not ready)
        risk.refresh_from_db()
        return risk

    def assessment(self, risk, rank, score, kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED, days_ago=20):
        status_before = risk.status
        Risk.objects.filter(pk=risk.pk).update(status=S.ASSESSMENT)
        assessment = Assessment(
            risk=risk, kind=kind, method_version=self.version, created_by=self.sara, horizon_months=12
        )
        assessment._history_user = self.sara
        assessment.save()
        Risk.objects.filter(pk=risk.pk).update(status=status_before)
        level = self.levels[rank]
        approved = timezone.now() - timedelta(days=days_ago)
        likelihood, impact = self.cell(score, flip=risk.pk % 2 == 1)
        Assessment.objects.filter(pk=assessment.pk).update(
            status=status,
            decision_level=level,
            base_level=level,
            likelihood_low=likelihood,
            likelihood_high=likelihood,
            impact_low=impact,
            impact_high=impact,
            score_low=score,
            score_high=score,
            approved_at=approved if status == Assessment.Status.APPROVED else None,
        )
        assessment.refresh_from_db()
        return assessment

    @staticmethod
    def cell(score, flip=False):
        """خانه‌ی L × I امتیاز: نزدیک‌ترین جفت به قطر، تا ماتریس گزارش مدیریتی خانه‌های متنوع داشته باشد."""
        pairs = [(likelihood, impact) for likelihood in range(1, 6) for impact in range(1, 6) if likelihood * impact == score]
        if not pairs:
            side = min(5, max(1, round(score**0.5)))
            return side, side
        likelihood, impact = min(pairs, key=lambda pair: (abs(pair[0] - pair[1]), -pair[1]))
        return (impact, likelihood) if flip else (likelihood, impact)

    def entered(self, risk, to_status, days_ago):
        record = StatusTransition.objects.create(
            risk=risk, from_status=S.ASSESSMENT, to_status=to_status, created_by=self.sara
        )
        StatusTransition.objects.filter(pk=record.pk).update(created_at=timezone.now() - timedelta(days=days_ago))

    def plan(self, risk, assessment, approved=True, option=TreatmentPlan.Option.REDUCE):
        plan = TreatmentPlan(
            risk=risk,
            assessment=assessment,
            option=option,
            rationale="کاهش امکان تحقق با کنترل‌های فنی؛ پذیرش برای این سطح مجاز نیست.",
            created_by=self.sara,
            decision_due=add_working_days(self.today, 3),
        )
        plan._history_user = self.sara
        plan.save()
        if approved:
            TreatmentPlan.objects.filter(pk=plan.pk).update(
                owner_approved_at=timezone.now() - timedelta(days=5), owner_approved_by=risk.owner
            )
        plan.refresh_from_db()
        return plan

    def action(self, plan, title, status, assignee, verifier, due_in, mechanism="b", **fields):
        if verifier == plan.risk.owner:
            verifier = self.neda if plan.risk.owner != self.neda else self.ali
        action = TreatmentAction.objects.create(
            plan=plan,
            title=title,
            deliverable=f"تحویل‌دادنی: {title}",
            mechanism=mechanism,
            owner=plan.risk.owner,
            assignee=assignee,
            verifier=verifier,
            created_by=self.sara,
            **{
                "start_date": self.today - timedelta(days=30),
                "due_date": self.today + timedelta(days=due_in),
                "acceptance_criteria": "آزمون مسیر در ۳۰ نمونه بدون موفقیت دور زدن کنترل.",
                **fields,
            },
        )
        TreatmentAction.objects.filter(pk=action.pk).update(status=status)
        return action

    def acceptance(self, risk, assessment, status, days_left, signatures=0, start_ago=60, **fields):
        start = self.today - timedelta(days=start_ago)
        acceptance = RiskAcceptance.objects.create(
            risk=risk,
            assessment=assessment,
            follow_up_by=self.sara,
            created_by=self.sara,
            **{
                "scope": f"خدمت {risk.service.name} برای بانک‌های متأثر",
                "reason": "هزینه‌ی کاهش بیش از زیان مورد انتظار است.",
                "conditions": "پایش ماهانه‌ی شاخص و گزارش به کمیته.",
                "customer_constraints": "—",
                "monitoring": "تعداد رخدادهای قطع در ماه",
                "revocation_triggers": "بیش از یک رخداد بحرانی در فصل",
                "start_date": start,
                "end_date": self.today + timedelta(days=days_left),
                **fields,
            },
        )
        decided = status not in (RiskAcceptance.Status.DRAFT, RiskAcceptance.Status.PENDING)
        RiskAcceptance.objects.filter(pk=acceptance.pk).update(
            status=status,
            submitted_at=timezone.now() - timedelta(days=62),
            decided_at=timezone.now() - timedelta(days=60) if decided else None,
            decision_text="ریسک باقیمانده تا پایان اعتبار با شروط بالا پذیرفته شد." if decided else "",
        )
        # امضاها به ترتیب صاحبان اختیاری که همین پذیرش لازم دارد (مالک، و برای متوسط مدیر خود واحد ریسک)
        auth = AcceptanceSignature.Authority
        signers = {
            auth.OWNER: risk.owner,
            auth.UNIT_MANAGER: unit_managers(risk).first(),
            auth.COMMITTEE: self.reza,
            auth.SENIOR_MANAGEMENT: self.sara,
        }
        for authority in required_authorities(acceptance)[:signatures]:
            signature = AcceptanceSignature.objects.create(
                acceptance=acceptance,
                authority=authority,
                decision=AcceptanceSignature.Decision.APPROVE,
                note="شروط را می‌پذیرم؛ پایش روزانه با تیم پیام است." if authority == auth.OWNER else "",
                reference="صورت‌جلسه‌ی ۱۴۰۵/۰۸/۱۰" if authority == auth.COMMITTEE else "",
                created_by=signers[authority],
            )
            AcceptanceSignature.objects.filter(pk=signature.pk).update(
                created_at=timezone.now() - timedelta(hours=26)
            )
        return acceptance

    def record(self, risk):
        """پرونده‌ی کامل نمونه‌ی صفحه‌ی ۰۴ فیگما: از پرسشنامه تا برنامه‌ی درمان، سه ارزیابی ذاتی، جاری و هدف،
        چهار کنترل با E4 تا E1، شواهد، پیوندهای بیرونی، پرسش‌های جواب‌داده و طرحی که منتظر تأیید مالک است."""
        now = timezone.now()
        scenario = RiskScenario.objects.create(
            title="قطع خدمت پرداخت به‌دلیل خرابی پایگاه داده",
            service=risk.service,
            service_name_snapshot=risk.service.name,
            event="قطع خدمت",
            conditions="خرابی پایگاه داده‌ی اصلی بدون جایگزین آماده",
            consequence="توقف تسویه‌ی بین‌بانکی",
            category=risk.category,
        )
        RiskScenario.objects.filter(pk=scenario.pk).update(version=2)
        Risk.objects.filter(pk=risk.pk).update(created_at=now - timedelta(days=40), scenario=scenario, scenario_version=2)
        chain = [
            (S.QUESTIONS, S.REGISTERED, 35, self.sara, "برگشت به رجیستر پس از پاسخ همه‌ی پرسش‌ها", None),
            (S.REGISTERED, S.ASSESSMENT, 25, self.neda, "ارسال جهت ارزیابی؛ گزارش رخداد قطع ۳ ساعته به ریسک وصل شد", None),
            (S.ASSESSMENT, S.TREATMENT_PLAN, 6, self.sara,
             "تأیید ارزیابی جاری و طراحی برنامه‌ی درمان (ردیف ۶)", self.today - timedelta(days=6)),
        ]
        for source, target, days_ago, by, reason, meeting in chain:
            record = StatusTransition.objects.create(
                risk=risk, from_status=source, to_status=target, created_by=by, reason=reason, meeting_date=meeting
            )
            StatusTransition.objects.filter(pk=record.pk).update(created_at=now - timedelta(days=days_ago))
        for days_ago, text, answer in [
            (38, "آخرین آزمون بازیابی پایگاه داده‌ی ساتنا کی و با چه نتیجه‌ای انجام شد؟",
             "شهریور ۱۴۰۵؛ بازیابی کامل ۲ ساعت و ۴۰ دقیقه طول کشید."),
            (38, "آیا سایت دوم داده را هم‌زمان دریافت می‌کند؟", "خیر، تکثیر غیرهم‌زمان با تأخیر حدود ۵ دقیقه است."),
        ]:
            RiskQuestion.objects.create(
                risk=risk, text=text, asked_by=self.neda, due=self.today - timedelta(days=days_ago - 7),
                answer=answer, answered_by=self.ali, answered_at=now - timedelta(days=days_ago - 2),
            )

        inherent = self.assessment(risk, 4, 20, kind=Assessment.Kind.INHERENT, days_ago=30)
        current = self.assessment(risk, 3, 12, days_ago=14)
        target = self.assessment(risk, 2, 6, kind=Assessment.Kind.TARGET, days_ago=13)
        Assessment.objects.filter(pk=inherent.pk).update(likelihood_low=5, likelihood_high=5, impact_low=4, impact_high=4)
        Assessment.objects.filter(pk=current.pk).update(
            a=3, a_basis="forward", a_confidence=Confidence.MEDIUM, a_rationale="دو رخداد مشابه در سه سال و هشدارهای ظرفیت دیسک.", b_low=4, b_high=4,
            likelihood_low=3, likelihood_high=3, impact_low=4, impact_high=4, confidence=Confidence.MEDIUM,
        )
        Assessment.objects.filter(pk=target.pk).update(
            likelihood_low=3, likelihood_high=3, impact_low=2, impact_high=2,
            target_due=self.today + timedelta(days=150),
        )
        ImpactDetail.objects.create(
            assessment=current, customer=self.banks[0], scale=self.version.scales.get(code="S"), level=4,
            rationale="توقف تسویه‌ی ساتنا بیش از ۲ ساعت برای بانک ملت", confidence=Confidence.MEDIUM,
        )

        def evidence(title, kind, reliability, days_ago, **fields):
            item = Evidence.objects.create(
                title=title, kind=kind, reliability=reliability, summary=title, source="واحد عملیات زیرساخت",
                observed_on=self.today - timedelta(days=days_ago), owner=self.ali, **fields,
            )
            item.risks.add(risk)
            return item

        E = Evidence
        incident = evidence("گزارش رخداد قطع ۳ ساعته‌ی ساتنا — مهر", E.Kind.INCIDENT, E.Reliability.HIGH, 50)
        evidence("تحلیل اثر کسب‌وکار (BIA) ساتنا: RTO ۲ ساعت، MTPD ۸ ساعت", E.Kind.BIA_CONTRACT, E.Reliability.HIGH, 60)
        evidence("نتیجه‌ی آزمون بازیابی شهریور", E.Kind.TEST, E.Reliability.MEDIUM, 70,
                 access_class=E.AccessClass.CONFIDENTIAL)
        evidence("قرارداد SLA بانک ملت", E.Kind.BIA_CONTRACT, E.Reliability.HIGH, 400,
                 valid_until=self.today - timedelta(days=45), customer=self.banks[0])
        cab = evidence("سوابق جلسه‌های CAB سه ماه اخیر", E.Kind.TEST, E.Reliability.HIGH, 20)
        replication = evidence("گزارش پایش تکثیر پایگاه داده", E.Kind.TEST, E.Reliability.MEDIUM, 25)
        disk = evidence("داشبورد ظرفیت ذخیره‌ساز", E.Kind.STATISTICS, E.Reliability.MEDIUM, 30)

        controls = [
            ("مدیریت تغییر با تأیید CAB", Control.Kind.PREVENTIVE, True, "8.32", 4, cab),
            ("تکثیر غیرهم‌زمان پایگاه داده به سایت دوم", Control.Kind.RECOVERY, True, "8.14", 3, replication),
            ("پایش ظرفیت و سلامت دیسک ذخیره‌ساز", Control.Kind.PREVENTIVE, False, "8.16", 2, disk),
            ("رویه‌ی بازیابی مستند و مانور سالانه", Control.Kind.RECOVERY, False, "5.30", None, None),
        ]
        for title, kind, key, iso, e, proof in controls:
            self.control(risk, title, kind, key, iso, e, proof)

        for kind, ref in [
            (ExternalLink.Kind.INCIDENT, "INC-20431"),
            (ExternalLink.Kind.CHANGE, "CHG-1182"),
            (ExternalLink.Kind.CONTINUITY_PLAN, "BCP-SATNA-02"),
        ]:
            ExternalLink.objects.create(risk=risk, kind=kind, ref=ref)
        for by, text in [
            (self.ali, "سایت دوم تا پایان آذر به تکثیر هم‌زمان می‌رسد؛ برآورد هزینه در طرح آمده است."),
            (self.sara, "شاهد قرارداد SLA منقضی است؛ نسخه‌ی تمدیدشده را وصل کنید."),
        ]:
            Comment.objects.create(content_object=risk, text=text, created_by=by)

        self.treatment_plan(risk, current, target)
        risk.refresh_from_db()
        return incident

    def treatment_plan(self, risk, current, target):
        """طرح نمونه‌ی صفحه‌ی ۰۷ فیگما: کاهش با ارزیابی هدف تأییدشده، منتظر تأیید مالک، با چهار اقدام روی مسیرهای
        ارزیابی جاری و دو بُعد پیامد. هزینه‌ی اقدام آخر خالی است تا هشدار «هزینه ثبت نشده» دیده شود."""
        paths = [
            Path.objects.create(
                assessment=current, name=name, description=name, b0=b0, b0_confidence=Confidence.MEDIUM,
                b0_rationale="از گزارش رخداد مهر و آزمون بازیابی شهریور.",
            )
            for name, b0 in [
                ("خرابی ذخیره‌ساز اصلی بدون تکثیر به‌روز", 4),
                ("خطای انسانی در تغییر پیکربندی پایگاه داده", 3),
                ("دورزدن رویه‌ی تغییر با حساب مدیر اضطراری مشترک", 4),
            ]
        ]
        Assessment.objects.filter(pk=target.pk).update(
            assumptions="B مسیر ۳ از ۴ به ۲ با حذف حساب مدیر اضطراری مشترک."
        )
        plan = self.plan(risk, current, approved=False)
        TreatmentPlan.objects.filter(pk=plan.pk).update(
            target_assessment=target,
            rationale=(
                "دو مسیر اصلی تحقق (خرابی ذخیره‌ساز و دورزدن رویه‌ی تغییر) با اقدام‌های فنی کاهش‌پذیرند و هزینه‌ی "
                "آن‌ها از زیان برآوردی کمتر است.\n«انتقال» بررسی شد: بیمه‌ی سایبری قطعی خدمت ساتنا را پوشش "
                "نمی‌دهد. «اجتناب» یعنی توقف خدمت، که ممکن نیست."
            ),
        )
        start = self.today + timedelta(days=10)
        rows = [
            ("راه‌اندازی تکثیر هم‌زمان پایگاه داده به سایت پشتیبان", "RPO صفر و RTO کمتر از ۲ ساعت در آزمون failover",
             "b", paths[0], None, self.mehdi, self.neda, 25, 65, 5_200_000_000, 300),
            ("حذف حساب مدیر اضطراری مشترک و راه‌اندازی دسترسی اضطراری فردی", "صفر حساب مشترک در بازبینی دسترسی",
             "b", paths[2], None, self.maryam, self.sara, 10, 60, 1_800_000_000, 180),
            ("مانور بازیابی سه‌ماهه با سناریوی خرابی دیسک", "بازیابی کامل در مانور، وابسته به TR تکثیر",
             "impact", None, "S", self.mehdi, self.neda, 0, 55, 1_400_000_000, 140),
            ("به‌روزرسانی BIA و توافق RTO با بانک‌ها", "صورت‌جلسه‌ی امضاشده با دو بانک",
             "impact", None, "C", self.neda, self.sara, 60, 30, None, None),
        ]
        for title, criteria, mechanism, path, scale, assignee, verifier, begin, length, cost, hours in rows:
            self.action(
                plan, title, AS.PLANNED, assignee, verifier, 0, mechanism=mechanism,
                acceptance_criteria=criteria,
                path=path,
                dimension=self.version.scales.get(code=scale) if scale else None,
                start_date=start + timedelta(days=begin),
                due_date=start + timedelta(days=begin + length),
                cost=cost,
                person_hours=hours,
            )
        return plan

    def control(self, risk, title, kind, key, iso, e, proof):
        """کنترل وصل به ریسک با یک ارزیابی اثربخشی که شرط‌های E خودش را دارد (e خالی یعنی بدون ارزیابی)."""
        control = Control.objects.create(
            title=title, objective=title, kind=kind, owner=self.ali, operated_by=Responsibility.DATIN, is_key=key
        )
        control.iso_controls.add(IsoControl.objects.get(code=iso))
        risk.controls.add(control)
        if e is None:
            return control, None
        sample = Thresholds.of(self.version).sample
        test = ControlAssessment(
            control=control, method_version=self.version, scope=f"دامنه‌ی {risk.service.name}",
            exists=True, design_ok=e >= 3, operating_ok=True, coverage_pct=100 if e >= 3 else 60,
            critical_points_covered=e >= 3, sample_size=sample if e >= 3 else 5,
            test_from=self.today - timedelta(days=50), test_to=self.today - timedelta(days=20),
            sustained=e >= 4, e=e, confidence=Confidence.MEDIUM, rationale=f"شرط‌های E{e} برقرار است.",
            verified_by=self.sara if e >= 3 else None, created_by=self.sara,
        )
        test.save()
        test.evidence.add(proof)
        return control, test

    def qc_assessment(self, risk):
        """ارزیابی جاری در کنترل کیفیت برای صفحه‌ی ۰۵ فیگما، با ورودی‌های واقعی تا موتور محاسبه نتیجه‌ی موقت را حساب
        کند: A، سه مسیر با کنترل‌های E۳، E۲ و E۴، پروفایل پیامد کامل جز شاهد یک خانه، و یک برگشت با یادداشت."""
        now = timezone.now()

        def evidence(title, kind, days_ago):
            item = Evidence.objects.create(
                title=title, kind=kind, reliability=Evidence.Reliability.HIGH, summary=title,
                source="واحد امنیت اطلاعات", observed_on=self.today - timedelta(days=days_ago), owner=self.maryam,
            )
            item.risks.add(risk)
            return item

        incident = evidence("گزارش رخداد توقف HSM در اردیبهشت", Evidence.Kind.INCIDENT, 120)
        storage = evidence("گزارش سلامت ذخیره‌ساز HSM", Evidence.Kind.TEST, 15)
        change = evidence("سوابق تغییر پیکربندی HSM", Evidence.Kind.TEST, 18)
        _, replication = self.control(
            risk, "تکثیر کلیدها به HSM پشتیبان", Control.Kind.PREVENTIVE, True, "8.14", 3, storage
        )
        _, monitoring = self.control(
            risk, "پایش سلامت دیسک و ماژول HSM", Control.Kind.PREVENTIVE, False, "8.16", 2, storage
        )
        _, cab = self.control(risk, "تأیید CAB برای تغییر پیکربندی HSM", Control.Kind.PREVENTIVE, True, "8.32", 4, change)

        assessment = Assessment(
            risk=risk, kind=Assessment.Kind.CURRENT, method_version=self.version, created_by=self.neda,
            horizon_months=12, assumptions="HSM پشتیبان در سایت دوم هم‌زمان نگه داشته می‌شود.",
            a=3, a_basis="forward", a_confidence=Confidence.MEDIUM,
            a_rationale="دو توقف در سه سال و هشدارهای سلامت ماژول در شش ماه اخیر.",
        )
        assessment._history_user = self.neda
        assessment.save()
        assessment.a_evidence.add(incident)
        for name, b0, controls, proof in [
            ("مسیر ۱ — خرابی دیسک ذخیره‌ساز اصلی بدون تکثیر به‌روز", 5, [replication, monitoring], storage),
            ("مسیر ۲ — خطای انسانی در تغییر پیکربندی HSM", 3, [cab], change),
            ("مسیر ۳ — دورزدن رویه‌ی تغییر با حساب مدیر اضطراری", 4, [], incident),
        ]:
            path = Path.objects.create(
                assessment=assessment, name=name, description=name, b0=b0, b0_confidence=Confidence.MEDIUM,
                b0_rationale="از شاهد رخداد و آزمون‌های اخیر.",
            )
            path.evidence.add(proof)
            path.control_assessments.add(*controls)
        levels = {
            "S": [3, 3, 2, 4], "D": [1, 1, 1, 2], "F": [2, 2, 1, 3], "C": [1, 2, 1, 2], "R": [1, 1, 1, 2],
        }
        columns = [None, *risk.customers.order_by("name")]
        for scale in self.version.scales.filter(kind="impact"):
            for customer, level in zip(columns, levels.get(scale.code, [1, 1, 1, 1]), strict=False):
                detail = ImpactDetail.objects.create(
                    assessment=assessment, customer=customer, scale=scale, level=level,
                    rationale=f"سطح {scale.name} از گزارش رخداد و قراردادها", confidence=Confidence.MEDIUM,
                )
                # خانه‌ی R بانک تجارت بی‌شاهد می‌ماند، تا «بررسی‌های پیش از تأیید» هشدار فیگما را نشان دهد.
                if not (scale.code == "R" and customer is not None and customer.name == "بانک تجارت"):
                    detail.evidence.add(incident)
        Assessment.objects.filter(pk=assessment.pk).update(status=Assessment.Status.IN_QC)
        for days_ago, action, by, notes in [
            (3, AssessmentReview.Action.SUBMIT, self.neda, ""),
            (2, AssessmentReview.Action.RETURN, self.sara,
             "برای خانه‌ی R بانک تجارت یا شاهد اضافه کنید یا سطح را با دلیل به صفر برگردانید."),
            (1, AssessmentReview.Action.SUBMIT, self.neda, "شاهد مسیرهای ۱ و ۲ اضافه شد."),
        ]:
            review = AssessmentReview.objects.create(assessment=assessment, action=action, notes=notes, created_by=by)
            AssessmentReview.objects.filter(pk=review.pk).update(created_at=now - timedelta(days=days_ago))
        return assessment

    def analysis_assessment(self):
        """ارزیابی پیش‌نویس صفحه‌ی ۱۲ فیگما («آنالیز ریسک»): A از نرخ ۲۰ بسته‌ی نامعتبر در ۱۲ ماه با پوشش ۹۸٪، دو مسیر
        با کنترل‌های E۳ و E۲، یک کنترل کاهش پیامد بی‌اثر در Bc و پروفایل پیامد S۳ و بقیه ۲؛ ارزیابی ذاتی ۱۲ هم هست."""
        risk = self.risk("اعمال بسته‌ی انتشار نامعتبر در تولید", "SRV-SATNA", self.hossein, "T2", S.ASSESSMENT)
        risk.description = (
            "بسته یا فرمان نامعتبر پیش از کنترل انتشار ممکن است به اعمال تنظیم نادرست در تولید و اختلال خدمت مشتری برسد"
        )
        risk.initiator = "ایجاد یک بسته یا فرمان انتشار نامعتبر و ارائه‌ی آن به فرایند کنترل انتشار"
        risk.count_unit = "هر بسته‌ی نامعتبر یکتا، بدون توجه به تعداد هشدارها"
        risk.scope = "ساتنا و پایا · محیط تولید · بانک ملت"
        risk.count_exclusions = "کل ۱۰۰۰ بسته‌ی انتشار، هشدارهای تکراری، تغییرات عادی"
        risk.scenario_snapshot = {"event": "اعمال بسته‌ی نامعتبر در محیط تولید"}
        risk.realization_path = "انتشار از پایپ‌لاین رسمی یا فرمان دستی در پنجره‌ی اضطراری"
        risk._history_user = self.sara
        risk.save()
        risk.customers.set([self.banks[0]])
        self.assessment(risk, 3, 12, kind=Assessment.Kind.INHERENT, days_ago=40)

        def evidence(title, kind, days_ago):
            item = Evidence.objects.create(
                title=title,
                kind=kind,
                reliability=Evidence.Reliability.HIGH,
                summary=title,
                source="واحد DevOps",
                observed_on=self.today - timedelta(days=days_ago),
                owner=self.sara,
            )
            item.risks.add(risk)
            return item

        cab = evidence("تیکت‌های CAB", Evidence.Kind.TEST, 10)
        pipeline = evidence("لاگ پایپ‌لاین انتشار", Evidence.Kind.STATISTICS, 12)
        incident = evidence("گزارش رخداد", Evidence.Kind.INCIDENT, 60)
        sample = Thresholds.of(self.version).sample

        def control(title, kind, key, iso, owner, **test):
            item = Control.objects.create(
                title=title, objective=title, kind=kind, owner=owner, operated_by=Responsibility.DATIN, is_key=key
            )
            item.iso_controls.add(IsoControl.objects.get(code=iso))
            risk.controls.add(item)
            if not test:
                return item, None
            proof = test.pop("proof")
            assessment = ControlAssessment(
                control=item,
                method_version=self.version,
                scope="بسته‌های انتشار ساتنا و پایا",
                test_from=self.today - timedelta(days=45),
                test_to=self.today - timedelta(days=15),
                confidence=Confidence.MEDIUM,
                created_by=self.sara,
                exists=True,
                **test,
            )
            assessment.save()
            assessment.evidence.add(proof)
            return item, assessment

        _, validation = control(
            "اعتبارسنجی خودکار بسته‌ی انتشار",
            Control.Kind.PREVENTIVE,
            True,
            "8.32",
            self.ali,
            design_ok=True,
            operating_ok=True,
            coverage_pct=100,
            critical_points_covered=True,
            sample_size=max(sample, 40),
            e=3,
            rationale="شرط‌های E3 برقرار است؛ آزمون ۴۰ نمونه.",
            verified_by=self.sara,
            proof=pipeline,
        )
        _, dual = control(
            "تأیید دوم انتشار (چهار چشم)",
            Control.Kind.PREVENTIVE,
            True,
            "8.32",
            self.hossein,
            design_ok=True,
            operating_ok=False,
            limited_effect_proven=True,
            coverage_pct=80,
            critical_points_covered=False,
            exceptions="۳ استثنای ثبت‌نشده",
            sample_size=12,
            e=2,
            rationale="طراحی کافی است ولی سه انتشار بدون تأیید دوم ثبت شده است.",
            proof=cab,
        )
        control("پایش و هشدار پس از اعمال", Control.Kind.DETECTIVE, False, "8.16", self.ali)

        assessment = Assessment(
            risk=risk,
            kind=Assessment.Kind.CURRENT,
            method_version=self.version,
            created_by=self.sara,
            horizon_months=12,
            assumptions="پنجره‌ی اضطراری فقط با دسترسی اپراتور باز می‌شود.",
            a_basis="rate",
            a_count=20,
            a_period_months=12,
            a_denominator="۱۰۰۰ بسته‌ی انتشار",
            a_coverage=98,
            a=4,
            a_confidence=Confidence.MEDIUM,
            a_rationale="۲۰ بسته‌ی نامعتبر یکتا در ۱۲ ماه از لاگ پایپ‌لاین و تیکت‌های CAB.",
        )
        assessment._history_user = self.sara
        assessment.save()
        assessment.a_evidence.add(cab, pipeline, incident)
        for name, description, b0, controls in [
            ("انتشار از پایپ‌لاین رسمی", "CI/CD ← اعتبارسنجی ← تأیید دوم ← تولید", 4, [validation, dual]),
            ("فرمان دستی در پنجره‌ی اضطراری", "دسترسی اپراتور ← تأیید دوم ← تولید", 3, [dual]),
        ]:
            path = Path.objects.create(
                assessment=assessment,
                name=name,
                description=description,
                b0=b0,
                b0_confidence=Confidence.MEDIUM,
                b0_rationale="از لاگ پایپ‌لاین و گزارش رخداد.",
            )
            path.evidence.add(pipeline)
            path.control_assessments.add(*controls)
        cells = {
            "S": (3, "اختلال ۶۰ دقیقه · RTO دو ساعت"),
            "D": (2, "تنظیم نادرست قابل اصلاح"),
            "F": (2, "۰٫۰۵٪ درآمد مبنا"),
            "C": (2, "نقض تعهد عادی قابل اصلاح"),
            "R": (2, "یک شکایت رسمی"),
        }
        for scale in self.version.scales.filter(kind="impact"):
            level, rationale = cells.get(scale.code, (1, scale.name))
            for customer in [None, self.banks[0]]:
                detail = ImpactDetail.objects.create(
                    assessment=assessment,
                    customer=customer,
                    scale=scale,
                    level=level if customer else level - 1,
                    rationale=rationale,
                    confidence=Confidence.MEDIUM,
                )
                detail.evidence.add(incident)
        return assessment

    def impact_profile(self, risk, assessment):
        """پروفایل پیامد نیمه‌کاره‌ی یک ارزیابی پیش‌نویس برای صفحه‌ی ۰۶ فیگما: داتین و دو بانک، سطح ۵ داده برای بانک
        ملت، F بانک ملت با مبلغ زیان و پیشنهاد سامانه، یک خانه‌ی نامعلوم بی‌شاهد و یک خانه‌ی ثبت‌نشده."""
        mellat, tejarat = self.banks[0], self.banks[1]
        Customer.objects.filter(pk=mellat.pk).update(financial_basis=5_200 * 10**9)
        risk.customers.set([mellat, tejarat])
        proofs = []
        for title, kind, days_ago in [
            ("گزارش آزمون نفوذ همراه‌بانک", Evidence.Kind.TEST, 30),
            ("گزارش رخداد مشابه ۱۴۰۳", Evidence.Kind.INCIDENT, 300),
            ("بند ۱۲ قرارداد پشتیبانی بانک‌ها", Evidence.Kind.BIA_CONTRACT, 90),
        ]:
            item = Evidence.objects.create(
                title=title, kind=kind, reliability=Evidence.Reliability.HIGH, summary=title,
                source="واحد امنیت اطلاعات", observed_on=self.today - timedelta(days=days_ago), owner=self.sara,
            )
            item.risks.add(risk)
            proofs.append(item)
        unknown = "داده‌ی کافی از واکنش مشتریان بانک تجارت نیست؛ نظرسنجی آذر نتیجه را روشن می‌کند."
        cells = {
            "S": [(1, "اختلال جزئی در محیط آزمون همراه‌بانک", 1), (0, "خدمت بانک قطع نمی‌شود", 1),
                  (0, "خدمت بانک قطع نمی‌شود", 1)],
            "D": [(4, "افشای داده‌ی دو بانک در محیط آزمون", 2), (5, "افشای اطلاعات هویتی مشتریان", 3),
                  (4, "افشای اطلاعات ۲۸۰ هزار حساب", 2)],
            "F": [(2, "هزینه‌ی پاسخ به رخداد و جریمه‌ی قراردادی", 1),
                  (3, "هزینه‌ی اطلاع‌رسانی به مشتریان، پاسخ به رخداد و جریمه‌ی قراردادی بر اساس بند ۱۲ قرارداد؛ "
                      "تجربه‌ی رخداد مشابه ۱۴۰۳.", 1), None],
            "C": [(3, "نقض بند محرمانگی قرارداد", 1), (4, "نقض الزام حفاظت از داده‌ی بانک مرکزی", 2),
                  (3, "نقض بند محرمانگی قرارداد", 1)],
            "R": [(3, "آسیب به اعتماد بانک‌ها", 1), (4, "پوشش رسانه‌ای و شکایت مشتریان", 1), ("?", unknown, 0)],
        }
        columns = [None, mellat, tejarat]
        for scale in self.version.scales.filter(kind="impact"):
            for customer, cell in zip(columns, cells.get(scale.code, []), strict=False):
                if cell is None:
                    continue
                level, rationale, proof_count = cell
                is_mellat_f = scale.code == "F" and customer == mellat
                detail = ImpactDetail.objects.create(
                    assessment=assessment, customer=customer, scale=scale,
                    level=None if level == "?" else level, rationale=rationale,
                    confidence="" if level == "?" else Confidence.MEDIUM,
                    actual_value=42 * 10**9 if is_mellat_f else None,
                    basis=5_200 * 10**9 if is_mellat_f else None,
                )
                detail.evidence.add(*proofs[:proof_count])
        return assessment

    def risks(self):
        # برنامه‌ی درمان: منتظر طرح، طرح منتظر تأیید مالک، طرح تأییدشده
        leak = self.risk("نشت داده‌ی مشتریان از محیط آزمون", "SRV-IPG", self.sara, "T1", S.TREATMENT_PLAN)
        self.entered(leak, S.TREATMENT_PLAN, 2)
        self.assessment(leak, 4, 20)

        satna = self.risk(
            "قطع سرویس انتقال وجه ساتنا به‌دلیل خرابی پایگاه داده‌ی اصلی", "SRV-SATNA", self.ali, "T3",
            S.TREATMENT_PLAN, channel=Risk.Channel.QUESTIONNAIRE,
        )
        self.record(satna)

        sms = self.risk("وابستگی به ارائه‌دهنده‌ی پیامک", "SRV-SMS", self.sara, "T5", S.TREATMENT_PLAN)
        self.entered(sms, S.TREATMENT_PLAN, 10)
        sms_plan = self.plan(sms, self.assessment(sms, 2, 8))
        self.action(sms_plan, "قرارداد پشتیبان با ارائه‌دهنده‌ی دوم پیامک", AS.APPROVED, self.mehdi, self.sara, 25)

        # در اجرای درمان: اقدام‌ها در وضعیت‌های مختلف (تابلوی درمان)
        tls = self.risk("انقضای گواهی‌های TLS درگاه‌ها", "SRV-IPG", self.sara, "T3", S.TREATMENT)
        tls_plan = self.plan(tls, self.assessment(tls, 2, 9))
        self.action(tls_plan, "پایش خودکار انقضای گواهی‌ها", AS.VERIFIED, self.mehdi, self.sara, -5)
        self.action(tls_plan, "تمدید خودکار گواهی‌ها با ACME", AS.VERIFIED, self.mehdi, self.sara, -2)

        db = self.risk("از دست رفتن داده‌ی پایگاه داده‌ی تراکنش", "SRV-CORE", self.ali, "T3", S.TREATMENT)
        db_plan = self.plan(db, self.assessment(db, 3, 15))
        self.action(db_plan, "تکثیر هم‌زمان پایگاه داده به سایت پشتیبان", AS.IN_PROGRESS, self.sara, self.ali, 0)
        self.action(db_plan, "آزمون بازیابی نسخه‌ی پشتیبان ماهانه", AS.READY, self.mehdi, self.sara, 5)
        self.action(db_plan, "خرید مجوز ابزار پایش پایگاه داده", AS.BLOCKED, self.sara, self.ali, -8)

        pam = self.risk("دسترسی ممتاز بدون کنترل به سرورهای تولید", "SRV-HSM", self.maryam, "T1", S.TREATMENT)
        pam_plan = self.plan(pam, self.assessment(pam, 4, 18))
        self.action(pam_plan, "دو مانع مستقل روی مسیر دسترسی ممتاز", AS.IN_PROGRESS, self.mehdi, self.maryam, 12)
        self.action(pam_plan, "پوشش همه‌ی حساب‌های ممتاز با PAM", AS.PLANNED, self.mehdi, self.maryam, 40)
        self.action(pam_plan, "ثبت جلسه‌های ممتاز و بازبینی هفتگی", AS.FAILED, self.mehdi, self.maryam, -3)

        # پذیرش‌ها: منقضی، منتظر امضا (۱ از ۲)، معتبر رو به انقضا
        archive = self.risk("ناسازگاری بایگانی اسناد با الزام نگهداری", "SRV-ARC", self.hossein, "T8", S.REVIEW)
        archive_current = self.assessment(archive, 1, 4)
        self.acceptance(archive, archive_current, RiskAcceptance.Status.EXPIRED, -2, signatures=2)

        portal = self.risk("کندی پرتال پشتیبانی در ساعات اوج", "SRV-PORTAL", self.hossein, "T4", S.REVIEW)
        self.acceptance(portal, self.assessment(portal, 2, 6), RiskAcceptance.Status.ACTIVE, 7, signatures=2)

        # نمونه‌ی صفحه‌ی ۰۸ فیگما: مالک ریسک امضا کرده و امضای مدیر واحد عملیات زیرساخت مانده است.
        sms2 = self.risk("وابستگی به ارائه‌دهنده‌ی واحد پیامک", "SRV-SMS", self.hossein, "T5", S.REVIEW)
        self.acceptance(
            sms2, self.assessment(sms2, 2, 7), RiskAcceptance.Status.PENDING, 178, signatures=1, start_ago=1,
            scope="ارسال پیامک تراکنش و رمز یک‌بارمصرف برای بانک ملت و بانک تجارت از طریق یک ارائه‌دهنده.",
            reason="قرارداد ارائه‌دهنده‌ی دوم تا اسفند نهایی می‌شود؛ راه‌اندازی موازی پیش از آن هزینه‌ای بیش از زیان "
            "برآوردی دارد.",
            alternatives="کاهش با ارائه‌دهنده‌ی دوم (در اجرا) و انتقال از راه بند جریمه‌ی SLA.",
            compensating_controls="پایش لحظه‌ای نرخ تحویل پیامک و مسیر جایگزین اعلان درون‌برنامه‌ای برای رمز "
            "یک‌بارمصرف.",
            conditions="نرخ تحویل بالای ۹۸٪؛ هر قطعی بیش از ۳۰ دقیقه به کارگروه امنیت گزارش شود.",
            customer_constraints="حد تحمل اعلام‌شده‌ی بانک ملت (قطعی کمتر از ۱ ساعت) با این پذیرش نقض نمی‌شود.",
            monitoring="نرخ تحویل روزانه، تأخیر میانگین تحویل و تعداد قطعی ماهانه.",
            revocation_triggers="دو قطعی بیش از ۱ ساعت در یک ماه، یا تغییر مالکیت ارائه‌دهنده.",
        )

        # در ارزیابی: یکی در کنترل کیفیت، یکی پیش‌نویس
        hsm = self.risk("خرابی HSM و توقف امضای تراکنش", "SRV-HSM", self.maryam, "T3", S.ASSESSMENT)
        self.qc_assessment(hsm)
        mb = self.risk("حمله‌ی credential stuffing به همراه‌بانک", "SRV-MB", self.hossein, "T1", S.ASSESSMENT)
        self.impact_profile(mb, self.assessment(mb, 3, 10, status=Assessment.Status.DRAFT))
        self.analysis_assessment()

        # سنجش‌شده و منتظر «ارسال به تصمیم» (فیگما ۱۳): یکی بحرانی، یکی با کف پیامد از امتیاز ۵ به «بالا»
        ransom = self.risk("حمله‌ی باج‌افزاری به خدمت بانکی", "SRV-IPG", self.sara, "T1", S.ASSESSMENT)
        self.assessment(ransom, 4, 25, days_ago=1)
        outage = self.risk("خرابی هم‌زمان مرکز داده‌ی اصلی و پشتیبان", "SRV-CORE", self.ali, "T7", S.ASSESSMENT)
        floor = self.assessment(outage, 3, 5, days_ago=2)
        Assessment.objects.filter(pk=floor.pk).update(
            base_level=self.levels[2],
            likelihood_low=1,
            likelihood_high=1,
            impact_low=5,
            impact_high=5,
            escalation_reasons=["کف پیامد ۵: حداقل «بالا»"],
        )

        # شناسایی: ثبت‌شده، ارسال‌شده، در پاسخ به پرسش‌ها
        self.risk("قطع برق مرکز داده‌ی اصلی", "SRV-CORE", self.ali, "T7", S.REGISTERED)
        self.risk("وابستگی پایا به یک نیروی کلیدی", "SRV-PAYA", self.hossein, "T6", S.SUBMITTED)
        question = self.risk(
            "نبود سایت پشتیبان فعال برای سرویس پیامک", "SRV-SMS", self.ali, "T7", S.QUESTIONS, ready=False
        )
        self.risk("خطای پیکربندی فایروال شبکه‌ی مرکزی", "SRV-CORE", self.ali, "T1", S.REGISTERED, ready=False)
        self.risk("ادغام‌شدنی: قطع ساتنا در ساعات تسویه", "SRV-SATNA", self.hossein, "T3", S.SUBMITTED)

        # بسته و ردشده
        closed = self.risk("انقضای مجوز نرم‌افزار پشتیبان‌گیری", "SRV-ARC", self.ali, "T2", S.CLOSED)
        self.assessment(closed, 1, 2, days_ago=200)
        self.risk("کپی تکراری ریسک قطع ساتنا", "SRV-SATNA", self.hossein, "T3", S.REJECTED)

        # اعلان‌های پایش نخوانده‌ی سارا
        for index, (risk, message) in enumerate(
            [
                (leak, "مهلت طرح مواجهه‌ی ریسک بحرانی فردا تمام می‌شود."),
                (archive, "پذیرش ریسک منقضی شد؛ ادامه یعنی پذیرش تازه."),
                (question, "پرسش ریسک سه روز است بی‌پاسخ مانده است."),
            ]
        ):
            MonitoringNotice.objects.create(
                recipient=self.sara,
                risk=risk,
                event_key=f"demo-{index}",
                message=message,
                href=risk.get_absolute_url(),
            )
