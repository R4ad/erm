from django.contrib.auth.models import Group

from apps.accounts.models import User
from apps.catalog.models import Asset, Service
from apps.organization.models import OrgUnit


def make_user(username, *roles, **fields):
    user = User.objects.create_user(username, **fields)
    for role in roles:
        user.groups.add(Group.objects.get(name=role))
    return user


def make_service(code, org_unit=None, owner=None, **fields):
    """خدمت آزمایشی؛ هر فیلدی که داده نشود مقدار ساده‌ای می‌گیرد."""
    org_unit = org_unit or OrgUnit.objects.create(name=f"واحد {code}")
    owner = owner or make_user(f"owner-{code}")
    values = {
        "name": f"خدمت {code}",
        "kind": Service.Kind.SERVICE,
        "lifecycle_stage": Service.LifecycleStage.OPERATION,
        "environment": Service.Environment.DATIN,
        **fields,
    }
    return Service.objects.create(code=code, org_unit=org_unit, owner=owner, **values)


def make_asset(code, org_unit=None, owner=None, **fields):
    """دارایی آزمایشی، مثل make_service."""
    org_unit = org_unit or OrgUnit.objects.create(name=f"واحد {code}")
    owner = owner or make_user(f"owner-{code}")
    values = {"name": f"دارایی {code}", "kind": Asset.Kind.SYSTEM, **fields}
    return Asset.objects.create(code=code, org_unit=org_unit, owner=owner, **values)
