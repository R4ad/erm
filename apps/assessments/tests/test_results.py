from datetime import date, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.assessments.models import Assessment, AssessmentReview, ImpactDetail, Path
from apps.assessments.results import compute, outcome, submission_problems
from apps.assessments.review import ReviewError, can_decide_referral, can_review, review, submit
from apps.assessments.services import create_assessment, likelihood_summary
from apps.catalog.models import Customer, Responsibility, ServiceCustomer
from apps.catalog.tests.factories import make_service, make_user
from apps.controls.models import Control
from apps.controls.tests.factories import valid_control_assessment
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence, Risk, RiskCategory
from apps.workflow.lifecycle import get_transition
from apps.workflow.services import WorkflowError, perform_transition

pytestmark = pytest.mark.django_db
S = Assessment.Status
A = AssessmentReview.Action


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def checker():
    return make_user("checker", Role.GRC_MEMBER, first_name="علی", last_name="رضایی")


@pytest.fixture
def workgroup():
    return make_user("workgroup", Role.SECURITY_WORKGROUP)


@pytest.fixture
def bank():
    return Customer.objects.create(name="بانک الف")


@pytest.fixture
def risk(bank):
    service = make_service("SRV-1")
    risk = Risk.objects.create(
        title="تغییر غیرمجاز تنظیمات سرور تولید",
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=service.org_unit,
        service=service,
        owner=make_user("risk-owner"),
        status=Risk.Status.ASSESSMENT,
        initiator="ایجاد یک بسته‌ی انتشار نامعتبر",
        count_unit="هر بسته‌ی نامعتبر یکتا",
        scope="خدمت SRV-1 در محیط تولید",
    )
    risk.customers.add(bank)
    return risk


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


def impact(assessment, customer, code, level, confidence="high", evidence=None, **fields):
    detail = ImpactDetail.objects.create(
        assessment=assessment,
        customer=customer,
        scale=assessment.method_version.scales.get(code=code),
        level=level,
        rationale="دلیل",
        confidence=confidence if level is not None else "",
        **fields,
    )
    if evidence:
        detail.evidence.add(evidence)
    return detail


@pytest.fixture
def ready(risk, grc, bank, evidence):
    """ارزیابی جاری کامل: A برابر ۲، یک مسیر با B0 برابر ۳ و پیامد ۳ برای بانک. L از جدول برابر ۲ است، امتیاز ۶ و
    سطح «متوسط». خانه‌ی تعیین‌کننده‌ی I اطمینان متوسط دارد و بقیه زیاد."""
    assessment = create_assessment(risk, grc, "current", horizon_months=12, meeting_date=date(2026, 10, 20))
    assessment.a_basis = "forward"
    assessment.a = 2
    assessment.a_confidence = "high"
    assessment.confidence = "medium"
    assessment.a_rationale = "برنامه‌ی انتشار سال بعد"
    assessment.save()
    assessment.a_evidence.add(evidence)
    path = Path.objects.create(
        assessment=assessment,
        name="انتشار از مسیر رسمی",
        b0=3,
        b0_confidence="high",
        b0_rationale="مسیر عادی",
    )
    path.evidence.add(evidence)
    for customer in [None, bank]:
        for code in ["S", "D", "F", "C", "R"]:
            impact(assessment, customer, code, 0)
    detail = assessment.impacts.get(customer=bank, scale__code="S")
    detail.level, detail.confidence = 3, "medium"
    detail.save()
    detail.evidence.add(evidence)
    return assessment


def test_a_complete_assessment_gets_score_levels_and_the_overall_confidence(ready):
    result = compute(ready).outcome

    assert (result.b.high, result.likelihood.high, result.impact.high, result.score.high) == (3, 2, 3, 6)
    assert result.base_level.name == result.decision_level.name == "متوسط"
    assert result.escalation_reasons == [] and not result.incomplete
    # اطمینان کلی جداگانه ثبت می‌شود، بدون اطمینان برای تک‌تک مؤلفه‌ها.
    assert result.confidence == "medium"
    # خانه‌ای که I را تعیین نکرده در اطمینان کل اثری ندارد.
    ready.impacts.filter(level=0).update(confidence="low")
    assert compute(ready).outcome.confidence == "medium"
    assert submission_problems(ready) == []


def test_legacy_draft_ranges_need_review_before_submission(ready, bank):
    ready.a_high = 3
    ready.save()
    ready.paths.update(b0_high=4)
    ready.impacts.filter(customer=bank, scale__code="S").update(level_high=4)

    problems = submission_problems(ready)
    assert any("A در پیش‌نویس قدیمی" in problem for problem in problems)
    assert any("B0 مسیر" in problem and "بازه" in problem for problem in problems)
    assert any("پیامد S برای بانک الف" in problem and "بازه" in problem for problem in problems)


