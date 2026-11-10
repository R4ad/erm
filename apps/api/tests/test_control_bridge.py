"""کتابخانه‌ی کنترل، ارزیابی اثربخشی و بیانیه‌ی کاربردپذیری در رابط React از راه پل جنگو: فهرست‌ها و پرونده‌ها با
همان دسترسی view جنگو، فرم کنترل، فرم ردیف بیانیه و برگه‌ی آزمون کنترل با بخش‌ها و راهنمای E."""

from datetime import date

import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.api.routes import spa_route
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_user
from apps.controls.models import Applicability, Control, ControlAssessment, IsoControl
from apps.controls.tests.factories import valid_control_assessment
from apps.controls.tests.test_controls import make_control, make_risk
from apps.risks.models import Evidence

from .test_bridge import form, page, send, values_of

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="مینا", last_name="کنترلی")


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def control(owner):
    return make_control(owner, "احراز هویت چندعاملی برای حساب‌های ممتاز", "5.15", "8.5", is_key=True)


def test_control_pages_open_in_react():
    assert spa_route(reverse("controls:control_list")) == "/controls"
    assert spa_route(reverse("controls:control_detail", args=[3])) == "/controls/3"
    assert spa_route(reverse("controls:control_update", args=[3])) == "/controls/3/edit"
    assert spa_route(reverse("controls:control_assessment_create", args=[3])) == "/controls/3/effectiveness/new"
    assert spa_route(reverse("controls:control_assessment_detail", args=[4])) == "/controls/effectiveness/4"
    assert spa_route(reverse("controls:soa_list")) == "/controls/soa"
    assert spa_route(reverse("controls:soa_detail", args=[5])) == "/controls/soa/5"
    assert spa_route(reverse("controls:soa_update", args=[5])) == "/controls/soa/5/edit"


def test_the_library_lists_what_each_user_may_see(api, grc, owner, control):
    other = make_control(make_user("someone"), "پشتیبان‌گیری روزانه", kind=Control.Kind.RECOVERY)

    data = page(api(grc), reverse("controls:control_list")).json()
    assert [row["code"] for row in data["results"]] == [control.code, other.code]
    row = data["results"][0]
    assert row["kind"] == {"value": "preventive", "label": "پیشگیرانه"}
    assert row["iso_controls"] == ["5.15", "8.5"] and row["is_key"] and row["owner"]["name"] == "مینا کنترلی"
    assert data["create_url"] == reverse("controls:control_create")
    assert data["soa_url"] == reverse("controls:soa_list")
    assert {field["name"] for field in data["filters"]["fields"]} >= {"q", "kind", "is_key", "theme", "status"}

    filtered = page(api(grc), f"{reverse('controls:control_list')}?kind=recovery").json()
    assert [row["code"] for row in filtered["results"]] == [other.code]

    # مسئول کنترل فقط کنترل خودش را می‌بیند و نه دکمه‌ی کنترل تازه دارد و نه بیانیه‌ی کاربردپذیری.
    mine = page(api(owner), reverse("controls:control_list")).json()
    assert [row["code"] for row in mine["results"]] == [control.code]
    assert (mine["create_url"], mine["soa_url"]) == (None, None)
    assert page(api(owner), other.get_absolute_url()).status_code == 404


def test_control_detail_shows_effectiveness_mappings_and_risks(api, grc, owner, control):
    risk = make_risk(owner=owner)
    risk.controls.add(control)
    assessment = valid_control_assessment(control, grc, e=4)
    stale = valid_control_assessment(control, grc, e=3, test_to=date(2024, 1, 1))
    Applicability.objects.create(
        iso_control=IsoControl.objects.get(code="5.15"), justification="الزام قرارداد", implementation="implemented"
    )

    data = page(api(grc), control.get_absolute_url()).json()
    assert data["control"]["objective"] == control.objective
    effect = {item["code"]: item for item in data["effectiveness"]}
    assert effect[assessment.code]["e"] == 4 and effect[assessment.code]["problem"] is None
    assert "کهنه شده" in effect[stale.code]["problem"]
    iso = {item["code"]: item for item in data["iso_controls"]}
    assert iso["5.15"]["applicability"] == {
        "value": "applicable",
        "label": "کاربرد دارد",
        "implementation": {"value": "implemented", "label": "اجراشده"},
    }
    assert iso["8.5"]["applicability"]["value"] == "undetermined"
    assert iso["5.15"]["href"] == IsoControl.objects.get(code="5.15").get_absolute_url()
    assert [item["code"] for item in data["risks"]] == [risk.code]
    assert data["edit_url"] == reverse("controls:control_update", args=[control.pk])
    assert data["add_assessment_url"] == reverse("controls:control_assessment_create", args=[control.pk])

    # مسئول کنترل پیوست می‌گذارد ولی E ثبت نمی‌کند و صفحه‌ی پیوست A را نمی‌بیند.
    mine = page(api(owner), control.get_absolute_url()).json()
    assert (mine["edit_url"], mine["add_assessment_url"]) == (None, None)
    assert mine["attach_url"] and all(item["href"] is None for item in mine["iso_controls"])

    control.is_active = False
    control.save()
    assert page(api(grc), control.get_absolute_url()).json()["add_assessment_url"] is None


