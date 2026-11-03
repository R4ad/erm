"""موتور محاسبه با نسخه‌ی ۱ (داده‌ی سند v5). نتیجه‌ی مثال‌ها طبق جواب س۱۱ قدم ۸ اصلاح شده است: Bc از جدول بخش ۱۵
می‌آید، پس یک کنترل E2 یعنی Bc برابر ۴ و یک کنترل E3 یعنی ۳، نه ۳ و ۲ که مثال‌های سند گرفته‌اند."""

import itertools

import pytest

from apps.methodology.engine import Control, Impact, Inputs, InvalidInput, Path, calculate
from apps.methodology.models import MethodVersion
from apps.methodology.services import LEVELS, MethodTables, copy_version

pytestmark = pytest.mark.django_db

DIMENSIONS = ["S", "D", "F", "C", "R"]


@pytest.fixture
def tables():
    return MethodTables(MethodVersion.objects.get(number=1))


def profile(text, stakeholder="بانک"):
    """پروفایل پیامد به شکل سند، مثل «S5 D4 F4 C4 R3»، برای یک ذی‌نفع."""
    return tuple(Impact(stakeholder, item[0], int(item[1:])) for item in text.split())


def path(b0, *e_values, independent=False, name=""):
    return Path(b0=b0, controls=tuple(Control(e) for e in e_values), independent=independent, name=name)


def run(tables, a, paths, impacts, **flags):
    paths = paths if isinstance(paths, (list, tuple)) else [paths]
    return calculate(tables, Inputs(a=a, paths=tuple(paths), impacts=impacts, **flags))


def summary(result):
    """(B، L، I، امتیاز، سطح تصمیم)، همان ستون‌های جدول مثال‌های سند."""
    return (result.b.high, result.likelihood.high, result.impact.high, result.score.high, result.decision_level.name)


# ---------- Bc از E کنترل‌ها (بخش ۱۵ و جواب س۱۱) ----------


@pytest.mark.parametrize(
    ("e_values", "independent", "bc"),
    [
        ((), False, 5),  # بدون کنترل
        ((1,), False, 5),  # کنترل E1 اعتبار کاهش ایجاد نمی‌کند
        ((1, 1, 1), True, 5),
        ((2,), False, 4),
        ((3,), False, 3),
        ((3, 3), True, 3),  # دو کنترل E3 مستقل هنوز Bc برابر ۱ نیست؛ Bc=1 دو کنترل E4 یا E5 می‌خواهد
        ((4,), False, 2),
        ((5,), True, 2),  # یک کنترل E5 به‌تنهایی شرط Bc=1 را تأمین نمی‌کند
        ((4, 4), False, 2),  # دو کنترل که استقلالشان تأیید نشده
        ((4, 5), True, 1),
        ((2, 4, 1), False, 2),  # از قاعده‌های برقرار کمترین Bc
    ],
)
def test_bc_follows_the_table_of_section_15(tables, e_values, independent, bc):
    result = run(tables, 3, path(5, *e_values, independent=independent), profile("S3"))

    assert result.paths[0].bc.high == bc


def test_path_b_is_the_smaller_of_b0_and_bc(tables):
    result = run(tables, 3, path(2, 3), profile("S3"))  # B0=2 و Bc=3

    assert result.paths[0].b.high == 2


def test_scenario_b_is_the_largest_path_b(tables):
    # مثال بخش ۱۵: مسیر رسمی با کنترل E4 و مسیر مستقیم بی‌مانع. B سناریو ۵ است.
    official = path(5, 4, name="انتشار از مسیر رسمی")
    direct = path(5, name="انتشار مستقیم خارج از فرایند رسمی")

    result = run(tables, 4, [official, direct], profile("S3"))

    assert [(item.bc.high, item.b.high) for item in result.paths] == [(2, 2), (5, 5)]
    assert result.b.high == 5


# ---------- هشت مثال سند (بخش ۲۶ تا ۲۹)، با نتیجه‌ی اصلاح‌شده طبق جدول Bc ----------

