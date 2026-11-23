from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.accounts.roles import Role
from apps.assessments.models import Assessment, ImpactDetail
from apps.assessments.services import (
    StakeholderFacts,
    create_assessment,
    impact_summary,
    suggest_duration,
    suggest_financial,
)
from apps.catalog.models import Customer, ServiceCustomer
from apps.catalog.tests.factories import make_service, make_user
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence, Risk, RiskCategory

pytestmark = pytest.mark.django_db
S = Risk.Status
QUARTER = Decimal("0.25")


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def v1():
    return MethodVersion.objects.get(number=1)


@pytest.fixture
def bank():
    return Customer.objects.create(name="بانک الف", financial_basis=10_000_000_000)


@pytest.fixture
def risk(bank):
    service = make_service("SRV-1", is_critical=True)
    ServiceCustomer.objects.create(service=service, customer=bank, rto_minutes=120, mtpd_minutes=480)
    risk = Risk.objects.create(
        title="قطع درگاه پرداخت",
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=service.org_unit,
        service=service,
        status=S.ASSESSMENT,
    )
    risk.customers.add(bank)
    return risk


def scale(v1, code):
    return v1.scales.get(code=code)


def facts(critical=True, rto=120, mtpd=480, label="بانک"):
    return StakeholderFacts(critical=critical, rto=rto, mtpd=mtpd, basis=None, label=label)


def test_the_duration_suggestion_follows_the_s_table():
    # مثال سند: خدمت حیاتی با RTO دو ساعت و MTPD هشت ساعت.
    cases = [(0, 0), (30, 2), (31, 3), (120, 3), (121, 4), (479, 4), (480, 5)]
    for minutes, level in cases:
        assert suggest_duration(minutes, facts(), QUARTER).level == level, minutes
    for minutes, level in [(30, 1), (90, 2), (121, 3)]:
        assert suggest_duration(minutes, facts(critical=False), QUARTER).level == level, minutes

    missing = suggest_duration(60, facts(rto=None), QUARTER)
    assert missing.level is None and "RTO یا MTPD" in missing.note
    inconsistent = suggest_duration(60, facts(rto=500), QUARTER)
    assert inconsistent.level is None and "مسئول BIA" in inconsistent.note
    assert suggest_duration(None, facts(), QUARTER) is None


def test_the_financial_suggestion_uses_the_bounds_of_the_method_version(v1):
    f = scale(v1, "F")
    basis = 10_000_000_000
    for loss, level in [(0, 0), (1_000_000, 1), (1_000_001, 2), (50_000_000, 3), (200_000_000, 4), (200_000_001, 5)]:
        assert suggest_financial(Decimal(loss), basis, f).level == level, loss
    assert suggest_financial(Decimal(5), None, f).level is None


def test_grc_creates_assessments_only_while_the_risk_is_being_assessed(client, grc, risk, v1):
    url = reverse("assessments:assessment_create", args=[risk.pk])
    client.force_login(make_user("viewer", Role.VIEWER))
    assert client.get(url).status_code == 403

    client.force_login(make_user("workgroup", Role.SECURITY_WORKGROUP))
    assert client.get(url).status_code == 200

    client.force_login(grc)
    form = client.get(url).context["form"]
    assert form.initial["horizon_months"] == 12  # افق پیش‌فرض نسخه‌ی روش
    response = client.post(url, {"kind": "inherent", "horizon_months": 12})
    assert "کنترل‌های کنارگذاشته" in response.context["form"].errors["assumptions"][0]

    response = client.post(url, {"kind": "current", "horizon_months": 12, "meeting_date": "1405/08/12"})
    assessment = Assessment.objects.get()
    assert response.url == reverse("assessments:impact_profile", args=[assessment.pk])
    assert assessment.code.startswith("AS-1405-") and assessment.method_version == v1
    assert assessment.meeting_date.isoformat() == "2026-11-03"

    risk.status = S.REGISTERED
    risk.save()
    response = client.get(url)
    assert response.url == risk.get_absolute_url()


def test_target_assessments_are_also_recorded_in_treatment_plan(client, grc, risk):
    risk.status = S.TREATMENT_PLAN
    risk.save()
    client.force_login(grc)

    form = client.get(reverse("assessments:assessment_create", args=[risk.pk])).context["form"]

    assert [value for value, _ in form.fields["kind"].choices] == ["target"]


def profile_data(prefix, **fields):
    return {f"{prefix}-{name}": value for name, value in fields.items()}


