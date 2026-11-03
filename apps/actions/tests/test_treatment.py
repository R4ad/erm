from datetime import date, datetime, timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import ActionUpdate, TreatmentAction, TreatmentPlan
from apps.actions.mywork import my_work
from apps.actions.services import PlanError, approve_plan, current_plan, perform_move
from apps.assessments.models import Assessment
from apps.assessments.services import create_assessment
from apps.catalog.tests.factories import make_service, make_user
from apps.core.jalali import parse_jalali, to_jalali
from apps.methodology.models import MethodVersion
from apps.risks.models import Evidence, Risk, RiskCategory
from apps.workcalendar.workdays import add_months, add_period, add_working_days
from apps.workflow.lifecycle import get_transition
from apps.workflow.models import StatusTransition
from apps.workflow.services import WorkflowError, perform_transition

pytestmark = pytest.mark.django_db
S = Risk.Status
ST = TreatmentAction.Status


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="رضا", last_name="مالکی")


@pytest.fixture
def assignee():
    return make_user("assignee", first_name="نیما", last_name="مجری")


@pytest.fixture
def verifier():
    return make_user("verifier", first_name="لیلا", last_name="آزمون")


def level(name):
    return MethodVersion.objects.get(number=1).risk_levels.get(name=name)


def make_risk(owner, title="دسترسی غیرمجاز به سرور تولید"):
    service = make_service(f"SRV-{Risk.objects.count() + 1}")
    return Risk.objects.create(
        title=title,
        description="شرح",
        channel=Risk.Channel.INTERVIEW,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=service.org_unit,
        service=service,
        owner=owner,
        status=S.ASSESSMENT,
    )


def approved(risk, user, level_name, score, kind="current"):
    """ارزیابی تأییدشده بدون گذر از کنترل کیفیت، که در تست‌های قدم ۱۸ آمده است."""
    status = risk.status
    risk.status = S.ASSESSMENT
    risk.save()
    assessment = create_assessment(risk, user, kind, horizon_months=12)
    risk.status = status
    risk.save()
    Assessment.objects.filter(pk=assessment.pk).update(
        status=Assessment.Status.APPROVED,
        decision_level=level(level_name),
        base_level=level(level_name),
        score_low=score,
        score_high=score,
        approved_at=timezone.now(),
    )
    assessment.refresh_from_db()
    return assessment


def to_treatment_plan(risk, user, entered=None):
    record = StatusTransition.objects.create(
        risk=risk, from_status=S.ASSESSMENT, to_status=S.TREATMENT_PLAN, created_by=user
    )
    if entered:
        StatusTransition.objects.filter(pk=record.pk).update(created_at=entered)
    risk.status = S.TREATMENT_PLAN
    risk.save()


@pytest.fixture
def risk(owner, grc):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    to_treatment_plan(risk, grc)
    return risk


def make_plan(risk, grc, option="reduce", **fields):
    plan = TreatmentPlan(option=option, rationale="کاهش با PAM؛ پذیرش برای سطح بالا مجاز نیست", **fields)
    from apps.actions.services import create_plan

    return create_plan(plan, risk, grc)


def action_data(owner, assignee, verifier, **fields):
    return {
        "title": "پوشش همه‌ی حساب‌های ممتاز با PAM",
        "deliverable": "همه‌ی حساب‌های ممتاز تولید از PAM می‌گذرند و استثناهای اضطراری ثبت می‌شوند.",
        "mechanism": "b",
        "owner": owner.pk,
        "assignee": assignee.pk,
        "verifier": verifier.pk,
        "start_date": "1405/08/15",
        "due_date": "1405/10/30",
        "person_hours": "120",
        "acceptance_criteria": "آزمون مسیر: ورود مستقیم بدون PAM در ۳۰ نمونه موفق نشود.",
        **fields,
    }


def make_action(plan, grc, owner, assignee, verifier, **fields):
    values = {
        "title": "پوشش PAM",
        "deliverable": "همه‌ی حساب‌های ممتاز",
        "mechanism": "b",
        "start_date": date(2026, 11, 5),
        "due_date": date(2027, 1, 20),
        "acceptance_criteria": "آزمون مسیر",
        **fields,
    }
    return TreatmentAction.objects.create(
        plan=plan, owner=owner, assignee=assignee, verifier=verifier, created_by=grc, **values
    )


