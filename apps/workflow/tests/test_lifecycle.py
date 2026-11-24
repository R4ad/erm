import datetime

import pytest
from django.db import IntegrityError, transaction
from django.urls import reverse

from apps.accounts.roles import Role
from apps.assessments.services import creation_problems
from apps.catalog.models import Customer
from apps.catalog.tests.factories import make_service, make_user
from apps.organization.models import OrgUnit
from apps.risks.models import Evidence, Risk, RiskCategory, Tag
from apps.workflow.lifecycle import TRANSITIONS, get_transition
from apps.workflow.models import ChangeRequest, RiskQuestion, StatusTransition
from apps.workflow.services import WorkflowError, perform_transition

pytestmark = pytest.mark.django_db
S = Risk.Status


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def workgroup():
    return make_user("workgroup", Role.SECURITY_WORKGROUP)


@pytest.fixture
def owner():
    return make_user("owner", first_name="رضا", last_name="مالکی")


def make_risk(title="قطع درگاه پرداخت", status=S.REGISTERED, owner=None, ready=False, **fields):
    service = fields.pop("service", None) or (make_service(f"SRV-{Risk.objects.count() + 1}") if ready else None)
    unit = fields.pop("org_unit", None) or (
        service.org_unit if service else OrgUnit.objects.create(name=f"واحد {title}")
    )
    risk = Risk.objects.create(
        title=title,
        description="در خدمت پرداخت، قطع ارتباط با درگاه ممکن است تسویه را مختل کند.",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit,
        service=service,
        owner=owner,
        status=status,
        **fields,
    )
    if ready:
        risk.customers.add(Customer.objects.create(name=f"بانک {risk.pk}"))
    return risk


def transition_url(risk, name):
    return reverse("workflow:transition", args=[risk.pk, name])


def test_the_table_follows_the_lifecycle_answer():
    """ده ردیف جدول س۱۵، بدون ردیف ۱ که شروع پرسشنامه است."""
    rows = {(t.row, t.source, t.target) for t in TRANSITIONS}

    assert rows == {
        (2, S.QUESTIONS, S.REGISTERED),
        (3, S.REGISTERED, S.ASSESSMENT),
        (4, S.ASSESSMENT, S.QUESTIONS),
        (5, S.ASSESSMENT, S.REJECTED),
        (6, S.ASSESSMENT, S.TREATMENT_PLAN),
        (7, S.TREATMENT_PLAN, S.TREATMENT),
        (8, S.TREATMENT, S.REVIEW),
        (9, S.REVIEW, S.ASSESSMENT),
        (10, S.REVIEW, S.CLOSED),
    }


def test_the_workgroup_does_its_rows_and_grc_records_them_too(client, grc, workgroup, owner):
    risk = make_risk(owner=owner, status=S.ASSESSMENT)

    client.force_login(workgroup)
    assert client.get(transition_url(risk, "approve")).status_code == 200
    assert client.get(transition_url(risk, "reject")).status_code == 200
    assert client.get(transition_url(risk, "ask_questions")).status_code == 403
    client.force_login(grc)
    assert client.get(transition_url(risk, "approve")).status_code == 200
    client.force_login(owner)
    assert client.get(transition_url(risk, "approve")).status_code == 403


def test_sending_for_assessment_needs_what_makes_a_scenario_assessable(client, grc, owner):
    risk = make_risk(owner=None)
    client.force_login(grc)

    page = client.get(transition_url(risk, "send_to_assessment"))
    problems = page.context["problems"]
    assert "خدمت ریسک تعیین نشده است." in problems
    assert "هیچ بانکی برای ریسک تعیین نشده است." in problems
    assert "مالک ریسک تعیین نشده است." in problems

    ready = make_risk("ریسک کامل", owner=owner, ready=True)
    response = client.post(transition_url(ready, "send_to_assessment"), {"reason": ""})
    assert "فرض قابل آزمون" in response.context["form"].non_field_errors()[0]
    ready.refresh_from_db()
    assert ready.status == S.REGISTERED

    response = client.post(
        transition_url(ready, "send_to_assessment"), {"reason": "فرض: درگاه پشتیبان در ۱۵ دقیقه جایگزین نمی‌شود."}
    )
    ready.refresh_from_db()
    assert response.url == ready.get_absolute_url()
    assert ready.status == S.ASSESSMENT
    record = StatusTransition.objects.get()
    assert (record.from_status, record.to_status, record.created_by) == (S.REGISTERED, S.ASSESSMENT, grc)
    assert ready.history.first().history_user == grc


