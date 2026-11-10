from datetime import date, timedelta

import pytest
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_user
from apps.controls.models import Control, ControlAssessment
from apps.controls.tests.factories import valid_control_assessment
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def owner():
    return make_user("owner", first_name="مینا", last_name="کنترلی")


@pytest.fixture
def verifier():
    return make_user("verifier", Role.GRC_MEMBER)


@pytest.fixture
def control(owner):
    return Control.objects.create(
        title="احراز هویت چندعاملی برای حساب‌های ممتاز",
        objective="ورود به حساب ممتاز بدون عامل دوم ممکن نیست.",
        kind=Control.Kind.PREVENTIVE,
        owner=owner,
        operated_by=Responsibility.DATIN,
    )


@pytest.fixture
def evidence(grc):
    return Evidence.objects.create(
        owner=grc,
        kind=Evidence.Kind.TEST,
        title="آزمون MFA روی ۴۲ حساب ممتاز",
        summary="-",
        source="گزارش آزمون",
        observed_on=date(2026, 10, 20),
        reliability=Evidence.Reliability.HIGH,
    )


def sheet(**fields):
    """برگه‌ی آزمونی که همه‌ی شرط‌های E3 را دارد؛ هر آزمون یک شرط را عوض می‌کند."""
    data = {
        "scope": "همه‌ی حساب‌های ممتاز سرورهای تولید",
        "exists": "on",
        "design_ok": "on",
        "population": "۴۲ حساب ممتاز",
        "coverage_pct": "97",
        "critical_points": "حساب اضطراری، ورود کنسول",
        "critical_points_covered": "on",
        "operating_ok": "on",
        "test_method": "اجرای دوباره روی نمونه",
        "test_from": "1405/07/01",
        "test_to": "1405/07/28",
        "sample_size": "30",
        "sample_rationale": "همه‌ی نقش‌ها و هر دو مرکز داده",
        "test_result": "هیچ ورود بدون عامل دوم موفق نشد.",
        "e": "3",
        "confidence": "medium",
        "rationale": "پوشش و نمونه کافی و آزمون فعلی موفق است.",
    }
    data.update(fields)
    return {key: value for key, value in data.items() if value is not None}


def test_each_e_level_needs_all_its_conditions(client, grc, owner, verifier, control, evidence):
    url = reverse("controls:control_assessment_create", args=[control.pk])
    client.force_login(grc)

    def errors(**fields):
        response = client.post(url, sheet(**fields))
        assert response.status_code == 200, "نباید ذخیره شود"
        return " ".join(response.context["form"].errors["e"])

    # کنترل بدون شاهد E1 است (جواب س۵۸).
    assert "بدون شاهد E1" in errors(e="2")
    base = {"evidence": [evidence.pk], "verified_by": verifier.pk}
    assert "دست‌کم 95 درصد" in errors(**base, coverage_pct="94")
    assert "دست‌کم 30 مورد" in errors(**base, sample_size="29")
    assert "همه‌ی نقاط حیاتی" in errors(**base, critical_points_covered=None)
    assert "شکاف شناخته‌شده" in errors(**base, known_gap="on")
    # تأییدکننده‌ی E3 کسی جز مسئول کنترل است (جواب س۵۴).
    assert "جز مسئول کنترل" in errors(evidence=[evidence.pk], verified_by=owner.pk)
    assert "تأییدکننده می‌خواهد" in errors(evidence=[evidence.pk])
    message = errors(**base, e="4")
    assert "تا E3 را پشتیبانی" in message and "عملکرد مستمر" in message
    assert "پایش مستمر" in errors(**base, e="5", sustained="on", failure_bypass_tested="on")
    assert not ControlAssessment.objects.exists()

    response = client.post(url, sheet(**base, e="5", sustained="on", failure_bypass_tested="on", monitored="on"))
    assessment = ControlAssessment.objects.get()
    assert response.url == assessment.get_absolute_url()
    assert (assessment.e, assessment.control, assessment.created_by) == (5, control, grc)
    assert assessment.code.startswith("CA-1405-")
    assert assessment.method_version == MethodVersion.objects.get(number=1)
    assert list(assessment.evidence.all()) == [evidence]


def test_e1_needs_nothing_but_a_reason(client, grc, control):
    client.force_login(grc)
    response = client.post(
        reverse("controls:control_assessment_create", args=[control.pk]),
        {"scope": "سرورهای تولید", "e": "1", "rationale": "MFA نصب شده ولی استثناها و کارکردش تأیید نشده است."},
    )
    assessment = ControlAssessment.objects.get()
    assert response.url == assessment.get_absolute_url()
    assert assessment.valid_until is None and assessment.effective_e() == 1


