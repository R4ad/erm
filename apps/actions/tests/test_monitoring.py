from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import (
    MonitoringNotice,
    RiskAcceptance,
    RiskReview,
    TreatmentAction,
)
from apps.actions.monitoring import complete_review, record_trigger, run_monitoring
from apps.actions.services import PlanError
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.controls.models import Control
from apps.controls.tests.factories import valid_control_assessment
from apps.workcalendar.workdays import add_working_days

from .test_acceptance import make_acceptance, risk_at
from .test_treatment import (
    approved,
    make_action,
    make_plan,
    make_risk,
    to_treatment_plan,
)

pytestmark = pytest.mark.django_db


def test_periodic_and_annual_review_follow_the_assessment_version_and_are_idempotent(
    grc, owner
):
    risk = make_risk(owner)
    base = approved(risk, grc, "بالا", 12)
    old = timezone.now() - timedelta(days=400)
    Assessment.objects.filter(pk=base.pk).update(approved_at=old)
    run_monitoring()
    reviews = risk.monitoring_reviews.all()
    assert set(reviews.values_list("trigger", flat=True)) == {"periodic", "annual"}
    assert MonitoringNotice.objects.filter(recipient=owner).exists()
    notice_count = MonitoringNotice.objects.count()
    run_monitoring()
    assert reviews.count() == 2 and MonitoringNotice.objects.count() == notice_count
    review = reviews.get(trigger="annual")
    with pytest.raises(PlanError, match="تازه"):
        complete_review(review, grc, "بررسی شد")
    approved(risk, grc, "متوسط", 6)
    complete_review(review, grc, "ارزیابی کامل تازه ثبت شد")
    review.refresh_from_db()
    assert review.completed_by == grc and review.completed_at


def test_periodic_review_reschedules_from_its_completion(grc, owner):
    risk = make_risk(owner)
    base = approved(risk, grc, "بحرانی", 20)
    Assessment.objects.filter(pk=base.pk).update(
        approved_at=timezone.now() - timedelta(days=8)
    )
    run_monitoring()
    review = RiskReview.objects.get(trigger="periodic")
    complete_review(review, owner, "شواهد و دامنه تغییر نکرده‌اند؛ پایش ادامه دارد")
    run_monitoring()
    assert RiskReview.objects.count() == 1
    run_monitoring(today=timezone.localdate() + timedelta(days=7))
    assert RiskReview.objects.filter(trigger="periodic").count() == 2


def test_acceptance_reminders_and_expiration_are_durable_and_do_not_renew(grc, owner):
    risk = risk_at(owner, grc, "پایین", 3)
    acceptance = make_acceptance(
        risk,
        grc,
        start_date=timezone.localdate() - timedelta(days=10),
        end_date=timezone.localdate() + timedelta(days=30),
    )
    acceptance.status = RiskAcceptance.Status.ACTIVE
    acceptance.decision_text = "متن تصمیم ثبت‌شده"
    acceptance.save()
    today = timezone.localdate()
    run_monitoring(today=today)
    assert MonitoringNotice.objects.filter(
        event_key=f"acceptance:{acceptance.pk}:first", recipient=owner
    ).exists()
    run_monitoring(today=today + timedelta(days=23))
    assert MonitoringNotice.objects.filter(
        event_key=f"acceptance:{acceptance.pk}:second", recipient=owner
    ).exists()
    run_monitoring(today=today + timedelta(days=31))
    acceptance.refresh_from_db()
    assert acceptance.status == RiskAcceptance.Status.EXPIRED and acceptance.is_expired
    assert acceptance.end_date == today + timedelta(days=30)
    assert risk.monitoring_reviews.filter(trigger="acceptance").count() == 1
    assert MonitoringNotice.objects.filter(
        event_key=f"acceptance:{acceptance.pk}:expired", recipient=grc
    ).exists()
    before = MonitoringNotice.objects.count()
    run_monitoring(today=today + timedelta(days=31))
    assert MonitoringNotice.objects.count() == before