def test_unspecified_overall_confidence_is_conservatively_low(ready):
    ready.confidence = ""
    assert compute(ready).outcome.confidence == "low"


def test_critical_service_without_valid_recovery_limits_remains_incomplete(ready, bank, checker):
    service = ready.risk.service
    service.is_critical = True
    service.save()
    link = ServiceCustomer.objects.create(service=service, customer=bank, rto_minutes=120)

    result = compute(ready).outcome
    assert result.score.high == 6
    assert result.incomplete and result.confidence == "low"
    assert "RTO و MTPD" in result.incomplete_reasons[0]

    link.mtpd_minutes = 480
    link.save()
    assert not compute(ready).outcome.incomplete

    link.valid_from = timezone.localdate() + timedelta(days=1)
    link.save()
    assert compute(ready).outcome.incomplete
    submit(ready, ready.created_by)
    review(ready, checker, A.APPROVE)
    ready.refresh_from_db()
    assert ready.is_incomplete and ready.confidence == "low"

    link.valid_from = None
    link.save()
    assert outcome(ready).incomplete  # نتیجه‌ی تأییدشده تاریخی حفظ می‌شود.


def test_an_escalation_flag_raises_the_decision_level_and_keeps_the_score(ready, evidence):
    ready.ongoing_incident = True
    ready.save()
    assert "قاعده‌ی تقدم بدون دلیل ثبت شده است." in submission_problems(ready)
    assert "قاعده‌ی تقدم بدون شاهد ثبت شده است." in submission_problems(ready)

    ready.escalation_rationale = "رخداد RD-12 باز است"
    ready.save()
    ready.escalation_evidence.add(evidence)
    result = compute(ready).outcome
    assert result.score.high == 6 and result.base_level.name == "متوسط"
    assert result.decision_level.name == "بحرانی"
    assert "رویداد در حال وقوع" in result.escalation_reasons[0]
    assert submission_problems(ready) == []


def test_the_impact_floor_is_recorded_as_an_escalation(ready, bank):
    ready.paths.update(b0=1)
    ready.paths.get().evidence.clear()
    ready.paths.get().evidence.add(*Evidence.objects.all())
    ready.impacts.filter(customer=bank, scale__code="S").update(level=5)

    result = compute(ready).outcome
    assert (result.likelihood.high, result.score.high, result.base_level.name) == (1, 5, "متوسط")
    assert result.decision_level.name == "بالا" and "کف پیامد" in result.escalation_reasons[0]


def test_submission_lists_what_blocks_quality_control(risk, grc, bank, ready):
    ready.meeting_date = None
    ready.save()
    ready.paths.update(b0_confidence="")
    detail = ready.impacts.get(customer=bank, scale__code="S")
    detail.evidence.clear()
    detail.rationale = ""
    detail.save()
    ready.impacts.filter(customer=None, scale__code="R").delete()

    problems = submission_problems(ready)
    assert "تاریخ جلسه‌ی کارگروه ثبت نشده است." not in problems
    assert not any("اطمینان B0" in problem for problem in problems)
    label = f"{detail.scale.code} برای بانک الف"
    assert f"پیامد {label} شاهد ندارد." in problems and f"پیامد {label} دلیل ندارد." in problems
    assert any("R برای داتین" in problem for problem in problems)
    with pytest.raises(ReviewError):
        submit(ready, grc)
    ready.refresh_from_db()
    assert ready.status == S.DRAFT


def test_an_empty_assessment_cannot_be_submitted(risk, grc):
    assessment = create_assessment(risk, grc, "current", horizon_months=12)

    problems = submission_problems(assessment)
    assert "A ثبت نشده است." in problems
    assert "دست‌کم یک مسیر تحقق لازم است (بخش ۱۵)." in problems
    assert "تاریخ جلسه‌ی کارگروه ثبت نشده است." not in problems