def test_jalali_months_and_periods():
    assert to_jalali(add_months(parse_jalali("1405/07/10"), 6)) == "1406/01/10"
    assert to_jalali(add_months(parse_jalali("1405/06/31"), 1)) == "1405/07/30"
    assert to_jalali(add_months(parse_jalali("1404/11/30"), 1)) == "1404/12/29"
    assert to_jalali(add_months(parse_jalali("1403/11/30"), 1)) == "1403/12/30"  # ۱۴۰۳ کبیسه است
    start = date(2026, 11, 3)
    assert add_period(start, 24, "hour") == date(2026, 11, 4)
    assert add_period(start, 3, "working_day") == add_working_days(start, 3)
    assert add_period(start, 2, "week") == date(2026, 11, 17)


def test_the_plan_deadline_follows_the_decision_level(client, grc, owner):
    entered = timezone.make_aware(datetime(2026, 11, 3, 10, 0))
    cases = [("پایین", 3, 30, "day"), ("متوسط", 6, 30, "day"), ("بالا", 12, 10, "working_day")]
    for name, score, value, unit in cases:
        risk = make_risk(owner, f"ریسک {name}")
        approved(risk, grc, name, score)
        to_treatment_plan(risk, grc, entered)
        client.force_login(grc)
        page = client.get(risk.get_absolute_url())
        assert page.context["plan_due"] == add_period(date(2026, 11, 3), value, unit), name
        assert page.context["containment_due"] is None

    critical = make_risk(owner, "ریسک بحرانی")
    approved(critical, grc, "بحرانی", 20)
    to_treatment_plan(critical, grc, entered)
    page = client.get(critical.get_absolute_url())
    assert page.context["plan_due"] == add_working_days(date(2026, 11, 3), 3)
    assert page.context["containment_due"] == entered + timedelta(hours=24)
    assert "مهلت مهار" in page.content.decode()


def test_grc_writes_the_plan_only_for_a_risk_waiting_for_one(client, grc, owner, risk):
    other = make_risk(owner, "ریسک در ارزیابی")
    client.force_login(grc)
    response = client.get(reverse("actions:plan_create", args=[other.pk]))
    assert response.url == other.get_absolute_url() + "#treatment"

    client.force_login(owner)
    assert client.get(reverse("actions:plan_create", args=[risk.pk])).status_code == 403
    client.force_login(grc)
    url = reverse("actions:plan_create", args=[risk.pk])
    response = client.post(url, {"option": "transfer", "rationale": "بیمه"})
    assert "شرط‌ها" in response.context["form"].errors["option_details"][0]
    response = client.post(url, {"option": "reduce", "rationale": "کاهش با PAM"})
    plan = TreatmentPlan.objects.get()
    assert response.url == plan.get_absolute_url()
    assert plan.assessment.decision_level.name == "بالا" and plan.created_by == grc
    assert current_plan(risk) == plan
    # هر ارزیابی یک طرح دارد.
    assert client.get(url).url == risk.get_absolute_url() + "#treatment"


def test_the_owner_approves_the_plan_when_its_rules_hold(client, grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc, option="accept")
    with pytest.raises(PlanError) as error:
        approve_plan(plan, owner)
    assert any("طرح مواجهه الزامی" in problem for problem in error.value.problems)

    plan.option = "reduce"
    plan.save()
    problems = " ".join(PlanErrorProblems(plan, owner))
    assert "دست‌کم یک اقدام" in problems and "ارزیابی هدف" in problems

    target = create_assessment_in(risk, grc, "target")
    plan.target_assessment = target
    plan.save()
    make_action(plan, grc, owner, assignee, verifier)
    assert "هنوز کنترل کیفیت" in " ".join(PlanErrorProblems(plan, owner))
    Assessment.objects.filter(pk=target.pk).update(status=Assessment.Status.APPROVED, decision_level=level("متوسط"))
    plan.refresh_from_db()

    with pytest.raises(PlanError, match="مالک ریسک"):
        approve_plan(plan, grc)
    client.force_login(owner)
    page = client.get(plan.get_absolute_url())
    assert page.context["can_approve"] and page.context["problems"] == []
    client.post(reverse("actions:plan_approve", args=[plan.pk]))
    plan.refresh_from_db()
    assert plan.is_owner_approved and plan.owner_approved_by == owner
    action = plan.actions.get()
    assert action.status == ST.APPROVED
    assert ActionUpdate.objects.get().to_status == ST.APPROVED
    # بعد از تأیید، متن طرح و اقدام مصوب ویرایش نمی‌شود.
    client.force_login(grc)
    assert client.get(reverse("actions:plan_update", args=[plan.pk])).status_code == 403
    assert client.get(reverse("actions:action_update", args=[action.pk])).status_code == 403


def PlanErrorProblems(plan, user):
    try:
        approve_plan(plan, user)
    except PlanError as error:
        return error.problems
    return []


