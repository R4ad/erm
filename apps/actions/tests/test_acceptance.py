from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions import acceptance as acc
from apps.actions.models import AcceptanceSignature, RiskAcceptance
from apps.actions.mywork import my_work
from apps.actions.services import PlanError, approve_plan
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.core.models import Attachment
from apps.organization.models import OrgUnit
from apps.risks.models import Risk
from apps.workcalendar.workdays import add_months
from apps.workflow.lifecycle import get_transition
from apps.workflow.services import perform_transition

from .test_treatment import approved, make_plan, make_risk, to_treatment_plan

pytestmark = pytest.mark.django_db
AUTH = AcceptanceSignature.Authority
STATUS = RiskAcceptance.Status
APPROVE, REJECT = AcceptanceSignature.Decision.APPROVE, AcceptanceSignature.Decision.REJECT


@pytest.fixture
def committee():
    return make_user("committee", Role.SECURITY_COMMITTEE, first_name="کامران", last_name="کمیته")


@pytest.fixture
def unit_manager():
    return make_user("unitmgr", Role.UNIT_MANAGER, first_name="مینا", last_name="مدیر")


def risk_at(owner, grc, level_name, score, **flags):
    risk = make_risk(owner, f"ریسک {level_name} {Risk.objects.count()}")
    assessment = approved(risk, grc, level_name, score)
    if flags:
        Assessment.objects.filter(pk=assessment.pk).update(**flags)
    to_treatment_plan(risk, grc)
    return risk


def acceptance_data(**fields):
    today = timezone.localdate()
    return {
        "scope": "خدمت پرداخت برای همه‌ی بانک‌ها",
        "reason": "هزینه‌ی کاهش از پیامد بیشتر است.",
        "alternatives": "کاهش با WAF؛ رد شد چون پیامد کم است.",
        "compensating_controls": "پایش روزانه‌ی لاگ",
        "conditions": "رخداد تازه‌ای ثبت نشود.",
        "customer_constraints": "قرارداد بانک‌ها محدودیتی برای این ریسک ندارد.",
        "monitoring": "تعداد هشدارهای ماهانه",
        "revocation_triggers": "هر رخداد مرتبط یا تغییر دامنه",
        "start_date": to_jalali(today),
        "end_date": to_jalali(today + timedelta(days=20)),
        **fields,
    }


def make_acceptance(risk, grc, **fields):
    today = timezone.localdate()
    values = {key: value for key, value in acceptance_data().items() if key not in ("start_date", "end_date")} | {
        "start_date": today,
        "end_date": today + timedelta(days=20),
        "follow_up_by": grc,
        **fields,
    }
    return acc.create_acceptance(RiskAcceptance(**values), risk, grc)


def letter():
    return SimpleUploadedFile("letter.pdf", b"%PDF-1.4 letter", content_type="application/pdf")


def test_the_authorities_follow_the_level_and_the_assessment_flags(grc, owner):
    def authorities(level_name, score, **flags):
        risk = risk_at(owner, grc, level_name, score, **flags)
        return [authority for authority, _ in acc.authority_reasons(Assessment.objects.get(risk=risk), risk)]

    assert authorities("پایین", 3) == [AUTH.OWNER]
    assert authorities("متوسط", 6) == [AUTH.OWNER, AUTH.UNIT_MANAGER]
    assert authorities("بالا", 12) == [AUTH.OWNER, AUTH.COMMITTEE]
    assert authorities("بحرانی", 20) == [AUTH.OWNER, AUTH.COMMITTEE]
    # پذیرش غیرعادی مجوز موقت مقام بالاتر می‌خواهد؛ عبور از حد تحمل مشتری مجوز مدیریت ارشد.
    assert authorities("پایین", 3, confidence="low") == [AUTH.OWNER, AUTH.UNIT_MANAGER]
    assert authorities("متوسط", 6, customer_tolerance_exceeded=True) == [
        AUTH.OWNER,
        AUTH.UNIT_MANAGER,
        AUTH.SENIOR_MANAGEMENT,
    ]
    risk = risk_at(owner, grc, "پایین", 3, incomplete_reasons=["A نامعلوم"])
    risk.service.is_critical = True
    risk.service.save()
    assessment = Assessment.objects.get(risk=risk)
    assert [item for item, _ in acc.authority_reasons(assessment, risk)] == [
        AUTH.OWNER,
        AUTH.UNIT_MANAGER,
        AUTH.SENIOR_MANAGEMENT,
    ]


