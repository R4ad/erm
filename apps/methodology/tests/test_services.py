import pytest

from apps.methodology.models import MethodVersion
from apps.methodology.services import MethodTables

from .factories import make_level, make_version

pytestmark = pytest.mark.django_db


def test_floor_raises_the_level_but_not_the_score():
    tables = MethodTables(MethodVersion.objects.get(number=1))

    # L1 × I5 = 5 یعنی سطح پایه‌ی متوسط، ولی پیامد ۵ دست‌کم بالاست
    assert tables.base_level(5).name == "متوسط"
    assert tables.decision_level(1, 5).name == "بالا"
    # L1 × I4 = 4 یعنی پایین، ولی پیامد ۴ دست‌کم متوسط است
    assert tables.decision_level(1, 4).name == "متوسط"
    # کف هیچ‌وقت سطح را پایین نمی‌آورد
    assert tables.decision_level(5, 5).name == "بحرانی"


def test_matrix_marks_only_the_cells_that_a_floor_raised():
    matrix = MethodTables(MethodVersion.objects.get(number=1)).decision_matrix()

    raised = [(likelihood, impact) for likelihood, cells in matrix for impact, cell in enumerate(cells, 1) if cell["raised"]]

    assert raised == [(1, 4), (1, 5)]


def test_score_outside_every_level_is_an_error_but_the_matrix_still_shows():
    draft = make_version(2)
    make_level(draft, 1, 1, 4)
    make_level(draft, 2, 5, 9)
    tables = MethodTables(draft)

    with pytest.raises(ValueError):
        tables.base_level(10)
    cells = dict(tables.decision_matrix())[2]  # L2: امتیازهای ۲، ۴، ۶، ۸ و ۱۰
    assert [cell["level"].name if cell["level"] else None for cell in cells] == ["سطح 1", "سطح 1", "سطح 2", "سطح 2", None]