def test_new_risks_start_in_analysis_and_go_to_assessment_like_registered_ones(client, grc, owner):
    """ریسک تازه «آنالیز ریسک» است و ردیف ۳ («ارسال جهت ارزیابی») از آن هم شروع می‌شود، با همان شرط‌ها."""
    unit = OrgUnit.objects.create(name="واحد تازه")
    assert Risk.objects.create(title="تازه", description="—", channel=Risk.Channel.INTERVIEW, org_unit=unit).status == (
        S.ANALYSIS
    )
    transition = get_transition("send_to_assessment")
    assert transition.sources == (S.REGISTERED, S.ANALYSIS)
    assert transition.source_label == "«ثبت‌شده در رجیستر» یا «آنالیز ریسک»"

    risk = make_risk(owner=owner, ready=True, status=S.ANALYSIS)
    client.force_login(grc)
    client.post(transition_url(risk, "send_to_assessment"), {"reason": "فرض: درگاه پشتیبان جایگزین نمی‌شود."})
    risk.refresh_from_db()
    assert risk.status == S.ASSESSMENT
    record = StatusTransition.objects.get()
    assert (record.from_status, record.to_status) == (S.ANALYSIS, S.ASSESSMENT)

    page = client.get(transition_url(make_risk("در ارزیابی", owner=owner, status=S.TREATMENT), "send_to_assessment"))
    assert page.status_code == 302


def test_the_category_is_needed_before_assessment(client, grc, owner):
    """فرم شناسایی دسته نمی‌گیرد؛ ریسک بی‌دسته در رجیستر می‌ماند تا عضو GRC دسته را تعیین کند و بعد ارزیابی شود."""
    risk = make_risk(owner=owner, ready=True)
    Risk.objects.filter(pk=risk.pk).update(category=None)
    risk.refresh_from_db()
    message = "دسته‌ی اصلی ریسک تعیین نشده است؛ آن را در ویرایش ریسک انتخاب کنید."
    client.force_login(grc)

    assert message in client.get(transition_url(risk, "send_to_assessment")).context["problems"]
    with pytest.raises(WorkflowError) as refused:
        perform_transition(risk, get_transition("send_to_assessment"), grc, reason="فرض قابل آزمون")
    assert message in refused.value.problems
    # ریسک قدیمی بی‌دسته‌ای که به‌هرحال «در ارزیابی» است هم ارزیابی تازه نمی‌گیرد.
    Risk.objects.filter(pk=risk.pk).update(status=S.ASSESSMENT)
    risk.refresh_from_db()
    assert any("دسته‌ی اصلی" in problem for problem in creation_problems(risk))

    Risk.objects.filter(pk=risk.pk).update(status=S.REGISTERED, category=RiskCategory.objects.get(code="T2"))
    risk.refresh_from_db()
    perform_transition(risk, get_transition("send_to_assessment"), grc, reason="فرض قابل آزمون")
    assert risk.status == S.ASSESSMENT
    assert not any("دسته‌ی اصلی" in problem for problem in creation_problems(risk))


def test_linked_evidence_replaces_the_testable_assumption(grc, owner):
    risk = make_risk(owner=owner, ready=True)
    evidence = Evidence.objects.create(
        kind="incident",
        title="رخداد",
        summary="خلاصه",
        source="تیکت",
        observed_on=datetime.date(2026, 10, 1),
        reliability="high",
        owner=owner,
    )
    evidence.risks.add(risk)

    perform_transition(risk, get_transition("send_to_assessment"), grc)

    assert risk.status == S.ASSESSMENT


