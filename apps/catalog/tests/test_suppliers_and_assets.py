import pytest
from django.core.exceptions import ValidationError
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Asset, DataClass, Supplier
from apps.organization.models import OrgUnit

from .factories import make_asset, make_user


@pytest.fixture
def grc(db):
    return make_user("grc", Role.GRC_MEMBER)


def asset_data(unit, owner, **changes):
    data = {
        "code": "AST-10",
        "name": "سامانه‌ی پرداخت",
        "kind": Asset.Kind.SYSTEM,
        "org_unit": unit.pk,
        "owner": owner.pk,
        "data_class": DataClass.CONFIDENTIAL,
        "cia_c": "on",
        "cia_a": "on",
        "is_active": "on",
    }
    return data | changes


@pytest.mark.django_db
def test_supplier_name_and_asset_code_are_unique_with_persian_messages():
    Supplier.objects.create(name="شرکت شبکه")
    asset = make_asset("AST-1")

    with pytest.raises(ValidationError) as supplier_error:
        Supplier(name="شرکت شبکه").full_clean()
    with pytest.raises(ValidationError) as asset_error:
        Asset(code="AST-1", name="دیگری", kind=Asset.Kind.SITE, org_unit=asset.org_unit, owner=asset.owner).full_clean()

    assert supplier_error.value.message_dict["name"] == ["تأمین‌کننده‌ای با همین نام ثبت شده است."]
    assert asset_error.value.message_dict["code"] == ["دارایی‌ای با همین کد ثبت شده است."]


@pytest.mark.django_db
def test_active_asset_needs_an_active_unit_and_owner_but_an_inactive_one_does_not():
    asset = make_asset("AST-1")
    asset.org_unit.is_active = False
    asset.org_unit.save()
    asset.owner.is_active = False
    asset.owner.save()

    with pytest.raises(ValidationError) as error:
        asset.full_clean()

    assert error.value.message_dict == {
        "org_unit": ["این واحد غیرفعال است؛ دارایی فعال باید مال یک واحد فعال باشد."],
        "owner": ["این کاربر غیرفعال است؛ برای دارایی فعال مالک دیگری انتخاب کنید."],
    }
    asset.is_active = False
    asset.full_clean()  # دارایی غیرفعال فقط سابقه است


@pytest.mark.django_db
def test_active_supplier_needs_an_active_contract_owner_if_it_has_one():
    gone = make_user("gone", is_active=False)

    with pytest.raises(ValidationError) as error:
        Supplier(name="شرکت شبکه", contract_owner=gone).full_clean()

    assert set(error.value.message_dict) == {"contract_owner"}
    Supplier(name="شرکت شبکه").full_clean()  # مسئول قرارداد اختیاری است
    Supplier(name="شرکت شبکه", contract_owner=gone, is_active=False).full_clean()


def test_cia_labels_lists_only_the_checked_letters():
    assert Asset(cia_c=True, cia_a=True).cia_labels == "C، A"
    assert Asset(cia_c=True, cia_i=True, cia_a=True).cia_labels == "C، I، A"
    assert Asset().cia_labels == ""


@pytest.mark.django_db
def test_only_grc_and_system_admin_open_the_supplier_and_asset_forms(client, grc, system_admin):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    asset = make_asset("AST-1")
    pages = [
        reverse("catalog:supplier_create"),
        reverse("catalog:supplier_update", args=[supplier.pk]),
        reverse("catalog:asset_create"),
        reverse("catalog:asset_update", args=[asset.pk]),
    ]

    for user, status in [(make_user("viewer", Role.VIEWER), 403), (grc, 200), (system_admin, 200)]:
        client.force_login(user)
        assert [client.get(page).status_code for page in pages] == [status] * 4


@pytest.mark.django_db
def test_suppliers_are_open_to_everyone(client):
    supplier = Supplier.objects.create(name="شرکت شبکه", description="پشتیبانی شبکه", is_critical=True)
    client.force_login(make_user("sara"))

    response = client.get(reverse("catalog:supplier_list"))

    assert list(response.context["suppliers"]) == [supplier]
    assert response.context["can_edit"] is False
    assert client.get(supplier.get_absolute_url()).status_code == 200


