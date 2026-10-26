from collections import defaultdict

from .models import OrgUnit


def get_subtree_ids(unit):
    """شناسه‌ی واحد و همه‌ی زیرمجموعه‌های آن را برمی‌گرداند."""
    ids = {unit.pk}
    frontier = [unit.pk]
    while frontier:
        children = OrgUnit.objects.filter(parent_id__in=frontier).values_list("pk", flat=True)
        frontier = [pk for pk in children if pk not in ids]
        ids.update(frontier)
    return ids

def unit_tree(units):
    units = list(units)
    listed_ids = {unit.pk for unit in units}
    children = defaultdict(list)
    for unit in units:
        parent_id = unit.parent_id if unit.parent_id in listed_ids else None
        children[parent_id].append(unit)

    ordered = []

    def visit(parent_id, depth):
        for unit in children[parent_id]:
            unit.depth = depth
            ordered.append(unit)
            visit(unit.pk, depth + 1)

    visit(None, 0)
    return ordered