def test_another_grc_member_approves_and_the_result_is_stored_and_locked(client, grc, checker, ready):
    client.force_login(grc)
    page = client.get(ready.get_absolute_url())
    assert page.context["can_submit"] and page.context["submission_problems"] == []
    response = client.post(reverse("assessments:submit", args=[ready.pk]), {"notes": ""})
    assert response.url == f"{ready.get_absolute_url()}#review"
    ready.refresh_from_db()
    assert ready.status == S.IN_QC
    # ارزیابی در کنترل کیفیت ویرایش نمی‌شود و ارزیاب خودش آن را کنترل نمی‌کند.
    assert client.get(reverse("assessments:initiator", args=[ready.pk])).status_code == 403
    assert not client.get(ready.get_absolute_url()).context["can_review"]
    assert client.post(reverse("assessments:review", args=[ready.pk]), {"action": "approve"}).status_code == 403

    client.force_login(checker)
    assert client.get(ready.get_absolute_url()).context["can_review"]
    client.post(reverse("assessments:review", args=[ready.pk]), {"action": "approve", "notes": ""})
    ready.refresh_from_db()
    assert ready.status == S.APPROVED and ready.approved_at
    assert (ready.score_low, ready.score_high, ready.decision_level.name, ready.confidence) == (6, 6, "متوسط", "medium")
    assert ready.result_detail["paths"][0]["b"] == [3, 3]
    assert [item.action for item in ready.reviews.order_by("pk")] == [A.SUBMIT, A.APPROVE]
    assert ready.history.first().history_user == checker
    assert client.get(reverse("assessments:impact_profile", args=[ready.pk])).status_code == 403

    # ارزیابی تأییدشده همان نتیجه‌ی ذخیره‌شده را نشان می‌دهد، حتی اگر ورودی‌ها بعداً عوض شوند.
    ready.impacts.filter(scale__code="S").update(level=5)
    assert outcome(ready).decision_level.name == "متوسط"


def test_return_and_referral_need_notes_and_the_workgroup_decides_with_a_meeting_date(
    client, grc, checker, workgroup, ready
):
    submit(ready, grc)
    with pytest.raises(ReviewError, match="اختلاف"):
        review(ready, checker, A.RETURN, " ")
    review(ready, checker, A.RETURN, "شاهد B0 کافی نیست")
    ready.refresh_from_db()
    assert ready.status == S.DRAFT

    submit(ready, grc)
    review(ready, checker, A.REFER, "ارزیاب و کنترل‌کننده درباره‌ی B0 هم‌نظر نیستند")
    ready.refresh_from_db()
    assert ready.status == S.REFERRED
    assert not can_review(checker, ready)

    # طرف‌های اختلاف تصمیم کارگروه را ثبت نمی‌کنند؛ عضو GRC دیگری می‌تواند (جواب س۵۲).
    for party in [grc, checker]:
        client.force_login(party)
        assert not client.get(ready.get_absolute_url()).context["can_decide_referral"]
    assert can_decide_referral(make_user("third", Role.GRC_MEMBER), ready)
    assert not can_decide_referral(make_user("viewer"), ready)
    client.force_login(workgroup)
    url = reverse("assessments:referral", args=[ready.pk])
    response = client.post(url, {"action": "workgroup_approve", "notes": "", "meeting_date": ""}, follow=True)
    messages = [str(message) for message in response.context["messages"]]
    assert "تاریخ جلسه‌ی کارگروه را بنویسید." in messages and "تصمیم کارگروه را بنویسید." in messages
    client.post(url, {"action": "workgroup_approve", "notes": "B0 همان ۳ است", "meeting_date": "1405/08/10"})
    ready.refresh_from_db()
    assert ready.status == S.APPROVED
    decision = ready.reviews.first()
    assert (decision.action, decision.meeting_date, decision.created_by) == (
        A.WORKGROUP_APPROVE,
        date(2026, 11, 1),
        workgroup,
    )


def test_someone_who_submitted_an_assessment_does_not_review_it(grc, checker, ready):
    submit(ready, grc)
    review(ready, checker, A.RETURN, "دلیل پیامد کافی نیست")
    # کنترل‌کننده‌ی قبلی پیش‌نویس را اصلاح و خودش دوباره ارسال می‌کند؛ حالا او هم ارزیاب این پرونده است.
    submit(ready, checker)
    assert not can_review(checker, ready) and not can_review(grc, ready)
    assert can_review(make_user("third", Role.GRC_MEMBER), ready)
    assert not can_review(make_user("viewer"), ready)


def test_an_incomplete_assessment_is_approved_but_does_not_open_the_treatment_plan(
    grc, checker, workgroup, ready, bank
):
    ready.impacts.filter(customer=bank, scale__code="C").update(level=None, confidence="")

    result = compute(ready).outcome
    assert result.incomplete and result.decision_level is None and result.confidence == "low"
    assert submission_problems(ready) == []
    submit(ready, grc)
    review(ready, checker, A.APPROVE)
    ready.refresh_from_db()
    assert ready.status == S.APPROVED and ready.incomplete_reasons and ready.decision_level is None

    with pytest.raises(WorkflowError, match="ناقص"):
        perform_transition(ready.risk, get_transition("approve"), workgroup, meeting_date=date(2026, 11, 1))


