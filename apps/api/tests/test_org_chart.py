"""«چارت سازمانی» (فیگما ۱۸): درخت واحدها با شمار ریسک زیردرخت، جزئیات واحد انتخاب‌شده و اعضای آن."""

import pytest

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import approved, make_risk
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.organization.models import OrgUnit
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db
URL = "/api/org/chart/"


@pytest.fixture
def admin():
    return make_user("admin", Role.SYSTEM_ADMIN, Role.GRC_MEMBER, first_name="سارا", last_name="محمدی")


@pytest.fixture
def org(admin):
    """داتین ← معاونت فناوری ← زیرساخت؛ مدیر معاونت مرجع پذیرش متوسط زیرساخت است."""
    root = OrgUnit.objects.create(name="داتین", code="DTN")
    tech = OrgUnit.objects.create(name="معاونت فناوری", code="TEC", parent=root)
    infra = OrgUnit.objects.create(name="زیرساخت", code="INF", parent=tech, ad_group="OU=Infra")
    deputy = make_user("deputy", first_name="مهدی", last_name="فرهادی", job_title="جانشین", org_unit=infra)
    infra.deputy = deputy
    infra.save()
    head = make_user("head", Role.UNIT_MANAGER, first_name="علی", last_name="رضایی", source=User.Source.AD)
    head.managed_units.add(tech, infra)
    boss = make_user("boss", Role.UNIT_MANAGER, first_name="نرگس", last_name="کاظمی")
    boss.managed_units.add(root)
    return {"root": root, "tech": tech, "infra": infra, "head": head, "deputy": deputy}


def risk_in(unit, owner, grc, level_name, score):
    risk = make_risk(owner, f"ریسک {Risk.objects.count() + 1}")
    approved(risk, grc, level_name, score)  # ریسک را دوباره ذخیره می‌کند، پس واحد پس از آن عوض می‌شود
    Risk.objects.filter(pk=risk.pk).update(org_unit=unit)
    return risk


def test_the_tree_counts_risks_per_subtree_and_shows_the_selected_unit(client, admin, org):
    infra, tech = org["infra"], org["tech"]
    risk_in(infra, org["head"], admin, "بحرانی", 20)
    risk_in(infra, org["head"], admin, "متوسط", 6)
    risk_in(tech, org["head"], admin, "بالا", 12)
    closed = risk_in(tech, org["head"], admin, "بحرانی", 20)
    Risk.objects.filter(pk=closed.pk).update(status=Risk.Status.CLOSED)
    service = make_service("SRV-CORE", org_unit=infra, owner=org["head"], name="شبکه‌ی مرکزی")
    service.customers.add(Customer.objects.create(name="بانک ملت", is_key=True))

    client.force_login(admin)
    data = client.get(f"{URL}?unit={infra.pk}").json()

    assert data["summary"]["levels"] == 3
    root = next(node for node in data["tree"] if node["code"] == "DTN")
    assert root["manager"]["name"] == "نرگس کاظمی"
    tech_node = root["children"][0]
    assert (tech_node["code"], tech_node["risks"], tech_node["critical"]) == ("TEC", 3, 1)
    infra_node = tech_node["children"][0]
    assert (infra_node["code"], infra_node["risks"], infra_node["critical"]) == ("INF", 2, 1)

    unit = data["selected"]
    assert unit["name"] == "زیرساخت" and unit["parent"] == "معاونت فناوری" and unit["ad_group"] == "OU=Infra"
    assert unit["manager"]["name"] == "علی رضایی" and unit["deputy"]["name"] == "مهدی فرهادی"
    assert unit["services"] == ["شبکه‌ی مرکزی"] and unit["customers"] == ["بانک ملت"]
    assert unit["acceptance"] == "مدیر بالادست: علی رضایی"
    assert [(level["name"], level["count"]) for level in unit["levels"]] == [
        ("بحرانی", 1),
        ("بالا", 0),
        ("متوسط", 1),
        ("پایین", 0),
    ]
    assert unit["edit_url"] == f"/units/{infra.pk}/edit/"
    assert unit["add_child_url"] == f"/units/new/?parent={infra.pk}"

    members = data["members"]
    assert [member["username"] for member in members] == ["head", "deputy"]
    assert [role["label"] for role in members[0]["roles"]] == ["مدیر واحد", "مالک ریسک"]
    assert members[0]["source"] == {"value": "ad", "label": "AD"}
    assert members[1]["roles"] == [{"label": "کارشناس", "tone": "neutral"}]
    assert members[1]["source"]["value"] == "local"


def test_only_the_system_admin_gets_edit_links_and_the_own_unit_is_the_default(client, org):
    viewer = make_user("viewer", Role.VIEWER, org_unit=org["tech"])
    client.force_login(viewer)
    data = client.get(URL).json()
    assert data["selected"]["code"] == "TEC"
    assert data["can_edit"] is False and data["add_unit_url"] is None and data["add_member_url"] is None
    assert data["selected"]["edit_url"] is None and data["selected"]["add_child_url"] is None
    assert data["selected"]["acceptance"] == "مدیر بالادست: نرگس کاظمی"


def test_add_child_unit_presets_the_parent(client, admin, org):
    client.force_login(admin)
    response = client.get(f"/units/new/?parent={org['tech'].pk}")
    assert response.context["form"].initial["parent"] == str(org["tech"].pk)


def test_add_member_opens_the_new_user_form_with_the_selected_unit(client, admin, org):
    client.force_login(admin)
    data = client.get(f"{URL}?unit={org['infra'].pk}").json()
    assert data["add_member_url"] == f"/accounts/users/new/?org_unit={org['infra'].pk}"
    response = client.get(data["add_member_url"])
    assert response.status_code == 200
    assert response.context["form"].initial["org_unit"] == str(org["infra"].pk)
