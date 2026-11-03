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


def unmet_conditions(level, facts, thresholds):
    """شرط‌هایی از سطح level و سطح‌های پایین‌تر که برقرار نیستند. فهرست خالی یعنی این سطح پذیرفته می‌شود."""
    problems = []
    if level >= 2:
        if not facts.exists:
            problems.append("E2 و بالاتر یعنی کنترل وجود دارد و اجرا می‌شود.")
        if not facts.has_evidence:
            problems.append("کنترل بدون شاهد E1 است (بخش ۱۵ و جواب س۵۸)؛ شاهد اجرا یا آزمون را انتخاب کنید.")
        if facts.test_to is None:
            problems.append("تاریخ پایان آزمون یا مشاهده لازم است تا قدمت شاهد معلوم باشد.")
    if level >= 3:
        if not facts.design_ok:
            problems.append("برای E3 و بالاتر طراحی کنترل باید کافی باشد.")
        if not facts.operating_ok:
            problems.append("برای E3 و بالاتر آزمون فعلی باید اثربخشی عملیاتی را نشان دهد.")
        if facts.coverage_pct is None or facts.coverage_pct < thresholds.coverage:
            problems.append(f"برای E3 و بالاتر پوشش اجرا دست‌کم {plain_number(thresholds.coverage)} درصد است.")
        if not facts.critical_points_covered:
            problems.append("برای E3 و بالاتر همه‌ی نقاط حیاتی باید پوشش داشته باشند.")
        if facts.known_gap:
            problems.append("با شکست یا شکاف شناخته‌شده در دامنه‌ی مورد اتکا، E3 و بالاتر پذیرفته نمی‌شود (بخش ۱۶).")
        if facts.sample_size is None or facts.sample_size < thresholds.sample:
            problems.append(f"برای E3 و بالاتر نمونه‌ی آزمون دست‌کم {thresholds.sample} مورد است.")
        if facts.verifier_id is None:
            problems.append("E3 و بالاتر تأییدکننده می‌خواهد (بخش ۲۳).")
        elif facts.verifier_id == facts.owner_id:
            problems.append("تأییدکننده‌ی E3 و بالاتر کسی جز مسئول کنترل است (جواب س۵۴).")
    if level >= 4 and not facts.sustained:
        problems.append("E4 و E5 یعنی سوابق معتبر عملکرد مستمر کنترل را در دوره‌ی بررسی نشان می‌دهند.")
    if level >= 5:
        if not facts.failure_bypass_tested:
            problems.append("E5 آزمون شرایط خرابی و دورزدن می‌خواهد.")
        if not facts.monitored:
            problems.append("E5 پایش مستمر می‌خواهد.")
    return problems


def supported_level(facts, thresholds):
    """بالاترین E که داده‌های ثبت‌شده پشتیبانی می‌کنند."""
    return max(level for level in LEVELS if not unmet_conditions(level, facts, thresholds))
