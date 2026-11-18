import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.core.jalali import jalali_year
from apps.organization.models import OrgUnit
from apps.risks.models import Coverage, ExternalLink, Risk, RiskCategory, RiskScenario, Tag
from apps.risks.services import coverage_rows, mark_covered_by_risk, parse_tag_names

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


def category(code="T1"):
    return RiskCategory.objects.get(code=code)


def make_scenario(title="دسترسی غیرمجاز به داده‌ی تراکنش", **fields):
    values = {"event": "رویداد", "conditions": "شرط", "consequence": "پیامد", "category": category(), **fields}
    return RiskScenario.objects.create(title=title, **values)


def make_risk(title="ریسک آزمایشی", service=None, **fields):
    values = {
        "description": "شرح",
        "channel": Risk.Channel.INTERVIEW,
        "category": category(),
        "org_unit": service.org_unit if service else OrgUnit.objects.create(name=f"واحد {title}"),
        **fields,
    }
    return Risk.objects.create(title=title, service=service, **values)


def risk_data(**fields):
    """داده‌ی کمینه‌ی فرم ریسک."""
    return {"title": "قطع درگاه پرداخت", "description": "شرح", "channel": "interview", **fields}


def submitted_data(**fields):
    return {"channel": "interview", "initiator": "عامل", "realization_path": "مسیر تحقق", **fields}


def scenario_risk_url(scenario):
    return f"{reverse('risks:risk_create')}?scenario={scenario.pk}"


def test_scenario_codes_are_automatic_and_start_at_version_one():
    first, second = make_scenario(), make_scenario("سناریوی دوم")

    assert (first.code, second.code) == ("SC-0001", "SC-0002")
    assert first.version == 1


def test_a_major_change_raises_the_scenario_version_and_flags_its_risks(client, grc):
    scenario = make_scenario()
    risk = make_risk(scenario=scenario)
    client.force_login(grc)
    url = reverse("risks:scenario_update", args=[scenario.pk])
    data = {
        "title": "عنوان تازه",
        "event": "رویداد",
        "conditions": "شرط",
        "consequence": "پیامد",
        "category": category().pk,
    }

    client.post(url, {**data, "is_active": "on"})
    scenario.refresh_from_db()
    assert scenario.version == 1  # اصلاح ساده نسخه را عوض نمی‌کند
    assert risk.scenario_version == 1
    assert not Risk.objects.get(pk=risk.pk).scenario_changed

    response = client.post(url, {**data, "is_active": "on", "major_change": "on"})
    scenario.refresh_from_db()
    assert response.status_code == 302
    assert scenario.version == 2
    assert scenario.history.first().history_user == grc
    assert Risk.objects.get(pk=risk.pk).scenario_changed
    assert "تغییر اساسی کرده است" in client.get(risk.get_absolute_url()).content.decode()


def test_everyone_sees_the_scenario_library_but_only_grc_and_system_admin_change_it(client, grc, system_admin):
    scenario = make_scenario()
    viewer = make_user("viewer", Role.VIEWER)
    client.force_login(viewer)
    assert client.get(reverse("risks:scenario_list")).status_code == 200
    assert client.get(scenario.get_absolute_url()).status_code == 200
    assert client.get(reverse("risks:scenario_create")).status_code == 403
    assert client.get(reverse("risks:scenario_update", args=[scenario.pk])).status_code == 403

    for user in (grc, system_admin):
        client.force_login(user)
        assert client.get(reverse("risks:scenario_create")).status_code == 200


def test_risk_codes_carry_the_jalali_year_and_count_from_one():
    year = jalali_year(timezone.localdate())

    first, second = make_risk(), make_risk("ریسک دوم")

    assert (first.code, second.code) == (f"RK-{year}-0001", f"RK-{year}-0002")
    assert first.status == Risk.Status.REGISTERED


def test_needs_completion_follows_initiator_count_unit_and_scope():
    risk = make_risk(initiator="تلاش ورود", count_unit="هر تلاش", scope="")
    assert risk.needs_completion

    risk.scope = "محیط تولید داتین"
    risk.save()
    assert not risk.needs_completion