def test_the_workgroup_sends_the_risk_to_treatment_only_with_an_approved_current_assessment(
    client, grc, checker, workgroup, ready
):
    risk = ready.risk
    with pytest.raises(WorkflowError, match="تأییدشده"):
        perform_transition(risk, get_transition("approve"), workgroup, meeting_date=date(2026, 11, 1))
    submit(ready, grc)
    review(ready, checker, A.APPROVE)

    client.force_login(grc)
    page = client.get(risk.get_absolute_url())
    assert page.context["current_assessment"] == ready
    assert "سطح فعلی ریسک" in page.content.decode()
    perform_transition(risk, get_transition("approve"), workgroup, meeting_date=date(2026, 11, 1))
    risk.refresh_from_db()
    assert risk.status == Risk.Status.TREATMENT_PLAN


def test_a_reassessed_risk_needs_an_assessment_approved_in_the_new_round(grc, checker, workgroup, ready):
    submit(ready, grc)
    review(ready, checker, A.APPROVE)
    risk = ready.risk
    # ریسک از بازبینی برگشته است (ردیف ۹)؛ ارزیابی دور قبل کافی نیست.
    risk.status = Risk.Status.REVIEW
    risk.save()
    perform_transition(risk, get_transition("reassess"), grc)

    with pytest.raises(WorkflowError, match="دور ارزیابی"):
        perform_transition(risk, get_transition("approve"), workgroup, meeting_date=date(2026, 11, 1))


def test_an_approved_assessment_keeps_its_likelihood_after_a_control_is_suspended(grc, checker, ready, evidence):
    control = Control.objects.create(
        title="اعتبارسنجی بسته",
        objective="-",
        kind=Control.Kind.PREVENTIVE,
        owner=make_user("control-owner"),
        operated_by=Responsibility.DATIN,
    )
    ready.risk.controls.add(control)
    control_assessment = valid_control_assessment(
        control, grc,
        method_version=MethodVersion.objects.get(number=1),
        scope="مسیر انتشار رسمی",
        e=3,
        confidence="high",
        rationale="آزمون",
        test_to=timezone.localdate() - timedelta(days=10),
    )
    path = ready.paths.get()
    path.b0 = 5
    path.save()
    path.control_assessments.add(control_assessment)
    assert compute(ready).outcome.b.high == 3
    submit(ready, grc)
    review(ready, checker, A.APPROVE)

    control_assessment.suspended = True
    control_assessment.save()
    ready.refresh_from_db()
    summary = likelihood_summary(ready)
    assert summary.b.high == 3 and summary.paths[0].controls[0].e == 3
    assert outcome(ready).score.high == 3 * 2  # L از A2 و B3 برابر ۲ است و I برابر ۳


def test_an_approved_assessment_needs_the_engine_to_agree_again(grc, checker, ready):
    submit(ready, grc)
    # از زمان ارسال، مالک ریسک غیرفعال شده است؛ تأیید دوباره چک می‌کند.
    owner = ready.risk.owner
    owner.is_active = False
    owner.save()
    with pytest.raises(ReviewError, match="مالک"):
        review(ready, checker, A.APPROVE)
    ready.refresh_from_db()
    assert ready.status == S.IN_QC and not ready.reviews.filter(action=A.APPROVE).exists()


def test_ordinary_assessment_needs_no_meeting_and_keeps_its_approved_scope(grc, checker, ready, bank):
    ready.meeting_date = None
    ready.save()
    submit(ready, grc)
    review(ready, checker, A.APPROVE)
    ready.refresh_from_db()
    saved = ready.scope_snapshot
    assert saved["customers"] == [{"id": bank.pk, "name": bank.name}]
    assert saved["initiator"] == ready.risk.initiator
    ready.risk.customers.clear()
    ready.risk.customers.add(Customer.objects.create(name="بانک جدید پس از تأیید"))
    bank.name = "نام تغییرکرده بانک"
    bank.save()
    ready.refresh_from_db()
    assert ready.scope_snapshot == saved
    from apps.assessments.services import stakeholders

    assert [customer.name for customer in stakeholders(ready) if customer] == [saved["customers"][0]["name"]]


def test_target_needs_a_due_date_and_nondefault_horizon_needs_a_reason(ready):
    ready.kind = Assessment.Kind.TARGET
    ready.assumptions = "اقدام و معیار آزمون"
    ready.horizon_months = 6
    ready.save()
    problems = submission_problems(ready)
    assert any("موعد تحقق" in problem for problem in problems)
    assert any("افق متفاوت" in problem for problem in problems)
    ready.target_due = timezone.localdate() + timedelta(days=30)
    ready.horizon_rationale = "مدت قرارداد باقیمانده"
    assert submission_problems(ready) == []