EXAMPLES = {
    # نام: (A، مسیرها، پروفایل پیامد، (B، L، I، امتیاز، سطح))
    "EX01 جاری": (5, [path(5, 1)], "S5 D4 F4 C4 R3", (5, 5, 5, 25, "بحرانی")),
    # سند: B=1 و ۸ متوسط. دو مانع مستقل E3 طبق جدول Bc برابر ۳ است، نه ۱.
    "EX01 هدف": (5, [path(5, 3, 3, independent=True)], "S4 D4 F3 C4 R3", (3, 4, 4, 16, "بحرانی")),
    # سند: Bc=2 و ۸ متوسط. یک کنترل E3 یعنی Bc برابر ۳.
    "EX02 جاری": (3, [path(5, 3)], "S4 D0 F2 C3 R2", (3, 3, 4, 12, "بالا")),
    # سند: ۶ متوسط.
    "EX02 هدف": (3, [path(5, 3)], "S3 D0 F2 C3 R2", (3, 3, 3, 9, "متوسط")),
    "EX03 جاری": (4, [path(5, 1)], "S1 D4 F2 C3 R3", (5, 5, 4, 20, "بحرانی")),
    # سند: B=2. نتیجه همان ۱۲ بالاست، چون در سطر A4 خانه‌های B2 و B3 هر دو L3 دارند.
    "EX03 هدف": (4, [path(5, 3)], "S1 D4 F2 C3 R3", (3, 3, 4, 12, "بالا")),
    "EX04 جاری": (2, [path(5)], "S4 D0 F3 C3 R2", (5, 3, 4, 12, "بالا")),
    # سند: B=2. نتیجه همان ۶ متوسط است، چون در سطر A2 خانه‌های B2 و B3 هر دو L2 دارند.
    "EX04 هدف": (2, [path(5, 3)], "S3 D0 F2 C3 R2", (3, 2, 3, 6, "متوسط")),
    # سند: Bc=3 و ۹ متوسط. یک کنترل E2 یعنی Bc برابر ۴.
    "EX05 جاری": (4, [path(4, 2)], "S3 D2 F2 C2 R2", (4, 4, 3, 12, "بالا")),
    # سند: B=2. نتیجه همان ۶ متوسط است.
    "EX05 هدف": (4, [path(4, 3)], "S2 D2 F1 C2 R1", (3, 3, 2, 6, "متوسط")),
    "EX06 جاری": (5, [path(5)], "S4 D4 F3 C3 R3", (5, 5, 4, 20, "بحرانی")),
    "EX07 جاری": (3, [path(5, 1)], "S5 D2 F3 C4 R3", (5, 4, 5, 20, "بحرانی")),
    # سند: B=2 و ۸ متوسط.
    "EX07 هدف": (3, [path(5, 3)], "S4 D2 F2 C4 R2", (3, 3, 4, 12, "بالا")),
    # حساب استثنا از همه‌ی موانع عبور می‌کند، پس مسیر جداست و Bc=5 دارد، با وجود پوشش ۹۹ درصد بقیه.
    "EX08 جاری": (
        4,
        [path(5, 3, name="حساب‌های زیر کنترل"), path(5, name="حساب استثنا")],
        "S2 D4 F3 C3 R2",
        (5, 5, 4, 20, "بحرانی"),
    ),
    # سند: B=2. نتیجه همان ۱۲ بالاست.
    "EX08 هدف": (4, [path(5, 3, name="همه‌ی مسیرهای ممتاز")], "S2 D4 F3 C3 R2", (3, 3, 4, 12, "بالا")),
    # مثال بخش ۱۷ (سند: Bc=2 و امتیاز ۸). یک کنترل E3 یعنی Bc=3، B=3، L=3 و امتیاز ۱۲.
    "بخش ۱۷ جاری": (3, [path(5, 3)], "S4", (3, 3, 4, 12, "بالا")),
}


@pytest.mark.parametrize("name", EXAMPLES)
def test_examples_of_the_document_with_corrected_results(tables, name):
    a, paths, impacts, expected = EXAMPLES[name]

    result = run(tables, a, paths, profile(impacts))

    assert summary(result) == expected
    assert not result.incomplete


