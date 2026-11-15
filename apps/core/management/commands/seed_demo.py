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
from apps.actions.models import (
    AcceptanceSignature,
    MonitoringNotice,
    RiskAcceptance,
    TreatmentAction,
    TreatmentPlan,
)
from apps.assessments.models import Assessment
from apps.catalog.models import Customer, Service
from apps.methodology.models import MethodVersion
from apps.organization.models import OrgUnit
from apps.risks.models import Risk, RiskCategory
from apps.workcalendar.workdays import add_working_days
from apps.workflow.models import StatusTransition

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
        Assessment.objects.filter(pk=assessment.pk).update(
            status=status,
            decision_level=level,
            base_level=level,
            score_low=score,
            score_high=score,
            approved_at=approved if status == Assessment.Status.APPROVED else None,
        )
        assessment.refresh_from_db()
        return assessment

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

    def action(self, plan, title, status, assignee, verifier, due_in, mechanism="b"):
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
            start_date=self.today - timedelta(days=30),
            due_date=self.today + timedelta(days=due_in),
            acceptance_criteria="آزمون مسیر در ۳۰ نمونه بدون موفقیت دور زدن کنترل.",
            created_by=self.sara,
        )
        TreatmentAction.objects.filter(pk=action.pk).update(status=status)
        return action

    def acceptance(self, risk, assessment, status, days_left, signatures=0):
        start = self.today - timedelta(days=60)
        acceptance = RiskAcceptance.objects.create(
            risk=risk,
            assessment=assessment,
            scope=f"خدمت {risk.service.name} برای بانک‌های متأثر",
            reason="هزینه‌ی کاهش بیش از زیان مورد انتظار است.",
            conditions="پایش ماهانه‌ی شاخص و گزارش به کمیته.",
            customer_constraints="—",
            monitoring="تعداد رخدادهای قطع در ماه",
            revocation_triggers="بیش از یک رخداد بحرانی در فصل",
            start_date=start,
            end_date=self.today + timedelta(days=days_left),
            follow_up_by=self.sara,
            created_by=self.sara,
        )
        decided = status not in (RiskAcceptance.Status.DRAFT, RiskAcceptance.Status.PENDING)
        RiskAcceptance.objects.filter(pk=acceptance.pk).update(
            status=status,
            submitted_at=timezone.now() - timedelta(days=62),
            decided_at=timezone.now() - timedelta(days=60) if decided else None,
            decision_text="ریسک باقیمانده تا پایان اعتبار با شروط بالا پذیرفته شد." if decided else "",
        )
        for authority, signer in [
            (AcceptanceSignature.Authority.OWNER, risk.owner),
            (AcceptanceSignature.Authority.COMMITTEE, self.reza),
        ][:signatures]:
            AcceptanceSignature.objects.create(
                acceptance=acceptance,
                authority=authority,
                decision=AcceptanceSignature.Decision.APPROVE,
                reference="صورت‌جلسه‌ی ۱۴۰۵/۰۸/۱۰" if authority == AcceptanceSignature.Authority.COMMITTEE else "",
                created_by=signer,
            )
        return acceptance

    def risks(self):
        # برنامه‌ی درمان: منتظر طرح، طرح منتظر تأیید مالک، طرح تأییدشده
        leak = self.risk("نشت داده‌ی مشتریان از محیط آزمون", "SRV-IPG", self.sara, "T1", S.TREATMENT_PLAN)
        self.entered(leak, S.TREATMENT_PLAN, 2)
        self.assessment(leak, 4, 20)

        satna = self.risk("قطع سرویس انتقال وجه ساتنا", "SRV-SATNA", self.sara, "T3", S.TREATMENT_PLAN)
        self.entered(satna, S.TREATMENT_PLAN, 4)
        satna_current = self.assessment(satna, 3, 12)
        self.plan(satna, satna_current, approved=False)

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

        portal = self.risk("کندی پرتال پشتیبانی در ساعات اوج", "SRV-PORTAL", self.ali, "T4", S.REVIEW)
        self.acceptance(portal, self.assessment(portal, 2, 6), RiskAcceptance.Status.ACTIVE, 7, signatures=2)

        sms2 = self.risk("تأخیر ارسال پیامک تأیید تراکنش", "SRV-SMS", self.sara, "T5", S.REVIEW)
        self.acceptance(sms2, self.assessment(sms2, 2, 7), RiskAcceptance.Status.PENDING, 30, signatures=1)

        # در ارزیابی: یکی در کنترل کیفیت، یکی پیش‌نویس
        hsm = self.risk("خرابی HSM و توقف امضای تراکنش", "SRV-HSM", self.maryam, "T3", S.ASSESSMENT)
        self.assessment(hsm, 3, 12, status=Assessment.Status.IN_QC)
        mb = self.risk("حمله‌ی credential stuffing به همراه‌بانک", "SRV-MB", self.hossein, "T1", S.ASSESSMENT)
        self.assessment(mb, 3, 10, status=Assessment.Status.DRAFT)

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
