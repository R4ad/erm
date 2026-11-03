"""چرخه‌ی عمر ریسک: جدول انتقال‌ها از جواب س۱۵، با انجام‌دهنده و شرط هر انتقال.

هر انتقال یک ردیف جدول س۱۵ است. ردیف ۱ (شروع و پاسخ به پرسشنامه) و ساختن ریسک از جواب‌ها در ردیف ۲، در ماژول
پرسشنامه است (قدم ۱۲)؛ ریسک با «ثبت‌شده در رجیستر» به دنیا می‌آید. «برگشت به رجیستر» همان ردیف ۲ است برای ریسکی
که با «طرح پرسش‌های جدید» (ردیف ۴) به پاسخ به پرسش‌ها برگشته است.

شرط‌هایی که به ماژول‌های بعدی بسته‌اند، وقتی همان ماژول ساخته شود اضافه می‌شوند: ارزیابی جاری تأییدشده برای ردیف
۶ از قدم ۱۸ آمده است؛ طرح درمان برای ردیف ۷ (قدم ۱۹) و موعد بازبینی برای ردیف ۸ (قدم ۲۳) می‌آیند.
"""

from dataclasses import dataclass, field

from apps.accounts.roles import Role
from apps.assessments.models import Assessment
from apps.risks.models import Risk

S = Risk.Status
GRC = (Role.GRC_MEMBER,)
# کارهای کارگروه را هم خود اعضای کارگروه ثبت می‌کنند و هم کارشناس ریسک (جواب س۵۲).
WORKGROUP = (Role.SECURITY_WORKGROUP, Role.GRC_MEMBER)


@dataclass(frozen=True)
class Transition:
    name: str
    row: int  # ردیف جدول س۱۵
    source: str
    target: str
    label: str
    description: str
    roles: tuple
    reason_label: str = "توضیح"
    reason_required: bool = False
    meeting_date: bool = False  # تصمیم کارگروه با تاریخ جلسه ثبت می‌شود (جواب س۳۳)
    asks_questions: bool = False
    checks: tuple = field(default=())

    @property
    def target_label(self):
        return S(self.target).label


def all_questions_answered(risk, data):
    if risk.questions.filter(answered_at__isnull=True).exists():
        return ["همه‌ی پرسش‌های ریسک هنوز جواب نگرفته‌اند."]
    return []


def ready_for_assessment(risk, data):
    """قاعده‌ی پذیرش ورودی بخش ۴ سند v5 (جواب س۴۸): سناریوی قابل ارزیابی هدف، رویداد، دامنه‌ی خدمت و مشتری، مالک
    و یک شاهد یا فرض قابل آزمون دارد. نبود شاهد دلیل رد نیست؛ آن وقت فرض قابل آزمون نوشته می‌شود."""
    problems = []
    if not risk.description.strip():
        problems.append("شرح ریسک (هدف و رویداد) نوشته نشده است.")
    if not risk.service_id:
        problems.append("خدمت ریسک تعیین نشده است.")
    if not risk.customers.exists():
        problems.append("هیچ بانکی برای ریسک تعیین نشده است.")
    if not risk.owner_id:
        problems.append("مالک ریسک تعیین نشده است.")
    elif not risk.owner.is_active:
        problems.append("مالک ریسک غیرفعال است.")
    if not risk.evidence.exists() and not (data.get("reason") or "").strip():
        problems.append("شاهدی به ریسک وصل نیست؛ فرض قابل آزمون را بنویسید.")
    return problems


def approved_current_assessment(risk, data):
    """ردیف ۶: کارگروه ریسک را با نتیجه‌ی یک ارزیابی جاری تأییدشده به برنامه‌ی درمان می‌فرستد. ارزیابی باید بعد از
    آخرین ورود ریسک به «در ارزیابی» تأیید شده باشد، تا ریسکی که از بازبینی برگشته (ردیف ۹) با نتیجه‌ی تازه تصمیم
    بگیرد، و سطح تصمیم داشته باشد، چون برنامه‌ی درمان از روی همین سطح طراحی می‌شود. ارزیابی ناقصی که کران قابل
    دفاعی ندارد سطح تصمیم ندارد، مگر یک قاعده‌ی تقدم سطح را بالا برده باشد."""
    approved = Assessment.objects.filter(risk=risk, kind=Assessment.Kind.CURRENT, status=Assessment.Status.APPROVED)
    entered = risk.transitions.filter(to_status=S.ASSESSMENT).values_list("created_at", flat=True).first()
    if entered:
        approved = approved.filter(approved_at__gte=entered)
    if not approved.exists():
        return ["هنوز ارزیابی جاری تأییدشده‌ای برای این دور ارزیابی ریسک نیست."]
    if not approved.filter(decision_level__isnull=False).exists():
        return ["ارزیابی جاری تأییدشده ناقص است و سطح تصمیم ندارد؛ جزء نامعلوم را روشن کنید و دوباره ارزیابی کنید."]
    return []


