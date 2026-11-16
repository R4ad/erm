"""«ریسک‌های در حال درمان» (فیگما ۱۵): تابلوی اقدام‌های طرح‌های جاری، کاشی‌ها و بازسنجی‌های پیش رو."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import ActionUpdate, RiskReview, TreatmentAction, TreatmentPlan
from apps.actions.tests.test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db
URL = "/api/treatment/board/"
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
    return make_user("verifier")


@pytest.fixture
def plan(owner, grc):
    risk = make_risk(owner, "دسترسی ممتاز بدون کنترل")
    approved(risk, grc, "بالا", 12)
    to_treatment_plan(risk, grc)
    plan = make_plan(risk, grc)
    target = approved(risk, grc, "متوسط", 6, kind="target")
    TreatmentPlan.objects.filter(pk=plan.pk).update(
        owner_approved_at=timezone.now(), owner_approved_by=owner, target_assessment=target
    )
    Risk.objects.filter(pk=risk.pk).update(status=Risk.Status.TREATMENT)
    plan.refresh_from_db()
    return plan


def test_the_board_shows_each_action_with_its_risk_target_and_progress(client, grc, owner, assignee, verifier, plan):
    today = timezone.localdate()
    running = make_action(
        plan, grc, owner, assignee, verifier, start_date=today - timedelta(days=10), due_date=today + timedelta(days=10)
    )
    TreatmentAction.objects.filter(pk=running.pk).update(status=ST.IN_PROGRESS)
    blocked = make_action(
        plan,
        grc,
        owner,
        assignee,
        verifier,
        title="سایت پشتیبان",
        start_date=today - timedelta(days=20),
        due_date=today - timedelta(days=1),
    )
    TreatmentAction.objects.filter(pk=blocked.pk).update(status=ST.BLOCKED)
    ActionUpdate.objects.create(
        action=blocked, from_status=ST.IN_PROGRESS, to_status=ST.BLOCKED, note="منتظر بودجه", created_by=grc
    )
    old = make_action(plan, grc, owner, assignee, verifier, title="تأیید قدیمی")
    TreatmentAction.objects.filter(pk=old.pk).update(status=ST.VERIFIED)
    update = ActionUpdate.objects.create(
        action=old, from_status=ST.READY, to_status=ST.VERIFIED, note="تأیید", created_by=grc
    )
    ActionUpdate.objects.filter(pk=update.pk).update(created_at=timezone.now() - timedelta(days=200))

    client.force_login(grc)
    data = client.get(URL).json()

    cards = {card["id"]: card for card in data["cards"]}
    assert old.pk not in cards  # تأییدشده‌ی فصل‌های قبل روی تابلو نمی‌ماند
    card = cards[running.pk]
    assert card["status"]["value"] == "in_progress" and card["level"]["name"] == "بالا"
    assert card["note"] == "۱۲ ← ۶" and card["progress"] == 50 and card["assignee"]["name"] == "نیما مجری"
    assert card["footer"]["tone"] == "neutral" and card["alert"] is False
    stuck = cards[blocked.pk]
    assert stuck["note"] == "منتظر بودجه" and stuck["footer"]["text"] == "معوق" and stuck["alert"] is True
    assert data["counts"] == {"active": 2, "blocked": 1, "ready": 0, "verified": 0, "reviews": 0}
    assert data["blocked_note"] == "منتظر بودجه"
    assert [column["value"] for column in data["columns"]] == [
        "planned",
        "approved",
        "in_progress",
        "blocked",
        "ready",
        "verified",
        "failed",
    ]
    assert client.get(URL).json()["me"] == grc.pk
    client.force_login(make_user("stranger"))
    assert client.get(URL).json()["cards"] == []


def test_upcoming_reassessments_include_open_reviews_and_failed_actions(client, grc, owner, assignee, verifier, plan):
    today = timezone.localdate()
    RiskReview.objects.create(
        risk=plan.risk,
        assessment=plan.assessment,
        trigger=RiskReview.Trigger.PERIODIC,
        reason="ارزیابی پس از اقدام",
        due=today + timedelta(days=5),
        responsible=owner,
        created_by=grc,
    )
    RiskReview.objects.create(
        risk=plan.risk,
        assessment=plan.assessment,
        trigger=RiskReview.Trigger.PERIODIC,
        reason="دور",
        due=today + timedelta(days=60),
        responsible=owner,
        created_by=grc,
    )
    failed = make_action(plan, grc, owner, assignee, verifier, title="اسکن اسرار")
    TreatmentAction.objects.filter(pk=failed.pk).update(status=ST.FAILED)

    client.force_login(grc)
    data = client.get(URL).json()

    assert len(data["reviews"]) == 2  # بازبینی ۶۰ روز بعد هنوز در فهرست نیست
    review = next(row for row in data["reviews"] if row["key"].startswith("review-"))
    urgent = next(row for row in data["reviews"] if row["key"] == f"action-{failed.pk}")
    assert (review["current"], review["target"]) == (12, 6) and review["responsible"]["name"] == "رضا مالکی"
    assert review["notice"]["text"] == "ارسال شد · ۷ روز"
    assert urgent["notice"] == {"text": "فوری · ۱ روز کاری", "tone": "danger"}
    assert urgent["note"] == f"{failed.code} · ناموفق؛ بازگشت به اقدام"
    assert data["counts"]["reviews"] == 2
    failed_card = next(card for card in data["cards"] if card["id"] == failed.pk)
    assert failed_card["footer"]["text"] == "بازسنجی" and failed_card["alert"] is True