def make_assessment(control, grc, verifier, e=3, test_to=date(2026, 10, 20), **fields):
    assessment = valid_control_assessment(
        control, grc, verified_by=verifier, e=e, test_to=test_to, **fields
    )
    return assessment


def test_evidence_age_follows_the_method_version_and_old_evidence_gives_no_credit(control, grc, verifier):
    other = make_assessment(control, grc, verifier)
    assert other.valid_until == date(2026, 10, 20) + timedelta(days=180)  # کنترل غیرکلیدی

    control.is_key = True
    control.save()
    key = make_assessment(control, grc, verifier)
    assert key.valid_until == date(2026, 10, 20) + timedelta(days=90)  # کنترل کلیدی زودتر کهنه می‌شود

    assert key.effective_e(on=key.valid_until) == 3
    after = key.valid_until + timedelta(days=1)
    assert key.effective_e(on=after) == 1 and "کهنه" in key.credit_problem(on=after)

    key.suspended = True
    key.save()
    assert key.effective_e(on=date(2026, 10, 21)) == 1 and key.credit_problem() == "معلق است"


def test_database_rejects_e_outside_1_to_5_and_a_reasonless_assessment(control, grc, verifier):
    version = MethodVersion.objects.get(number=1)
    for values in [{"e": 0, "rationale": "x"}, {"e": 6, "rationale": "x"}, {"e": 2, "rationale": ""}]:
        with pytest.raises(IntegrityError), transaction.atomic():
            ControlAssessment.objects.create(
                control=control, method_version=version, scope="-", created_by=grc, **values
            )


def test_the_owner_attaches_test_files_but_only_grc_records_e(client, grc, owner, verifier, control):
    assessment = make_assessment(control, grc, verifier)
    client.force_login(owner)
    assert client.get(reverse("controls:control_assessment_create", args=[control.pk])).status_code == 403
    assert client.get(reverse("controls:control_assessment_update", args=[assessment.pk])).status_code == 403

    page = client.get(assessment.get_absolute_url())
    assert page.status_code == 200 and page.context["can_attach"] and not page.context["can_edit"]
    content_type = ContentType.objects.get_for_model(ControlAssessment)
    upload = reverse("core:attachment_upload", args=[content_type.pk, assessment.pk])
    assert client.get(upload).status_code == 200

    client.force_login(make_user("stranger"))
    assert client.get(assessment.get_absolute_url()).status_code == 404

    # صفحه‌ی کنترل ارزیابی‌هایش را نشان می‌دهد.
    client.force_login(grc)
    page = client.get(control.get_absolute_url())
    assert list(page.context["effectiveness"]) == [assessment]


def test_an_inactive_control_gets_no_new_assessment(client, grc, control):
    control.is_active = False
    control.save()
    client.force_login(grc)

    response = client.get(reverse("controls:control_assessment_create", args=[control.pk]))

    assert response.url == control.get_absolute_url()


def test_the_detail_page_warns_when_the_sheet_no_longer_supports_e(client, grc, owner, control):
    # تأییدکننده بعداً همان مسئول کنترل شده است؛ E3 دیگر پشتیبانی نمی‌شود.
    assessment = make_assessment(control, grc, owner)
    client.force_login(grc)

    unmet = client.get(assessment.get_absolute_url()).context["unmet"]

    assert any("جز مسئول کنترل" in problem for problem in unmet)


def test_e2_requires_proven_limited_effect_not_just_installation(client, grc, control, evidence):
    client.force_login(grc)
    url = reverse("controls:control_assessment_create", args=[control.pk])
    values = sheet(e="2", operating_ok=None, evidence=[evidence.pk])
    response = client.post(url, values)
    assert "اثر واقعی" in " ".join(response.context["form"].errors["e"])
    response = client.post(url, values | {"limited_effect_proven": "on"})
    assert response.status_code == 302
    assert ControlAssessment.objects.get().effective_e() == 2


def test_unsupported_or_future_control_tests_do_not_reduce_current_risk(control, grc, verifier):
    sheet = make_assessment(control, grc, verifier)
    assert sheet.effective_e() == 3
    sheet.evidence.clear()
    assert sheet.effective_e() == 1
    sheet = make_assessment(control, grc, verifier, test_to=date(2099, 1, 1))
    assert sheet.effective_e() == 1
    control.is_active = False
    control.save()
    assert sheet.effective_e() == 1