def test_inherent_examples(tables):
    """ذاتی هر مثال با همان A و I0 و بدون اعتبار کنترل‌ها (B=B0)."""
    inherent = {"EX01": (5, 5, 25), "EX02": (3, 4, 16), "EX03": (4, 4, 20), "EX04": (2, 4, 12), "EX05": (4, 3, 12)}
    b0 = {"EX05": 4}
    for name, (a, impact, score) in inherent.items():
        result = run(tables, a, path(b0.get(name, 5)), profile(f"S{impact}"))
        assert result.score.high == score, name


def test_section_17_example_inherent(tables):
    """«بدون مانع، L ذاتی برابر ۴ می‌شود.»"""
    assert run(tables, 3, path(5), profile("S4")).likelihood.high == 4


# ---------- آزمون‌های بخش ۳۰ ----------


def test_25_likelihood_cells_are_1_to_5_and_never_drop(tables):
    for a, b in itertools.product(LEVELS, LEVELS):
        likelihood = run(tables, a, path(b), profile("S3")).likelihood.high
        assert likelihood in LEVELS
        if a > 1:
            assert likelihood >= run(tables, a - 1, path(b), profile("S3")).likelihood.high
        if b > 1:
            assert likelihood >= run(tables, a, path(b - 1), profile("S3")).likelihood.high


def test_125_combinations_lowering_b_or_i_never_raises_the_level(tables):
    def outcome(a, b, impact):
        result = run(tables, a, path(b), profile(f"S{impact}"))
        return result.score.high, result.decision_level.rank

    for a, b, impact in itertools.product(LEVELS, LEVELS, LEVELS):
        score, rank = outcome(a, b, impact)
        assert 1 <= score <= 25
        if b > 1:
            assert outcome(a, b - 1, impact)[1] <= rank
        if impact > 1:
            assert outcome(a, b, impact - 1)[1] <= rank


def test_7775_non_zero_profiles_give_i_between_1_and_5_and_all_zero_is_rejected(tables):
    count = 0
    for levels in itertools.product(range(6), repeat=len(DIMENSIONS)):
        impacts = tuple(Impact("داتین", code, level) for code, level in zip(DIMENSIONS, levels))
        if not any(levels):
            with pytest.raises(InvalidInput, match="تمام‌صفر"):
                run(tables, 3, path(3), impacts)
            continue
        assert run(tables, 3, path(3), impacts).impact.high == max(levels)
        count += 1
    assert count == 7775


def test_severe_impact_with_low_likelihood(tables):
    """L1 و I5 امتیاز ۵ دارد ولی سطح تصمیم بالاست؛ L1 و I4 دست‌کم متوسط است. امتیاز عوض نمی‌شود."""
    i5 = run(tables, 1, path(1), profile("S5"))
    i4 = run(tables, 1, path(1), profile("S4"))

    assert (i5.likelihood.high, i5.score.high, i5.base_level.name, i5.decision_level.name) == (1, 5, "متوسط", "بالا")
    assert (i4.score.high, i4.base_level.name, i4.decision_level.name) == (4, "پایین", "متوسط")
    assert "کف پیامد" in i5.escalation_reasons[0]


def test_control_in_same_rank_cells_does_not_lower_the_score(tables):
    """در A4، تغییر B3 به B2، L را از ۳ کمتر نمی‌کند."""
    assert run(tables, 4, path(3), profile("S3")).likelihood.high == 3
    assert run(tables, 4, path(2), profile("S3")).likelihood.high == 3


def test_e1_controls_give_no_reduction_in_examples_1_3_and_7(tables):
    for a, impacts in [(5, "S5 D4 F4 C4 R3"), (4, "S1 D4 F2 C3 R3"), (3, "S5 D2 F3 C4 R3")]:
        with_control = run(tables, a, path(5, 1), profile(impacts))
        without = run(tables, a, path(5), profile(impacts))
        assert with_control.score == without.score


def test_bypass_with_99_percent_coverage_blocks_the_reduction(tables):
    """مثال هشتم: حتی با پوشش ۹۹ درصد، مسیر استثنای باز B را ۵ نگه می‌دارد."""
    covered = path(5, 4, 4, independent=True, name="۹۹ درصد حساب‌ها")
    exception = path(5, name="حساب استثنا")

    assert run(tables, 4, [covered], profile("D4")).b.high == 1
    assert run(tables, 4, [covered, exception], profile("D4")).b.high == 5


