"""«سنجش ریسک» (فیگما ۱۳): صف سنجش با سطح پایه و تصمیم، ماتریس تصمیم، اشتهای ریسک، و «ارسال به تصمیم» گروهی."""

import pytest

from apps.accounts.roles import Role
from apps.assessments.models import AssessmentReview
from apps.assessments.review import review, submit
from apps.assessments.tests import test_results
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db

bank, checker, evidence, grc = test_results.bank, test_results.checker, test_results.evidence, test_results.grc
ready, risk, workgroup = test_results.ready, test_results.risk, test_results.workgroup


@pytest.fixture
def approved(grc, checker, ready):
    submit(ready, grc)
    review(ready, checker, AssessmentReview.Action.APPROVE)
    ready.refresh_from_db()
    return ready


def evaluation(client, user):
    client.force_login(user)
    return client.get("/api/evaluation/").json()


def test_an_approved_assessment_enters_the_queue_with_its_levels_and_authority(client, grc, workgroup, approved):
    data = evaluation(client, workgroup)

    [row] = data["rows"]
    assert row["code"] == approved.risk.code and row["scope"] == "بانک الف"
    assert (row["l"], row["i"], row["score"]) == (2, 3, 6)
    assert row["base_level"]["name"] == row["decision_level"]["name"] == "متوسط" and row["raised"] is False
    assert row["authority"] == "مالک + مدیر بالادست"
    assert row["deadline"]["kind"] == "awaiting" and row["deadline"]["text"] == "۳۰ روز تقویمی"
    assert row["sendable"] is True and data["sendable"] == [approved.risk.pk]
    medium = next(level for level in data["levels"] if level["name"] == "متوسط")
    assert medium["count"] == 1 and medium["review"] == "سه‌ماهه" and medium["acceptance"] == "۶ ماه"
    critical = next(level for level in data["levels"] if level["name"] == "بحرانی")
    assert critical["plan"] == "مهار حداکثر ۲۴ ساعت؛ طرح طی ۳ روز کاری"
    assert critical["note"] == "ارجاع فوری به کمیته · مهار ≤ ۲۴ ساعت"
    cell = next(cell for row in data["matrix"] if row["l"] == 2 for cell in row["cells"] if cell["i"] == 3)
    assert cell == {**cell, "score": 6, "count": 1}
    assert [row["l"] for row in data["matrix"]] == [5, 4, 3, 2, 1]

    # کارگروه امنیت و کارشناس ریسک به تصمیم می‌فرستند (جواب س۵۲)؛ بیننده فقط صف را می‌بیند.
    assert evaluation(client, grc)["sendable"] == [approved.risk.pk]
    viewer = evaluation(client, make_user("viewer", Role.VIEWER))
    assert viewer["sendable"] == [] and [row["sendable"] for row in viewer["rows"]] in ([], [False])
    assert evaluation(client, make_user("stranger"))["rows"] == []


def test_a_draft_assessment_stays_out_of_the_queue(client, workgroup, ready):
    assert evaluation(client, workgroup)["rows"] == []


def test_an_escalated_level_shows_its_reason(client, workgroup, approved):
    type(approved).objects.filter(pk=approved.pk).update(
        decision_level=approved.method_version.risk_levels.get(rank=3), escalation_reasons=["کف پیامد ۵: حداقل «بالا»"]
    )

    data = evaluation(client, workgroup)

    [row] = data["rows"]
    assert row["raised"] is True and row["decision_level"]["name"] == "بالا" and row["base_level"]["name"] == "متوسط"
    assert row["reasons"] == ["کف پیامد ۵: حداقل «بالا»"] and row["authority"] == "مالک + کمیته امنیت"
    assert data["raised"] == {"count": 1, "reasons": ["کف پیامد ۵"]}
    assert data["example"] == {"code": row["code"], "score": 6, "level": "بالا"}


def test_sending_to_decision_opens_the_treatment_plan_and_its_deadline(client, workgroup, approved):
    client.force_login(make_user("viewer", Role.VIEWER))
    refused = client.post(
        "/api/risks/bulk-transition/",
        {"transition": "approve", "ids": [approved.risk.pk]},
        content_type="application/json",
    ).json()
    assert refused["done"] == []
    approved.risk.refresh_from_db()
    assert approved.risk.status == Risk.Status.ASSESSMENT

    client.force_login(workgroup)
    result = client.post(
        "/api/risks/bulk-transition/",
        {"transition": "approve", "ids": [approved.risk.pk]},
        content_type="application/json",
    ).json()

    assert result == {"done": [approved.risk.code], "failed": []}
    approved.risk.refresh_from_db()
    assert approved.risk.status == Risk.Status.TREATMENT_PLAN
    [row] = evaluation(client, workgroup)["rows"]
    assert row["sendable"] is False
    assert row["deadline"]["kind"] == "plan" and row["deadline"]["text"] == "۳۰ روز" and row["deadline"]["due"]