def test_a_risk_from_the_form_takes_unit_from_its_service_and_category_from_its_scenario(client, grc):
    service = make_service("SRV-1")
    scenario = make_scenario(service=service, category=category("T4"))
    client.force_login(grc)

    response = client.post(
        scenario_risk_url(scenario),
        submitted_data(tag_names="پرداخت، ابری ,پرداخت"),
    )

    risk = Risk.objects.get()
    assert response.status_code == 302
    assert response.url == risk.get_absolute_url()
    assert risk.org_unit == service.org_unit
    assert risk.category == category("T4")
    assert risk.scenario_version == 1
    assert sorted(risk.tags.values_list("name", flat=True)) == ["ابری", "پرداخت"]
    assert risk.history.first().history_user == grc


def test_a_risk_must_be_created_from_a_scenario(client, grc):
    client.force_login(grc)

    response = client.post(reverse("risks:risk_create"), risk_data())

    assert response.status_code == 302
    assert response.url == reverse("risks:scenario_list")
    assert not Risk.objects.exists()


def test_the_unit_can_differ_from_the_service_unit(client, grc):
    service = make_service("SRV-1")
    other = OrgUnit.objects.create(name="امنیت")
    scenario = make_scenario(service=service)
    client.force_login(grc)

    client.post(scenario_risk_url(scenario), submitted_data(org_unit=other.pk, category=category().pk))

    assert Risk.objects.get().org_unit == other


def test_an_inactive_owner_is_refused(client, grc):
    gone = make_user("gone", is_active=False)
    risk = make_risk(owner=gone)  # مالکی که بعداً غیرفعال شده در فرم ویرایش می‌ماند
    client.force_login(grc)

    response = client.post(
        reverse("risks:risk_update", args=[risk.pk]),
        risk_data(org_unit=risk.org_unit.pk, category=category().pk, owner=gone.pk),
    )

    assert "مالک دیگری" in response.context["form"].errors["owner"][0]


def test_tags_are_reused_and_their_changes_are_kept_in_history(client, grc):
    Tag.objects.create(name="پرداخت")
    risk = make_risk()
    client.force_login(grc)
    url = reverse("risks:risk_update", args=[risk.pk])
    base = risk_data(org_unit=risk.org_unit.pk, category=category().pk)

    client.post(url, {**base, "tag_names": "پرداخت"})
    client.post(url, {**base, "tag_names": ""})

    assert Tag.objects.count() == 1
    assert not risk.tags.exists()
    # تاریخچه هم برچسب‌خوردن را نگه داشته و هم برداشتنش را.
    assert any(record.tags.exists() for record in risk.history.all())
    assert not risk.history.first().tags.exists()


def test_parse_tag_names_splits_on_both_commas_and_drops_repeats():
    assert parse_tag_names(" پرداخت ،ابری,  کارت   بانکی ,,پرداخت") == ["پرداخت", "ابری", "کارت بانکی"]


def test_customers_are_chosen_from_active_banks(client, grc):
    mellat = Customer.objects.create(name="بانک ملت")
    Customer.objects.create(name="بانک قدیمی", is_active=False)
    service = make_service("SRV-CUSTOMER")
    scenario = make_scenario(service=service)
    client.force_login(grc)

    response = client.get(scenario_risk_url(scenario))
    assert list(response.context["form"].fields["customers"].queryset) == [mellat]

    client.post(
        scenario_risk_url(scenario),
        submitted_data(customers=[mellat.pk]),
    )
    assert list(Risk.objects.get().customers.all()) == [mellat]


def test_only_grc_and_system_admin_register_risks(client, grc, system_admin):
    manager = make_user("manager", Role.UNIT_MANAGER)
    scenario = make_scenario(service=make_service("SRV-PERM"))
    for user, status in [(manager, 403), (make_user("viewer", Role.VIEWER), 403), (grc, 200), (system_admin, 200)]:
        client.force_login(user)
        assert client.get(scenario_risk_url(scenario)).status_code == status