def test_an_acceptance_needs_an_assessed_risk_within_authority(client, grc, owner):
    in_assessment = make_risk(owner, "ریسک در ارزیابی")
    assert any("برنامه‌ی درمان" in problem for problem in acc.creation_problems(in_assessment))

    prohibited = risk_at(owner, grc, "پایین", 3, binding_prohibition=True)
    assert any("خارج از اختیار پذیرش" in problem for problem in acc.creation_problems(prohibited))
    client.force_login(grc)
    page = client.get(prohibited.get_absolute_url())
    assert page.context["out_of_authority"] and not page.context["can_add_acceptance"]

    high = risk_at(owner, grc, "بالا", 12)
    assert any("طرح مواجهه الزامی" in problem for problem in acc.creation_problems(high))
    plan = make_plan(high, grc, option="accept")
    assert any("طرح مواجهه الزامی" in problem for problem in acc.creation_problems(high))
    plan.option = "reduce"
    plan.save()
    assert acc.creation_problems(high) == []

    low = risk_at(owner, grc, "پایین", 3)
    make_acceptance(low, grc)
    assert any("هنوز باز است" in problem for problem in acc.creation_problems(low))
    client.force_login(owner)
    assert client.get(reverse("actions:acceptance_create", args=[low.pk])).status_code == 403


def test_the_form_caps_the_validity_by_the_level(client, grc, owner):
    risk = risk_at(owner, grc, "متوسط", 6, confidence="low")
    client.force_login(grc)
    url = reverse("actions:acceptance_create", args=[risk.pk])
    page = client.get(url)
    today = timezone.localdate()
    cap = add_months(today, 6)
    assert page.context["form"].initial["end_date"] == cap
    data = acceptance_data(follow_up_by=grc.pk, end_date=to_jalali(cap + timedelta(days=1)))
    form = client.post(url, data).context["form"]
    assert "سقف سطح «متوسط»" in form.errors["end_date"][0]
    assert "evidence_due" in form.errors  # اطمینان کم: پذیرش غیرعادی است
    data |= {"start_date": to_jalali(today - timedelta(days=1)), "end_date": to_jalali(cap)}
    form = client.post(url, data).context["form"]
    assert "عطف به ماسبق" in form.errors["start_date"][0]

    data |= {"start_date": to_jalali(today), "evidence_due": to_jalali(today + timedelta(days=40))}
    response = client.post(url, data)
    acceptance = RiskAcceptance.objects.get()
    assert response.url == acceptance.get_absolute_url()
    assert acceptance.code.startswith("AC-") and acceptance.status == STATUS.DRAFT
    assert acceptance.assessment.decision_level.name == "متوسط" and acceptance.created_by == grc


def test_a_low_acceptance_needs_only_the_owner_and_completes_an_accept_plan(client, grc, owner):
    risk = risk_at(owner, grc, "پایین", 3)
    plan = make_plan(risk, grc, option="accept")
    with pytest.raises(PlanError, match="پذیرش معتبر"):
        approve_plan(plan, owner)
    acceptance = make_acceptance(risk, grc)
    assert acceptance.plan == plan
    with pytest.raises(PlanError):
        acc.sign_acceptance(acceptance, owner, AUTH.OWNER, APPROVE)  # هنوز پیش‌نویس است
    with pytest.raises(PlanError):
        acc.submit_acceptance(acceptance, owner)
    acc.submit_acceptance(acceptance, grc)
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.PENDING and acceptance.decision_text == ""

    client.force_login(owner)
    page = client.get(acceptance.get_absolute_url())
    assert [form.initial["authority"] for form in page.context["sign_forms"]] == [AUTH.OWNER]
    assert not page.context["can_edit"]
    url = reverse("actions:acceptance_sign", args=[acceptance.pk])
    client.post(url, {"authority": AUTH.OWNER, "decision": APPROVE, "note": ""})
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.ACTIVE and acceptance.is_in_force
    assert to_jalali(acceptance.end_date) in acceptance.decision_text
    assert acceptance.assessment.code in acceptance.decision_text
    assert "پذیرفته می‌شود" in acceptance.decision_text

    approve_plan(plan, owner)
    perform_transition(risk, get_transition("start_treatment"), grc)
    risk.refresh_from_db()
    assert risk.status == Risk.Status.TREATMENT