def test_the_impact_profile_has_datin_and_each_affected_bank(client, grc, risk, bank, v1):
    assessment = create_assessment(risk, grc, "current", horizon_months=12)
    evidence = Evidence.objects.create(
        owner=grc,
        kind="test",
        title="آزمون بازیابی",
        summary="-",
        source="-",
        observed_on="2026-10-01",
        reliability="high",
    )
    evidence.risks.add(risk)
    client.force_login(grc)
    url = reverse("assessments:impact_profile", args=[assessment.pk])

    groups = client.get(url).context["groups"]
    assert [group["customer"] for group in groups] == [None, bank]
    assert [form.scale.code for form in groups[0]["forms"]] == ["S", "D", "F", "C", "R"]
    assert groups[1]["forms"][2].initial["basis"] == bank.financial_basis  # مبنای مالی بانک از پیش پر است

    data = {
        **profile_data(f"{bank.pk}-S", level="3", actual_value="200", confidence="high", evidence=[evidence.pk]),
        **profile_data("datin-F", level=""),
        **profile_data("datin-D", level="0", confidence="medium"),
        **profile_data("datin-C", level="unknown"),
    }
    response = client.post(url, data)
    forms = {form.prefix: form for group in response.context["groups"] for form in group["forms"]}
    # پیشنهاد هر خانه حتی بعد از خانه‌ی ایراددار حساب شده است.
    assert forms[f"{bank.pk}-S"].suggestion.level == 4
    # سامانه برای ۲۰۰ دقیقه سطح ۴ پیشنهاد می‌دهد؛ سطح دیگر دلیل می‌خواهد.
    assert "سطح 4" in forms[f"{bank.pk}-S"].errors["rationale"][0]
    assert "دلیل می‌خواهد" in forms["datin-D"].errors["rationale"][0]
    assert "نامعلوم" in forms["datin-C"].errors["rationale"][0]
    assert not ImpactDetail.objects.exists()

    data.update(
        {
            f"{bank.pk}-S-rationale": "جابه‌جایی خودکار در ۹۰ دقیقه آزمون شده است.",
            "datin-D-rationale": "داده‌ای در این سناریو درگیر نیست.",
            "datin-C-rationale": "بند SLA هنوز از حقوقی نرسیده است.",
            **profile_data("datin-R", level="2", level_high="3", confidence="low", rationale="دو شکایت مشابه"),
        }
    )
    response = client.post(url, data)
    # ذخیره در همین صفحه می‌ماند (فیگما ۰۶)؛ «ادامه» با next=initiator به عامل آغازگر می‌رود.
    assert response.url == url

    # بعد از ذخیره، صفحه‌ی پروفایل پیشنهاد را از مقدار ذخیره‌شده نشان می‌دهد.
    saved = client.get(url).context["groups"][1]["forms"][0]
    assert saved.suggestion.level == 4 and saved.initial["level"] == "3"

    s = assessment.impacts.get(customer=bank, scale__code="S")
    assert (s.level, s.actual_value, s.unit, list(s.evidence.all())) == (3, Decimal(200), "دقیقه", [evidence])
    assert assessment.impacts.get(customer=None, scale__code="C").level is None
    assert assessment.impacts.get(customer=None, scale__code="R").engine_level == (2, 3)
    assert assessment.impacts.count() == 4


def test_the_summary_takes_the_highest_valid_level_and_treats_gaps_as_unknown(grc, risk, bank, v1):
    assessment = create_assessment(risk, grc, "current", horizon_months=12)

    def add(customer, code, level, high=None):
        ImpactDetail.objects.create(
            assessment=assessment,
            customer=customer,
            scale=scale(v1, code),
            level=level,
            level_high=high,
            rationale="دلیل",
            confidence="medium",
        )

    add(bank, "S", 3, 4)
    add(None, "D", 2)
    summary = impact_summary(assessment)
    assert summary.impact is None and summary.incomplete  # خانه‌های ثبت‌نشده می‌توانند I را بالاتر ببرند
    assert "F برای داتین" in summary.missing

    add(bank, "C", 5)
    summary = impact_summary(assessment)
    assert (summary.impact.low, summary.impact.high) == (5, 5)  # سطح ۵ بالاترین است و ناشناخته‌ها اثری ندارند


def test_an_all_zero_profile_is_rejected_by_the_engine(grc, risk, v1):
    risk.customers.clear()
    assessment = create_assessment(risk, grc, "current", horizon_months=12)
    for item in v1.scales.filter(kind="impact"):
        ImpactDetail.objects.create(assessment=assessment, scale=item, level=0, rationale="اثر ندارد")

    assert "تمام‌صفر" in impact_summary(assessment).problems[0]


def test_impact_rules_are_also_checked_in_the_database(grc, risk, v1):
    assessment = create_assessment(risk, grc, "current", horizon_months=12)
    s = scale(v1, "S")
    ImpactDetail.objects.create(assessment=assessment, scale=s, level=2, confidence="low")
    for values in [
        {"scale": s, "level": 3},  # داتین برای یک بُعد دو ردیف ندارد
        {"scale": scale(v1, "D"), "level": None},  # نامعلوم بی‌دلیل
        {"scale": scale(v1, "F"), "level": 0},  # صفر بی‌دلیل
        {"scale": scale(v1, "C"), "level": 3, "level_high": 2},
        {"scale": scale(v1, "R"), "level": 6, "rationale": "x"},
    ]:
        with pytest.raises(IntegrityError), transaction.atomic():
            ImpactDetail.objects.create(assessment=assessment, **values)


def test_people_who_see_the_risk_see_its_assessments_and_only_grc_edits(client, grc, risk):
    assessment = create_assessment(risk, grc, "current", horizon_months=12)
    owner = make_user("owner")
    risk.owner = owner
    risk.save()
    client.force_login(owner)

    page = client.get(risk.get_absolute_url())
    assert list(page.context["assessments"]) == [assessment]
    assert not page.context["can_add_assessment"]
    assert client.get(assessment.get_absolute_url()).status_code == 200
    assert client.get(reverse("assessments:impact_profile", args=[assessment.pk])).status_code == 403

    client.force_login(make_user("stranger"))
    assert client.get(assessment.get_absolute_url()).status_code == 404

    # ارزیابی ریسک بسته‌شده دیگر ویرایش نمی‌شود.
    risk.status = S.CLOSED
    risk.save()
    client.force_login(grc)
    assert client.get(reverse("assessments:assessment_update", args=[assessment.pk])).status_code == 403
