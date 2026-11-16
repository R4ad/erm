"""«پروفایل کاربر» (فیگما ۲۹): هویت از AD، نقش‌ها با منشأ و تاریخ، تفکیک وظایف، مسئولیت‌های فعال، فعالیت اخیر،
ذخیره‌ی نقش‌های گروهی و تفویض، لغو تفویض و غیرفعال‌سازی."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Delegation, User
from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import approved, make_risk
from apps.audit.models import AuditEvent
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.organization.models import OrgUnit

pytestmark = pytest.mark.django_db


@pytest.fixture
def admin():
    return make_user("admin", Role.SYSTEM_ADMIN, first_name="سارا", last_name="محمدی")


@pytest.fixture
def unit():
    parent = OrgUnit.objects.create(name="معاونت امنیت", code="P-SEC")
    return OrgUnit.objects.create(name="امنیت و تداوم", code="P-BCM", parent=parent)


@pytest.fixture
def boss(unit):
    boss = make_user("boss", first_name="سعید", last_name="مرادی")
    boss.managed_units.add(unit.parent)
    return boss


@pytest.fixture
def mehdi(unit, boss):
    return make_user(
        "m.farhadi",
        Role.SECURITY_WORKGROUP,
        first_name="مهدی",
        last_name="فرهادی",
        source=User.Source.AD,
        org_unit=unit,
        job_title="معاون",
    )


def url(user):
    return f"/api/accounts/users/{user.pk}/"


def test_the_profile_shows_identity_roles_duties_and_activity(client, admin, mehdi, boss):
    grc = make_user("grc", Role.GRC_MEMBER)
    risk = make_risk(mehdi, "نفوذ از طریق حساب دسترسی ممتاز ساتنا")
    approved(risk, grc, "بالا", 20)
    client.force_login(admin)
    data = client.get(url(mehdi)).json()

    assert data["name"] == "مهدی فرهادی" and data["initials"] == "م ف"
    assert data["subtitle"] == "امنیت و تداوم · نام کاربری m.farhadi · مدیر مستقیم: سعید مرادی"
    assert data["source"] == {"value": "ad", "label": "همگام با AD"} and data["identity"]["locked"]
    fields = {field["key"]: field["value"] for field in data["identity"]["fields"]}
    assert fields["job_title"] == "معاون" and fields["manager"] == "سعید مرادی"
    roles = {role["key"]: role for role in data["roles"]}
    assert roles["workgroup"]["origin"] == "تخصیص در ERM" and roles["workgroup"]["removable"]
    assert roles["workgroup"]["since"] == to_jalali(timezone.localdate()).translate(
        str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
    )
    assert roles["owner"]["origin"] == "از روی سوابق" and not roles["owner"]["removable"]
    assert roles["owner"]["scope"] == "امنیت و تداوم · ۱ ریسک"
    assert data["sod"]["chip"] == {"label": "بدون تعارض فعال", "tone": "success"}
    assert {check["tone"] for check in data["sod"]["checks"]} == {"success", "warning"}  # کارگروه و مالک هم‌زمان
    tiles = {tile["key"]: tile["value"] for tile in data["duties"]["tiles"]}
    assert tiles["risks"] == 1
    assert data["duties"]["risks"][0]["score"] == 20 and data["duties"]["risks"][0]["level"]["name"] == "بالا"
    assert data["activity"][0]["title"] == "تغییر نقش: افزودن کارگروه امنیت"
    assert [level["delegable"] for level in data["levels"]] == [True, True, False, False]
    assert data["delegation"] is None and data["can_deactivate"]


def test_group_roles_are_saved_and_derived_roles_are_not(client, admin, mehdi):
    client.force_login(admin)
    response = client.post(url(mehdi), {"action": "save", "roles": ["viewer"]}, "application/json")

    assert response.status_code == 200 and response.json()["message"] == "تغییرات ذخیره شد"
    assert set(mehdi.groups.values_list("name", flat=True)) == {Role.VIEWER}
    assert AuditEvent.objects.filter(event=AuditEvent.Event.ROLES_CHANGED, details__action="removed").exists()
    bad = client.post(url(mehdi), {"action": "save", "roles": ["owner"]}, "application/json")
    assert bad.status_code == 400
    own = client.post(url(admin), {"action": "save", "roles": []}, "application/json")
    assert own.status_code == 400 and admin.has_role(Role.SYSTEM_ADMIN)


def test_a_delegation_is_scheduled_within_the_delegable_levels(client, admin, mehdi, boss):
    successor = make_user("a.rezaei", first_name="علی", last_name="رضایی", job_title="کارشناس ارشد امنیت")
    today = timezone.localdate()
    body = {
        "successor": successor.pk,
        "starts_on": to_jalali(today + timedelta(days=4)),
        "ends_on": to_jalali(today + timedelta(days=18)),
        "max_rank": 2,
        "notify_successor": True,
        "copy_owner": False,
    }
    client.force_login(admin)
    high = client.post(url(mehdi), {"action": "save", "delegation": {**body, "max_rank": 3}}, "application/json")
    assert high.status_code == 400 and "بالا و بحرانی" in high.json()["detail"]
    past = {**body, "starts_on": to_jalali(today - timedelta(days=9)), "ends_on": to_jalali(today - timedelta(days=2))}
    assert client.post(url(mehdi), {"action": "save", "delegation": past}, "application/json").status_code == 400

    data = client.post(url(mehdi), {"action": "save", "delegation": body}, "application/json").json()
    found = Delegation.objects.get()
    assert found.user == mehdi and found.successor == successor and found.created_by == admin and not found.copy_owner
    assert data["delegation"]["chip"] == {"label": "زمان‌بندی‌شده · ۴ روز دیگر", "tone": "info"}
    assert data["delegation"]["successor"]["name"] == "علی رضایی · کارشناس ارشد امنیت"
    assert data["delegation"]["scope"] == "تصمیم مواجهه و پذیرش تا سطح متوسط"
    assert data["delegation"]["escalation"] == "سعید مرادی"

    # ذخیره‌ی دوباره همان تفویض را عوض می‌کند، نه تفویض تازه
    client.post(url(mehdi), {"action": "save", "delegation": {**body, "max_rank": 1}}, "application/json")
    assert Delegation.objects.get().max_rank == 1
    cancelled = client.post(url(mehdi), {"action": "cancel_delegation"}, "application/json").json()
    assert cancelled["delegation"] is None and Delegation.objects.get().cancelled_at is not None


def test_deactivation_keeps_records_and_only_admins_see_profiles(client, admin, mehdi):
    client.force_login(admin)
    assert client.post(url(admin), {"action": "deactivate"}, "application/json").status_code == 400
    data = client.post(url(mehdi), {"action": "deactivate"}, "application/json").json()
    mehdi.refresh_from_db()
    assert not mehdi.is_active and data["status"]["value"] == "inactive" and not data["can_deactivate"]

    client.force_login(make_user("manager", Role.UNIT_MANAGER))
    assert client.get(url(mehdi)).status_code == 403
    assert client.post(url(mehdi), {"action": "deactivate"}, "application/json").status_code == 403
