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