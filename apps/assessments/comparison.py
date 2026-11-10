"""مقایسه‌ی چند نسخه‌ی ارزیابی یک ریسک (بخش ۲۰ و ۲۱ سند v5): مثلاً ارزیابی جاری پیش از اقدام، ارزیابی جاری تازه
بعد از اقدام و ارزیابی هدف. سطح هر بُعد پیامد بیشترین سطح آن بُعد در ستون‌های داتین و بانک‌هاست. اگر نسخه‌ی روش
دو ارزیابی فرق کند، تغییر سطح ممکن است از تغییر روش آمده باشد و جدا گفته می‌شود (بخش ۲۱ و ۳۲)."""

from dataclasses import dataclass, field
from decimal import Decimal

from .results import outcome
from .services import impact_summary, likelihood_summary


@dataclass
class Profile:
    assessment: object
    a: str
    b: object
    likelihood: object
    impact: object
    score: object
    base_level: object
    decision_level: object
    confidence: str
    incomplete: bool
    dimensions: dict = field(default_factory=dict)  # کد بُعد → سطح بیشینه (متن) یا None


def dimension_levels(assessment):
    """بیشترین سطح هر بُعد پیامد در همه‌ی ستون‌ها، با کران بالای بازه. خانه‌ی نامعلوم یا ثبت‌نشده «؟» می‌شود."""
    levels = {}
    for scale, row in impact_summary(assessment).rows:
        known = [detail for detail in row if detail is not None and detail.level is not None]
        unknown = len(known) < len(row)
        top = max((detail.level_high or detail.level for detail in known), default=None)
        levels[scale.code] = (scale.name, top, unknown)
    return levels


def profile(assessment):
    result = outcome(assessment)
    likelihood = likelihood_summary(assessment)
    return Profile(
        assessment=assessment,
        a=assessment.a_display,
        b=result.b or likelihood.b,
        likelihood=result.likelihood or likelihood.likelihood,
        impact=result.impact,
        score=result.score,
        base_level=result.base_level,
        decision_level=result.decision_level,
        confidence=result.confidence_label,
        incomplete=result.incomplete,
        dimensions=dimension_levels(assessment),
    )


def _number(value):
    """مقدار عددی برای جهت تغییر: کران بالای بازه یا خود عدد. متن‌هایی مثل «ثبت‌نشده» جهت ندارند."""
    value = getattr(value, "high", value)
    return value if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool) else None


def trend(before, after):
    """جهت تغییر یک مقدار عددی یا بازه: down بهتر شدن ریسک است و up بدتر شدن."""
    before, after = _number(before), _number(after)
    if before is None or after is None or before == after:
        return ""
    return "down" if after < before else "up"


def compare(assessments):
    """جدول مقایسه: هر سطر یک مؤلفه و هر ستون یک ارزیابی، با جهت تغییر نسبت به ستون اول."""
    profiles = [profile(item) for item in assessments]
    if not profiles:
        return {"profiles": [], "rows": [], "method_changed": False}
    first = profiles[0]

    def row(label, getter, measure=None):
        """measure از ستون، عدد مقایسه را می‌دهد؛ پیش‌فرض خود مقدار سلول است."""
        measure = measure or getter
        cells = []
        for item in profiles:
            change = "" if item is first else trend(measure(first), measure(item))
            cells.append({"value": getter(item), "trend": change})
        return {"label": label, "cells": cells}

    def level_rank(getter):
        return lambda item: getter(item).rank if getter(item) else None

    rows = [
        row("A", lambda item: item.a, measure=_a_value),
        row("B", lambda item: item.b),
        row("L", lambda item: item.likelihood),
    ]
    codes = list(first.dimensions)
    for item in profiles[1:]:
        codes += [code for code in item.dimensions if code not in codes]
    for code in codes:
        name = next((item.dimensions[code][0] for item in profiles if code in item.dimensions), code)
        rows.append(
            row(
                f"پیامد {code}: {name}",
                lambda item, code=code: _dimension_text(item.dimensions.get(code)),
                measure=lambda item, code=code: _dimension_value(item.dimensions.get(code)),
            )
        )
    rows += [
        row("I", lambda item: item.impact),
        row("امتیاز L × I", lambda item: item.score),
        row("سطح پایه", lambda item: item.base_level, measure=level_rank(lambda item: item.base_level)),
        row("سطح تصمیم", lambda item: item.decision_level, measure=level_rank(lambda item: item.decision_level)),
        row("اطمینان کل", lambda item: item.confidence or "-"),
    ]
    versions = {item.assessment.method_version_id for item in profiles}
    return {"profiles": profiles, "rows": rows, "method_changed": len(versions) > 1}


def _a_value(item):
    assessment = item.assessment
    if not assessment.a_recorded or assessment.a is None:
        return None
    return assessment.a_high or assessment.a


def _dimension_value(entry):
    """سطح بیشینه‌ی بُعد برای جهت تغییر؛ خانه‌ی نامعلوم جهت ندارد چون کران بالایش معلوم نیست."""
    if entry is None or entry[1] is None or entry[2]:
        return None
    return entry[1]


def _dimension_text(entry):
    if entry is None:
        return "-"
    _, top, unknown = entry
    if top is None:
        return "؟"
    return f"{top}؟" if unknown else top


def target_met(current, target):
    """هدف محقق شده است اگر سطح تصمیم ارزیابی تازه از سطح هدف بالاتر نباشد و امتیاز تصمیمش از امتیاز هدف بیشتر
    نباشد. ارزیابی ناقص هدف را محقق نمی‌کند."""
    if current.incomplete_reasons or not (current.decision_level_id and target.decision_level_id):
        return False
    return current.decision_level.rank <= target.decision_level.rank and (current.score_high or 0) <= (
        target.score_high or 0
    )
