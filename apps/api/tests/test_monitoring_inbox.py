"""«اعلان‌های پایش» (فیگما ۲۰): کارت هر اعلان از رکورد پشت کلید رویدادش، خواندن اعلان‌ها و کانال‌های دریافت."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice, NoticePreference, RiskReview
from apps.actions.monitoring import record_trigger
from apps.actions.tests.test_treatment import approved, make_risk
from apps.catalog.tests.factories import make_user

pytestmark = pytest.mark.django_db
URL = "/api/monitoring/inbox/"
T = RiskReview.Trigger


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="ندا", last_name="احمدی")


@pytest.fixture
def owner():
    return make_user("owner", first_name="علی", last_name="رضایی")


def test_each_notice_becomes_a_card_from_its_review_and_urgent_triggers_are_counted(client, grc, owner):
    risk = make_risk(owner)
    base = approved(risk, grc, "بحرانی", 20)
    record_trigger(risk, grc, T.INCIDENT, "رخداد مهم INC-1؛ ارجاع فوری.")
    periodic = RiskReview.objects.create(
        risk=risk,
        assessment=base,
        trigger=T.PERIODIC,
        reason="بررسی دوره‌ای",
        due=timezone.localdate(),
        responsible=owner,
    )
    MonitoringNotice.objects.create(
        recipient=owner, risk=risk, event_key=f"review:{periodic.pk}:due", message="مهلت", href="/x/"
    )
    old = MonitoringNotice.objects.create(
        recipient=owner, risk=risk, event_key=f"containment:{base.pk}", message="مهار", href="/y/"
    )
    MonitoringNotice.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(days=1))

    client.force_login(owner)
    data = client.get(URL).json()

    assert data["unread"] == 3 and data["summary"]["urgent"] == 1
    tabs = {tab["key"]: tab["count"] for tab in data["tabs"]}
    assert tabs == {"all": 3, "trigger": 1, "periodic": 1, "acceptance": 0, "evidence": 0}
    incident, review, containment = data["notices"]
    assert incident["tab"] == "trigger" and incident["tone"] == "danger" and incident["mine"] is True
    assert incident["body"] == "رخداد مهم INC-1؛ ارجاع فوری." and incident["cta"]["label"] == "آغاز بازسنجی"
    assert risk.code in incident["chips"] and "مالک: علی رضایی" in incident["chips"]
    assert review["title"] == f"بازبینی هفتگی ریسک بحرانی {risk.code}"
    assert review["cta"] == {
        "label": "باز کردن ریسک",
        "href": risk.get_absolute_url(),
        "icon": "arrow-left",
        "primary": False,
    }
    assert containment["group"] == {"key": "yesterday", "label": "دیروز"}
    assert containment["title"] == f"مهلت مهار {risk.code} رسیده است"
    critical = next(row for row in data["calendar"] if row["name"] == "بحرانی")
    assert critical["count"] == 1 and critical["cycle"] == "هفتگی"
    assert [trigger["key"] for trigger in data["triggers"]][:3] == ["change", "incident", "control"]

    escalated = client.get(URL)  # کارشناس GRC هم اعلان محرک را گرفته است، اما «مال من» نیست
    client.force_login(grc)
    mine = [notice["mine"] for notice in client.get(URL).json()["notices"]]
    assert escalated.status_code == 200 and mine == [False]


def test_reading_one_or_all_notices_only_touches_own_notices(client, grc, owner):
    risk = make_risk(owner)
    approved(risk, grc, "بالا", 12)
    record_trigger(risk, grc, T.INCIDENT, "رخداد")
    record_trigger(risk, grc, T.REQUIREMENT, "الزام تازه")
    mine = MonitoringNotice.objects.filter(recipient=owner).order_by("pk")
    other = MonitoringNotice.objects.filter(recipient=grc).first()

    client.force_login(owner)
    assert client.post(f"{URL}{other.pk}/read/").status_code == 404
    single = client.post(f"{URL}{mine[0].pk}/read/").json()
    assert single["read"] == 1 and single["page"]["unread"] == 1
    everything = client.post(f"{URL}read/").json()
    assert everything["read"] == 1 and everything["page"]["unread"] == 0
    assert MonitoringNotice.objects.get(pk=other.pk).read_at is None


def test_channels_are_saved_per_user_and_in_app_stays_on(client, owner):
    client.force_login(owner)
    assert client.get(URL).json()["channels"] == {"in_app": True, "email": True, "sms": True, "delegate": False}
    saved = client.post("/api/monitoring/channels/", {"sms": False, "in_app": False}, content_type="application/json")
    assert saved.json()["channels"] == {"in_app": True, "email": True, "sms": False, "delegate": False}
    assert NoticePreference.objects.get(user=owner).sms is False
