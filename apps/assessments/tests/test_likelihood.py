from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Assessment, Path
from apps.assessments.services import assessment_rate_check, create_assessment, likelihood_summary
from apps.catalog.models import Responsibility
from apps.catalog.tests.factories import make_service, make_user
from apps.controls.models import Control, ControlAssessment
from apps.controls.tests.factories import valid_control_assessment
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence, Risk, RiskCategory

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def risk():
    service = make_service("SRV-1")
    return Risk.objects.create(
        title="تغییر غیرمجاز تنظیمات سرور تولید",
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=service.org_unit,
        service=service,
        status=Risk.Status.ASSESSMENT,
        initiator="ایجاد یک بسته‌ی انتشار نامعتبر",
        count_unit="هر بسته‌ی نامعتبر یکتا",
        scope="خدمت SRV-1 در محیط تولید",
    )


@pytest.fixture
def assessment(risk, grc):
    return create_assessment(risk, grc, "current", horizon_months=12)


@pytest.fixture
def evidence(grc, risk):
    item = Evidence.objects.create(
        owner=grc,
        kind=Evidence.Kind.STATISTICS,
        title="گزارش انتشارهای سال",
        summary="-",
        source="سامانه‌ی انتشار",
        observed_on=date(2026, 10, 1),
        reliability=Evidence.Reliability.HIGH,
    )
    item.risks.add(risk)
    return item


def make_control(risk, code_title, kind=Control.Kind.PREVENTIVE, link=True):
    control = Control.objects.create(
        title=code_title,
        objective="-",
        kind=kind,
        owner=make_user(f"owner-{Control.objects.count()}"),
        operated_by=Responsibility.DATIN,
    )
    if link:
        risk.controls.add(control)
    return control


def assessed(control, grc, e, test_to=None, **fields):
    return valid_control_assessment(
        control, grc, e=e, test_to=test_to or timezone.localdate() - timedelta(days=10), **fields
    )


def rate(assessment, count, months, coverage):
    check = assessment_rate_check(assessment, count, months, None if coverage is None else Decimal(coverage))
    return check.suggestion.level, check.insufficient


def test_the_rate_follows_the_a_table_and_says_when_data_is_not_enough(assessment):
    # مثال بخش ۱۳: ۲۰ بسته‌ی نامعتبر در یک سال یعنی نرخ ۲۰، که در «از ۱۰ تا کمتر از ۱۰۰» است.
    assert rate(assessment, 20, 12, "98") == (4, [])
    level, insufficient = rate(assessment, 1, 6, "98")
    assert level == 3 and "کمتر از 12 ماه" in insufficient[0]
    level, insufficient = rate(assessment, 5, 12, "80")
    assert level == 3 and "کران پایین" in insufficient[0]
    assert "معلوم نیست" in rate(assessment, 5, 12, None)[1][0]
    # صفر رخداد در یک سال نرخ کمتر از ۰٫۱ را ثابت نمی‌کند؛ در ده سال می‌کند.
    level, insufficient = rate(assessment, 0, 12, "99")
    assert level is None and "صفر رخداد" in insufficient[0]
    assert rate(assessment, 0, 120, "99") == (1, [])


def post_initiator(client, assessment, **fields):
    data = {"a_basis": "rate", "a_confidence": "medium", "a_rationale": "داده‌ی سامانه‌ی انتشار", **fields}
    return client.post(reverse("assessments:initiator", args=[assessment.pk]), data)


def test_a_from_rate_needs_enough_data_for_a_single_level(client, grc, assessment, evidence):
    client.force_login(grc)
    page = client.get(reverse("assessments:initiator", args=[assessment.pk]))
    assert page.context["risk"].initiator == "ایجاد یک بسته‌ی انتشار نامعتبر"

    response = post_initiator(client, assessment, a_count="3", a_period_months="6", a_coverage="99", a_level="3")
    assert "A را بازه بگذارید" in response.context["form"].errors["a_level"][0]
    assert response.context["form"].rate.suggestion.level == 3

    response = post_initiator(
        client,
        assessment,
        a_count="3",
        a_period_months="6",
        a_denominator="۴۸۰ بسته",
        a_coverage="99",
        a_level="3",
        a_high="4",
        a_evidence=[evidence.pk],
    )
    assert response.url == f"{assessment.get_absolute_url()}#likelihood"
    assessment.refresh_from_db()
    assert (assessment.a, assessment.a_high, assessment.a_display) == (3, 4, "3 تا 4")
    assert assessment.a_rate == Decimal(6) and list(assessment.a_evidence.all()) == [evidence]


