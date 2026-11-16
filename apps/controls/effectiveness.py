"""شرط‌های هر سطح اثربخشی کنترل (E) در بخش ۱۶ سند v5، با قاعده‌های مسدودکننده‌ی بخش ۲۳ و جواب س۵۴ و س۵۸.

سطح E با احراز همه‌ی شرط‌های آن سطح و سطح‌های پایین‌تر تعیین می‌شود و میانگین خوب شکست یک شرط را نمی‌پوشاند.
آستانه‌ها (درصد پوشش و اندازه‌ی نمونه) از نسخه‌ی روش می‌آیند و در کد نیستند."""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from apps.methodology.models import MethodParameter, plain_number
from apps.methodology.services import parameter

LEVELS = range(1, 6)


@dataclass(frozen=True)
class Thresholds:
    coverage: Decimal  # کمترین درصد پوشش اجرا برای E3 و بالاتر
    sample: int  # کمترین اندازه‌ی نمونه‌ی آزمون برای E3 و بالاتر
    key_age: int  # حداکثر قدمت شاهد کنترل کلیدی، به روز
    other_age: int  # حداکثر قدمت شاهد کنترل‌های دیگر، به روز

    @classmethod
    def of(cls, version):
        def value(key):
            return parameter(version, key)

        return cls(
            coverage=value(MethodParameter.Key.CONTROL_COVERAGE),
            sample=int(value(MethodParameter.Key.CONTROL_SAMPLE)),
            key_age=int(value(MethodParameter.Key.KEY_EVIDENCE_AGE)),
            other_age=int(value(MethodParameter.Key.OTHER_EVIDENCE_AGE)),
        )

    def evidence_age(self, is_key):
        return self.key_age if is_key else self.other_age


@dataclass(frozen=True)
class TestFacts:
    """آن‌چه از برگه‌ی آزمون کنترل (بخش ۲۵) برای تعیین E لازم است."""

    exists: bool
    design_ok: bool
    operating_ok: bool
    coverage_pct: Decimal | None
    critical_points_covered: bool
    known_gap: bool
    test_to: date | None
    sample_size: int | None
    has_evidence: bool
    verifier_id: int | None
    owner_id: int | None
    sustained: bool
    failure_bypass_tested: bool
    monitored: bool
    limited_effect_proven: bool = False


@dataclass(frozen=True)
class Condition:
    """یک شرط سطح level: label جمله‌ی مثبت برای فهرست شرط‌ها، met بررسی آن و problem متن ایراد وقتی برقرار نیست."""

    key: str
    level: int
    label: str
    met: object  # (facts, thresholds) -> bool
    problem: object  # (facts, thresholds) -> str


def _verifier_problem(facts, thresholds):
    if facts.verifier_id is None:
        return "E3 و بالاتر تأییدکننده می‌خواهد (بخش ۲۳)."
    return "تأییدکننده‌ی E3 و بالاتر کسی جز مسئول کنترل است (جواب س۵۴)."