TRANSITIONS = [
    Transition(
        name="back_to_register",
        row=2,
        source=S.QUESTIONS,
        target=S.REGISTERED,
        label="برگشت به رجیستر",
        description="جواب پرسش‌ها رسیده است و ریسک دوباره در رجیستر ثبت می‌شود.",
        roles=GRC,
        checks=(all_questions_answered,),
    ),
    Transition(
        name="send_to_assessment",
        row=3,
        source=S.REGISTERED,
        target=S.ASSESSMENT,
        label="ارسال جهت ارزیابی",
        description="ریسک برای ارزیابی کارگروه امنیت فرستاده می‌شود.",
        roles=WORKGROUP,
        reason_label="فرض قابل آزمون یا توضیح",
        checks=(ready_for_assessment,),
    ),
    Transition(
        name="ask_questions",
        row=4,
        source=S.ASSESSMENT,
        target=S.QUESTIONS,
        label="طرح پرسش‌های جدید",
        description="اطلاعات ارزیابی ناقص است و از واحد ریسک پرسش مشخص با مهلت پنج روز کاری پرسیده می‌شود.",
        roles=GRC,
        asks_questions=True,
    ),
    Transition(
        name="reject",
        row=5,
        source=S.ASSESSMENT,
        target=S.REJECTED,
        label="رد ریسک",
        description="کارگروه امنیت ریسک را رد کرده است.",
        roles=WORKGROUP,
        reason_label="دلیل رد",
        reason_required=True,
        meeting_date=True,
    ),
    Transition(
        name="approve",
        row=6,
        source=S.ASSESSMENT,
        target=S.TREATMENT_PLAN,
        label="تأیید و طراحی برنامه‌ی درمان",
        description="کارگروه امنیت ریسک را تأیید کرده است و برنامه‌ی درمان طراحی می‌شود.",
        roles=WORKGROUP,
        meeting_date=True,
        checks=(approved_current_assessment,),
    ),
    Transition(
        name="start_treatment",
        row=7,
        source=S.TREATMENT_PLAN,
        target=S.TREATMENT,
        label="شروع اجرای درمان",
        description="برنامه‌ی درمان آماده است و اجرایش شروع می‌شود.",
        roles=GRC,
    ),
    Transition(
        name="start_review",
        row=8,
        source=S.TREATMENT,
        target=S.REVIEW,
        label="شروع بازبینی",
        description="مدت تعیین‌شده گذشته است و ریسک بازبینی می‌شود.",
        roles=GRC,
    ),
    Transition(
        name="reassess",
        row=9,
        source=S.REVIEW,
        target=S.ASSESSMENT,
        label="ارسال برای ارزیابی دوباره",
        description="ریسک برای ارزیابی دوباره به کارگروه امنیت فرستاده می‌شود.",
        roles=GRC,
    ),
    Transition(
        name="close",
        row=10,
        source=S.REVIEW,
        target=S.CLOSED,
        label="بستن ریسک",
        description="ریسک دیگر وجود ندارد و بسته می‌شود.",
        roles=GRC,
        reason_label="چرا این ریسک دیگر وجود ندارد",
        reason_required=True,
    ),
]

BY_NAME = {transition.name: transition for transition in TRANSITIONS}


def get_transition(name):
    return BY_NAME.get(name)


def transitions_from(status):
    return [transition for transition in TRANSITIONS if transition.source == status]


def can_perform(user, transition):
    return user.is_system_admin or user.has_role(*transition.roles)


def blocking_problems(transition, risk, data=None):
    """شرط‌هایی از انتقال که برقرار نیستند، به زبان کاربر. فهرست خالی یعنی انتقال مجاز است."""
    data = data or {}
    problems = []
    for check in transition.checks:
        problems.extend(check(risk, data))
    return problems