def test_workgroup_decisions_need_the_meeting_date_and_rejection_a_reason(client, workgroup, owner):
    risk = make_risk(owner=owner, status=S.ASSESSMENT)
    client.force_login(workgroup)

    response = client.post(transition_url(risk, "reject"), {"reason": ""})
    errors = response.context["form"].errors
    assert "meeting_date" in errors and "reason" in errors

    client.post(transition_url(risk, "reject"), {"reason": "ریسک تکراری است", "meeting_date": "1405/08/10"})
    risk.refresh_from_db()
    assert risk.status == S.REJECTED
    assert not risk.is_active
    assert StatusTransition.objects.get().meeting_date == datetime.date(2026, 11, 1)


def test_asking_new_questions_sends_the_risk_back_until_they_are_answered(client, grc, owner):
    unit = OrgUnit.objects.create(name="عملیات")
    risk = make_risk(owner=owner, status=S.ASSESSMENT, org_unit=unit)
    manager = make_user("manager", Role.UNIT_MANAGER)
    manager.managed_units.add(unit)
    other_manager = make_user("other", Role.UNIT_MANAGER)
    other_manager.managed_units.add(OrgUnit.objects.create(name="فروش"))
    client.force_login(grc)

    client.post(
        transition_url(risk, "ask_questions"),
        {"questions": "درگاه پشتیبان دارید؟\n\nآخرین قطعی کی بود؟", "reason": "برای تعیین A"},
    )

    risk.refresh_from_db()
    assert risk.status == S.QUESTIONS
    questions = list(risk.questions.order_by("pk"))
    assert [q.text for q in questions] == ["درگاه پشتیبان دارید؟", "آخرین قطعی کی بود؟"]
    assert questions[0].due > datetime.date.today()

    response = client.post(transition_url(risk, "back_to_register"), {"reason": ""})
    assert "جواب نگرفته‌اند" in response.context["form"].non_field_errors()[0]

    client.force_login(other_manager)
    assert list(client.get(reverse("workflow:question_list")).context["questions"]) == []
    assert client.get(reverse("workflow:question_answer", args=[questions[0].pk])).status_code == 404
    client.force_login(manager)
    assert set(client.get(reverse("workflow:question_list")).context["questions"]) == set(questions)
    for question in questions:
        client.post(reverse("workflow:question_answer", args=[question.pk]), {"answer": "بله، از تیر ۱۴۰۵"})
    assert RiskQuestion.objects.filter(answered_by=manager).count() == 2

    client.force_login(grc)
    client.post(transition_url(risk, "back_to_register"), {"reason": ""})
    risk.refresh_from_db()
    assert risk.status == S.REGISTERED
    assert list(risk.transitions.values_list("to_status", flat=True)) == [S.REGISTERED, S.QUESTIONS]


def test_review_ends_in_reassessment_or_closing_with_a_reason(client, grc, owner):
    risk = make_risk(owner=owner, status=S.REVIEW)
    client.force_login(grc)

    response = client.post(transition_url(risk, "close"), {"reason": ""})
    assert "reason" in response.context["form"].errors
    response = client.post(transition_url(risk, "close"), {"reason": "سامانه‌ی قدیمی از رده خارج شد."})
    risk.refresh_from_db()
    assert risk.status == S.REVIEW  # ادعای حذف مسیر بدون شاهد کافی نیست.
    risk.evidence.add(Evidence.objects.create(
        title="صورت‌جلسه خروج از دامنه", summary="حذف معتبر مسیر", source="مالک خدمت", owner=grc,
        observed_on=datetime.date(2026, 11, 1), kind=Evidence.Kind.TEST,
        reliability=Evidence.Reliability.HIGH,
    ))
    client.post(transition_url(risk, "close"), {"reason": "سامانه‌ی قدیمی از رده خارج شد."})

    risk.refresh_from_db()
    assert risk.status == S.CLOSED
    page = client.get(risk.get_absolute_url())
    assert page.context["transitions"] == []
    assert page.context["can_edit"] is False
    response = client.get(reverse("risks:risk_update", args=[risk.pk]))
    assert response.url == risk.get_absolute_url()


