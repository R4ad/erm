import pytest

from apps.organization.models import OrgUnit
from apps.organization.services import get_subtree_ids


@pytest.mark.django_db
def test_subtree_includes_all_descendants_only():
    root = OrgUnit.objects.create(name="مدیریت", code="1")
    child = OrgUnit.objects.create(name="مالی", code="1-1", parent=root)
    grandchild = OrgUnit.objects.create(name="خزانه", code="1-1-1", parent=child)
    OrgUnit.objects.create(name="فنی", code="2")

    assert get_subtree_ids(root) == {root.pk, child.pk, grandchild.pk}
    assert get_subtree_ids(child) == {child.pk, grandchild.pk}