"""«بررسی پاسخنامه‌ها» (11a): صف کارشناس ریسک و جدول همه‌ی پاسخنامه‌ها."""

import datetime

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit
from apps.questionnaires.models import PathConsequence, PendingRisk, Response, RiskInstance, RiskPath, ServiceRecord
from apps.risks.models import Risk, RiskCategory

pytestmark = pytest.mark.django_db

URL = "/api/questionnaire-responses/"
S = Response.Status


@pytest.fixture
def unit():
    return OrgUnit.objects.create(name="پرداخت الکترونیک")


@pytest.fixture
def manager(unit):
    user = make_user("narges", Role.UNIT_MANAGER, first_name="نرگس", last_name="احمدی")
    user.managed_units.add(unit)
    return user


def answered(unit, respondent, status=S.SUBMITTED, service="پایانه‌های فروشگاهی", paths=3, **fields):
    """پاسخنامه با یک خدمت، دو رویداد و مسیرهایی که بین آن‌ها پخش شده‌اند؛ پیامد هر رویداد کامل است."""
    response = Response.objects.create(org_unit=unit, respondent=respondent, status=status, **fields)
    record = ServiceRecord.objects.create(response=response, name_and_scope=service)
    events = [
        RiskInstance.objects.create(service=record, number=n, event=f"رویداد {n}", scope="مشتریان") for n in (1, 2)
    ]
    for n in range(paths):
        RiskPath.objects.create(risk_instance=events[n % 2], number=n + 1, description=f"مسیر {n + 1}")
    for event in events:
        PathConsequence.objects.create(risk_instance=event, impact_types=["F"], description="زیان مالی")
    return response


def submitted(unit, respondent, days_ago, due_in, **fields):
    now = timezone.now()
    return answered(
        unit,
        respondent,
        submitted_at=now - datetime.timedelta(days=days_ago),
        review_due=timezone.localdate(now) + datetime.timedelta(days=due_in),
        **fields,
    )


def test_queue_puts_the_oldest_first_and_counts_overdue(client, unit, manager):
    newer = submitted(unit, manager, days_ago=1, due_in=2, service="احراز هویت مشتریان")
    oldest = submitted(unit, manager, days_ago=6, due_in=-4)
    today = submitted(unit, manager, days_ago=3, due_in=0, service="سامانه‌ی چکاوک")
    for days in (1, 1):
        submitted(unit, manager, days_ago=days, due_in=2)
    answered(unit, manager, status=S.DRAFT)

    client.force_login(make_user("sara", Role.GRC_MEMBER))
    data = client.get(URL).json()
    queue = data["queue"]
    assert data["can_review"] is True
    assert (queue["count"], queue["overdue"]) == (5, 1)
    assert [card["id"] for card in queue["cards"]][:3] == [oldest.pk, today.pk, newer.pk]
    assert len(queue["cards"]) == 4
    card = queue["cards"][0]
    assert card["code"] == oldest.code
    assert card["service"] == "پایانه‌های فروشگاهی"
    assert card["summary"] == {"paths": 3, "events": 2, "impacts": 2}
    assert card["org_unit"] == "پرداخت الکترونیک"
    assert card["respondent"]["name"] == "نرگس احمدی"
    assert card["review_due"]["overdue"] is True and card["review_due"]["days_left"] == -4
    assert card["route"] == f"/identification/responses/{oldest.pk}"


def test_table_tabs_search_unit_and_pages(client, unit, manager):
    other = OrgUnit.objects.create(name="خزانه‌داری")
    for _ in range(9):
        answered(unit, manager)
    answered(unit, manager, status=S.RETURNED, service="سامانه‌ی پایا")
    answered(other, make_user("kaveh", Role.UNIT_MANAGER), status=S.DRAFT, service="مدیریت نقدینگی")

    client.force_login(make_user("sara", Role.GRC_MEMBER))
    data = client.get(URL).json()
    assert data["counts"] == {
        "all": 11,
        "submitted": 9,
        "returned": 1,
        "identified": 0,
        "reviewed": 0,
        "draft": 1,
    }
    assert data["year_total"] == 11
    assert data["page"] == {"number": 1, "pages": 2, "size": 8, "count": 11, "start": 1, "end": 8}
    assert {item["label"] for item in data["units"]} == {"خزانه‌داری", "پرداخت الکترونیک"}

    page_two = client.get(URL, {"page": 2}).json()
    assert (page_two["page"]["start"], page_two["page"]["end"]) == (9, 11)

    returned = client.get(URL, {"status": "returned"}).json()
    assert [row["service"] for row in returned["rows"]] == ["سامانه‌ی پایا"]
    assert returned["counts"]["all"] == 11  # تب شمار تب‌های دیگر را عوض نمی‌کند

    found = client.get(URL, {"q": "نقدینگی"}).json()
    assert [row["service"] for row in found["rows"]] == ["مدیریت نقدینگی"]
    assert found["counts"]["all"] == 1
    assert found["rows"][0]["action"] is None  # پیش‌نویس دیگری اقدامی ندارد

    by_name = client.get(URL, {"q": "احمدی", "unit": str(unit.pk)}).json()
    assert by_name["counts"]["all"] == 10


def test_rows_summarise_each_status(client, unit, manager):
    returned = answered(
        unit,
        manager,
        status=S.RETURNED,
        return_questions=[{"text": "پیامد رویداد ۱ ناقص است", "step": 7, "about": "رویداد ۱"}],
        return_message="لطفاً کامل کنید",
    )
    identified = answered(unit, manager, status=S.IDENTIFIED)
    risk = Risk.objects.create(
        title="قطع پایانه‌ها",
        description="شرح",
        channel=Risk.Channel.QUESTIONNAIRE,
        category=RiskCategory.objects.get(code="T1"),
        org_unit=unit,
    )
    PendingRisk.objects.create(response=identified, status=PendingRisk.Status.CONVERTED, risk=risk)
    reviewed = answered(unit, manager, status=S.REVIEWED)
    PendingRisk.objects.create(response=reviewed, status=PendingRisk.Status.DISMISSED, dismiss_reason="تکراری")
    late = submitted(unit, manager, days_ago=6, due_in=-4)

    client.force_login(make_user("sara", Role.GRC_MEMBER))
    rows = {row["id"]: row for row in client.get(URL).json()["rows"]}
    assert rows[returned.pk]["return_note"] == "پیامد رویداد ۱ ناقص است"
    assert rows[returned.pk]["action"] == "view"
    assert rows[identified.pk]["risks"] == [risk.code]
    assert rows[reviewed.pk]["all_dismissed"] is True
    assert rows[late.pk]["review_due"]["days_left"] == -4
    assert rows[late.pk]["action"] == "review"
    assert rows[late.pk]["status"] == {"value": "submitted", "label": "در انتظار بررسی", "tone": "info"}


def test_a_unit_manager_sees_their_units_without_the_queue(client, unit, manager):
    mine = submitted(unit, manager, days_ago=1, due_in=2)
    answered(OrgUnit.objects.create(name="خزانه‌داری"), make_user("kaveh", Role.UNIT_MANAGER))

    client.force_login(manager)
    data = client.get(URL).json()
    assert data["can_review"] is False
    assert data["queue"] is None
    assert [row["id"] for row in data["rows"]] == [mine.pk]
    assert data["rows"][0]["action"] == "view"
    assert [item["label"] for item in data["units"]] == ["پرداخت الکترونیک"]


def test_needs_login(client):
    assert client.get(URL).status_code in (401, 403)