def test_grc_creates_and_edits_a_control_with_its_annex_a_mappings(api, grc, owner):
    client = api(grc)
    described = form(client, reverse("controls:control_create")).json()
    fields = {field["name"]: field for field in described["form"]["fields"]}
    assert fields["iso_controls"]["kind"] == "multiselect"
    assert len(fields["iso_controls"]["choices"]) == IsoControl.objects.count()
    # راهنمای Ctrl فهرست بومی جنگو در فهرست تیک‌دار React نمی‌آید.
    assert "Ctrl" not in fields["iso_controls"]["help"]

    iso_ids = [str(IsoControl.objects.get(code=code).pk) for code in ["5.15", "8.5"]]
    values = {
        **values_of(described["form"]),
        "title": "پشتیبان‌گیری روزانه",
        "objective": "بازگرداندن داده پس از خرابی.",
        "kind": "recovery",
        "owner": str(owner.pk),
        "operated_by": Responsibility.DATIN,
        "iso_controls": iso_ids,
    }
    result = send(client, reverse("controls:control_create"), values).json()
    control = Control.objects.get()
    assert result["message"] == f"کنترل «{control}» ثبت شد."
    assert sorted(control.iso_controls.values_list("code", flat=True)) == ["5.15", "8.5"]

    path = reverse("controls:control_update", args=[control.pk])
    described = form(client, path).json()
    assert {field["name"]: field["value"] for field in described["form"]["fields"]}["iso_controls"] == iso_ids
    errors = send(client, path, {**values_of(described["form"]), "title": ""}).json()["errors"]
    assert errors["title"] == ["این مقدار لازم است."]
    assert send(client, path, {**values_of(described["form"]), "is_active": False}).status_code == 200
    control.refresh_from_db()
    assert not control.is_active

    assert form(api(owner), path).status_code == 403


def test_soa_lists_annex_a_with_its_summary_and_gaps(api, grc, owner, control):
    gap = IsoControl.objects.get(code="5.1")
    Applicability.objects.create(iso_control=gap, justification="سیاست", implementation="planned")
    Applicability.objects.create(iso_control=IsoControl.objects.get(code="7.1"), applicable=False, justification="-")

    data = page(api(grc), reverse("controls:soa_list")).json()
    assert data["count"] == IsoControl.objects.count() == 93
    assert data["summary"]["applicable"] == 1 and data["summary"]["not_applicable"] == 1
    assert data["summary"]["gaps"] == 1 and data["summary"]["undetermined"] == 91
    rows = {row["code"]: row for row in data["results"]}
    assert rows["5.1"]["gap"] and rows["5.1"]["applicability"]["implementation"]["label"] == "برنامه‌ریزی‌شده"
    assert rows["5.15"]["control_count"] == 1 and not rows["5.15"]["gap"]
    assert rows["5.15"]["title_en"] and rows["5.15"]["theme"]["label"] == "سازمانی"

    gaps = page(api(grc), f"{reverse('controls:soa_list')}?state=gap").json()
    assert [row["code"] for row in gaps["results"]] == ["5.1"]

    detail = page(api(grc), gap.get_absolute_url()).json()
    assert "هیچ کنترل فعال سازمان" in detail["warning"]
    assert detail["iso_control"]["justification"] == "سیاست" and detail["edit_label"] == "ویرایش"
    undecided = page(api(grc), IsoControl.objects.get(code="5.15").get_absolute_url()).json()
    assert undecided["warning"] is None and undecided["edit_label"] == "تعیین کاربرد"
    assert [row["code"] for row in undecided["controls"]] == [control.code]

    assert page(api(owner), reverse("controls:soa_list")).status_code == 403


def test_soa_row_is_saved_through_the_django_form(api, grc):
    iso = IsoControl.objects.get(code="5.15")
    path = reverse("controls:soa_update", args=[iso.pk])
    client = api(grc)
    described = form(client, path).json()
    assert described["title"] == f"بیانیه‌ی کاربردپذیری: 5.15 {iso.title_en}"
    assert [field["name"] for field in described["form"]["fields"]] == [
        "iso_title",
        "applicable",
        "justification",
        "implementation",
    ]
    values = {**values_of(described["form"]), "justification": "الزام قرارداد بانک"}
    errors = send(client, path, {**values, "implementation": ""}).json()["errors"]
    assert errors["implementation"] == ["برای کنترلی که کاربرد دارد وضعیت اجرا را انتخاب کنید."]

    result = send(client, path, {**values, "implementation": "in_progress", "iso_title": "کنترل دسترسی"}).json()
    assert result["message"] == "ردیف 5.15 بیانیه‌ی کاربردپذیری ذخیره شد."
    assert result["redirect"]["route"] == f"/controls/soa/{iso.pk}"
    iso.refresh_from_db()
    assert iso.title == "کنترل دسترسی" and iso.applicability.implementation == "in_progress"