def test_unit_managers_see_risks_of_their_units_and_owners_see_their_own(client):
    mine = make_service("SRV-1")
    in_my_unit = make_risk("ریسک واحد من", service=mine)
    elsewhere = make_risk("ریسک واحد دیگر")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit)
    owned = make_risk("ریسکی که مالکش هستم", owner=manager)
    client.force_login(manager)

    response = client.get(reverse("risks:risk_list"))

    assert set(response.context["risks"]) == {in_my_unit, owned}
    assert client.get(elsewhere.get_absolute_url()).status_code == 404
    assert client.get(in_my_unit.get_absolute_url()).status_code == 200


def test_a_viewer_with_a_scope_sees_only_risks_in_it(client):
    inside = make_risk("داخل دامنه")
    make_risk("بیرون دامنه")
    viewer = make_user("viewer", Role.VIEWER)
    viewer.scope_units.add(inside.org_unit)
    client.force_login(viewer)

    assert list(client.get(reverse("risks:risk_list")).context["risks"]) == [inside]


def test_the_service_filter_lists_only_services_the_user_sees(client):
    mine = make_service("SRV-1")
    make_service("SRV-2")
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(mine.org_unit)
    client.force_login(manager)

    response = client.get(reverse("risks:risk_list"))

    assert list(response.context["filter_form"].fields["service"].queryset) == [mine]


def test_the_register_filters_by_service_category_and_completeness(client, grc):
    service = make_service("SRV-1")
    match = make_risk("ریسک T2", service=service, category=category("T2"))
    make_risk("ریسک T1", service=service)
    complete = make_risk("کامل", initiator="آ", count_unit="هر بار", scope="تولید")
    client.force_login(grc)
    url = reverse("risks:risk_list")

    assert list(client.get(url, {"service": service.pk, "category": category("T2").pk}).context["risks"]) == [match]
    assert list(client.get(url, {"needs_completion": "no"}).context["risks"]) == [complete]


def test_submitting_a_risk_does_not_change_coverage(client, grc):
    service = make_service("SRV-1")
    scenario = make_scenario(service=service, category=category("T2"))
    client.force_login(grc)

    response = client.post(
        scenario_risk_url(scenario), submitted_data(), follow=True
    )

    assert not Coverage.objects.filter(service=service, category=category("T2")).exists()
    assert Risk.objects.get().status == Risk.Status.SUBMITTED
    assert response.status_code == 200


def test_a_reviewed_cell_keeps_its_reviewer_and_reason():
    service = make_service("SRV-1")
    reviewer = make_user("reviewer")
    Coverage.objects.create(
        service=service, category=category(), status=Coverage.Status.REVIEWED, reason="مصاحبه", reviewed_by=reviewer
    )
    grc = make_user("grc", Role.GRC_MEMBER)

    assert mark_covered_by_risk(make_risk(service=service), grc) is None
    cell = Coverage.objects.get()
    assert (cell.reviewed_by, cell.reason) == (reviewer, "مصاحبه")


def test_a_risk_cannot_go_into_a_not_relevant_cell(client, grc):
    service = make_service("SRV-1")
    Coverage.objects.create(
        service=service, category=category(), status=Coverage.Status.NOT_RELEVANT, reason="نرم‌افزار ندارد"
    )
    scenario = make_scenario(service=service)
    client.force_login(grc)

    response = client.post(scenario_risk_url(scenario), submitted_data(category=category().pk))

    assert "«نامرتبط» ثبت شده است" in response.context["form"].errors["category"][0]
    assert not Risk.objects.exists()


def test_a_cell_with_active_risks_cannot_become_not_relevant(client, grc):
    service = make_service("SRV-1")
    make_risk(service=service)
    client.force_login(grc)

    response = client.post(
        reverse("risks:coverage_update", args=[service.pk, category().pk]),
        {"status": "not_relevant", "reason": "دلیل"},
    )

    assert "نمی‌تواند «نامرتبط» باشد" in response.context["form"].errors["status"][0]
    assert response.context["cell_risks"].count() == 1


def test_coverage_cells_count_active_risks():
    service = make_service("SRV-1")
    make_risk("یک", service=service)
    make_risk("دو", service=service)
    make_risk("بسته", service=service, status=Risk.Status.CLOSED)
    make_risk("دسته‌ی دیگر", service=service, category=category("T3"))

    [(_, cells)] = coverage_rows([service], [category("T1"), category("T2")], Risk.objects.all())

    assert [cell.risk_count for cell in cells] == [2, 0]