def test_forward_evidence_drops_rate_data_and_needs_a_reason(client, grc, assessment):
    client.force_login(grc)
    response = post_initiator(client, assessment, a_basis="forward", a_level="4", a_rationale="")
    assert "الزامی است" in response.context["form"].errors["a_rationale"][0]
    response = post_initiator(client, assessment, a_basis="forward", a_level="4", a_confidence="")
    assert "اطمینان" in response.context["form"].errors["a_confidence"][0]

    post_initiator(client, assessment, a_basis="forward", a_count="7", a_period_months="12", a_level="4")
    assessment.refresh_from_db()
    assert (assessment.a_basis, assessment.a, assessment.a_count, assessment.a_period_months) == (
        "forward",
        4,
        None,
        None,
    )

    # «نامعلوم» مقدار ندارد ولی دلیل دارد؛ با برگرداندن مسیر به «ثبت‌نشده» همه چیز پاک می‌شود.
    post_initiator(client, assessment, a_basis="forward", a_level="unknown", a_rationale="منبع تهدید هنوز نرسیده")
    assessment.refresh_from_db()
    assert (assessment.a, assessment.a_display, assessment.a_confidence) == (None, "نامعلوم", "")
    post_initiator(client, assessment, a_basis="", a_level="4")
    assessment.refresh_from_db()
    assert (assessment.a_basis, assessment.a, assessment.a_rationale, assessment.a_display) == ("", None, "", "ثبت‌نشده")


def path_data(**fields):
    return {
        "name": "انتشار از مسیر رسمی",
        "description": "بسته از خط انتشار می‌گذرد.",
        "b0_level": "5",
        "b0_confidence": "medium",
        "b0_rationale": "مسیر عادی",
        **fields,
    }


def test_a_path_takes_only_current_preventive_controls_of_the_risk(client, grc, risk, assessment, evidence):
    validation = make_control(risk, "اعتبارسنجی بسته پیش از انتشار")
    current = assessed(validation, grc, 4)
    old = assessed(validation, grc, 4, test_to=timezone.localdate() - timedelta(days=400))
    detective = assessed(make_control(risk, "پایش انتشار", kind=Control.Kind.DETECTIVE), grc, 3)
    unrelated = assessed(make_control(risk, "کنترل ریسک دیگر", link=False), grc, 3)
    review = make_control(risk, "بازبینی دونفره")
    second = assessed(review, grc, 4)
    client.force_login(grc)
    url = reverse("assessments:path_create", args=[assessment.pk])

    choices = list(client.get(url).context["form"].fields["control_assessments"].queryset)
    assert current in choices and second in choices
    assert old not in choices and detective not in choices and unrelated not in choices

    form = client.post(url, path_data(control_assessments=[current.pk], b0_level="1")).context["form"]
    assert "نادر بودن" in form.errors["evidence"][0]
    form = client.post(url, path_data(control_assessments=[current.pk], independent="on")).context["form"]
    assert "دو مانع" in form.errors["independent"][0]
    assert "وابستگی‌های مشترک" in form.errors["independence_rationale"][0]
    assert "شواهد آزمون" in form.errors["evidence"][0]
    form = client.post(url, path_data(critical_exception="on")).context["form"]
    assert "شرح دهید" in form.errors["exceptions"][0]
    third = assessed(validation, grc, 3)
    form = client.post(url, path_data(control_assessments=[current.pk, third.pk])).context["form"]
    assert "یک بار حساب می‌شود" in form.errors["control_assessments"][0]
    assert not Path.objects.exists()

    response = client.post(
        url,
        path_data(
            control_assessments=[current.pk, second.pk],
            independent="on",
            independence_rationale="حساب مدیریتی و زیرساخت جدا",
            evidence=[evidence.pk],
        ),
    )
    path = Path.objects.get()
    assert response.url == path.get_absolute_url()
    assert set(path.control_assessments.all()) == {current, second} and path.b0 == 5

    # بعد از کهنه‌شدن شاهد، انتخاب قبلی در فرم ویرایش می‌ماند تا بی‌صدا حذف نشود.
    current.test_to = timezone.localdate() - timedelta(days=400)
    current.save()
    choices = (
        client.get(reverse("assessments:path_update", args=[path.pk]))
        .context["form"]
        .fields["control_assessments"]
        .queryset
    )
    assert current in choices


