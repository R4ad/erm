import pytest

from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids, unit_tree


@pytest.mark.django_db
def test_subtree_includes_all_descendants_only():
    root = OrgUnit.objects.create(name="مدیریت", code="1")
    child = OrgUnit.objects.create(name="مالی", code="1-1", parent=root)
    grandchild = OrgUnit.objects.create(name="خزانه", code="1-1-1", parent=child)
    OrgUnit.objects.create(name="فنی", code="2")

    assert get_subtree_ids(root) == {root.pk, child.pk, grandchild.pk}
    assert get_subtree_ids(child) == {child.pk, grandchild.pk}

@pytest.mark.django_db
def test_unit_tree_puts_each_unit_right_after_its_parent():
    tech = OrgUnit.objects.create(name="فنی", code="2")
    root = OrgUnit.objects.create(name="مدیریت", code="1")
    child = OrgUnit.objects.create(name="مالی", code="1-1", parent=root)
    grandchild = OrgUnit.objects.create(name="خزانه", code="1-1-1", parent=child)

    tree = unit_tree(OrgUnit.objects.all())

    assert tree == [tech, root, child, grandchild]
    assert [unit.depth for unit in tree] == [0, 0, 1, 2]
    # اگر بالادست در فهرست نباشد، واحد ریشه حساب می‌شود و گم نمی‌شود.
    assert unit_tree([child, grandchild]) == [child, grandchild]