CONDITIONS = [
    Condition(
        "exists",
        2,
        "کنترل وجود دارد و اجرا می‌شود",
        lambda f, t: f.exists,
        lambda f, t: "E2 و بالاتر یعنی کنترل وجود دارد و اجرا می‌شود.",
    ),
    Condition(
        "evidence",
        2,
        "شاهد اجرا یا آزمون پیوست است",
        lambda f, t: f.has_evidence,
        lambda f, t: "کنترل بدون شاهد E1 است (بخش ۱۵ و جواب س۵۸)؛ شاهد اجرا یا آزمون را انتخاب کنید.",
    ),
    Condition(
        "dated",
        2,
        "تاریخ پایان آزمون ثبت شده است",
        lambda f, t: f.test_to is not None,
        lambda f, t: "تاریخ پایان آزمون یا مشاهده لازم است تا قدمت شاهد معلوم باشد.",
    ),
    Condition(
        "effect",
        2,
        "اثر واقعی کنترل با آزمون نشان داده شده است",
        lambda f, t: f.limited_effect_proven or f.operating_ok,
        lambda f, t: "E2 و بالاتر شاهد اثر واقعی کنترل می‌خواهد؛ صرف نصب یا وجود شاهد اجرا کافی نیست (بخش ۱۵).",
    ),
    Condition(
        "design",
        3,
        "طراحی کنترل کافی است",
        lambda f, t: f.design_ok,
        lambda f, t: "برای E3 و بالاتر طراحی کنترل باید کافی باشد.",
    ),
    Condition(
        "operating",
        3,
        "آزمون فعلی در همه‌ی مسیرهای مرتبط موفق است",
        lambda f, t: f.operating_ok,
        lambda f, t: "برای E3 و بالاتر آزمون فعلی باید اثربخشی عملیاتی را نشان دهد.",
    ),
    Condition(
        "coverage",
        3,
        "پوشش اجرا دست‌کم {coverage} درصد است",
        lambda f, t: f.coverage_pct is not None and f.coverage_pct >= t.coverage,
        lambda f, t: f"برای E3 و بالاتر پوشش اجرا دست‌کم {plain_number(t.coverage)} درصد است.",
    ),
    Condition(
        "critical",
        3,
        "نقاط حیاتی دامنه را پوشش می‌دهد",
        lambda f, t: f.critical_points_covered,
        lambda f, t: "برای E3 و بالاتر همه‌ی نقاط حیاتی باید پوشش داشته باشند.",
    ),
    Condition(
        "gap",
        3,
        "شکست یا شکاف شناخته‌شده در دامنه‌ی مورد اتکا وجود ندارد",
        lambda f, t: not f.known_gap,
        lambda f, t: "با شکست یا شکاف شناخته‌شده در دامنه‌ی مورد اتکا، E3 و بالاتر پذیرفته نمی‌شود (بخش ۱۶).",
    ),
    Condition(
        "sample",
        3,
        "نمونه‌ی آزمون دست‌کم {sample} مورد است",
        lambda f, t: f.sample_size is not None and f.sample_size >= t.sample,
        lambda f, t: f"برای E3 و بالاتر نمونه‌ی آزمون دست‌کم {t.sample} مورد است.",
    ),
    Condition(
        "verifier",
        3,
        "تأییدکننده‌ای جز مسئول کنترل دارد",
        lambda f, t: f.verifier_id is not None and f.verifier_id != f.owner_id,
        _verifier_problem,
    ),
    Condition(
        "sustained",
        4,
        "سوابق معتبر عملکرد مستمر کنترل را در دوره‌ی بررسی نشان می‌دهند",
        lambda f, t: f.sustained,
        lambda f, t: "E4 و E5 یعنی سوابق معتبر عملکرد مستمر کنترل را در دوره‌ی بررسی نشان می‌دهند.",
    ),
    Condition(
        "bypass",
        5,
        "شرایط خرابی و دورزدن آزمون شده است",
        lambda f, t: f.failure_bypass_tested,
        lambda f, t: "E5 آزمون شرایط خرابی و دورزدن می‌خواهد.",
    ),
    Condition("monitored", 5, "پایش مستمر دارد", lambda f, t: f.monitored, lambda f, t: "E5 پایش مستمر می‌خواهد."),
]


def unmet_conditions(level, facts, thresholds):
    """شرط‌هایی از سطح level و سطح‌های پایین‌تر که برقرار نیستند. فهرست خالی یعنی این سطح پذیرفته می‌شود."""
    return [
        condition.problem(facts, thresholds)
        for condition in CONDITIONS
        if condition.level <= level and not condition.met(facts, thresholds)
    ]


def checklist(level, facts, thresholds):
    """شرط‌های خود سطح level با وضعیتشان، و شرط‌های برقرارنشده‌ی سطح‌های پایین‌تر که آن را هم می‌بندند؛ برای «شروط
    E» در برگه‌ی آزمون کنترل. هر ردیف (کلید، جمله‌ی شرط، برقرار است)."""
    values = {"coverage": plain_number(thresholds.coverage), "sample": thresholds.sample}
    rows = []
    for condition in CONDITIONS:
        met = condition.met(facts, thresholds)
        if condition.level == level or (condition.level < level and not met):
            rows.append((condition.key, condition.label.format(**values), met))
    return rows


def supported_level(facts, thresholds):
    """بالاترین E که داده‌های ثبت‌شده پشتیبانی می‌کنند."""
    return max(level for level in LEVELS if not unmet_conditions(level, facts, thresholds))
