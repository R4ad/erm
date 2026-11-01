import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.forms import DependencyForm
from apps.catalog.models import Dependency, Responsibility, Supplier
from apps.catalog.permissions import visible_assets

from .factories import make_asset, make_service, make_user

# آنچه صفحه‌ی خدمت به‌جای پنج پرسش خالی مرز مسئولیت نشان می‌دهد
NO_BOUNDARY = '<span class="text-body-secondary">ثبت نشده</span>'


@pytest.fixture
def service(db):
    return make_service("SRV-1")


@pytest.fixture
def grc(db):
    return make_user("grc", Role.GRC_MEMBER)


def dependency_data(**changes):
    data = {
        "description": "تأیید تراکنش",
        "alternative": "",
        "is_shared_point": "on",
        "infra_owner": Responsibility.SUPPLIER,
        "control_operator": Responsibility.DATIN,
        "evidence_provider": "",
        "change_authority": "",
        "incident_contact": "مرکز عملیات تأمین‌کننده",
        "valid_from": "",
        "valid_until": "",
    }
    return data | changes


def test_dependency_needs_exactly_one_target(service):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    message = "وابستگی باید دقیقاً به یکی از این‌ها باشد: خدمت دیگر، تأمین‌کننده یا دارایی."
    nothing = Dependency(service=service)
    two_targets = Dependency(service=service, supplier=supplier, asset=make_asset("AST-1"))

    for dependency in [nothing, two_targets]:
        with pytest.raises(ValidationError) as error:
            dependency.full_clean()
        assert message in error.value.messages

    with pytest.raises(IntegrityError):  # در خود پایگاه داده هم
        Dependency.objects.create(service=service)


def test_service_cannot_depend_on_itself(service):
    with pytest.raises(ValidationError) as error:
        Dependency(service=service, upstream_service=service).full_clean()
    assert error.value.messages == ["خدمت نمی‌تواند به خودش وابسته باشد."]

    with pytest.raises(IntegrityError):
        Dependency.objects.create(service=service, upstream_service=service)


def test_same_target_only_once_per_service_but_many_suppliers_are_fine(service):
    first, second = Supplier.objects.create(name="شرکت شبکه"), Supplier.objects.create(name="شرکت برق")
    Dependency.objects.create(service=service, supplier=first)
    Dependency(service=service, supplier=second).full_clean()  # تأمین‌کننده‌ی دیگر مشکلی ندارد

    with pytest.raises(ValidationError) as error:
        Dependency(service=service, supplier=first).full_clean()
    assert error.value.messages == ["وابستگی به این تأمین‌کننده پیش‌تر ثبت شده است."]


def test_target_is_whichever_of_the_three_is_filled(service):
    asset = make_asset("AST-1")
    dependency = Dependency(service=service, asset=asset)

    assert (dependency.target_field, dependency.target, dependency.target_kind) == ("asset", asset, "دارایی")
    assert str(dependency) == "SRV-1 وابسته به AST-1 - دارایی AST-1"
    assert Dependency(service=service).target is None


def test_form_shows_only_its_own_target_and_requires_it(service):
    form = DependencyForm(dependency_data(), instance=Dependency(service=service), target="supplier")

    assert "supplier" in form.fields
    assert "upstream_service" not in form.fields and "asset" not in form.fields
    assert not form.is_valid()
    assert "supplier" in form.errors


def test_form_does_not_offer_the_service_itself_taken_targets_or_inactive_ones(service):
    taken, free = make_service("SRV-2"), make_service("SRV-3")
    make_service("SRV-4", is_active=False)
    Dependency.objects.create(service=service, upstream_service=taken)
    # ستون «خدمت بالادستی» این یکی خالی (NULL) است و نباید همه‌ی گزینه‌ها را از فهرست بیندازد.
    Dependency.objects.create(service=service, supplier=Supplier.objects.create(name="شرکت شبکه"))

    form = DependencyForm(instance=Dependency(service=service), target="upstream_service")

    assert list(form.fields["upstream_service"].queryset) == [free]


def test_editing_keeps_its_own_target_even_if_it_is_now_inactive(service):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    dependency = Dependency.objects.create(service=service, supplier=supplier)
    supplier.is_active = False
    supplier.save()

    form = DependencyForm(instance=dependency, target="supplier")

    assert list(form.fields["supplier"].queryset) == [supplier]