@pytest.mark.django_db
def test_supplier_filter_searches_name_and_description(client):
    network = Supplier.objects.create(name="شرکت شبکه", description="پشتیبانی شبکه و فایروال", is_critical=True)
    Supplier.objects.create(name="شرکت نظافت", is_active=False)
    client.force_login(make_user("sara"))

    def listed(**params):
        return list(client.get(reverse("catalog:supplier_list"), params).context["suppliers"])

    assert listed(q="فایروال") == [network]
    assert listed(is_critical="yes") == [network]
    assert [supplier.name for supplier in listed(status="inactive")] == ["شرکت نظافت"]


@pytest.mark.django_db
def test_new_asset_is_saved_with_history_and_opens_its_page(client, grc):
    unit = OrgUnit.objects.create(name="فنی")
    owner = make_user("ali")
    client.force_login(grc)

    response = client.post(reverse("catalog:asset_create"), asset_data(unit, owner))

    asset = Asset.objects.get(code="AST-10")
    assert response.url == asset.get_absolute_url()
    assert (asset.data_class, asset.cia_c, asset.cia_i, asset.cia_a) == ("confidential", True, False, True)
    assert asset.history.first().history_user == grc
    page = client.get(asset.get_absolute_url()).content.decode()
    assert "محرمانه" in page
    assert "C، A" in page


@pytest.mark.django_db
def test_cancel_goes_to_the_list_when_creating_and_to_the_record_when_editing(client, grc):
    asset = make_asset("AST-1")
    client.force_login(grc)

    assert client.get(reverse("catalog:asset_create")).context["cancel_url"] == reverse("catalog:asset_list")
    edit_page = client.get(reverse("catalog:asset_update", args=[asset.pk]))
    assert edit_page.context["cancel_url"] == asset.get_absolute_url()


@pytest.mark.django_db
def test_asset_form_offers_only_active_units_and_owners_but_keeps_the_current_ones(client, grc):
    old_unit = OrgUnit.objects.create(name="قدیمی", is_active=False)
    old_owner = make_user("old", is_active=False)
    asset = make_asset("AST-1", org_unit=old_unit, owner=old_owner, is_active=False)
    client.force_login(grc)

    new_form = client.get(reverse("catalog:asset_create")).context["form"]
    edit_form = client.get(reverse("catalog:asset_update", args=[asset.pk])).context["form"]

    assert old_unit not in new_form.fields["org_unit"].queryset
    assert old_owner not in new_form.fields["owner"].queryset
    assert old_unit in edit_form.fields["org_unit"].queryset
    assert old_owner in edit_form.fields["owner"].queryset


@pytest.mark.django_db
def test_supplier_form_keeps_an_inactive_contract_owner_only_for_that_supplier(client, grc):
    gone = make_user("gone", is_active=False)
    supplier = Supplier.objects.create(name="شرکت شبکه", contract_owner=gone, is_active=False)
    client.force_login(grc)

    assert gone not in client.get(reverse("catalog:supplier_create")).context["form"].fields["contract_owner"].queryset
    edit_form = client.get(reverse("catalog:supplier_update", args=[supplier.pk])).context["form"]
    assert gone in edit_form.fields["contract_owner"].queryset


@pytest.mark.django_db
def test_unit_manager_sees_only_assets_of_own_units(client):
    mine = make_asset("AST-1")
    other = make_asset("AST-2")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit)
    client.force_login(manager)

    assert list(client.get(reverse("catalog:asset_list")).context["assets"]) == [mine]
    assert client.get(mine.get_absolute_url()).status_code == 200
    assert client.get(other.get_absolute_url()).status_code == 404


@pytest.mark.django_db
def test_asset_filters(client, grc):
    finance = OrgUnit.objects.create(name="مالی")
    ledger = make_asset("AST-1", org_unit=OrgUnit.objects.create(name="حسابداری", parent=finance), name="دفتر کل")
    site = make_asset("AST-2", kind=Asset.Kind.SITE, data_class=DataClass.INTERNAL)
    client.force_login(grc)

    def listed(**params):
        return list(client.get(reverse("catalog:asset_list"), params).context["assets"])

    assert listed(q="دفتر") == [ledger]
    assert listed(unit=finance.pk) == [ledger]  # زیرمجموعه‌ها هم
    assert listed(kind=Asset.Kind.SITE) == [site]
    assert listed(data_class=DataClass.INTERNAL) == [site]


@pytest.mark.django_db
def test_menu_links_to_the_new_lists(client):
    client.force_login(make_user("sara"))

    page = client.get(reverse("core:home")).content.decode()

    assert reverse("catalog:asset_list") in page
    assert reverse("catalog:supplier_list") in page