def test_short_acceptances_get_proportional_reminders(grc, owner):
    risk = risk_at(owner, grc, "پایین", 3)
    acceptance = make_acceptance(
        risk, grc, end_date=timezone.localdate() + timedelta(days=4)
    )
    acceptance.status = RiskAcceptance.Status.ACTIVE
    acceptance.decision_text = "متن تصمیم ثبت‌شده"
    acceptance.save()
    run_monitoring()
    assert not MonitoringNotice.objects.filter(
        event_key__startswith=f"acceptance:{acceptance.pk}:"
    ).exists()
    run_monitoring(today=timezone.localdate() + timedelta(days=2))
    assert MonitoringNotice.objects.filter(
        event_key=f"acceptance:{acceptance.pk}:first"
    ).exists()


def test_key_control_failure_suspends_all_credit_and_creates_one_workday_review(
    grc, owner
):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    control = Control.objects.create(
        title="مانع انتشار",
        objective="توقف مسیر",
        owner=owner,
        kind=Control.Kind.PREVENTIVE,
        is_key=True,
    )
    risk.controls.add(control)
    sheet = valid_control_assessment(control, grc)
    review = record_trigger(
        risk, grc, "control", "شکست در آزمون اضطرار", control=control
    )
    assert review.due == add_working_days(timezone.localdate(), 1)
    sheet.refresh_from_db()
    assert sheet.suspended and sheet.effective_e() == 1
    assert review.history.first().history_user == grc
    with pytest.raises(PlanError):
        record_trigger(risk, owner, "incident", "رخداد")


def test_requirement_deadline_uses_five_workdays_or_an_earlier_obligation(grc, owner):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    review = record_trigger(risk, grc, "requirement", "ابلاغیه و دامنه مشخص")
    assert review.due == add_working_days(timezone.localdate(), 5)
    urgent = record_trigger(
        risk, grc, "requirement", "مهلت الزام امروز", due=timezone.localdate()
    )
    assert urgent.due == timezone.localdate()
    with pytest.raises(PlanError, match="تاریخ"):
        record_trigger(risk, grc, "change", "پیش از تولید")
    manager = make_user("upper-manager", Role.UNIT_MANAGER)
    manager.managed_units.add(risk.org_unit)
    approved(risk, grc, "متوسط", 6)
    review = record_trigger(risk, grc, "incident", "رخداد مهم")
    assert MonitoringNotice.objects.filter(recipient=manager, event_key=f"trigger:{review.pk}").exists()


def test_overdue_action_escalates_to_owner_and_grc(grc, owner, assignee, verifier):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    to_treatment_plan(risk, grc)
    plan = make_plan(risk, grc)
    action = make_action(
        plan,
        grc,
        owner,
        assignee,
        verifier,
        start_date=timezone.localdate() - timedelta(days=10),
        due_date=timezone.localdate() - timedelta(days=1),
    )
    run_monitoring()
    assert MonitoringNotice.objects.filter(
        recipient=grc, event_key__startswith=f"action:{action.pk}:overdue"
    ).exists()
    count = MonitoringNotice.objects.count()
    run_monitoring()
    assert MonitoringNotice.objects.count() == count
    action.status = TreatmentAction.Status.VERIFIED
    action.save()
    assert action.status == TreatmentAction.Status.VERIFIED


def test_monitoring_pages_respect_visibility_and_notice_ownership(client, grc, owner):
    risk = make_risk(owner)
    review = record_trigger(risk, grc, "incident", "رخداد نیازمند پاسخ فوری")
    client.force_login(owner)
    assert client.get(review.get_absolute_url()).status_code == 200
    assert client.get(reverse("actions:notices")).status_code == 200
    assert (
        client.get(reverse("actions:review_create", args=[risk.pk])).status_code == 403
    )
    notice = MonitoringNotice.objects.filter(recipient=owner).first()
    stranger = make_user("stranger")
    client.force_login(stranger)
    assert client.get(review.get_absolute_url()).status_code == 404
    assert (
        client.post(reverse("actions:notice_read", args=[notice.pk])).status_code == 404
    )
    client.force_login(owner)
    client.post(reverse("actions:notice_read", args=[notice.pk]))
    notice.refresh_from_db()
    assert notice.read_at
    assert (
        client.post(
            review.get_absolute_url(),
            {"result": "ارجاع به مدیریت رخداد و درخواست ارزیابی تازه"},
        ).status_code
        == 302
    )
    assert (
        client.post(review.get_absolute_url(), {"result": "بازنویسی"}).status_code
        == 403
    )


def test_monitor_command_runs_without_external_delivery():
    output = StringIO()
    call_command("monitor_risks", stdout=output)
    assert "پایش انجام شد" in output.getvalue()
