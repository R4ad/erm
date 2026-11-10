"""کاتالوگ، ساختار سازمانی و روش ارزیابی در رابط React از راه پل جنگو: فهرست‌ها و پرونده‌ها با همان دسترسی view
جنگو، و فرم‌های وابستگی، تعهد و واحد که بعد از ذخیره به همان صفحه‌ی جنگو برمی‌گردند."""

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.api.routes import spa_route
from apps.catalog.models import Commitment, Customer, Dependency, Responsibility, ServiceCustomer, Supplier
from apps.catalog.tests.factories import make_asset, make_service, make_user
from apps.methodology.models import MethodVersion
from apps.methodology.services import copy_version
from apps.organization.models import OrgUnit
from apps.risks.models import Coverage, RiskCategory

from .test_bridge import form, page, send, values_of

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="مینا", last_name="خدمتی")


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def service(owner):
    return make_service("SRV-PAY", owner=owner, name="درگاه پرداخت", is_critical=True)


def test_catalog_pages_open_in_react():
    assert spa_route(reverse("catalog:service_list")) == "/catalog/services"
    assert spa_route(reverse("catalog:service_detail", args=[3])) == "/catalog/services/3"
    assert spa_route(reverse("catalog:service_update", args=[3])) == "/catalog/services/3/edit"
    assert (
        spa_route(reverse("catalog:dependency_create", args=[3, "supplier"]))
        == "/catalog/services/3/dependencies/new/supplier"
    )
    assert spa_route(reverse("catalog:service_customer_create", args=[3])) == "/catalog/services/3/customers/new"
    assert spa_route(reverse("catalog:customer_list")) == "/catalog/customers"
    assert spa_route(reverse("catalog:commitment_list")) == "/catalog/commitments"
    assert spa_route(reverse("catalog:supplier_detail", args=[4])) == "/catalog/suppliers/4"
    assert spa_route(reverse("catalog:asset_detail", args=[5])) == "/catalog/assets/5"
    assert spa_route(reverse("organization:unit_list")) == "/units"
    assert spa_route(reverse("organization:unit_update", args=[2])) == "/units/2/edit"
    assert spa_route(reverse("methodology:active")) == "/method"
    assert spa_route(reverse("methodology:version_detail", args=[2])) == "/method/2"


def test_the_service_list_shows_what_each_user_may_see(api, grc, owner, service):
    other = make_service("SRV-SMS", name="پیامک بانکی", is_active=False)

    data = page(api(grc), reverse("catalog:service_list")).json()
    assert [row["code"] for row in data["results"]] == ["SRV-PAY", "SRV-SMS"]
    row = data["results"][0]
    assert row["name"] == "درگاه پرداخت" and row["is_critical"] and row["is_active"]
    assert row["owner"]["name"] == "مینا خدمتی" and row["kind"]["value"] == "service"
    assert row["href"] == service.get_absolute_url()
    assert data["create_url"] == reverse("catalog:service_create")
    assert {field["name"] for field in data["filters"]["fields"]} >= {"q", "status"}

    # مالک فقط خدمت خودش را می‌بیند و دکمه‌ی خدمت تازه ندارد؛ خدمت دیگر برایش اصلاً پیدا نمی‌شود.
    mine = page(api(owner), reverse("catalog:service_list")).json()
    assert [row["code"] for row in mine["results"]] == ["SRV-PAY"] and mine["create_url"] is None
    assert page(api(owner), other.get_absolute_url()).status_code == 404


