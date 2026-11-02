"""نسخه‌ی ۱ را migration داده می‌سازد. این تست‌ها می‌گویند داده همان سند v5 است."""

import re
from decimal import Decimal

import pytest

from apps.methodology.models import PARAMETER_UNITS, MethodParameter, MethodVersion
from apps.methodology.services import MethodTables

pytestmark = pytest.mark.django_db

# جدول بخش ۱۷ سند v5: سطرها A1 تا A5 و ستون‌ها B1 تا B5
V5_LIKELIHOOD_TABLE = [
    [1, 1, 2, 2, 2],
    [1, 2, 2, 3, 3],
    [2, 2, 3, 3, 4],
    [2, 3, 3, 4, 5],
    [2, 3, 4, 5, 5],
]

# ماتریس بخش ۱۸ سند v5، همان‌طور که در سند چاپ شده است: سطرها L1 تا L5 و ستون‌ها I1 تا I5
V5_DECISION_MATRIX = [
    ["پایین", "پایین", "پایین", "متوسط", "بالا"],
    ["پایین", "پایین", "متوسط", "متوسط", "بالا"],
    ["پایین", "متوسط", "متوسط", "بالا", "بالا"],
    ["پایین", "متوسط", "بالا", "بحرانی", "بحرانی"],
    ["متوسط", "بالا", "بالا", "بحرانی", "بحرانی"],
]


@pytest.fixture
def v5():
    return MethodVersion.objects.get(number=1)


def test_version_1_is_the_only_version_and_is_active_and_trial(v5):
    assert list(MethodVersion.objects.all()) == [v5]
    assert v5.status == MethodVersion.Status.ACTIVE
    assert v5.is_trial
    assert v5.activated_at is not None


def test_version_1_has_the_ten_scales_of_v5_with_their_levels(v5):
    scales = list(v5.scales.all())

    assert [(scale.code, scale.kind) for scale in scales] == [
        ("A", "likelihood"),
        ("B0", "likelihood"),
        ("E", "likelihood"),
        ("Bc", "likelihood"),
        ("L", "likelihood"),
        ("S", "impact"),
        ("D", "impact"),
        ("F", "impact"),
        ("C", "impact"),
        ("R", "impact"),
    ]
    for scale in scales:
        levels = list(scale.levels.all())
        expected = [1, 2, 3, 4, 5] if scale.kind == "likelihood" else [0, 1, 2, 3, 4, 5]
        assert [level.value for level in levels] == expected, scale.code
        if scale.code != "L":  # L معیار ندارد؛ از جدول A × B خوانده می‌شود
            assert all(level.criteria for level in levels), scale.code


def test_likelihood_table_is_the_table_of_section_17(v5):
    assert [row for _, row in MethodTables(v5).likelihood_grid()] == V5_LIKELIHOOD_TABLE


def test_levels_and_floors_give_exactly_the_decision_matrix_of_section_18(v5):
    tables = MethodTables(v5)

    matrix = [
        [tables.decision_level(likelihood, impact).name for impact in range(1, 6)] for likelihood in range(1, 6)
    ]

    assert matrix == V5_DECISION_MATRIX


def test_bc_rules_follow_the_table_of_section_15(v5):
    rules = [(rule.bc, rule.min_e, rule.min_count, rule.needs_independence) for rule in v5.bc_rules.all()]

    assert rules == [(4, 2, 1, False), (3, 3, 1, False), (2, 4, 1, False), (1, 4, 2, True)]


@pytest.mark.parametrize(
    "code, number, level",
    [
        ("A", "0.0999", 1),
        ("A", "0.1", 2),
        ("A", "9.99", 3),
        ("A", "10", 4),
        ("A", "100", 5),
        ("A", "5000", 5),
        ("F", "0.0001", 1),
        ("F", "0.01", 1),
        ("F", "0.0101", 2),
        ("F", "0.5", 3),
        ("F", "2", 4),
        ("F", "2.01", 5),
    ],
)
def test_numeric_bounds_of_a_and_f_follow_the_document(v5, code, number, level):
    assert v5.scales.get(code=code).level_for(Decimal(number)).value == level


def test_zero_loss_has_no_numeric_level_and_is_chosen_by_its_criteria(v5):
    loss = v5.scales.get(code="F")

    assert loss.level_for(Decimal(0)) is None
    assert loss.levels.get(value=0).criteria == "زیان قابل انتساب ندارد"


def test_rules_of_each_level_follow_sections_19_and_21(v5):
    rows = [
        (
            level.name,
            level.min_score,
            level.max_score,
            level.co_approver,
            level.containment_value,
            level.containment_unit,
            level.plan_value,
            level.plan_unit,
            level.acceptance_value,
            level.acceptance_unit,
            level.review_value,
            level.review_unit,
            level.color,
        )
        for level in v5.risk_levels.all()
    ]

    assert rows == [
        ("پایین", 1, 4, "none", None, "", 30, "day", 12, "month", 6, "month", "#198754"),
        ("متوسط", 5, 9, "upper_manager", None, "", 30, "day", 6, "month", 3, "month", "#ffc107"),
        ("بالا", 10, 15, "security_committee", None, "", 10, "working_day", 90, "day", 1, "month", "#fd7e14"),
        ("بحرانی", 16, 25, "security_committee", 24, "hour", 3, "working_day", 30, "day", 1, "week", "#dc3545"),
    ]


def test_every_parameter_has_a_value_and_a_unit(v5):
    values = {parameter.key: parameter.value for parameter in v5.parameters.all()}

    assert set(values) == set(MethodParameter.Key.values)
    assert set(PARAMETER_UNITS) == set(MethodParameter.Key.values)
    assert values["key_evidence_age"] == 90
    assert values["other_evidence_age"] == 180
    assert values["s_rto_fraction"] == Decimal("0.25")


def test_texts_have_no_missing_or_double_spaces(v5):
    texts = [v5.impact_guidance, v5.decision_guidance, v5.acceptance_guidance]
    for scale in v5.scales.all():
        texts += [scale.scope, scale.description, scale.guidance]
        texts += [level.name for level in scale.levels.all()] + [level.criteria for level in scale.levels.all()]

    for text in texts:
        assert not re.search(r"[آ-ی][A-Za-z]|[A-Za-z][آ-ی]", text), text  # مثل «باd»
        assert "  " not in text, text
        assert "نلازم" not in text, text


def test_seeded_rows_start_their_history(v5):
    level = v5.scales.get(code="S").levels.get(value=3)

    assert v5.history.get().history_type == "+"
    assert level.history.get().history_change_reason == "داده‌ی اولیه از سند v5"