def test_the_service_page_lists_its_risks(client, grc):
    service = make_service("SRV-1")
    risk = make_risk(service=service)
    client.force_login(grc)

    response = client.get(service.get_absolute_url())

    assert list(response.context["risks"]) == [risk]
    assert reverse("risks:scenario_list") in response.content.decode()


def test_the_create_form_is_prefilled_from_scenario_service_and_category(client, grc):
    service = make_service("SRV-1")
    scenario = make_scenario(service=service, category=category("T5"))
    client.force_login(grc)

    initial = client.get(reverse("risks:risk_create"), {"scenario": scenario.pk}).context["form"].initial
    assert (initial["scenario"], initial["title"], initial["category"]) == (scenario, scenario.title, category("T5"))

    assert (initial["service"], initial["org_unit"]) == (service, service.org_unit)


def test_external_links_are_added_by_grc_and_duplicates_are_refused(client, grc):
    risk = make_risk()
    url = reverse("risks:link_create", args=[risk.pk])
    client.force_login(make_user("viewer", Role.VIEWER))
    assert client.get(url).status_code == 403

    client.force_login(grc)
    response = client.post(url, {"kind": "change", "ref": "CHG-2231", "url": ""})
    assert response.status_code == 302
    assert response.url == risk.get_absolute_url()

    response = client.post(url, {"kind": "change", "ref": "CHG-2231", "url": ""})
    assert "پیش‌تر برای این ریسک ثبت شده" in response.context["form"].errors["ref"][0]

    link = ExternalLink.objects.get()
    client.post(reverse("risks:link_update", args=[link.pk]), {"kind": "incident", "ref": "INC-7", "url": ""})
    link.refresh_from_db()
    assert (link.kind, link.ref) == ("incident", "INC-7")
    assert link.history.count() == 2


def test_the_database_refuses_a_duplicate_external_link():
    risk = make_risk()
    ExternalLink.objects.create(risk=risk, kind="change", ref="CHG-1")

    with pytest.raises(IntegrityError), transaction.atomic():
        ExternalLink.objects.create(risk=risk, kind="change", ref="CHG-1")


def test_a_risk_may_have_no_category_and_every_page_says_so(client, grc):
    """ریسکی که از فرم شناسایی آمده تا تعیین دسته بی‌دسته است؛ رجیستر، پرونده و API به‌جای «None» یا خطا «بدون
    دسته» و خط تیره نشان می‌دهند و جهان ریسک آن را در هیچ خانه‌ای نمی‌شمارد."""
    service = make_service("SRV-1")
    risk = make_risk("ریسک بی‌دسته", service=service, category=None)
    client.force_login(grc)

    assert Risk.objects.get(pk=risk.pk).category is None
    register = client.get(reverse("risks:risk_list"))
    detail = client.get(risk.get_absolute_url())
    assert register.status_code == detail.status_code == 200
    assert "None" not in register.content.decode() and "None" not in detail.content.decode()
    assert "هنوز تعیین نشده" in detail.content.decode()

    row = next(item for item in client.get("/api/risks/").json()["results"] if item["id"] == risk.pk)
    assert row["category"] is None
    assert client.get(f"/api/risks/{risk.pk}/").json()["category"] is None
    assert client.get("/api/risks/export/").status_code == 200
    assert mark_covered_by_risk(risk, grc) is None
    [(_, cells)] = coverage_rows([service], RiskCategory.objects.filter(is_active=True), Risk.objects.all())
    assert not any(cell.risk_count for cell in cells)


def test_grc_saves_a_risk_without_a_category_and_sets_it_later(client, grc):
    risk = make_risk(category=None)
    client.force_login(grc)
    url = reverse("risks:risk_update", args=[risk.pk])

    kept = client.post(url, risk_data(org_unit=risk.org_unit.pk, category=""))
    risk.refresh_from_db()
    assert kept.status_code == 302 and risk.category is None

    client.post(url, risk_data(org_unit=risk.org_unit.pk, category=category("T2").pk))
    risk.refresh_from_db()
    assert risk.category == category("T2")