def test_grc_adds_a_dependency_from_the_service_page(client, service, grc):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    client.force_login(grc)
    url = reverse("catalog:dependency_create", args=[service.pk, "supplier"])

    response = client.post(url, dependency_data(supplier=supplier.pk))

    assert response.url == service.get_absolute_url()
    dependency = service.dependencies.get()
    assert (dependency.supplier, dependency.is_shared_point, dependency.infra_owner) == (supplier, True, "supplier")
    assert dependency.history.first().history_user == grc
    page = client.get(service.get_absolute_url()).content.decode()
    assert "شرکت شبکه" in page
    assert "مرکز عملیات تأمین‌کننده" in page
    assert NO_BOUNDARY not in page  # مرز مسئولیت جواب دارد


def test_each_kind_in_the_address_opens_the_form_of_that_target(client, service, grc):
    client.force_login(grc)

    for kind, target in [("service", "upstream_service"), ("supplier", "supplier"), ("asset", "asset")]:
        form = client.get(reverse("catalog:dependency_create", args=[service.pk, kind])).context["form"]
        assert [name for name in form.fields if name in Dependency.TARGET_FIELDS] == [target]


def test_unknown_kind_in_the_address_is_not_found_and_only_editors_open_the_form(client, service, grc):
    client.force_login(grc)
    assert client.get(reverse("catalog:dependency_create", args=[service.pk, "bank"])).status_code == 404

    dependency = Dependency.objects.create(service=service, asset=make_asset("AST-1"))
    client.force_login(make_user("viewer", Role.VIEWER))
    assert client.get(reverse("catalog:dependency_create", args=[service.pk, "asset"])).status_code == 403
    assert client.get(reverse("catalog:dependency_update", args=[dependency.pk])).status_code == 403


def test_edit_form_has_the_target_of_the_dependency(client, service, grc):
    asset = make_asset("AST-1")
    dependency = Dependency.objects.create(service=service, asset=asset)
    client.force_login(grc)

    response = client.post(
        reverse("catalog:dependency_update", args=[dependency.pk]),
        dependency_data(asset=asset.pk, alternative="سایت پشتیبان"),
    )

    assert response.status_code == 302
    dependency.refresh_from_db()
    assert dependency.alternative == "سایت پشتیبان"


def test_hidden_upstream_service_is_named_but_not_linked(client, service):
    visible = make_service("SRV-2", org_unit=service.org_unit)
    hidden = make_service("SRV-3")
    Dependency.objects.create(service=service, upstream_service=visible)
    Dependency.objects.create(service=service, upstream_service=hidden)
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(service.org_unit)
    client.force_login(manager)

    response = client.get(service.get_absolute_url())

    links = {dependency.target: dependency.target_url for dependency in response.context["dependencies"]}
    assert links == {visible: visible.get_absolute_url(), hidden: None}
    page = response.content.decode()
    assert "SRV-3" in page
    assert NO_BOUNDARY in page  # هیچ‌کدام از پنج پرسش مرز مسئولیت جواب ندارد


@pytest.mark.django_db
def test_pages_list_only_the_dependent_services_the_user_may_see(client):
    supplier = Supplier.objects.create(name="شرکت شبکه")
    mine, other = make_service("SRV-1"), make_service("SRV-2")
    Dependency.objects.create(service=mine, supplier=supplier)
    Dependency.objects.create(service=other, supplier=supplier)
    client.force_login(mine.owner)

    response = client.get(supplier.get_absolute_url())

    assert [dependency.service for dependency in response.context["dependents"]] == [mine]
    assert "SRV-2" not in response.content.decode()


@pytest.mark.django_db
def test_unit_manager_also_sees_assets_their_services_depend_on_once(client):
    first = make_service("SRV-1")
    second = make_service("SRV-2", org_unit=first.org_unit)
    asset = make_asset("AST-1")  # در واحد دیگری
    Dependency.objects.create(service=first, asset=asset)
    Dependency.objects.create(service=second, asset=asset)
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(first.org_unit)
    client.force_login(manager)

    assert list(visible_assets(manager)) == [asset]
    response = client.get(asset.get_absolute_url())
    assert response.status_code == 200
    assert [dependency.service for dependency in response.context["dependents"]] == [first, second]
