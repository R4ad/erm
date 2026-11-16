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
from apps.actions.monitoring import record_trigger, run_monitoring
from apps.actions.models import (
    AcceptanceSignature,
    ActionUpdate,
    MonitoringNotice,
    RiskAcceptance,
    RiskReview,
    TreatmentAction,
    TreatmentPlan,
)
from apps.assessments.models import Assessment, AssessmentReview, ImpactDetail, Path
from apps.catalog.models import Commitment, Customer, Dependency, Responsibility, Service, Supplier
from apps.controls.effectiveness import Thresholds
from apps.controls.models import Control, ControlAssessment, ControlTestSample, IsoControl
from apps.core.choices import Confidence
from apps.core.models import Comment
from apps.methodology.models import MethodParameter, MethodVersion
from apps.methodology.services import MethodTables, copy_version, save_with_reason
from apps.organization.models import OrgUnit
from apps.questionnaires.models import Option, Question, Questionnaire, Response
from apps.risks.identification import narrative
from apps.risks.models import Coverage, Evidence, ExternalLink, IdentificationDraft, Risk, RiskCategory, RiskScenario
from apps.risks.models import ScenarioProposal
from apps.risks.scenario_proposals import propose
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
        self.method_draft()
        self.access()
        self.scenario_library()
        self.monitoring()
        self.control_test()
        self.committee()
        self.verification()
        self.post_action()
        self.stdout.write(self.style.SUCCESS(f"{Risk.objects.count()} ریسک و {User.objects.count()} کاربر ساخته شد."))

    SCENARIOS = [
        # عنوان، دسته، خدمت، رویداد، عامل آغازگر، پیامد، هدف یا تعهد، مشتری، نمونه‌های ریسک (با عنوان)
        (
            "نشت داده‌ی تراکنش در محیط غیرتولید",
            "T1",
            "SRV-IPG",
            "خروج داده‌ی واقعی مشتری از محیط آزمون",
            "کپی داده‌ی تولید بدون پوشاندن در محیط آزمون",
            "افشای داده‌ی کارت و تراکنش",
            "حفظ محرمانگی داده",
            "بانک‌های مشتری",
            ["نشت داده‌ی مشتریان از محیط آزمون"],
        ),
        (
            "نفوذ از طریق آسیب‌پذیری یا اعتبارنامه‌ی درگاه‌های اینترنتی",
            "T1",
            "SRV-IPG",
            "نفوذ به درگاه بانکی",
            "آسیب‌پذیری وصله‌نشده یا اعتبارنامه‌ی لورفته",
            "تراکنش غیرمجاز و توقف درگاه",
            "پرداخت اینترنتی امن",
            "بانک‌های مشتری",
            ["آسیب‌پذیری بحرانی قابل بهره‌برداری در درگاه اینترنتی", "حمله‌ی credential stuffing به همراه‌بانک"],
        ),
        (
            "باج‌افزار در خدمت بانکی",
            "T1",
            "SRV-IPG",
            "رمزگذاری داده و سرورهای خدمت",
            "ورود بدافزار از ایستگاه کاری یا سرور آسیب‌پذیر",
            "توقف خدمت تا بازیابی از پشتیبان",
            "تداوم خدمت",
            "بانک‌های مشتری",
            ["حمله‌ی باج‌افزاری به خدمت بانکی"],
        ),
        (
            "باج‌افزار در ایستگاه‌های کاری اپراتور",
            "T1",
            "SRV-PORTAL",
            "رمزگذاری ایستگاه‌های کاری پشتیبانی",
            "پیوست آلوده‌ی ایمیل",
            "توقف پاسخ‌گویی به بانک‌ها",
            "پشتیبانی بانک‌ها",
            "بانک‌های مشتری",
            [],
        ),
        (
            "خرابی HSM و توقف امضای تراکنش",
            "T3",
            "SRV-HSM",
            "توقف امضای تراکنش",
            "خرابی ماژول HSM بدون جایگزین گرم",
            "توقف تراکنش در همه‌ی بانک‌ها",
            "امضای تراکنش",
            "همه‌ی بانک‌ها",
            ["خرابی HSM و توقف امضای تراکنش"],
        ),
        (
            "انقضای گواهی دیجیتال درگاه‌ها",
            "T3",
            "SRV-IPG",
            "قطع ارتباط امن درگاه",
            "نبود پایش انقضای گواهی",
            "خطای اتصال مشتریان",
            "ارتباط امن",
            "بانک‌های مشتری",
            ["انقضای گواهی‌های TLS درگاه‌ها", "از دست رفتن داده‌ی پایگاه داده‌ی تراکنش"],
        ),
        (
            "از دست رفتن مرکز داده‌ی اصلی",
            "T7",
            "SRV-CORE",
            "توقف هم‌زمان خدمات مرکز داده",
            "قطع برق یا حادثه‌ی محیطی بدون سایت پشتیبان آماده",
            "توقف همه‌ی خدمات تا بازیابی",
            "تداوم خدمت",
            "همه‌ی بانک‌ها",
            [
                "خرابی هم‌زمان مرکز داده‌ی اصلی و پشتیبان",
                "قطع برق مرکز داده‌ی اصلی",
                "نبود سایت پشتیبان فعال برای سرویس پیامک",
            ],
        ),
        (
            "وابستگی به دانش کلیدی یک نفر در پشتیبانی",
            "T6",
            "SRV-PAYA",
            "توقف پشتیبانی تخصصی",
            "نبود جانشین آموزش‌دیده",
            "تأخیر رفع حادثه",
            "پشتیبانی خدمت",
            "بانک‌های مشتری",
            ["وابستگی پایا به یک نیروی کلیدی"],
        ),
        (
            "عدم انطباق با الزام نظارتی یا نگهداری اسناد",
            "T8",
            "SRV-SATNA",
            "ادامه‌ی پردازش خارج از الزام",
            "پیگیری‌نشدن تغییر الزام بانک مرکزی",
            "جریمه و توقف مجوز",
            "انطباق نظارتی",
            "بانک مرکزی",
            ["ادامه‌ی پردازش بدون مجوز نظارتی به‌روز", "ناسازگاری بایگانی اسناد با الزام نگهداری"],
        ),
        (
            "نقض SLA پاسخ‌گویی در اوج بار",
            "T4",
            "SRV-PORTAL",
            "کندی پاسخ‌گویی خدمت",
            "ظرفیت ناکافی در ساعات اوج",
            "نقض SLA مشتری",
            "پاسخ‌گویی در مهلت SLA",
            "بانک‌های مشتری",
            ["کندی پرتال پشتیبانی در ساعات اوج"],
        ),
    ]
    # نمونه‌هایی که به سناریوهای قبلی همین داده‌ی نمایشی وصل می‌شوند
    LINKS = {
        "استفاده‌ی نامجاز از دسترسی ممتاز باقی‌مانده": ["دسترسی ممتاز بدون کنترل به سرورهای تولید"],
        "اعمال بسته‌ی انتشار نامعتبر در تولید": ["اعمال بسته‌ی انتشار نامعتبر در تولید"],
        "خطای پیکربندی در پنجره‌ی تغییر": ["خطای پیکربندی فایروال شبکه‌ی مرکزی"],
        "قطع خدمت پرداخت به‌دلیل خرابی پایگاه داده": ["ادغام‌شدنی: قطع ساتنا در ساعات تسویه"],
        "قطع خدمت ارتباطی تأمین‌کننده": [
            "قطع خدمت ارتباطی تأمین‌کننده",
            "وابستگی به ارائه‌دهنده‌ی پیامک",
            "وابستگی به ارائه‌دهنده‌ی واحد پیامک",
        ],
    }

    def scenario_library(self):
        """کتابخانه‌ی سناریو (فیگما ۲۱): سناریوهای مرجع بیشتر در دسته‌های T1 تا T8، نمونه‌های ریسک موجود زیر آن‌ها، یک
        سناریوی بی‌نمونه و دو پیشنهاد ادغام در انتظار تصمیم که با همان سرویس پیشنهاد ثبت می‌شوند."""
        scenarios = {scenario.title: scenario for scenario in RiskScenario.objects.all()}
        for title, category, service, event, conditions, consequence, objective, customer, _ in self.SCENARIOS:
            scenarios[title] = RiskScenario.objects.create(
                title=title,
                category=RiskCategory.objects.get(code=category),
                service=self.services[service],
                service_name_snapshot=self.services[service].name,
                event=event,
                conditions=conditions,
                consequence=consequence,
                objective=objective,
                customer_text=customer,
            )
        links = {**self.LINKS, **{row[0]: row[-1] for row in self.SCENARIOS}}
        for title, risk_titles in links.items():
            scenario = scenarios[title]
            Risk.objects.filter(title__in=risk_titles, scenario__isnull=True).update(
                scenario=scenario, scenario_version=scenario.version
            )
        release, config = scenarios["اعمال بسته‌ی انتشار نامعتبر در تولید"], scenarios["خطای پیکربندی در پنجره‌ی تغییر"]
        reason = "عامل آغازگر مشابه، اما دامنه و کنترل‌ها متفاوت‌اند؛ ممکن است تفکیک مناسب‌تر باشد."
        propose(release, self.neda, ScenarioProposal.Kind.MERGE, reason, target=config)
        satna = scenarios["توقف پردازش ساتنا"]
        reason = "هر دو توقف پردازش ساتنا با خرابی پایگاه داده‌اند و کنترل و مالک یکسانی دارند."
        target = scenarios["قطع خدمت پرداخت به‌دلیل خرابی پایگاه داده"]
        propose(satna, self.neda, ScenarioProposal.Kind.MERGE, reason, target=target)

    FAILED_SAMPLES = {
        6: "تأیید دوم پس از انتشار ثبت شد",
        18: "گام تأیید با نقش اضطراری دور زده شد",
        34: "تأییدکننده‌ی دوم همان مجری بود",
    }

    def control_test(self):
        """برگه‌ی آزمون کنترل (فیگما ۲۲): آزمون تأیید دوم انتشار با ۴۰ نمونه از سه مسیر و سه استثنا در مسیر اضطراری،
        شکاف شناخته‌شده‌ای که E3 سال گذشته را به E2 رسانده، آزمون سال گذشته با شاهد منسوخ، و ریسک دیگری که همین
        کنترل را دارد و در بازسنجی است. بعد از زمان‌بند پایش می‌آید تا اعلان‌های صفحه‌ی ۲۰ عوض نشوند."""
        test = ControlAssessment.objects.filter(control__title="تأیید دوم انتشار (چهار چشم)").order_by("-pk").first()
        if test is None:
            return
        ControlAssessment.objects.filter(pk=test.pk).update(
            population="۳۱۲ انتشار در دوره · ۲۸۹ عادی و ۲۳ اضطراری",
            test_method="بازبینی نمونه‌ای سوابق انتشار + اجرای عملی در محیط پیش‌تولید",
            sample_size=40,
            sample_rationale="اهمیت بالای کنترل؛ مسیر اضطراری عمداً بیش‌نمونه‌گیری شد",
            critical_points="انتشار عادی، انتشار اضطراری و بازگردانی نسخه",
            critical_points_covered=True,
            known_gap=True,
            failures="مسیر انتشار اضطراری از گام تأیید دوم عبور نمی‌کند",
            rationale="استثناها مسیر اضطراری را کاملاً باز می‌گذارند؛ کنترل تا رفع شکاف در سطح E2 می‌ماند.",
            verified_by=self.neda,
        )
        Control.objects.filter(pk=test.control_id).update(
            objective="در صورت اجرا، تغییر نامعتبر را پیش از رسیدن به تولید متوقف می‌کند."
        )
        # شواهد آزمون پیش از تیکت‌های CAB دیده شده‌اند تا شاهد اول این کنترل در صفحه‌ی ۱۲ همان بماند
        for title, summary, days_ago in [
            ("گزارش آزمون نمونه‌ای انتشار", "۴۰ نمونه از سه مسیر انتشار", 14),
            ("لاگ خط لوله‌ی انتشار · ۳۱۲ رکورد", "سوابق همه‌ی انتشارهای دوره", 14),
            ("صورت‌جلسه‌ی بررسی استثناها", "بررسی سه استثنای مسیر اضطراری", 13),
        ]:
            item = Evidence.objects.create(
                title=title,
                kind=Evidence.Kind.TEST,
                reliability=Evidence.Reliability.HIGH,
                summary=summary,
                source="واحد DevOps",
                observed_on=self.today - timedelta(days=days_ago),
                owner=self.sara,
            )
            test.evidence.add(item)
        emergency = {2, 6, 10, 14, 18, 22, 26, 30, 34, 38}
        rollback = {12, 25, 37}
        people = [self.ali.get_full_name(), self.maryam.get_full_name(), self.sara.get_full_name()]
        for index in range(40):
            path = "انتشار اضطراری" if index in emergency else "بازگردانی نسخه" if index in rollback else "انتشار عادی"
            note = self.FAILED_SAMPLES.get(index, "")
            ControlTestSample.objects.create(
                assessment=test,
                reference=f"REL-1405-{2231 + index * 4}",
                occurred_on=test.test_from + timedelta(days=index * 30 // 39),
                path=path,
                performer="" if note else people[index % len(people)],
                passed=not note,
                note=note,
            )
        proof = Evidence.objects.create(
            title="آزمون سال گذشته",
            kind=Evidence.Kind.TEST,
            reliability=Evidence.Reliability.HIGH,
            summary="آزمون ۴۰ انتشار در سال ۱۴۰۴",
            source="واحد DevOps",
            observed_on=self.today - timedelta(days=380),
            owner=self.sara,
        )
        previous = ControlAssessment(
            control=test.control,
            method_version=self.version,
            scope=test.scope,
            exists=True,
            design_ok=True,
            operating_ok=True,
            coverage_pct=100,
            critical_points_covered=True,
            sample_size=40,
            test_from=self.today - timedelta(days=410),
            test_to=self.today - timedelta(days=380),
            e=3,
            confidence=Confidence.MEDIUM,
            rationale="شرط‌های E3 در آزمون سال گذشته برقرار بود.",
            verified_by=self.neda,
            created_by=self.sara,
        )
        previous.save()
        previous.evidence.add(proof)
        ControlAssessment.objects.filter(pk=previous.pk).update(created_at=timezone.now() - timedelta(days=380))
        gateway = Risk.objects.filter(title="آسیب‌پذیری بحرانی قابل بهره‌برداری در درگاه اینترنتی").first()
        if gateway:
            gateway.controls.add(test.control)

    def post_action(self):
        """ارزیابی پس از اقدام (فیگما ۲۵): ریسک انتشار ساتنا با ارزیابی ذاتی، جاری قبلی (پیامد ۳)، هدف طرح (B۲ و پیامد ۲)
        و ارزیابی جاری تازه با شواهد واقعی که با موتور محاسبه تأیید شده است. کنترل انتشار اضطراری در آزمون اخیر از E۳
        به E۲ افت کرد و B روی ۳ ماند، ولی پروفایل پیامد پایین آمد. اقدام‌های طرح تأیید شده‌اند و تصمیم مالک مانده است."""
        from apps.assessments.review import review

        tables = MethodTables(self.version)
        risk = self.risk("انتشار ساتنا", "SRV-SATNA", self.hossein, "T2", S.ASSESSMENT)
        risk.description = "بسته‌ی انتشار یا تغییر نادرست در ساتنا ممکن است به اختلال تسویه‌ی بین‌بانکی برسد."
        risk.initiator = "ارائه‌ی بسته یا تغییر نادرست به فرایند انتشار ساتنا"
        risk.count_unit = "هر انتشار یا تغییر نادرست یکتا"
        risk._history_user = self.sara
        risk.save()
        risk.customers.set(self.banks[:2])

        def evidence(title, kind, days_ago):
            item = Evidence.objects.create(
                title=title, kind=kind, reliability=Evidence.Reliability.HIGH, summary=title,
                source="واحد DevOps", observed_on=self.today - timedelta(days=days_ago), owner=self.maryam,
            )
            item.risks.add(risk)
            return item

        history = evidence("سوابق انتشار و رخدادهای ساتنا در ۱۲ ماه", Evidence.Kind.INCIDENT, 150)
        pipeline = evidence("آزمون کنترل انتشار پایپ‌لاین", Evidence.Kind.TEST, 140)
        _, gate = self.control(risk, "کنترل انتشار پایپ‌لاین رسمی", Control.Kind.PREVENTIVE, True, "8.32", 3, pipeline)
        emergency, approval = self.control(
            risk, "تأیید دومرحله‌ای انتشار اضطراری", Control.Kind.PREVENTIVE, True, "8.32", 3, pipeline
        )
        _, lock = self.control(risk, "قفل تغییر مستقیم پایگاه داده", Control.Kind.PREVENTIVE, True, "8.15", 4, pipeline)
        ControlAssessment.objects.filter(pk__in=[gate.pk, approval.pk, lock.pk]).update(
            test_from=self.today - timedelta(days=160), test_to=self.today - timedelta(days=140)
        )

        def level_rank(likelihood, impact):
            return tables.decision_level(likelihood, impact).rank

        inherent = self.assessment(risk, level_rank(4, 3), 12, kind=Assessment.Kind.INHERENT, days_ago=130)
        Assessment.objects.filter(pk=inherent.pk).update(
            a=4, a_basis="forward", a_rationale="انتشارهای ماهانه بدون کنترل انتشار.", b_low=4, b_high=4,
            likelihood_low=4, likelihood_high=4, impact_low=3, impact_high=3,
            assumptions="محیط بدون کنترل انتشار و بازگردانی فرض شد.",
        )

        def approved_assessment(paths, levels, proofs, days_ago):
            assessment = Assessment(
                risk=risk, kind=Assessment.Kind.CURRENT, method_version=self.version, created_by=self.maryam,
                horizon_months=12, a=4, a_basis="forward", a_confidence=Confidence.MEDIUM,
                a_rationale="انتشارهای ماهانه و دو انتشار اضطراری در سال، با سابقه‌ی یک بسته‌ی نادرست.",
            )
            assessment._history_user = self.maryam
            assessment.save()
            assessment.a_evidence.add(history)
            for name, b0, controls in paths:
                path = Path.objects.create(
                    assessment=assessment, name=name, description=name, b0=b0, b0_confidence=Confidence.MEDIUM,
                    b0_rationale="از سوابق انتشار و آزمون‌های کنترل.",
                )
                path.evidence.add(proofs[0])
                path.control_assessments.add(*controls)
            columns = [None, *risk.customers.order_by("name")]
            for scale in self.version.scales.filter(kind="impact"):
                level, rationale = levels[scale.code]
                for customer in columns:
                    detail = ImpactDetail.objects.create(
                        assessment=assessment, customer=customer, scale=scale, level=level, rationale=rationale,
                        confidence=Confidence.MEDIUM,
                    )
                    detail.evidence.add(proofs[-1])
            Assessment.objects.filter(pk=assessment.pk).update(status=Assessment.Status.IN_QC)
            AssessmentReview.objects.create(
                assessment=assessment, action=AssessmentReview.Action.SUBMIT, created_by=self.maryam
            )
            assessment.refresh_from_db()
            review(assessment, self.neda, AssessmentReview.Action.APPROVE)
            moment = timezone.now() - timedelta(days=days_ago)
            Assessment.objects.filter(pk=assessment.pk).update(approved_at=moment)
            assessment.reviews.update(created_at=moment)
            assessment.refresh_from_db()
            return assessment

        before = approved_assessment(
            [
                ("مسیر ۱ · انتشار عادی", 4, [gate, approval]),
                ("مسیر ۲ · انتشار اضطراری", 4, [approval]),
                ("مسیر ۳ · تغییر مستقیم در پایگاه داده", 3, []),
            ],
            {
                "S": (3, "اختلال تسویه تا یک چرخه با بازگردانی دستی"),
                "D": (2, "ناسازگاری محدود داده‌ی تراکنش"),
                "F": (2, "جبران مشتری برای دو چرخه‌ی تسویه"),
                "C": (2, "گزارش به بانک مرکزی"),
                "R": (2, "شکایت بانک‌های عضو"),
            },
            [history],
            100,
        )
        Risk.objects.filter(pk=risk.pk).update(status=S.TREATMENT_PLAN)
        target = self.assessment(risk, level_rank(3, 2), 6, kind=Assessment.Kind.TARGET, days_ago=95)
        Assessment.objects.filter(pk=target.pk).update(
            a=4, a_basis="forward", a_rationale="همان A جاری؛ طرح فقط B و پیامد را کم می‌کند.", b_low=2, b_high=2,
            likelihood_low=3, likelihood_high=3, impact_low=2, impact_high=2,
        )
        plan = self.plan(risk, before)
        TreatmentPlan.objects.filter(pk=plan.pk).update(
            target_assessment=target, rationale="انتشار تدریجی با بازگردانی خودکار و قفل تغییر مستقیم پایگاه داده."
        )
        plan.refresh_from_db()
        Risk.objects.filter(pk=risk.pk).update(status=S.TREATMENT)
        for title in ("انتشار تدریجی با بازگردانی خودکار", "قفل تغییر مستقیم پایگاه داده‌ی ساتنا"):
            self.action(plan, title, TreatmentAction.Status.VERIFIED, self.mehdi, self.ali, -20)

        # کنترل انتشار اضطراری در آزمون نمونه‌ای اخیر E۲ گرفت: محرک بازبینی و آزمون تازه.
        sample = evidence("آزمون نمونه‌ای انتشار اضطراری · نتیجه E2", Evidence.Kind.TEST, 25)
        retest = ControlAssessment(
            control=emergency, method_version=self.version, scope=f"دامنه‌ی {risk.service.name}", exists=True,
            design_ok=False, operating_ok=True, coverage_pct=60, critical_points_covered=False, sample_size=5,
            test_from=self.today - timedelta(days=40), test_to=self.today - timedelta(days=25), sustained=False, e=2,
            confidence=Confidence.MEDIUM, rationale="دو انتشار اضطراری بدون تأیید دوم اجرا شد.", created_by=self.sara,
        )
        retest.save()
        retest.evidence.add(sample)
        trigger = RiskReview.objects.create(
            risk=risk, assessment=before, trigger=RiskReview.Trigger.CONTROL,
            reason=f"افت E کنترل {emergency.code} در آزمون نمونه‌ای انتشار اضطراری", due=self.today - timedelta(days=20),
            responsible=self.hossein, created_by=self.sara, result="در ارزیابی پس از اقدام دیده شد.",
            completed_at=timezone.now() - timedelta(days=12), completed_by=self.hossein,
        )
        RiskReview.objects.filter(pk=trigger.pk).update(created_at=timezone.now() - timedelta(days=24))

        Risk.objects.filter(pk=risk.pk).update(status=S.ASSESSMENT)
        report = evidence("گزارش تأیید نتیجه‌ی اقدام‌های طرح", Evidence.Kind.TEST, 20)
        rollback = evidence("لاگ بازگردانی خودکار · ۱۲ انتشار", Evidence.Kind.TEST, 15)
        approved_assessment(
            [
                ("مسیر ۱ · انتشار عادی", 4, [gate, retest]),
                ("مسیر ۲ · انتشار اضطراری", 4, [gate]),
                ("مسیر ۳ · تغییر مستقیم در پایگاه داده", 3, [lock]),
            ],
            {
                "S": (2, "انتشار تدریجی و بازگردانی خودکار ۵ دقیقه‌ای؛ اختلال کمتر از یک‌چهارم RTO"),
                "D": (2, "ناسازگاری محدود داده‌ی تراکنش"),
                "F": (1, "جبران مشتری به یک چرخه‌ی تسویه محدود شد"),
                "C": (2, "گزارش به بانک مرکزی"),
                "R": (1, "اختلال کوتاه‌تر؛ واکنش مستند مشتری در حد پرسش عملیاتی ماند"),
            },
            [report, sample, rollback],
            10,
        )

    def verification(self):
        """آزمون و تأیید نتیجه‌ی اقدام (فیگما ۲۴): اقدام «آزمون بازیابی نسخه‌ی پشتیبان ماهانه» آماده‌ی آزمون است؛ اجرای
        اول ناموفق بود و اقدام به «در اجرا» برگشت، اجرای دوم همه‌ی معیارهای دامنه را برآورد و یک معیار خارج از دامنه
        ماند. تأییدکننده‌ی مستقل سارا محمدی است."""
        from apps.actions.models import ActionCriterion, ActionTestRun

        action = TreatmentAction.objects.get(title="آزمون بازیابی نسخه‌ی پشتیبان ماهانه")
        risk = action.plan.risk
        action.test_setting = "مانور در پنجره‌ی تغییر شبانه · محیط تولید با ترافیک کنترل‌شده"
        action.save(update_fields=["test_setting"])

        def evidence(title, days_ago):
            item = Evidence.objects.create(
                title=title,
                kind=Evidence.Kind.TEST,
                reliability=Evidence.Reliability.HIGH,
                summary=title,
                source="واحد عملیات زیرساخت",
                observed_on=self.today - timedelta(days=days_ago),
                owner=self.ali,
            )
            item.risks.add(risk)
            return item

        failed_report = evidence("گزارش اجرای اول مانور بازیابی", 12)
        log = evidence("لاگ زمان‌بندی مانور بازیابی", 4)
        evidence("گزارش تطبیق تراکنش‌ها پس از بازیابی", 4)
        evidence("صورت‌جلسه و ضبط مانور بازیابی", 3)
        action.evidence.add(
            *Evidence.objects.filter(
                risks=risk, kind=Evidence.Kind.TEST, observed_on__gte=self.today - timedelta(days=4)
            )
        )
        C = ActionCriterion.Status
        for title, target, result, status, extra in [
            (
                "زمان بازیابی پایگاه داده‌ی تراکنش",
                "حداکثر ۴ ساعت",
                "۲ ساعت و ۴۰ دقیقه",
                C.PASSED,
                {"measures_effect": True, "baseline": "۹ ساعت"},
            ),
            ("صحت داده پس از بازیابی", "تطبیق ۱۰۰٪ تراکنش‌ها", "۱۰۰٪ · ۴۸٬۲۱۰ تراکنش", C.PASSED, {}),
            ("از دست رفتن داده (RPO)", "حداکثر ۵ دقیقه", "۲ دقیقه", C.PASSED, {}),
            ("شواهد اجرا", "لاگ، صورت‌جلسه و ضبط", "کامل · ۳ شاهد", C.PASSED, {}),
            (
                "پایگاه داده‌ی گزارش‌گیری",
                "",
                "",
                C.OUT_OF_SCOPE,
                {
                    "note": "پایگاه داده‌ی گزارش‌گیری در دامنه‌ی این اقدام نبود؛ برای آن اقدام پیگیری جداگانه ایجاد "
                    "می‌شود و نتیجه‌ی این اقدام را مخدوش نمی‌کند."
                },
            ),
        ]:
            ActionCriterion.objects.create(
                action=action, title=title, target=target, result=result, status=status, **extra
            )
        ActionTestRun.objects.create(
            action=action,
            performed_on=self.today - timedelta(days=12),
            passed=False,
            outcome="۶ ساعت و ۱۰ دقیقه",
            description="اسکریپت بازیابی، جدول‌های تسویه را پوشش نمی‌داد؛ زمان از ۴ ساعت گذشت و اقدام اصلاحی ثبت شد.",
            evidence=failed_report,
            created_by=self.mehdi,
        )
        ActionTestRun.objects.create(
            action=action,
            performed_on=self.today - timedelta(days=4),
            passed=True,
            outcome="۲ ساعت و ۴۰ دقیقه",
            description="اسکریپت اصلاح‌شده‌ی بازیابی؛ بازگردانی نسخه‌ی پشتیبان و تطبیق خودکار تراکنش‌ها. ناظر: الهام توکلی.",
            evidence=log,
            created_by=self.mehdi,
        )
        S = TreatmentAction.Status
        now = timezone.now()
        for source, target, by, days, note in [
            (S.APPROVED, S.IN_PROGRESS, self.mehdi, 30, "اجرا شروع شد."),
            (S.IN_PROGRESS, S.READY, self.mehdi, 12, "اجرای اول مانور انجام شد."),
            (S.READY, S.FAILED, self.sara, 11, "زمان بازیابی از ۴ ساعت گذشت و جدول‌های تسویه بازیابی نشدند."),
            (S.FAILED, S.IN_PROGRESS, self.mehdi, 10, "اسکریپت بازیابی برای جدول‌های تسویه اصلاح می‌شود."),
            (S.IN_PROGRESS, S.READY, self.mehdi, 3, "اجرای دوم مانور با اسکریپت اصلاح‌شده انجام شد."),
        ]:
            update = ActionUpdate.objects.create(
                action=action, from_status=source, to_status=target, note=note, created_by=by
            )
            ActionUpdate.objects.filter(pk=update.pk).update(created_at=now - timedelta(days=days))

    def committee(self):
        """جلسه‌ی کمیته‌ی امنیت (فیگما ۲۳): جلسه‌ی فوق‌العاده‌ی امروز در حال برگزاری با هفت حاضر و یک ناظر، شش مورد
        دستور جلسه (دو بحرانی، سه بالا و یک تغییر روش) که دو مصوبه‌اش با همان سرویس ثبت و امضا شده‌اند، پرونده‌ی تصمیم
        مورد در حال بررسی با سه گزینه، و جلسه‌ی قبلی با سه مصوبه‌ی باز که یکی از مهلت گذشته است."""
        from apps.committee import services as committee
        from apps.committee.models import AgendaItem, AgendaOption, Attendee, Meeting

        users = {user.username: user for user in User.objects.all()}
        risks = {
            risk.code: risk
            for risk in Risk.objects.filter(code__in=[f"RK-1405-{n:04d}" for n in (1, 2, 3, 4, 7, 8, 9, 17)])
        }
        privileged = risks["RK-1405-0008"]
        record_trigger(
            privileged,
            self.sara,
            RiskReview.Trigger.INCIDENT,
            "رخداد INC-20462؛ نشست مشکوک با حساب ممتاز مشترک پیمانکار روی سرورهای تولید. ارجاع فوری به کمیته.",
        )
        now = timezone.localtime()
        start = (now - timedelta(minutes=45)).replace(second=0, microsecond=0)
        start = start.replace(minute=start.minute - start.minute % 15)
        if start.date() != now.date():
            start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = min(start + timedelta(minutes=90), now.replace(hour=23, minute=59, second=0, microsecond=0))
        meeting = Meeting.objects.create(
            kind=Meeting.Kind.EXTRAORDINARY,
            reason=f"ریسک بحرانی {privileged.code}",
            date=self.today,
            starts_at=start.time(),
            ends_at=end.time(),
            location="اتاق جلسات طبقه‌ی ۴",
            secretary=self.neda,
            quorum=4,
            status=Meeting.Status.OPEN,
            created_by=self.neda,
        )
        R = Attendee.Role
        for username, role, position, present in [
            ("reza", R.CHAIR, "معاون فناوری", True),
            ("neda", R.SECRETARY, "متولی روش", True),
            ("maryam", R.MEMBER, "مدیر امنیت اطلاعات", True),
            ("mehdi", R.MEMBER, "کارگروه امنیت", True),
            ("e.tavakoli", R.OBSERVER, "ممیزی داخلی", True),
            ("ali", R.MEMBER, "مدیر عملیات", False),
            ("n.sharifi", R.MEMBER, "امور مشتریان", False),
        ]:
            Attendee.objects.create(
                meeting=meeting, user=users[username], role=role, position=position, present=present
            )
        K = AgendaItem.Kind
        items = {}
        for code, kind, detail in [
            ("RK-1405-0008", K.EXPOSURE, "فوری"),
            ("RK-1405-0009", K.PLAN, "بازبینی هفتگی"),
            ("RK-1405-0002", K.EXCEPTION, "عبور از حد تحمل مشتری"),
            ("RK-1405-0004", K.PROGRESS, ""),
            ("RK-1405-0007", K.ACCEPTANCE, "۹۰ روزه"),
        ]:
            items[code] = AgendaItem.objects.create(meeting=meeting, risk=risks[code], kind=kind, detail=detail)
        AgendaItem.objects.create(
            meeting=meeting, title="تصویب ۳ تغییر روش", reference="ParameterSet v6", kind=K.METHOD, presenter=self.neda
        )
        high = self.version.risk_levels.get(rank=3)
        review = items["RK-1405-0008"]
        AgendaOption.objects.create(
            item=review,
            title="کاهش + مهار فوری",
            description="حذف حساب‌های ممتاز مشترک، استقرار PAM با تأیید دوگانه و ضبط جلسه، پایش رفتاری حساب‌ها. هدف: "
            "احتمال ۲ و پیامد ۵ با امتیاز ۱۰؛ پیامد ۵ حداقل در سطح «بالا» می‌ماند.",
            owner_proposal=True,
            cost="۲٫۸ میلیارد ریال",
            target_level=high,
            target_score=10,
            due=self.today + timedelta(days=3),
        )
        AgendaOption.objects.create(
            item=review,
            title="پذیرش موقت ۳۰ روزه",
            description="فقط با ضرورت مستند و اختیار رسمی؛ کنترل جبرانی: پایش ۲۴×۷ مرکز عملیات امنیت. تمدید خودکار "
            "ممنوع است.",
            expires=self.today + timedelta(days=30),
            notes=[{"text": "یادآوری ۷ روزه", "tone": "neutral"}],
        )
        AgendaOption.objects.create(
            item=review,
            title="اجتناب",
            description="قطع دسترسی راه دور پیمانکار به سرورهای تولید تا استقرار PAM؛ پشتیبانی شبانه با تیم داخلی "
            "انجام می‌شود.",
            notes=[
                {"text": "نیازمند تأیید عملیات", "tone": "neutral"},
                {"text": "اثر بر SLA پشتیبانی", "tone": "danger"},
            ],
        )
        committee.start_review(review, self.neda)
        committee.record_resolution(
            items["RK-1405-0007"], self.neda, votes=(4, 0, 0), text="پذیرش موقت ۹۰ روزه با پایش ماهانه‌ی پشتیبان‌گیری"
        )
        plan = committee.record_resolution(
            items["RK-1405-0009"], self.neda, votes=(3, 0, 0), text="تأیید طرح وصله‌ی درگاه با بازبینی هفتگی پیشرفت"
        )
        for signer, minutes in ((users["reza"], 24), (self.neda, 25)):
            committee.sign(plan, signer)
            plan.signatures.filter(user=signer).update(signed_at=start + timedelta(minutes=minutes))
        AgendaItem.objects.filter(pk=plan.pk).update(decided_at=start + timedelta(minutes=23))
        AgendaItem.objects.filter(pk=items["RK-1405-0007"].pk).update(decided_at=start + timedelta(minutes=15))
        # جلسه‌ی عادی دو هفته پیش با سه مصوبه که هنوز انجام نشده‌اند
        before = Meeting.objects.create(
            date=self.today - timedelta(days=14),
            starts_at=start.time(),
            ends_at=end.time(),
            location="اتاق جلسات طبقه‌ی ۴",
            secretary=self.neda,
            status=Meeting.Status.CLOSED,
            created_by=self.neda,
        )
        Meeting.objects.filter(pk=before.pk).update(closed_at=timezone.now() - timedelta(days=14), closed_by=self.neda)
        for subject, days in [
            (risks["RK-1405-0003"], -2),
            (risks["RK-1405-0017"], 10),
            ("بازنگری حد تحمل بانک ملت", 20),
        ]:
            AgendaItem.objects.create(
                meeting=before,
                risk=subject if isinstance(subject, Risk) else None,
                title="" if isinstance(subject, Risk) else subject,
                kind=K.PLAN if isinstance(subject, Risk) else K.METHOD,
                presenter=None if isinstance(subject, Risk) else self.neda,
                status=AgendaItem.Status.APPROVED,
                votes_for=4,
                resolution="مصوب شد",
                decided_at=timezone.now() - timedelta(days=14),
                decided_by=self.neda,
                follow_up_due=self.today + timedelta(days=days),
            )

    def monitoring(self):
        """اعلان‌های پایش (فیگما ۲۰): شکست یک کنترل کلیدی، یک رخداد مهم و یک الزام تازه با همان ثبت محرک سامانه، و
        سپس اجرای زمان‌بند پایش که بازبینی دوره‌ای، انقضای پذیرش و سررسید اقدام را اعلان می‌کند."""
        T = RiskReview.Trigger
        open_risks = Risk.objects.exclude(status__in=Risk.CLOSED_STATUSES).filter(merged_into__isnull=True)
        risk = open_risks.filter(controls__is_key=True).distinct().order_by("pk").first()
        if risk:
            control = risk.controls.filter(is_key=True).first()
            failure = f"شکست کنترل کلیدی {control.code} در آزمون دوره‌ای؛ تأیید دوم انتشار."
            record_trigger(risk, self.sara, T.CONTROL, failure, control=control)
        incident = open_risks.exclude(pk=risk.pk if risk else None).order_by("-pk").first()
        reason = "رخداد مهم INC-20457؛ ارجاع فوری به پاسخ رخداد. امتیازدهی اقدام فوری را به تأخیر نمی‌اندازد."
        record_trigger(incident, self.sara, T.INCIDENT, reason)
        requirement = open_risks.filter(category__code="T8").first() or open_risks.order_by("pk").first()
        review = record_trigger(
            requirement, self.sara, T.REQUIREMENT, "بخشنامه‌ی رمز یک‌بارمصرف تراکنش؛ ثبت منبع و دامنه."
        )
        with transaction.atomic():
            run_monitoring(self.today)
        # پیش از امروز: الزام تازه دیروز آمده و دو اعلان قدیمی‌تر این هفته‌اند؛ یکی هم خوانده شده است
        yesterday, earlier = timezone.now() - timedelta(days=1), timezone.now() - timedelta(days=3)
        MonitoringNotice.objects.filter(event_key=f"trigger:{review.pk}").update(created_at=yesterday)
        older = MonitoringNotice.objects.filter(recipient=self.sara, event_key__startswith="action:").order_by("pk")
        MonitoringNotice.objects.filter(pk__in=list(older.values_list("pk", flat=True)[:2])).update(
            created_at=earlier, read_at=earlier
        )

    def access(self):
        """تعریف کاربر و نقش (فیگما ۱۹): ممیز بیرونی با دسترسی موقت، مدیر پروژه‌ای که مالک یک اقدام است و آخرین ورودها."""
        auditor = self.user("auditor.ext", "ممیز", "بیرونی", Role.VIEWER, job="ممیزی مستقل")
        auditor.set_unusable_password()
        auditor.access_expires = self.today + timedelta(days=20)
        auditor.save(update_fields=["password", "access_expires"])
        karami = self.user("h.karami", "حمید", "کرمی", job="مدیر پروژه‌ی توسعه‌ی ساتنا و پایا")
        karami.set_unusable_password()
        karami.is_active = False
        karami.org_unit = self.units["pay"]
        karami.source = User.Source.AD
        karami.save(update_fields=["password", "is_active", "org_unit", "source"])
        action = TreatmentAction.objects.order_by("pk").first()
        if action:
            TreatmentAction.objects.filter(pk=action.pk).update(owner=karami)
        now = timezone.now()
        for user, ago in ((self.sara, 1), (self.mehdi, 2), (self.maryam, 26), (self.ali, 3), (self.reza, 30 * 24)):
            User.objects.filter(pk=user.pk).update(last_login=now - timedelta(hours=ago))

    def method_draft(self):
        """تعریف متدولوژی (فیگما ۱۷): پیش‌نویس نسخه‌ی بعد با سه تغییر نسبت به نسخه‌ی فعال، هنوز فرستاده‌نشده."""
        draft = copy_version(self.version, self.sara)
        MethodVersion.objects.filter(pk=draft.pk).update(
            title="روش v5 · بازنگری ۱۴۰۵",
            change_notes=(
                "هم‌ترازی با بخش کفایت داده (پوشش ۹۸٪)، افزودن یادآوری دوم پیش از انقضای پذیرش تا هیچ پذیرشی بدون "
                "تصمیم منقضی نشود، و کوتاه‌کردن بازبینی سطح پایین برای کشف زودتر تغییر شرایط."
            ),
            effective_from=self.today + timedelta(days=15),
        )
        changes = {MethodParameter.Key.A_DATA_COVERAGE: 98, MethodParameter.Key.REMINDER_SECOND: 14}
        for row in draft.parameters.filter(key__in=list(changes)):
            row.value = changes[row.key]
            save_with_reason(row, self.sara, "بازنگری ۱۴۰۵")
        low = draft.risk_levels.get(rank=1)
        low.review_value = 4
        save_with_reason(low, self.sara, "بازنگری ۱۴۰۵")
        # برچسب‌های نمایشی سطوح S (فیگما ۲۷)؛ معیارها همان نسخه‌ی فعال‌اند.
        tags = {
            0: "بدون اثر",
            1: "غیرحیاتی · داخلی؛ تا یک‌چهارم RTO",
            2: "حیاتی · تا یک‌چهارم RTO؛ غیرحیاتی · تا RTO",
            3: "حیاتی · تا RTO؛ غیرحیاتی · عبور از RTO",
            4: "حیاتی · بین RTO و MTPD؛ ازدست‌رفتن ظرفیت",
            5: "حیاتی · از MTPD به بالا؛ علت مشترک در دو بانک؛ توقف زنجیره‌ای",
        }
        for level in draft.scales.get(code="S").levels.all():
            if level.value in tags:
                level.tags = tags[level.value]
                save_with_reason(level, self.sara, "برچسب‌های سطوح S")

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
        # اعضای بی‌نقش سامانه‌ای که فقط از AD می‌آیند (چارت سازمانی، فیگما ۱۸)
        self.kian = self.user("k.akbari", "کیان", "اکبری", job="جانشین مدیر پرداخت")
        self.nima = self.user("n.sharifi", "نیما", "شریفی", job="کارشناس عملیات پرداخت")
        self.elham = self.user("e.tavakoli", "الهام", "توکلی", job="کارشناس کنترل")
        for member in (self.kian, self.nima, self.elham):
            member.set_unusable_password()
            member.save(update_fields=["password"])

    def organization(self):
        # چارت سازمانی (فیگما ۱۸): سه سطح، با معاونت‌هایی که واحدهای فنی و امنیت زیرشان است
        root = OrgUnit.objects.create(name="داتین", code="DTN", ad_group="DC=datin")
        tech = OrgUnit.objects.create(
            name="معاونت فناوری و عملیات", code="TEC", parent=root, ad_group="OU=Tech · DC=datin"
        )
        guard = OrgUnit.objects.create(
            name="معاونت امنیت و ریسک", code="SCR", parent=root, ad_group="OU=SecRisk · DC=datin"
        )
        self.units = {
            "tech": tech,
            "guard": guard,
            "infra": OrgUnit.objects.create(name="زیرساخت", code="INF", parent=tech, ad_group="OU=Infra · DC=datin"),
            "ops": OrgUnit.objects.create(name="عملیات زیرساخت", code="OPS", parent=tech, ad_group="OU=Ops · DC=datin"),
            "sec": OrgUnit.objects.create(name="امنیت اطلاعات", code="SEC", parent=guard, ad_group="OU=Sec · DC=datin"),
            "risk": OrgUnit.objects.create(name="واحد ریسک", code="RSK", parent=guard),
            "pay": OrgUnit.objects.create(name="پرداخت", code="PAY", parent=root, ad_group="OU=Pay · DC=datin"),
            "proc": OrgUnit.objects.create(name="تدارکات", code="PRC", parent=root),
        }
        for user, unit in [
            (self.ali, "tech"),
            (self.ali, "infra"),
            (self.ali, "ops"),
            (self.maryam, "guard"),
            (self.maryam, "sec"),
            (self.hossein, "pay"),
        ]:
            user.managed_units.add(self.units[unit])
        for unit, deputy in (("infra", self.mehdi), ("sec", self.reza), ("pay", self.kian)):
            OrgUnit.objects.filter(pk=self.units[unit].pk).update(deputy=deputy)
        # کاربرهای همگام با AD؛ کاربرهای GRC حساب محلی سامانه‌اند
        User.objects.exclude(pk__in=[self.sara.pk, self.neda.pk]).update(source=User.Source.AD)
        for user, unit in [
            (self.sara, "risk"),
            (self.neda, "risk"),
            (self.ali, "infra"),
            (self.maryam, "sec"),
            (self.hossein, "pay"),
            (self.mehdi, "ops"),
            (self.reza, "sec"),
            (self.kian, "pay"),
            (self.nima, "pay"),
            (self.elham, "sec"),
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

    def board_history(self, *plans):
        """تابلوی درمان (فیگما ۱۵): ریسک هدف هر طرح، یادداشت مسدود و ناموفق، روز تأیید خروجی، و بازبینی‌های پیش رو."""
        for plan in plans:
            current = plan.assessment
            # نیمه‌ی امتیاز جاری، به نزدیک‌ترین امتیازی که از L × I ساخته می‌شود (۷ از هیچ L و I تا ۵ ساخته نمی‌شود).
            half = max(current.score_high // 2, 2)
            score = max(value for value in {lk * im for lk in range(1, 6) for im in range(1, 6)} if value <= half)
            target = self.assessment(
                plan.risk, max(current.decision_level.rank - 1, 1), score, kind=Assessment.Kind.TARGET
            )
            TreatmentPlan.objects.filter(pk=plan.pk).update(target_assessment=target)
        notes = {
            AS.BLOCKED: "منتظر بودجه",
            AS.FAILED: "کنترل هنوز E2 ماند",
            AS.VERIFIED: "خروجی با شاهد آزمون تأیید شد",
        }
        for action in TreatmentAction.objects.filter(plan__in=plans, status__in=list(notes)):
            update = ActionUpdate.objects.create(
                action=action,
                from_status=AS.IN_PROGRESS,
                to_status=action.status,
                note=notes[action.status],
                created_by=self.sara,
            )
            ActionUpdate.objects.filter(pk=update.pk).update(created_at=timezone.now() - timedelta(days=4))
        reviews = ((plans[1], 5, RiskReview.Trigger.PERIODIC), (plans[0], 12, RiskReview.Trigger.CHANGE))
        for plan, days, trigger in reviews:
            RiskReview.objects.create(
                risk=plan.risk,
                assessment=plan.assessment,
                trigger=trigger,
                reason="ارزیابی جاری جدید پس از اقدام با شواهد واقعی",
                due=self.today + timedelta(days=days),
                responsible=plan.risk.owner,
                created_by=self.sara,
            )

    def target_profiles(self, *rows):
        """لیست ریسک‌های هدف (فیگما ۱۶): پروفایل پیامد داتین (S D F C R) و B جاری و هدف هر طرح."""
        scales = {scale.code: scale for scale in self.version.scales.filter(code__in=list("SDFCR"))}
        for plan, current, target, b in rows:
            plan.refresh_from_db()
            for assessment, text in ((plan.assessment, current), (plan.target_assessment, target)):
                if assessment is None or text is None:
                    continue
                for item in text.split():
                    level = int(item[1:])
                    ImpactDetail.objects.create(
                        assessment=assessment,
                        scale=scales[item[0]],
                        level=level,
                        rationale="" if level else "این بُعد در سناریو درگیر نیست.",
                        confidence=Confidence.MEDIUM,
                    )
            if b:
                Assessment.objects.filter(pk=plan.assessment_id).update(b_low=b[0], b_high=b[0])
                Assessment.objects.filter(pk=plan.target_assessment_id).update(b_low=b[1], b_high=b[1])

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

        # نیازمند اقدام (فیگما ۱۴): بحرانی با منع الزام‌آور که مهلت مهارش گذشته، و بالایی که هنوز در مهلت طرح است
        licence = self.risk("ادامه‌ی پردازش بدون مجوز نظارتی به‌روز", "SRV-SATNA", self.hossein, "T8", S.TREATMENT_PLAN)
        self.entered(licence, S.TREATMENT_PLAN, 1.1)
        prohibited = self.assessment(licence, 4, 6, days_ago=2)
        Assessment.objects.filter(pk=prohibited.pk).update(
            base_level=self.levels[2],
            binding_prohibition=True,
            out_of_acceptance_authority=True,
            escalation_reasons=["منع الزام‌آور: خارج از اختیار پذیرش"],
        )
        supplier = self.risk("قطع خدمت ارتباطی تأمین‌کننده", "SRV-SMS", self.ali, "T5", S.TREATMENT_PLAN)
        self.entered(supplier, S.TREATMENT_PLAN, 3)
        self.assessment(supplier, 3, 12, days_ago=4)

        sms = self.risk("وابستگی به ارائه‌دهنده‌ی پیامک", "SRV-SMS", self.sara, "T5", S.TREATMENT_PLAN)
        self.entered(sms, S.TREATMENT_PLAN, 10)
        sms_plan = self.plan(sms, self.assessment(sms, 2, 8))
        self.action(sms_plan, "قرارداد پشتیبان با ارائه‌دهنده‌ی دوم پیامک", AS.APPROVED, self.mehdi, self.sara, 25)

        # در اجرای درمان: اقدام‌ها در وضعیت‌های مختلف (تابلوی درمان)
        tls = self.risk("انقضای گواهی‌های TLS درگاه‌ها", "SRV-IPG", self.sara, "T3", S.TREATMENT)
        tls_plan = self.plan(tls, self.assessment(tls, 2, 9))
        tls_check = "هشدار ۳۰ روز پیش از انقضا برای همه‌ی گواهی‌ها و تمدید بدون توقف در آزمون"
        for title, due_in in (("پایش خودکار انقضای گواهی‌ها", -5), ("تمدید خودکار گواهی‌ها با ACME", -2)):
            self.action(tls_plan, title, AS.VERIFIED, self.mehdi, self.sara, due_in, acceptance_criteria=tls_check)

        db = self.risk("از دست رفتن داده‌ی پایگاه داده‌ی تراکنش", "SRV-CORE", self.ali, "T3", S.TREATMENT)
        db_plan = self.plan(db, self.assessment(db, 3, 15))
        db_check = "بازیابی کامل در مانور با از دست رفتن داده‌ی کمتر از ۵ دقیقه و آزمون صحت تراکنش"
        for title, status, assignee, verifier, due_in in (
            ("تکثیر هم‌زمان پایگاه داده به سایت پشتیبان", AS.IN_PROGRESS, self.sara, self.ali, 0),
            ("آزمون بازیابی نسخه‌ی پشتیبان ماهانه", AS.READY, self.mehdi, self.sara, 5),
            ("خرید مجوز ابزار پایش پایگاه داده", AS.BLOCKED, self.sara, self.ali, -8),
        ):
            self.action(db_plan, title, status, assignee, verifier, due_in, acceptance_criteria=db_check)

        pam = self.risk("دسترسی ممتاز بدون کنترل به سرورهای تولید", "SRV-HSM", self.maryam, "T1", S.TREATMENT)
        pam_plan = self.plan(pam, self.assessment(pam, 4, 18))
        pam_check = "دو مانع مستقل E3 روی همه‌ی مسیرهای ممتاز و آزمون دور زدن در ۳۰ نمونه"
        for title, status, due_in in (
            ("دو مانع مستقل روی مسیر دسترسی ممتاز", AS.IN_PROGRESS, 12),
            ("پوشش همه‌ی حساب‌های ممتاز با PAM", AS.PLANNED, 40),
            ("ثبت جلسه‌های ممتاز و بازبینی هفتگی", AS.FAILED, -3),
        ):
            self.action(pam_plan, title, status, self.mehdi, self.maryam, due_in, acceptance_criteria=pam_check)

        # اجتناب (فیگما ۱۶): مسیر حذف می‌شود و ریسک پس از اثبات بازنشسته می‌شود، بدون امتیاز صفر ساختگی
        exploit = self.risk(
            "آسیب‌پذیری بحرانی قابل بهره‌برداری در درگاه اینترنتی", "SRV-IPG", self.maryam, "T1", S.TREATMENT
        )
        exploit_plan = self.plan(exploit, self.assessment(exploit, 4, 20), option=TreatmentPlan.Option.AVOID)
        TreatmentPlan.objects.filter(pk=exploit_plan.pk).update(
            rationale="حذف مسیر آسیب‌پذیر؛ ریسک پس از اثبات حذف بازنشسته می‌شود."
        )
        self.action(
            exploit_plan,
            "وصله یا حذف سرویس آسیب‌پذیر درگاه",
            AS.IN_PROGRESS,
            self.mehdi,
            self.maryam,
            4,
            acceptance_criteria="وصله یا حذف مسیر، آزمون همه‌ی مصادیق و عارضه‌ی تغییر",
        )

        self.board_history(tls_plan, db_plan, pam_plan)
        self.target_profiles(
            (tls_plan, "S3 D2 F2 C2 R2", "S2 D2 F1 C2 R1", (3, 2)),
            (db_plan, "S4 D0 F3 C3 R2", "S3 D0 F2 C3 R2", (5, 2)),
            (pam_plan, "S2 D4 F3 C3 R2", "S2 D4 F3 C3 R2", (5, 2)),
            (exploit_plan, "S4 D4 F3 C3 R3", None, None),
        )

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
        self.risk("نبود سایت پشتیبان فعال برای سرویس پیامک", "SRV-SMS", self.ali, "T7", S.QUESTIONS, ready=False)
        self.risk("خطای پیکربندی فایروال شبکه‌ی مرکزی", "SRV-CORE", self.ali, "T1", S.REGISTERED, ready=False)
        self.risk("ادغام‌شدنی: قطع ساتنا در ساعات تسویه", "SRV-SATNA", self.hossein, "T3", S.SUBMITTED)

        # بسته و ردشده
        closed = self.risk("انقضای مجوز نرم‌افزار پشتیبان‌گیری", "SRV-ARC", self.ali, "T2", S.CLOSED)
        self.assessment(closed, 1, 2, days_ago=200)
        self.risk("کپی تکراری ریسک قطع ساتنا", "SRV-SATNA", self.hossein, "T3", S.REJECTED)