def test_a_transition_from_another_status_is_refused(client, grc, owner):
    risk = make_risk(owner=owner, status=S.REGISTERED)
    client.force_login(grc)

    response = client.get(transition_url(risk, "close"))

    assert response.url == risk.get_absolute_url()
    with pytest.raises(WorkflowError):
        perform_transition(risk, get_transition("close"), grc, reason="دلیل")
    assert not StatusTransition.objects.exists()


def test_the_risk_page_offers_only_the_transitions_of_the_users_role(client, grc, workgroup, owner):
    risk = make_risk(owner=owner, status=S.ASSESSMENT)

    client.force_login(grc)
    assert [t.name for t in client.get(risk.get_absolute_url()).context["transitions"]] == [
        "ask_questions",
        "reject",
        "approve",
    ]
    client.force_login(workgroup)
    assert [t.name for t in client.get(risk.get_absolute_url()).context["transitions"]] == ["reject", "approve"]


def test_grc_proposes_a_merge_and_the_owner_approves_it(client, grc, owner):
    duplicate = make_risk("قطع درگاه (تکراری)", owner=owner, status=S.ASSESSMENT)
    target = make_risk("قطع درگاه پرداخت", owner=make_user("other-owner"))
    client.force_login(grc)

    client.post(
        reverse("workflow:change_request_create", args=[duplicate.pk, "merge"]),
        {"merge_into": target.pk, "reason": "هر دو یک رویداد و یک مسیرند."},
    )
    change = ChangeRequest.objects.get()
    assert (change.kind, change.merge_into, change.status) == ("merge", target, "pending")
    assert client.get(duplicate.get_absolute_url()).context["can_decide_change"] is False
    assert client.post(change.get_absolute_url(), {"decision": "approve"}).status_code == 403

    client.force_login(owner)
    assert client.get(duplicate.get_absolute_url()).context["can_decide_change"] is True
    client.post(change.get_absolute_url(), {"decision": "approve", "note": ""})

    duplicate.refresh_from_db()
    change.refresh_from_db()
    assert (duplicate.status, duplicate.merged_into) == (S.CLOSED, target)
    assert duplicate.code.startswith("RK-")  # شناسه‌ی مبدأ می‌ماند
    assert (change.status, change.decided_by) == ("approved", owner)
    record = duplicate.transitions.get()
    assert record.from_status == S.ASSESSMENT and target.code in record.reason
    assert client.get(target.get_absolute_url()).status_code == 404  # ریسک مقصد مال کس دیگری است
    client.force_login(grc)
    assert list(client.get(target.get_absolute_url()).context["merged_risks"]) == [duplicate]


def test_the_owner_rejects_a_split_with_a_reason(client, grc, owner):
    risk = make_risk(owner=owner)
    client.force_login(grc)
    client.post(
        reverse("workflow:change_request_create", args=[risk.pk, "split"]),
        {"parts": "قطع درگاه بانک الف\nقطع درگاه بانک ب", "reason": "کنترل‌ها متفاوت‌اند."},
    )
    change = ChangeRequest.objects.get()
    client.force_login(owner)

    response = client.post(change.get_absolute_url(), {"decision": "reject", "note": ""})
    assert "note" in response.context["form"].errors
    client.post(change.get_absolute_url(), {"decision": "reject", "note": "کنترل‌ها یکی‌اند."})

    change.refresh_from_db()
    assert change.status == "rejected"
    assert Risk.objects.count() == 1