def test_service_detail_has_commitments_dependencies_banks_and_coverage(api, grc, owner, service):
    bank = Customer.objects.create(name="بانک ملی", is_key=True)
    ServiceCustomer.objects.create(service=service, customer=bank, rto_minutes=240, mtpd_minutes=1440)
    commitment = Commitment.objects.create(title="دسترس‌پذیری ۹۹٫۹ درصد", customer=bank, owner=owner)
    commitment.services.add(service)
    supplier = Supplier.objects.create(name="شرکت شبکه")
    Dependency.objects.create(
        service=service,
        supplier=supplier,
        is_shared_point=True,
        infra_owner=Responsibility.SUPPLIER,
        incident_contact="مرکز عملیات",
    )
    hidden = make_service("SRV-CORE", name="هسته‌ی بانکی")
    Dependency.objects.create(service=service, upstream_service=hidden)
    category = RiskCategory.objects.filter(is_active=True).first()
    Coverage.objects.create(service=service, category=category, status=Coverage.Status.NOT_RELEVANT, reason="خیر")

    url = service.get_absolute_url()
    data = page(api(grc), url).json()
    assert data["title"] == str(service)
    assert data["service"]["environment"]["value"] == "datin"
    assert data["edit_url"] == reverse("catalog:service_update", args=[service.pk])
    [item] = data["commitments"]
    assert item["customer"] == "بانک ملی"
    assert item["edit_url"] == f"{reverse('catalog:commitment_update', args=[commitment.pk])}?service={service.pk}"
    assert data["add_commitment_url"] == f"{reverse('catalog:commitment_create')}?service={service.pk}"
    [link] = data["customer_links"]
    assert (link["customer"], link["is_key"], link["rto"], link["mtpd"], link["rpo"]) == (
        "بانک ملی",
        True,
        "4 ساعت",
        "1 روز",
        None,
    )
    by_target = {item["target"]: item for item in data["dependencies"]}
    network = by_target["شرکت شبکه"]
    assert network["is_shared_point"] and network["target_url"] == supplier.get_absolute_url()
    boundary = {row["label"]: row["value"] for row in network["boundary"]}
    assert boundary["مالک زیرساخت"] == "تأمین‌کننده" and boundary["مخاطب اعلام رخداد"] == "مرکز عملیات"
    assert boundary["تصمیم‌گیر تغییر"] == "-"
    assert by_target[str(hidden)]["boundary"] is None
    assert [item["label"] for item in data["add_dependency"]] == ["به خدمت دیگر", "به تأمین‌کننده", "به دارایی"]
    cells = {cell["category"]: cell for cell in data["coverage"]["cells"]}
    assert len(cells) == RiskCategory.objects.filter(is_active=True).count()
    assert (
        cells[category.code]["status"]["value"] == "not_relevant"
        and cells[category.code]["summary"] == f"{category}: خیر"
    )
    assert cells[category.code]["edit_url"].endswith(f"?next={url.replace('/', '%2F')}")
    assert data["create_risk_url"] == reverse("risks:scenario_list")

    # مالک خدمت هیچ دکمه‌ی ویرایشی ندارد و پیوند خدمت بالادستی‌ای را که نمی‌بیند هم نمی‌گیرد، ولی نامش را می‌بیند.
    mine = page(api(owner), url).json()
    assert mine["edit_url"] is None and mine["add_commitment_url"] is None and mine["add_dependency"] == []
    assert mine["commitments"][0]["edit_url"] is None and mine["create_risk_url"] is None
    targets = {item["target"]: item["target_url"] for item in mine["dependencies"]}
    assert targets[str(hidden)] is None
    assert all(cell["edit_url"] is None for cell in mine["coverage"]["cells"])


def test_inactive_service_has_no_coverage_and_no_new_risk(api, grc):
    retired = make_service("SRV-OLD", is_active=False)
    data = page(api(grc), retired.get_absolute_url()).json()
    assert data["coverage"] is None and data["create_risk_url"] is None


def test_supplier_and_asset_pages_list_only_visible_dependents(api, grc, owner, service):
    supplier = Supplier.objects.create(name="شرکت شبکه", is_critical=True, contract_owner=grc)
    asset = make_asset("AST-DB", name="پایگاه داده‌ی پرداخت", cia_c=True, cia_a=True)
    other = make_service("SRV-ATM", name="خودپرداز")
    for record in [service, other]:
        Dependency.objects.create(service=record, supplier=supplier)
        Dependency.objects.create(service=record, asset=asset)

    data = page(api(grc), supplier.get_absolute_url()).json()
    assert data["supplier"]["is_critical"] and data["supplier"]["contract_owner"]["name"] == "سارا احمدی"
    assert [item["service"]["code"] for item in data["dependents"]] == ["SRV-ATM", "SRV-PAY"]
    assert data["edit_url"] == reverse("catalog:supplier_update", args=[supplier.pk])

    mine = page(api(owner), supplier.get_absolute_url()).json()
    assert [item["service"]["code"] for item in mine["dependents"]] == ["SRV-PAY"] and mine["edit_url"] is None

    # دارایی‌ای که خدمت قابل‌دیدن مالک به آن وابسته است برایش دیده می‌شود.
    asset_page = page(api(owner), asset.get_absolute_url()).json()
    assert asset_page["asset"]["code"] == "AST-DB" and asset_page["asset"]["cia"] == ["C", "A"]
    assert [item["service"]["code"] for item in asset_page["dependents"]] == ["SRV-PAY"]


def test_commitments_list_only_visible_services(api, grc, owner, service):
    other = make_service("SRV-ATM")
    commitment = Commitment.objects.create(title="پاسخ‌گویی در چهار ساعت", owner=grc)
    commitment.services.add(service, other)

    data = page(api(grc), reverse("catalog:commitment_list")).json()
    [row] = data["results"]
    assert [item["code"] for item in row["services"]] == ["SRV-ATM", "SRV-PAY"]
    assert row["edit_url"] == reverse("catalog:commitment_update", args=[commitment.pk])

    [mine] = page(api(owner), reverse("catalog:commitment_list")).json()["results"]
    assert [item["code"] for item in mine["services"]] == ["SRV-PAY"] and mine["edit_url"] is None