def create_assessment_in(risk, user, kind):
    status = risk.status
    risk.status = S.TREATMENT_PLAN
    assessment = create_assessment(risk, user, kind, horizon_months=12, assumptions="PAM روی همه‌ی سرورها")
    risk.status = status
    return assessment


def test_the_action_form_needs_a_testable_independent_action(client, grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc)
    client.force_login(grc)
    url = reverse("actions:action_create", args=[plan.pk])

    form = client.post(url, action_data(owner, assignee, assignee, mechanism="impact")).context["form"]
    assert "کسی جز مالک و مجری" in form.errors["verifier"][0]
    assert "بُعد پیامدی" in form.errors["dimension"][0]
    form = client.post(url, action_data(owner, assignee, verifier, due_date="1405/08/01")).context["form"]
    assert "پیش از آغاز" in form.errors["due_date"][0]
    assert not TreatmentAction.objects.exists()

    response = client.post(url, action_data(owner, assignee, verifier))
    assert response.url == plan.get_absolute_url()
    action = TreatmentAction.objects.get()
    assert action.code.startswith("TR-1405-") and action.status == ST.PLANNED
    assert (action.start_date, action.person_hours) == (date(2026, 11, 6), 120)


def test_treatment_starts_only_with_an_approved_plan(grc, owner, assignee, verifier, risk):
    transition = get_transition("start_treatment")
    with pytest.raises(WorkflowError, match="طرح مواجهه‌ای"):
        perform_transition(risk, transition, grc)
    plan = make_plan(risk, grc, option="avoid", option_details="خدمت قدیمی خاموش می‌شود؛ ریسک جایگزین ندارد.")
    make_action(plan, grc, owner, assignee, verifier)
    with pytest.raises(WorkflowError, match="تأیید نکرده"):
        perform_transition(risk, transition, grc)
    approve_plan(plan, owner)
    second = make_action(plan, grc, owner, assignee, verifier, title="مستندسازی")
    with pytest.raises(WorkflowError, match=second.code):
        perform_transition(risk, transition, grc)
    approve_plan(plan, owner)
    perform_transition(risk, transition, grc)
    risk.refresh_from_db()
    assert risk.status == S.TREATMENT


def test_an_action_moves_through_its_seven_statuses(client, grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc, option="transfer", option_details="بیمه‌ی سایبری؛ مسئولیت محرمانگی می‌ماند.")
    action = make_action(plan, grc, owner, assignee, verifier)
    approve_plan(plan, owner)
    action.refresh_from_db()
    # تا ریسک «در اجرای درمان» نیست، اجرا ثبت نمی‌شود.
    with pytest.raises(PlanError):
        perform_move(action, assignee, "start")
    perform_transition(risk, get_transition("start_treatment"), grc)

    client.force_login(assignee)
    page = client.get(action.get_absolute_url())
    assert [move.name for move in page.context["moves"]] == ["start"]
    url = reverse("actions:action_move", args=[action.pk])
    client.post(url, {"move": "start", "note": ""})
    action.refresh_from_db()
    assert action.status == ST.IN_PROGRESS
    with pytest.raises(PlanError, match="توضیح"):
        perform_move(action, assignee, "block")
    perform_move(action, assignee, "block", "منتظر پنجره‌ی تغییر")
    perform_move(action, owner, "resume")
    with pytest.raises(PlanError, match="شاهد اجرا"):
        perform_move(action, assignee, "ready")
    evidence = Evidence.objects.create(
        owner=grc,
        kind=Evidence.Kind.TEST,
        title="گزارش اجرای PAM",
        summary="-",
        source="تیم زیرساخت",
        observed_on=date(2026, 11, 20),
        reliability=Evidence.Reliability.HIGH,
    )
    evidence.risks.add(risk)
    # مجری‌ای که ریسک را نمی‌بیند شواهد ریسک را هم نمی‌بیند و گزارش اجرا را پیوست می‌کند؛ مالک اقدام شاهد را وصل
    # می‌کند.
    assert list(client.get(action.get_absolute_url()).context["move_form"].fields["evidence"].queryset) == []
    client.force_login(owner)
    response = client.post(url, {"move": "ready", "note": "اجرا شد", "evidence": [evidence.pk]})
    action.refresh_from_db()
    assert action.status == ST.READY and list(action.evidence.all()) == [evidence]
    assert response.url == action.get_absolute_url() + "#progress"

    # نتیجه را فقط تأییدکننده تأیید یا رد می‌کند.
    with pytest.raises(PlanError):
        perform_move(action, assignee, "verify", "خوب است")
    with pytest.raises(PlanError):
        perform_move(action, grc, "verify", "خوب است")
    perform_move(action, verifier, "fail", "دو حساب اضطراری بیرون از PAM ماندند")
    perform_move(action, assignee, "rework")
    perform_move(action, assignee, "note", "حساب‌های اضطراری اضافه شدند")
    perform_move(action, assignee, "ready")
    perform_move(action, verifier, "verify", "آزمون ۳۰ نمونه موفق بود")
    action.refresh_from_db()
    assert action.status == ST.VERIFIED and not action.is_overdue
    statuses = list(action.updates.order_by("pk").values_list("to_status", flat=True))
    assert statuses == [
        ST.APPROVED,
        ST.IN_PROGRESS,
        ST.BLOCKED,
        ST.IN_PROGRESS,
        ST.READY,
        ST.FAILED,
        ST.IN_PROGRESS,
        ST.IN_PROGRESS,
        ST.READY,
        ST.VERIFIED,
    ]
    assert not action.updates.order_by("pk")[7].changes_status  # یادداشت پیشرفت وضعیت را عوض نمی‌کند


