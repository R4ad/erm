import datetime

import pytest
from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Commitment, Customer
from apps.catalog.permissions import visible_commitments

from .factories import make_service, make_user


@pytest.fixture
def grc(db):
    return make_user("grc", Role.GRC_MEMBER)


def commitment_data(*services, **changes):
    data = {
        "title": "SLA پرداخت",
        "kind": Commitment.Kind.SLA,
        "clause_ref": "بند ۴-۲",
        "description": "پردازش تا ساعت ۱۴",
        "services": [service.pk for service in services],
        "customer": "",
        "owner": "",
        "valid_from": "1405/01/01",
        "valid_until": "",
    }
    return data | changes


@pytest.mark.django_db
def test_valid_until_may_not_be_before_valid_from_in_the_form_and_in_the_database():
    commitment = Commitment(
        title="SLA پرداخت", valid_from=datetime.date(2026, 5, 1), valid_until=datetime.date(2026, 4, 1)
    )

    with pytest.raises(ValidationError) as error:
        commitment.full_clean()
    assert error.value.messages == ["«اعتبار تا» نباید پیش از «اعتبار از» باشد."]

    with pytest.raises(IntegrityError):
        commitment.save()


@pytest.mark.django_db
def test_everything_but_the_title_is_optional(client, grc):
    client.force_login(grc)

    response = client.post(reverse("catalog:commitment_create"), {"title": "الزام بانک مرکزی"})

    assert response.status_code == 302
    commitment = Commitment.objects.get()
    assert (commitment.title, commitment.kind, list(commitment.services.all())) == ("الزام بانک مرکزی", "", [])
    assert "title" in client.post(reverse("catalog:commitment_create"), {"title": ""}).context["form"].errors


@pytest.mark.django_db
def test_unit_manager_sees_commitments_of_own_services_once_and_others_see_all():
    mine, also_mine, other = make_service("SRV-1"), make_service("SRV-2"), make_service("SRV-3")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit, also_mine.org_unit)
    both = Commitment.objects.create(title="قرارداد مشترک")
    both.services.add(mine, also_mine, other)
    hidden = Commitment.objects.create(title="SLA دیگر")
    hidden.services.add(other)
    unattached = Commitment.objects.create(title="هنوز بی‌خدمت")

    assert list(visible_commitments(manager)) == [both]  # یک بار، با این‌که به دو خدمتش وصل است
    assert set(visible_commitments(make_user("committee", Role.SECURITY_COMMITTEE))) == {both, hidden, unattached}


@pytest.mark.django_db
def test_list_shows_only_the_services_the_user_may_see(client):
    mine, other = make_service("SRV-1"), make_service("SRV-2")
    commitment = Commitment.objects.create(title="قرارداد مشترک")
    commitment.services.add(mine, other)
    client.force_login(mine.owner)

    response = client.get(reverse("catalog:commitment_list"))

    assert [list(c.services.all()) for c in response.context["commitments"]] == [[mine]]
    assert "SRV-2" not in response.content.decode()


@pytest.mark.django_db
def test_add_from_the_service_page_preselects_the_service_and_goes_back_to_it(client, grc):
    service = make_service("SRV-1")
    other = make_service("SRV-2")
    client.force_login(grc)
    url = reverse("catalog:commitment_create") + f"?service={service.pk}"

    form_page = client.get(url)
    assert form_page.context["form"].initial["services"] == [service]
    assert form_page.context["cancel_url"] == service.get_absolute_url()

    response = client.post(url, commitment_data(service, other))

    assert response.url == service.get_absolute_url()
    commitment = Commitment.objects.get()
    assert set(commitment.services.all()) == {service, other}
    assert commitment.valid_from == datetime.date(2026, 3, 21)
    assert commitment.history.first().history_user == grc
    page = client.get(service.get_absolute_url()).content.decode()
    assert "SLA پرداخت" in page
    assert "بند ۴-۲" in page


@pytest.mark.django_db
def test_without_a_service_in_the_address_it_goes_back_to_the_list(client, grc):
    commitment = Commitment.objects.create(title="SLA پرداخت")
    client.force_login(grc)

    response = client.post(
        reverse("catalog:commitment_update", args=[commitment.pk]) + "?service=abc", commitment_data(title="SLA تازه")
    )

    assert response.url == reverse("catalog:commitment_list")
    commitment.refresh_from_db()
    assert commitment.title == "SLA تازه"


@pytest.mark.django_db
def test_form_offers_active_services_and_keeps_the_ones_already_on_it(client, grc):
    old = make_service("SRV-1", is_active=False)
    make_service("SRV-2", is_active=False)
    active = make_service("SRV-3")
    commitment = Commitment.objects.create(title="SLA قدیمی")
    commitment.services.add(old)
    client.force_login(grc)

    new_form = client.get(reverse("catalog:commitment_create")).context["form"]
    edit_form = client.get(reverse("catalog:commitment_update", args=[commitment.pk])).context["form"]

    assert list(new_form.fields["services"].queryset) == [active]
    assert list(edit_form.fields["services"].queryset) == [old, active]


@pytest.mark.django_db
def test_service_page_lists_its_commitments_with_all_banks_when_none_is_chosen(client, grc):
    service = make_service("SRV-1")
    for_all = Commitment.objects.create(title="الزام همه‌ی بانک‌ها")
    for_mellat = Commitment.objects.create(title="SLA ملت", customer=Customer.objects.create(name="بانک ملت"))
    service.commitments.add(for_all, for_mellat)
    client.force_login(grc)

    response = client.get(service.get_absolute_url())

    assert list(response.context["commitments"]) == [for_mellat, for_all]  # به ترتیب عنوان
    page = response.content.decode()
    assert "همه" in page
    assert "بانک ملت" in page
    assert f"?service={service.pk}" in page  # ویرایش از همین صفحه به همین صفحه برمی‌گردد


@pytest.mark.django_db
def test_only_editors_open_the_commitment_forms(client, grc, system_admin):
    commitment = Commitment.objects.create(title="SLA پرداخت")
    pages = [reverse("catalog:commitment_create"), reverse("catalog:commitment_update", args=[commitment.pk])]

    for user, status in [(make_user("viewer", Role.VIEWER), 403), (grc, 200), (system_admin, 200)]:
        client.force_login(user)
        assert [client.get(page).status_code for page in pages] == [status] * 2


@pytest.mark.django_db
def test_commitment_filters(client, grc):
    sla = Commitment.objects.create(title="SLA پرداخت", kind=Commitment.Kind.SLA, clause_ref="بند ۷")
    Commitment.objects.create(title="ابلاغیه‌ی امنیت", kind=Commitment.Kind.REGULATORY)
    client.force_login(grc)

    def listed(**params):
        return list(client.get(reverse("catalog:commitment_list"), params).context["commitments"])

    assert listed(q="بند ۷") == [sla]
    assert listed(kind=Commitment.Kind.SLA) == [sla]