def test_uncertain_a_decides_on_the_upper_bound(tables):
    """A در بازه‌ی ۳ تا ۴، B برابر ۴ و I برابر ۴: امتیاز ۱۲ تا ۱۶ و تصمیم بر ۱۶ و بحرانی."""
    result = run(tables, (3, 4), path(4), profile("S4"))

    assert (result.score.low, result.score.high) == (12, 16)
    assert result.decision_score == 16
    assert result.base_level.name == result.decision_level.name == "بحرانی"
    assert str(result.score) == "12 تا 16"
    assert not result.incomplete


# ---------- عدم قطعیت و «ارزیابی ناقص» (بخش ۷) ----------


def test_range_in_e_gives_a_range_in_bc(tables):
    result = run(tables, 3, path(5, (2, 3)), profile("S3"))

    assert (result.paths[0].bc.low, result.paths[0].bc.high) == (3, 4)


def test_range_in_impact(tables):
    result = run(tables, 3, path(5), (Impact("داتین", "S", (2, 4)), Impact("بانک", "F", 3)))

    assert (result.impact.low, result.impact.high) == (3, 4)


def test_impact_range_starting_at_zero_scores_from_the_lowest_level(tables):
    result = run(tables, 3, path(3), (Impact("داتین", "S", (0, 2)),))

    assert (result.impact.low, result.impact.high) == (1, 2)


def test_unknown_a_makes_the_assessment_incomplete(tables):
    result = run(tables, None, path(5), profile("S3"))

    assert result.incomplete
    assert result.likelihood is None and result.score is None and result.decision_level is None
    assert "A نامعلوم" in result.incomplete_reasons[0]


def test_unknown_b0_makes_the_assessment_incomplete(tables):
    result = run(tables, 3, [path(4, name="مسیر رسمی"), path(None, name="مسیر پشتیبانی")], profile("S3"))

    assert result.incomplete
    assert "مسیر پشتیبانی" in result.incomplete_reasons[0]


def test_unknown_b0_does_not_matter_when_another_path_is_already_5(tables):
    result = run(tables, 3, [path(5), path(None)], profile("S3"))

    assert not result.incomplete
    assert result.b.high == 5


def test_unknown_impact_makes_the_assessment_incomplete(tables):
    impacts = (Impact("داتین", "S", 3), Impact("بانک ملت", "C", None))

    result = run(tables, 3, path(5), impacts)

    assert result.incomplete
    assert result.impact is None
    assert "C برای بانک ملت" in result.incomplete_reasons[0]


def test_unknown_impact_does_not_matter_when_another_is_already_5(tables):
    impacts = (Impact("داتین", "S", 5), Impact("بانک ملت", "C", None))

    assert not run(tables, 3, path(5), impacts).incomplete


def test_zeros_with_unknowns_are_incomplete_not_invalid(tables):
    impacts = (Impact("داتین", "S", 0), Impact("داتین", "D", None))

    assert run(tables, 3, path(5), impacts).incomplete


# ---------- قاعده‌های تقدم (بخش ۱۸) ----------


def test_ongoing_incident_raises_the_level_but_keeps_the_score(tables):
    result = run(tables, 1, path(1), profile("S1"), ongoing_incident=True)

    assert result.score.high == 1
    assert result.base_level.name == "پایین"
    assert result.decision_level.name == "بحرانی"
    assert "مدیریت رخداد" in result.escalation_reasons[0]


def test_binding_prohibition_is_out_of_acceptance_authority(tables):
    result = run(tables, 1, path(1), profile("C2"), binding_prohibition=True)

    assert result.decision_level.name == "بحرانی"
    assert result.out_of_acceptance_authority
    assert result.acceptance_restricted


def test_customer_tolerance_restricts_acceptance_without_changing_the_level(tables):
    result = run(tables, 2, path(2), profile("S2"), customer_tolerance_exceeded=True)

    assert result.decision_level.name == "پایین"
    assert result.acceptance_restricted
    assert not result.out_of_acceptance_authority