def test_banks_list_editable_only_by_the_catalog_team(api, grc, owner):
    Customer.objects.create(name="بانک ملی", is_key=True, financial_basis=1000)
    data = page(api(grc), reverse("catalog:customer_list")).json()
    [row] = data["results"]
    assert (row["name"], row["is_key"], row["financial_basis"]) == ("بانک ملی", True, 1000)
    assert row["edit_url"] and data["create_url"] == reverse("catalog:customer_create")
    mine = page(api(owner), reverse("catalog:customer_list")).json()
    assert mine["create_url"] is None and mine["results"][0]["edit_url"] is None


def test_units_come_as_a_tree_with_managers(api, system_admin, owner):
    root = OrgUnit.objects.create(name="فناوری", code="IT")
    child = OrgUnit.objects.create(name="عملیات", parent=root)
    child.managers.add(owner)

    data = page(api(system_admin), reverse("organization:unit_list")).json()
    rows = {row["name"]: row for row in data["results"]}
    assert (rows["فناوری"]["depth"], rows["عملیات"]["depth"]) == (0, 1)
    assert [manager["name"] for manager in rows["عملیات"]["managers"]] == ["مینا خدمتی"]
    assert rows["عملیات"]["edit_url"] == reverse("organization:unit_update", args=[child.pk])
    assert data["create_url"] == reverse("organization:unit_create")

    # فقط مدیر سامانه ساختار را ویرایش می‌کند.
    mine = page(api(owner), reverse("organization:unit_list")).json()
    assert mine["create_url"] is None and all(row["edit_url"] is None for row in mine["results"])
    assert form(api(owner), reverse("organization:unit_create")).status_code == 403


def test_the_active_method_has_scales_tables_and_levels(api, owner):
    data = page(api(owner), reverse("methodology:active")).json()
    version = MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)
    assert data["version"]["number"] == version.number and data["version"]["status"]["value"] == "active"
    assert [item["number"] for item in data["versions"]] == [version.number]
    assert data["versions"][0]["current"]
    codes = [scale["code"] for scale in data["likelihood_scales"]]
    assert "Bc" in codes and "L" not in codes
    assert data["l_scale"]["code"] == "L"
    assert len(data["l_scale"]["grid"]) == len(data["levels_range"])
    assert all(len(row["values"]) == len(data["levels_range"]) for row in data["l_scale"]["grid"])
    assert data["risk_levels"] and all(level["color"].startswith("#") for level in data["risk_levels"])
    matrix = data["decision_matrix"]
    assert len(matrix) == len(data["levels_range"])
    cell = matrix[0]["cells"][0]
    assert {"score", "level", "raised"} <= set(cell)
    assert data["impact_scales"] and data["parameters"]
    assert data["active_url"] == reverse("methodology:active")


def test_drafts_are_seen_only_by_the_roles_that_review_them(api, grc, owner):
    active = MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)
    draft = copy_version(active, grc)

    data = page(api(grc), reverse("methodology:version_detail", args=[draft.number])).json()
    assert data["version"]["status"]["value"] == "draft" and data["version"]["based_on"] == str(active)
    assert {item["number"] for item in data["versions"]} == {active.number, draft.number}
    assert page(api(owner), reverse("methodology:version_detail", args=[draft.number])).status_code == 404


def test_a_dependency_is_added_through_the_django_form_and_returns_to_the_service(api, grc, service):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    path = reverse("catalog:dependency_create", args=[service.pk, "supplier"])

    described = form(api(grc), path).json()
    assert described["title"] == f"وابستگی خدمت {service} به تأمین‌کننده"
    assert described["cancel"]["route"] == f"/catalog/services/{service.pk}"
    names = {field["name"] for field in described["form"]["fields"]}
    assert {"supplier", "infra_owner", "incident_contact"} <= names and "asset" not in names

    values = values_of(described["form"]) | {"supplier": str(supplier.pk), "infra_owner": "supplier"}
    result = send(api(grc), path, values).json()
    assert result["redirect"]["route"] == f"/catalog/services/{service.pk}"
    assert result["message"] == f"وابستگی خدمت «{service.name}» به «{supplier}» ذخیره شد."
    assert Dependency.objects.get(service=service).infra_owner == Responsibility.SUPPLIER


def test_a_commitment_from_a_service_starts_with_that_service(api, grc, owner, service):
    path = f"{reverse('catalog:commitment_create')}?service={service.pk}"
    described = form(api(grc), path).json()
    fields = {field["name"]: field for field in described["form"]["fields"]}
    assert fields["services"]["value"] == [str(service.pk)]
    assert described["cancel"]["route"] == f"/catalog/services/{service.pk}"

    values = values_of(described["form"]) | {"title": "پاسخ در چهار ساعت", "owner": str(owner.pk)}
    result = send(api(grc), path, values).json()
    assert result["redirect"]["route"] == f"/catalog/services/{service.pk}"
    assert Commitment.objects.get(title="پاسخ در چهار ساعت").services.get() == service

    assert form(api(owner), path).status_code == 403
