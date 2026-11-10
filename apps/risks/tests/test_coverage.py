import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.models import Service
from apps.catalog.tests.factories import make_service, make_user
from apps.risks.models import Coverage, RiskCategory
from apps.risks.services import active_categories, coverage_rows, critical_coverage, status_counts

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


def mark(service, code, status, reason=""):
    """وضعیت یک خانه را مستقیم ثبت می‌کند."""
    return Coverage.objects.create(
        service=service, category=RiskCategory.objects.get(code=code), status=status, reason=reason
    )


def mark_all(service, status=Coverage.Status.REVIEWED):
    for category in RiskCategory.objects.all():
        mark(service, category.code, status, reason="دلیل")


def test_the_eight_categories_of_section_5_exist_from_the_start():
    categories = list(RiskCategory.objects.values_list("code", "name", "is_active"))

    assert [code for code, _, _ in categories] == ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"]
    assert categories[0][1] == "امنیت اطلاعات و سایبری"
    assert categories[-1][1] == "انطباق و حاکمیت داده"
    assert all(active for _, _, active in categories)
    # هر دسته ردیف «ایجاد» در تاریخچه دارد تا اولین ویرایشش با چیزی مقایسه شود.
    assert RiskCategory.history.filter(history_type="+").count() == 8


def test_not_relevant_without_a_reason_is_refused_by_the_database():
    service = make_service("SRV-1")

    with pytest.raises(IntegrityError), transaction.atomic():
        mark(service, "T1", Coverage.Status.NOT_RELEVANT)

    mark(service, "T1", Coverage.Status.NOT_RELEVANT, reason="این خدمت نرم‌افزار ندارد")


def test_each_service_and_category_has_one_cell():
    service = make_service("SRV-1")
    mark(service, "T1", Coverage.Status.REVIEWED)

    with pytest.raises(IntegrityError), transaction.atomic():
        mark(service, "T1", Coverage.Status.PENDING)


def test_cells_without_a_row_are_pending():
    service = make_service("SRV-1")
    reviewed = mark(service, "T2", Coverage.Status.REVIEWED)

    [(row_service, cells)] = coverage_rows([service], active_categories())

    assert row_service == service
    assert len(cells) == 8
    assert cells[1] == reviewed
    assert [cell.status for cell in cells].count(Coverage.Status.PENDING) == 7
    assert all(cell.pk is None for cell in cells if cell != reviewed)


def test_critical_coverage_counts_active_critical_services_with_no_pending_cell():
    done = make_service("SRV-1", is_critical=True)
    half = make_service("SRV-2", is_critical=True)
    not_critical = make_service("SRV-3")
    inactive = make_service("SRV-4", is_critical=True, is_active=False)
    mark_all(done)
    mark(half, "T1", Coverage.Status.REVIEWED)
    mark_all(not_critical)
    mark_all(inactive)
    result = critical_coverage(Service.objects.all(), active_categories())

    assert result == {"total": 2, "complete": 1, "percent": 50}


def test_a_new_category_makes_complete_services_pending_and_an_inactive_one_is_ignored():
    service = make_service("SRV-1", is_critical=True)
    mark_all(service)
    services = Service.objects.all()
    assert critical_coverage(services, active_categories())["percent"] == 100

    new = RiskCategory.objects.create(code="T9", name="دسته‌ی تازه")
    assert critical_coverage(services, active_categories())["percent"] == 0

    new.is_active = False
    new.save()
    assert critical_coverage(services, active_categories())["percent"] == 100


def test_no_critical_service_means_no_percent():
    make_service("SRV-1")

    assert critical_coverage(Service.objects.all(), active_categories())["percent"] is None


def test_pending_also_counts_cells_marked_pending():
    service = make_service("SRV-1")
    mark(service, "T1", Coverage.Status.REVIEWED)
    mark(service, "T2", Coverage.Status.NOT_RELEVANT, reason="دلیل")
    mark(service, "T3", Coverage.Status.PENDING)

    counts = status_counts(Service.objects.all(), active_categories())

    assert counts == {"reviewed": 1, "not_relevant": 1, "pending": 6}


def test_the_grid_shows_only_active_services_the_user_can_see(client):
    mine = make_service("SRV-1")
    make_service("SRV-2")
    make_service("SRV-3", org_unit=mine.org_unit, is_active=False)
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit)
    client.force_login(manager)

    response = client.get(reverse("risks:coverage"))

    assert response.status_code == 200
    assert [service for service, _ in response.context["rows"]] == [mine]
    assert response.context["can_edit"] is False
    assert reverse("risks:coverage_update", args=[mine.pk, 1]) not in response.content.decode()