def test_overdue_is_computed_from_the_due_date(grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc)
    action = make_action(plan, grc, owner, assignee, verifier)
    TreatmentAction.objects.filter(pk=action.pk).update(
        start_date=timezone.localdate() - timedelta(days=30), due_date=timezone.localdate() - timedelta(days=1)
    )
    action.refresh_from_db()
    assert action.is_overdue
    TreatmentAction.objects.filter(pk=action.pk).update(status=ST.VERIFIED)
    action.refresh_from_db()
    assert not action.is_overdue


def test_action_people_see_their_action_without_seeing_the_risk(client, grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc)
    action = make_action(plan, grc, owner, assignee, verifier)
    client.force_login(assignee)
    page = client.get(action.get_absolute_url())
    assert page.status_code == 200 and not page.context["risk_visible"]
    assert client.get(plan.get_absolute_url()).status_code == 404
    client.force_login(make_user("stranger"))
    assert client.get(action.get_absolute_url()).status_code == 404
    client.force_login(owner)
    assert client.get(plan.get_absolute_url()).status_code == 200


def test_my_work_lists_what_waits_for_each_person(client, grc, owner, assignee, verifier, risk):
    low = make_risk(owner, "ریسک پایین")
    approved(low, grc, "پایین", 2)
    to_treatment_plan(low, grc)
    critical = make_risk(owner, "ریسک بحرانی")
    approved(critical, grc, "بحرانی", 20)
    to_treatment_plan(critical, grc)

    # عضو GRC ریسک‌های منتظر طرح را به ترتیب سطح می‌بیند.
    work = my_work(grc)
    assert [row.risk for row in work["waiting_risks"]] == [critical, risk, low]
    assert {row.state for row in work["waiting_risks"]} == {"بدون طرح"}

    plan = make_plan(risk, grc)
    action = make_action(plan, grc, owner, assignee, verifier)
    assert list(my_work(owner)["plans_to_approve"]) == [plan]
    assert list(my_work(assignee)["my_actions"]) == [action]
    assert not my_work(verifier)["has_work"]
    assert my_work(grc)["waiting_risks"][1].state == "منتظر تأیید مالک"

    client.force_login(assignee)
    home = client.get(reverse("core:home")).content.decode()
    assert "کارهای من" in home and action.code in home
    client.force_login(make_user("nobody"))
    assert "کاری منتظر شما نیست" in client.get(reverse("actions:my_work")).content.decode()


def test_the_action_list_filters_open_overdue_and_mine(client, grc, owner, assignee, verifier, risk):
    plan = make_plan(risk, grc)
    late = make_action(plan, grc, owner, assignee, verifier, title="دیرکرد")
    TreatmentAction.objects.filter(pk=late.pk).update(
        start_date=timezone.localdate() - timedelta(days=30), due_date=timezone.localdate() - timedelta(days=3)
    )
    done = make_action(plan, grc, owner, verifier, assignee, title="تمام‌شده")
    TreatmentAction.objects.filter(pk=done.pk).update(status=ST.VERIFIED)
    client.force_login(grc)
    url = reverse("actions:action_list")
    assert set(client.get(url).context["actions"]) == {late, done}
    assert list(client.get(url, {"status": "open"}).context["actions"]) == [late]
    assert list(client.get(url, {"overdue": "on"}).context["actions"]) == [late]
    client.force_login(assignee)
    assert set(client.get(url, {"mine": "on"}).context["actions"]) == {late, done}