def test_the_control_test_sheet_has_sections_guides_and_e_rules(api, grc, owner, control):
    verifier = make_user("verifier", Role.GRC_MEMBER)
    evidence = Evidence.objects.create(
        owner=grc,
        kind=Evidence.Kind.TEST,
        title="آزمون MFA روی ۴۲ حساب ممتاز",
        summary="-",
        source="گزارش آزمون",
        observed_on=date(2026, 10, 20),
        reliability=Evidence.Reliability.HIGH,
    )
    path = reverse("controls:control_assessment_create", args=[control.pk])
    client = api(grc)
    described = form(client, path).json()
    assert described["title"] == f"ارزیابی اثربخشی تازه برای {control}"
    sections = {item["title"]: item["fields"] for item in described["fieldsets"]}
    assert list(sections) == ["دامنه، طراحی و پوشش", "آزمون", "شرط‌های E4 و E5", "نتیجه"]
    # ارزیابی تازه معلق نیست؛ فیلد تعلیق فقط در ویرایش است.
    assert "suspended" not in sections["نتیجه"]
    names = [field["name"] for field in described["form"]["fields"]]
    assert sorted(names) == sorted(name for fields in sections.values() for name in fields)
    assert [item["term"] for item in described["guides"][0]["items"]] == ["E1", "E2", "E3", "E4", "E5"]
    assert "دست‌کم 95 درصد" in described["guides"][1]["items"][1]["text"]
    assert described["facts"]["rows"][1]["value"] == "پیشگیرانه، کنترل کلیدی"

    values = {
        **values_of(described["form"]),
        "scope": "همه‌ی حساب‌های ممتاز",
        "exists": True,
        "design_ok": True,
        "coverage_pct": "97",
        "critical_points_covered": True,
        "operating_ok": True,
        "test_method": "اجرای دوباره",
        "test_from": "1405/07/01",
        "test_to": "1405/07/28",
        "sample_size": "30",
        "sample_rationale": "همه‌ی نقش‌ها",
        "test_result": "ورود بدون عامل دوم موفق نشد.",
        "e": "3",
        "confidence": "medium",
        "rationale": "پوشش و نمونه کافی است.",
        "evidence": [str(evidence.pk)],
    }
    errors = send(client, path, values).json()["errors"]
    assert errors["e"][0] == "E3 پذیرفته نمی‌شود؛ داده‌های این برگه تا E2 را پشتیبانی می‌کنند."
    assert "E3 و بالاتر تأییدکننده می‌خواهد (بخش ۲۳)." in errors["e"]

    result = send(client, path, {**values, "verified_by": str(verifier.pk)}).json()
    assessment = ControlAssessment.objects.get()
    assert result["message"] == f"ارزیابی اثربخشی {assessment.code} با E3 ثبت شد."
    assert result["redirect"]["route"] == f"/controls/effectiveness/{assessment.pk}"

    edit = form(client, reverse("controls:control_assessment_update", args=[assessment.pk])).json()
    assert "suspended" in edit["fieldsets"][-1]["fields"]

    control.is_active = False
    control.save()
    blocked = form(client, path)
    assert blocked.status_code == 409 and blocked.json()["message"] == "کنترل غیرفعال ارزیابی تازه نمی‌گیرد."


def test_assessment_detail_shows_the_sheet_and_warns_when_it_no_longer_holds(api, grc, owner, control):
    assessment = valid_control_assessment(control, grc, e=3, sample_size=12)
    risk = make_risk(owner=owner)
    risk.controls.add(control)

    data = page(api(grc), assessment.get_absolute_url()).json()
    sheet = data["assessment"]
    assert sheet["control"]["code"] == control.code and sheet["control"]["is_key"]
    assert sheet["coverage_pct"] == "100" and sheet["sample_size"] == 12
    assert sheet["level_name"] and sheet["evidence_age"] > 0 and sheet["valid_until"]["days_left"] > 0
    assert [item["label"] for item in sheet["conditions"]] == ["عملکرد مستمر", "آزمون خرابی و دورزدن", "پایش مستمر"]
    assert any("نمونه‌ی آزمون دست‌کم 30" in problem for problem in data["unmet"])
    assert "نمونه‌ی آزمون" in sheet["problem"]
    assert [item["title"] for item in data["evidence"]] == ["شاهد آزمون کنترل"]
    assert data["edit_url"] == reverse("controls:control_assessment_update", args=[assessment.pk])

    mine = page(api(owner), assessment.get_absolute_url()).json()
    assert mine["edit_url"] is None and mine["attach_url"]
