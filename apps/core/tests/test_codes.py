import pytest

from apps.core.models import CodeCounter
from apps.core.services import next_code

pytestmark = pytest.mark.django_db


def test_each_prefix_counts_on_its_own():
    assert [next_code("SC"), next_code("SC"), next_code("RK-1405")] == ["SC-0001", "SC-0002", "RK-1405-0001"]
    assert CodeCounter.objects.get(prefix="SC").last == 2


def test_numbers_grow_past_the_width():
    CodeCounter.objects.create(prefix="SC", last=9999)

    assert next_code("SC") == "SC-10000"