def test_a_medium_acceptance_needs_a_manager_of_the_same_unit(grc, owner, unit_manager):
    risk = risk_at(owner, grc, "متوسط", 6)
    acceptance = make_acceptance(risk, grc)
    with pytest.raises(PlanError, match="مدیر فعالی"):
        acc.submit_acceptance(acceptance, grc)
    parent = OrgUnit.objects.create(name="معاونت فناوری")
    risk.org_unit.parent = parent
    risk.org_unit.save()
    parent_manager = make_user("parentmgr", Role.UNIT_MANAGER)
    parent_manager.managed_units.add(parent)
    owner.managed_units.add(risk.org_unit)
    # مدیر واحد بالادست و خود مالک ریسک جای مدیر همان واحد نیستند (جواب س۱۳).
    with pytest.raises(PlanError, match="مدیر فعالی"):
        acc.submit_acceptance(acceptance, grc)
    unit_manager.managed_units.add(risk.org_unit)
    acc.submit_acceptance(acceptance, grc)
    acceptance.refresh_from_db()
    assert not acc.can_sign(parent_manager, acceptance, AUTH.UNIT_MANAGER)
    assert not acc.can_sign(owner, acceptance, AUTH.UNIT_MANAGER)
    assert acc.signable_authorities(unit_manager, acceptance) == [AUTH.UNIT_MANAGER]
    acc.sign_acceptance(acceptance, unit_manager, AUTH.UNIT_MANAGER, APPROVE, "مجوز می‌دهم")
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.PENDING  # امضای مالک هنوز نیست
    acc.sign_acceptance(acceptance, owner, AUTH.OWNER, APPROVE)
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.ACTIVE


def test_the_committee_decision_needs_its_minutes(client, grc, owner, committee):
    risk = risk_at(owner, grc, "بالا", 12)
    make_plan(risk, grc, option="reduce")
    acceptance = make_acceptance(risk, grc, end_date=timezone.localdate() + timedelta(days=60))
    acc.submit_acceptance(acceptance, grc)
    assert not acc.can_sign(grc, acceptance, AUTH.COMMITTEE)
    with pytest.raises(PlanError, match="صورت‌جلسه"):
        acc.sign_acceptance(acceptance, committee, AUTH.COMMITTEE, APPROVE)

    client.force_login(committee)
    page = client.get(acceptance.get_absolute_url())
    assert [form.initial["authority"] for form in page.context["sign_forms"]] == [AUTH.COMMITTEE]
    url = reverse("actions:acceptance_sign", args=[acceptance.pk])
    client.post(url, {"authority": AUTH.COMMITTEE, "decision": APPROVE, "reference": "ص-۱۲", "note": "موقت تا PAM"})
    signature = acceptance.signatures.get()
    assert signature.reference == "ص-۱۲" and signature.created_by == committee
    acc.sign_acceptance(acceptance, owner, AUTH.OWNER, APPROVE)
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.ACTIVE


def test_the_validity_of_a_high_acceptance_is_capped_at_ninety_days(grc, owner):
    risk = risk_at(owner, grc, "بالا", 12)
    make_plan(risk, grc, option="reduce")
    acceptance = make_acceptance(risk, grc, end_date=timezone.localdate() + timedelta(days=91))
    with pytest.raises(PlanError, match="سقف سطح «بالا»"):
        acc.submit_acceptance(acceptance, grc)


def test_grc_records_the_senior_management_letter(client, grc, owner, unit_manager):
    risk = risk_at(owner, grc, "متوسط", 6, customer_tolerance_exceeded=True)
    unit_manager.managed_units.add(risk.org_unit)
    acceptance = make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    client.force_login(grc)
    url = reverse("actions:acceptance_sign", args=[acceptance.pk])
    client.post(url, {"authority": AUTH.SENIOR_MANAGEMENT, "decision": APPROVE, "reference": "۱۲/۳۴۵"})
    assert not acceptance.signatures.exists()
    future = to_jalali(timezone.localdate() + timedelta(days=1))
    client.post(
        url,
        {
            "authority": AUTH.SENIOR_MANAGEMENT,
            "decision": APPROVE,
            "reference": "۱۲/۳۴۵",
            "reference_date": future,
            "letter": letter(),
        },
    )
    assert not acceptance.signatures.exists()
    today = to_jalali(timezone.localdate())
    client.post(
        url,
        {
            "authority": AUTH.SENIOR_MANAGEMENT,
            "decision": APPROVE,
            "reference": "۱۲/۳۴۵",
            "reference_date": today,
            "letter": letter(),
        },
    )
    signature = acceptance.signatures.get()
    assert signature.letter.original_name == "letter.pdf"
    assert Attachment.objects.get(object_id=acceptance.pk).description.endswith("۱۲/۳۴۵")
    page = client.get(acceptance.get_absolute_url())
    assert page.context["sign_forms"] == []  # عضو GRC جای مالک یا مدیر واحد امضا نمی‌کند