def test_ongoing_incident_sets_the_level_even_when_incomplete(tables):
    result = run(tables, None, path(5), profile("S3"), ongoing_incident=True)

    assert result.incomplete
    assert result.decision_level.name == "بحرانی"


# ---------- ورودی نامعتبر (بخش ۲۳) ----------


@pytest.mark.parametrize(
    ("a", "paths", "impacts", "message"),
    [
        (0, [path(3)], profile("S3"), "A باید بین 1 و 5"),
        (6, [path(3)], profile("S3"), "A باید بین 1 و 5"),
        (3, [path(7)], profile("S3"), "B0 مسیر 1"),
        (3, [path(3, 6)], profile("S3"), "E کنترل"),
        (3, [path(3, None)], profile("S3"), "E1"),
        (3, [path(3)], (Impact("داتین", "S", 6),), "پیامد S برای داتین"),
        (3, [path(3)], (Impact("داتین", "X", 3),), "«X»"),
        (3, [path(3)], (Impact("داتین", "S", 3), Impact("داتین", "S", 4)), "دو بار"),
        (3, [path(3)], (), "خالی"),
        (3, [], profile("S3"), "دست‌کم یک مسیر"),
        ((4, 3), [path(3)], profile("S3"), "کران پایین"),
        (2.5, [path(3)], profile("S3"), "عدد صحیح"),
        (True, [path(3)], profile("S3"), "عدد صحیح"),
    ],
)
def test_invalid_inputs_are_rejected(tables, a, paths, impacts, message):
    with pytest.raises(InvalidInput) as error:
        run(tables, a, paths, impacts)

    assert message in str(error.value)


def test_all_problems_are_reported_together(tables):
    with pytest.raises(InvalidInput) as error:
        run(tables, 9, [path(9)], (Impact("داتین", "S", 9),))

    assert len(error.value.messages) == 3


# ---------- هیچ عددی ثابت در کد نیست ----------


def test_the_engine_reads_every_number_from_the_version(tables):
    """اگر کارگروه در نسخه‌ی تازه جدول Bc، خانه‌ی جدول احتمال یا مرز سطح را عوض کند، نتیجه بدون تغییر کد عوض می‌شود."""
    v1 = tables.version
    draft = copy_version(v1, None)
    # همان خوانشی از جدول Bc که مثال‌های سند داشتند: E3 یعنی Bc=2
    draft.bc_rules.filter(bc=2).update(min_e=3)
    draft.likelihood_cells.filter(a=3, b=2).update(likelihood=3)
    draft.risk_levels.filter(rank=2).update(max_score=8)
    draft.risk_levels.filter(rank=3).update(min_score=9)

    before = run(tables, 3, path(5, 3), profile("S4"))
    after = run(MethodTables(draft), 3, path(5, 3), profile("S4"))

    assert summary(before) == (3, 3, 4, 12, "بالا")
    # با Bc=2: B=2، و L از خانه‌ی تغییرکرده‌ی A3×B2 برابر ۳ است، امتیاز ۱۲ و همچنان بالا
    assert summary(after) == (2, 3, 4, 12, "بالا")
    # مرز تازه‌ی سطح‌ها: امتیاز ۹ حالا «بالا» است
    assert run(MethodTables(draft), 3, path(3), profile("S3")).decision_level.name == "بالا"
    assert run(tables, 3, path(3), profile("S3")).decision_level.name == "متوسط"


def test_a_new_impact_dimension_in_a_version_is_accepted(tables):
    draft = copy_version(tables.version, None)
    scale = draft.scales.get(code="R")
    levels = list(scale.levels.all())
    scale.pk = None
    scale.code, scale.order = "H", 99
    scale.save()
    for level in levels:
        level.pk, level.scale = None, scale
        level.save()

    result = run(MethodTables(draft), 2, path(2), (Impact("داتین", "H", 5),))

    assert result.impact.high == 5
    with pytest.raises(InvalidInput):
        run(tables, 2, path(2), (Impact("داتین", "H", 5),))