def test_an_approved_split_creates_new_risks_and_keeps_the_source(client, grc, owner):
    risk = make_risk(owner=owner, ready=True, status=S.ASSESSMENT, scope="تولید")
    risk.tags.add(Tag.objects.create(name="پرداخت"))
    client.force_login(grc)
    client.post(
        reverse("workflow:change_request_create", args=[risk.pk, "split"]),
        {"parts": "قطع درگاه بانک الف\nقطع درگاه بانک ب", "reason": "کنترل‌ها و مالکان متفاوت‌اند."},
    )
    client.force_login(owner)

    client.post(ChangeRequest.objects.get().get_absolute_url(), {"decision": "approve", "note": "موافقم"})

    risk.refresh_from_db()
    parts = list(Risk.objects.filter(split_from=risk).order_by("code"))
    assert risk.status == S.ASSESSMENT
    assert [part.title for part in parts] == ["قطع درگاه بانک الف", "قطع درگاه بانک ب"]
    for part in parts:
        assert (part.status, part.service, part.owner, part.scope) == (S.REGISTERED, risk.service, owner, "تولید")
        assert list(part.customers.all()) == list(risk.customers.all())
        assert [tag.name for tag in part.tags.all()] == ["پرداخت"]
    assert set(client.get(risk.get_absolute_url()).context["split_parts"]) == set(parts)


def test_merge_and_split_need_an_owner_and_one_open_request_at_a_time(client, grc, owner):
    orphan = make_risk("بی‌مالک")
    client.force_login(grc)

    response = client.get(reverse("workflow:change_request_create", args=[orphan.pk, "merge"]))
    assert response.url == orphan.get_absolute_url()
    assert client.get(orphan.get_absolute_url()).context["can_propose_change"] is False

    risk = make_risk(owner=owner)
    client.post(
        reverse("workflow:change_request_create", args=[risk.pk, "split"]),
        {"parts": "بخش یک", "reason": "دلیل"},
    )
    response = client.get(reverse("workflow:change_request_create", args=[risk.pk, "merge"]))
    assert response.url == risk.get_absolute_url()
    with pytest.raises(IntegrityError), transaction.atomic():
        ChangeRequest.objects.create(kind="split", risk=risk, parts="بخش دو", reason="دلیل", proposed_by=grc)


def test_only_grc_proposes_changes_and_closed_risks_take_none(client, owner, grc):
    risk = make_risk(owner=owner)
    client.force_login(owner)
    assert client.get(reverse("workflow:change_request_create", args=[risk.pk, "merge"])).status_code == 403

    closed = make_risk("بسته", owner=owner, status=S.CLOSED)
    client.force_login(grc)
    response = client.get(reverse("workflow:change_request_create", args=[closed.pk, "split"]))
    assert response.url == closed.get_absolute_url()


def test_a_merge_into_a_risk_that_closed_meanwhile_is_refused(client, grc, owner):
    risk = make_risk(owner=owner)
    target = make_risk("مقصد", owner=owner)
    change = ChangeRequest.objects.create(kind="merge", risk=risk, merge_into=target, reason="دلیل", proposed_by=grc)
    Risk.objects.filter(pk=target.pk).update(status=S.CLOSED)
    client.force_login(owner)

    response = client.post(change.get_absolute_url(), {"decision": "approve", "note": ""})

    assert "فعال نیست" in response.context["form"].non_field_errors()[0]
    risk.refresh_from_db()
    assert risk.status == S.REGISTERED


def test_the_database_keeps_merges_consistent(owner):
    risk = make_risk(owner=owner)
    target = make_risk("مقصد", owner=owner)

    with pytest.raises(IntegrityError), transaction.atomic():
        Risk.objects.filter(pk=risk.pk).update(merged_into=target)  # بدون بستن
    with pytest.raises(IntegrityError), transaction.atomic():
        Risk.objects.filter(pk=risk.pk).update(status=S.CLOSED, merged_into=risk)


def test_closed_risks_take_no_new_evidence_or_links(client, grc, owner):
    risk = make_risk(owner=owner, status=S.CLOSED)
    client.force_login(grc)

    assert client.get(risk.get_absolute_url()).context["can_add_evidence"] is False
    assert client.get(reverse("risks:link_create", args=[risk.pk])).status_code == 404