def test_a_rejection_closes_and_nothing_extends_by_itself(grc, owner):
    risk = risk_at(owner, grc, "پایین", 3)
    acceptance = make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    with pytest.raises(PlanError, match="دلیل"):
        acc.sign_acceptance(acceptance, owner, AUTH.OWNER, REJECT)
    acc.sign_acceptance(acceptance, owner, AUTH.OWNER, REJECT, "پایش کافی نیست")
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.REJECTED and "پایش کافی نیست" in acceptance.closed_reason
    assert acc.signable_authorities(owner, acceptance) == []

    second = make_acceptance(risk, grc)
    acc.submit_acceptance(second, grc)
    acc.sign_acceptance(second, owner, AUTH.OWNER, APPROVE)
    RiskAcceptance.objects.filter(pk=second.pk).update(
        start_date=timezone.localdate() - timedelta(days=40), end_date=timezone.localdate() - timedelta(days=1)
    )
    second.refresh_from_db()
    assert second.is_expired and not second.is_in_force and second.state_label == "منقضی"
    assert acc.valid_acceptance(second.assessment) is None
    assert second in my_work(grc)["expiring_acceptances"]
    # ادامه پذیرش تازه است با همه‌ی امضاها.
    third = make_acceptance(risk, grc, renews=second)
    assert third.status == STATUS.DRAFT and list(second.renewals.all()) == [third]


def test_an_acceptance_is_revoked_with_a_reason(client, grc, owner, assignee):
    risk = risk_at(owner, grc, "پایین", 3)
    acceptance = make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    acc.sign_acceptance(acceptance, owner, AUTH.OWNER, APPROVE)
    acceptance.refresh_from_db()
    assert not acc.can_revoke(assignee, acceptance)
    with pytest.raises(PlanError, match="دلیل"):
        acc.revoke_acceptance(acceptance, owner, " ")
    client.force_login(owner)
    client.post(reverse("actions:acceptance_revoke", args=[acceptance.pk]), {"reason": "رخداد تازه ثبت شد"})
    acceptance.refresh_from_db()
    assert acceptance.status == STATUS.REVOKED and acceptance.closed_by == owner
    assert acceptance.decision_text  # متن تصمیم سابقه می‌ماند


def test_my_work_lists_acceptances_waiting_for_my_signature(client, grc, owner, committee):
    risk = risk_at(owner, grc, "بالا", 12)
    make_plan(risk, grc, option="reduce")
    acceptance = make_acceptance(risk, grc, end_date=timezone.localdate() + timedelta(days=30))
    assert my_work(owner)["acceptances_to_sign"] == []
    acc.submit_acceptance(acceptance, grc)
    assert my_work(owner)["acceptances_to_sign"] == [acceptance]
    assert my_work(committee)["acceptances_to_sign"] == [acceptance]
    assert my_work(grc)["acceptances_to_sign"] == []
    client.force_login(committee)
    assert acceptance.code in client.get("/").content.decode()
    page = client.get(reverse("actions:acceptance_list") + "?status=pending")
    assert list(page.context["acceptances"]) == [acceptance]


def test_the_acceptance_must_still_match_the_current_assessment(grc, owner):
    risk = risk_at(owner, grc, "پایین", 3)
    acceptance = make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    # ارزیابی جاری تازه‌تری تأیید شده است: پذیرش ارزیابی قبلی دیگر امضا نمی‌شود.
    newer = approved(risk, grc, "متوسط", 6)
    Assessment.objects.filter(pk=newer.pk).update(approved_at=timezone.now() + timedelta(seconds=1))
    with pytest.raises(PlanError, match="دیگر ارزیابی تصمیم"):
        acc.sign_acceptance(acceptance, owner, AUTH.OWNER, APPROVE)
