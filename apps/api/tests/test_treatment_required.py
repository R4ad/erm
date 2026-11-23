"""«ریسک‌های نیازمند اقدام» (فیگما ۱۴): ریسک بالا و بحرانی بی‌طرح، اقدام ناموفق، پذیرش رو به انقضا، و تصعید."""

from datetime import timedelta

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice, RiskAcceptance, TreatmentAction
from apps.actions.tests.test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db
URL = "/api/treatment/required/"


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="سارا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="رضا", last_name="مالکی")


@pytest.fixture
def assignee():
    return make_user("assignee")


@pytest.fixture
def verifier():
    return make_user("verifier")


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


def waiting(owner, grc, level, score, hours_ago, title="ریسک"):
    risk = make_risk(owner, title)
    approved(risk, grc, level, score)
    to_treatment_plan(risk, grc, entered=timezone.now() - timedelta(hours=hours_ago))
    return risk


def test_high_and_critical_risks_without_an_approved_plan_need_action(api, grc, owner):
    critical = waiting(owner, grc, "بحرانی", 20, hours_ago=30, title="باج‌افزار")
    high = waiting(owner, grc, "بالا", 12, hours_ago=1, title="قطع تأمین‌کننده")
    waiting(owner, grc, "متوسط", 8, hours_ago=1, title="متوسط بدون طرح")
    planned = waiting(owner, grc, "بالا", 12, hours_ago=1, title="طرح مصوب")
    plan = make_plan(planned, grc)
    type(plan).objects.filter(pk=plan.pk).update(owner_approved_at=timezone.now(), owner_approved_by=owner)

    data = api(grc).get(URL).json()

    assert [row["risk"]["code"] for row in data["rows"]] == [critical.code, high.code]
    first, second = data["rows"]
    assert first["overdue"] is True and first["containment_overdue"] is True
    assert first["deadline"]["text"] == "۶ ساعت از مهلت گذشته" and first["status"]["label"] == "عبور از مهلت"
    assert first["reason"] == "بدون طرح · مهلت مهار گذشته" and first["action"]["kind"] == "escalate"
    assert first["option"] == {"value": "reduce", "label": "کاهش", "suggested": True}
    assert second["overdue"] is False and second["status"]["label"] == "در تصمیم"
    assert second["deadline"]["text"].endswith("روز کاری")
    assert second["action"] == {
        "kind": "create",
        "label": "ایجاد طرح",
        "href": reverse("actions:plan_create", args=[high.pk]),
    }
    assert data["counts"] == {"no_plan": 2, "overdue": 1, "within_48h": 0, "failed": 0, "acceptance": 0}
    assert data["containment_overdue"] == [
        {"id": critical.pk, "code": critical.code, "title": "باج‌افزار", "href": critical.get_absolute_url()}
    ]

    # عدد منو همان شمار سطرهای این صفحه است.
    navigation = api(grc).get("/api/session/").json()["navigation"]
    items = [item for module in navigation["modules"] for item in module["items"]]
    assert next(item for item in items if item["key"] == "module:action_required")["count"] == 2
    assert api(make_user("stranger")).get(URL).json()["rows"] == []


def test_a_binding_prohibition_suggests_avoidance(api, grc, owner):
    risk = waiting(owner, grc, "بحرانی", 6, hours_ago=1)
    risk.assessments.update(binding_prohibition=True)

    [row] = api(grc).get(URL).json()["rows"]

    assert row["option"]["value"] == "avoid" and row["reason"] == "خارج از اختیار پذیرش · منع الزام‌آور"
    assert row["deadline"]["text"] == "۲۲ ساعت تا مهار" and row["within_48h"] is True


def test_failed_actions_and_expiring_acceptances_need_action(api, grc, owner, assignee, verifier):
    risk = waiting(owner, grc, "بالا", 12, hours_ago=1, title="نشت کلید")
    plan = make_plan(risk, grc)
    type(plan).objects.filter(pk=plan.pk).update(owner_approved_at=timezone.now(), owner_approved_by=owner)
    action = make_action(plan, grc, owner, assignee, verifier, status=TreatmentAction.Status.FAILED)
    accepted = make_risk(owner, "سیستم‌عامل منسوخ")
    assessment = approved(accepted, grc, "متوسط", 8)
    today = timezone.localdate()
    acceptance = RiskAcceptance.objects.create(
        risk=accepted,
        assessment=assessment,
        scope="سرور گزارش‌گیری",
        reason="ارتقا در برنامه است",
        conditions="پایش",
        monitoring="پایش",
        revocation_triggers="رخداد",
        start_date=today - timedelta(days=175),
        end_date=today + timedelta(days=7),
        follow_up_by=owner,
        created_by=grc,
    )
    RiskAcceptance.objects.filter(pk=acceptance.pk).update(
        status=RiskAcceptance.Status.ACTIVE, decision_text="پذیرفته شد", decided_at=timezone.now()
    )

    rows = api(grc).get(URL).json()["rows"]

    failed = next(row for row in rows if row["kind"] == "failed")
    assert failed["risk"]["code"] == risk.code and failed["status"]["label"] == "ناموفق"
    assert failed["reason"] == f"آزمون اقدام ناموفق · {action.title}"
    assert failed["deadline"]["text"].startswith("بازسنجی") and failed["option"]["suggested"] is False
    assert failed["action"] == {"kind": "open", "label": "بازگشایی", "href": action.get_absolute_url()}
    expiring = next(row for row in rows if row["kind"] == "acceptance")
    assert expiring["reason"] == "انقضای پذیرش ۶ ماهه" and expiring["deadline"]["text"] == "۷ روز تا انقضا"
    assert expiring["status"]["label"] == "پذیرفته‌شده" and expiring["option"]["value"] == "accept"
    assert expiring["action"]["href"] == acceptance.get_absolute_url()
    assert [row["kind"] for row in rows] == ["failed", "acceptance"]  # بالا پیش از متوسط


def test_escalation_notifies_the_committee_once_a_day(api, grc, owner):
    committee = make_user("committee", Role.SECURITY_COMMITTEE)
    overdue = waiting(owner, grc, "بحرانی", 20, hours_ago=30)
    on_time = waiting(owner, grc, "بالا", 12, hours_ago=1)

    refused = api(make_user("viewer", Role.VIEWER)).post(
        f"{URL}escalate/", {"ids": [overdue.pk]}, content_type="application/json"
    )
    assert refused.status_code == 400 and not MonitoringNotice.objects.exists()

    client = api(grc)
    response = client.post(f"{URL}escalate/", {"ids": [overdue.pk, on_time.pk]}, content_type="application/json")
    assert response.status_code == 200 and response.json()["done"] == [overdue.code]
    notice = MonitoringNotice.objects.get(recipient=committee)
    assert notice.risk == overdue and "تصعید" in notice.message
    assert MonitoringNotice.objects.filter(recipient=owner, risk=overdue).exists()

    client.post(f"{URL}escalate/", {"ids": [overdue.pk]}, content_type="application/json")
    assert MonitoringNotice.objects.filter(recipient=committee).count() == 1
    assert Risk.objects.get(pk=overdue.pk).status == Risk.Status.TREATMENT_PLAN