def test_the_grid_filters_by_completeness(client, grc):
    complete = make_service("SRV-1")
    incomplete = make_service("SRV-2")
    mark_all(complete)
    client.force_login(grc)
    url = reverse("risks:coverage")

    assert list(client.get(url, {"state": "complete"}).context["services"]) == [complete]
    assert list(client.get(url, {"state": "incomplete"}).context["services"]) == [incomplete]


def test_grc_the_security_workgroup_and_system_admin_open_the_cell_form(client, grc, system_admin):
    service = make_service("SRV-1")
    url = reverse("risks:coverage_update", args=[service.pk, RiskCategory.objects.get(code="T1").pk])
    workgroup = make_user("workgroup", Role.SECURITY_WORKGROUP)

    for user, status in [(make_user("viewer", Role.VIEWER), 403), (grc, 200), (workgroup, 200), (system_admin, 200)]:
        client.force_login(user)
        assert client.get(url).status_code == status
    assert client.get(reverse("risks:coverage")).context["can_edit"] is True


def test_saving_a_cell_records_the_reviewer_the_date_and_history(client, grc):
    service = make_service("SRV-1")
    category = RiskCategory.objects.get(code="T2")
    client.force_login(grc)
    back = reverse("risks:coverage") + "?q=SRV"

    response = client.post(
        reverse("risks:coverage_update", args=[service.pk, category.pk]),
        {"status": "not_relevant", "reason": "این خدمت نرم‌افزاری ندارد", "next": back},
    )

    assert response.status_code == 302
    assert response.url == back
    cell = Coverage.objects.get(service=service, category=category)
    assert cell.status == Coverage.Status.NOT_RELEVANT
    assert cell.reviewed_by == grc
    assert cell.reviewed_on == timezone.localdate()
    assert cell.history.get().history_user == grc

    client.post(reverse("risks:coverage_update", args=[service.pk, category.pk]), {"status": "reviewed", "reason": ""})

    assert Coverage.objects.get(pk=cell.pk).status == Coverage.Status.REVIEWED
    assert cell.history.count() == 2


def test_not_relevant_needs_a_reason_in_the_form(client, grc):
    service = make_service("SRV-1")
    client.force_login(grc)

    response = client.post(
        reverse("risks:coverage_update", args=[service.pk, RiskCategory.objects.get(code="T1").pk]),
        {"status": "not_relevant", "reason": "  "},
    )

    assert response.status_code == 200
    assert "بنویسید چرا" in response.context["form"].errors["reason"][0]
    assert not Coverage.objects.exists()


def test_a_next_address_outside_the_system_is_ignored(client, grc):
    service = make_service("SRV-1")
    client.force_login(grc)

    response = client.post(
        reverse("risks:coverage_update", args=[service.pk, RiskCategory.objects.get(code="T1").pk]),
        {"status": "reviewed", "reason": "", "next": "https://example.com/"},
    )

    assert response.url == reverse("risks:coverage")


def test_inactive_services_and_categories_have_no_cell_form(client, grc):
    active = make_service("SRV-1")
    inactive = make_service("SRV-2", is_active=False)
    t1 = RiskCategory.objects.get(code="T1")
    old = RiskCategory.objects.create(code="T0", name="قدیمی", is_active=False)
    client.force_login(grc)

    assert client.get(reverse("risks:coverage_update", args=[inactive.pk, t1.pk])).status_code == 404
    assert client.get(reverse("risks:coverage_update", args=[active.pk, old.pk])).status_code == 404


def test_everyone_sees_categories_but_only_grc_and_system_admin_change_them(client, grc):
    viewer = make_user("viewer", Role.VIEWER)
    client.force_login(viewer)
    assert client.get(reverse("risks:category_list")).status_code == 200
    assert client.get(reverse("risks:category_create")).status_code == 403
    client.force_login(make_user("workgroup", Role.SECURITY_WORKGROUP))  # کارگروه فقط وضعیت خانه‌ها را ثبت می‌کند
    assert client.get(reverse("risks:category_create")).status_code == 403
    assert client.get(reverse("risks:category_list")).context["can_edit"] is False

    client.force_login(grc)
    response = client.post(reverse("risks:category_create"), {"code": "T9", "name": "دسته‌ی تازه", "is_active": "on"})

    assert response.status_code == 302
    category = RiskCategory.objects.get(code="T9")
    assert category.history.get().history_user == grc
    response = client.post(reverse("risks:category_update", args=[category.pk]), {"code": "T9", "name": "دسته‌ی تازه"})
    category.refresh_from_db()
    assert category.is_active is False


def test_the_service_page_shows_its_coverage(client, grc):
    service = make_service("SRV-1")
    mark(service, "T1", Coverage.Status.REVIEWED)
    client.force_login(grc)

    response = client.get(service.get_absolute_url())

    cells = response.context["coverage"]
    assert len(cells) == 8
    assert cells[0].status == Coverage.Status.REVIEWED
    assert "پوشش جهان ریسک" in response.content.decode()