def add_path(assessment, name, b0, *control_assessments, **fields):
    path = Path.objects.create(assessment=assessment, name=name, description="-", b0=b0, b0_rationale="-", **fields)
    path.control_assessments.add(*control_assessments)
    return path


def test_scenario_b_is_the_largest_path_b_as_in_the_example_of_section_15(grc, risk, assessment):
    assessment.a_basis, assessment.a, assessment.a_rationale = "forward", 4, "هدف‌گیری معتبر"
    assessment.save()
    validation = assessed(make_control(risk, "اعتبارسنجی بسته"), grc, 4)
    add_path(assessment, "انتشار از مسیر رسمی", 5, validation)
    summary = likelihood_summary(assessment)
    assert [(row.result.bc.high, row.result.b.high) for row in summary.paths] == [(2, 2)]
    assert summary.likelihood.high == 3  # A4 و B2

    add_path(assessment, "انتشار مستقیم خارج از فرایند رسمی", 5)
    summary = likelihood_summary(assessment)
    assert [(row.result.bc.high, row.result.b.high) for row in summary.paths] == [(2, 2), (5, 5)]
    # کنترل خوب مسیر رسمی باز بودن مسیر مستقیم را جبران نمی‌کند.
    assert (summary.b.high, summary.likelihood.high) == (5, 5)
    assert not summary.incomplete


def test_old_suspended_or_blocked_controls_give_no_credit(grc, risk, assessment):
    validation = assessed(make_control(risk, "اعتبارسنجی بسته"), grc, 3)
    path = add_path(assessment, "مسیر رسمی", 5, validation)
    assert likelihood_summary(assessment).paths[0].result.bc.high == 3

    validation.suspended = True
    validation.save()
    row = likelihood_summary(assessment).paths[0]
    assert (row.controls[0].e, row.controls[0].note, row.result.bc.high) == (1, "معلق است", 5)

    validation.suspended = False
    validation.save()
    path.critical_exception, path.exceptions = True, "حساب اضطراری بدون اعتبارسنجی منتشر می‌کند"
    path.save()
    row = likelihood_summary(assessment).paths[0]
    assert row.result.bc.high == 5 and "استثنای بحرانی" in row.notes[0]


def test_unknown_or_missing_parts_keep_l_open_and_approval_blockers_are_listed(grc, risk, assessment):
    summary = likelihood_summary(assessment)
    assert summary.likelihood is None
    assert "A هنوز ثبت نشده است." in summary.incomplete
    assert any("هنوز مسیر تحققی ثبت نشده" in reason for reason in summary.incomplete)

    assessment.a_basis, assessment.a, assessment.a_rationale = "forward", 3, "-"
    assessment.save()
    add_path(assessment, "مسیر نامعلوم", None)
    summary = likelihood_summary(assessment)
    assert summary.b is None and "مجوز B0 برابر ۱ نیست" in summary.incomplete[0]
    assert "A شاهد ندارد؛ هر امتیاز شناسه‌ی شاهد می‌خواهد (بخش ۲۴)." in summary.blockers
    assert "B0 مسیر «مسیر نامعلوم» شاهد ندارد." in summary.blockers

    risk.count_unit = ""
    risk.save()
    assessment.refresh_from_db()
    assert "A نهایی تأیید نمی‌شود" in likelihood_summary(assessment).blockers[0]


def test_only_grc_edits_paths_and_others_see_them(client, grc, risk, assessment):
    path = add_path(assessment, "مسیر رسمی", 4)
    owner = make_user("risk-owner")
    risk.owner = owner
    risk.save()
    client.force_login(owner)
    page = client.get(assessment.get_absolute_url())
    assert [row.path for row in page.context["likelihood"].paths] == [path]
    assert client.get(reverse("assessments:path_update", args=[path.pk])).status_code == 403
    assert client.post(reverse("assessments:path_delete", args=[path.pk])).status_code == 403
    assert client.get(reverse("assessments:initiator", args=[assessment.pk])).status_code == 403

    client.force_login(make_user("stranger"))
    assert client.get(reverse("assessments:path_update", args=[path.pk])).status_code == 404

    client.force_login(grc)
    response = client.post(reverse("assessments:path_delete", args=[path.pk]))
    assert response.url == f"{assessment.get_absolute_url()}#likelihood"
    assert not Path.objects.exists() and Assessment.objects.filter(pk=assessment.pk).exists()
