"""«آزمون و تأیید نتیجه» (فیگما ۲۴): گام‌ها، معیارهای دامنه، اجراهای آزمون، تفکیک وظایف، تصمیم تأییدکننده با
اقدام پیگیری و اعلان ارزیابی پس از اقدام، و اثر بر ریسک."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import ActionCriterion, ActionTestRun, ActionUpdate, MonitoringNotice, TreatmentAction
from apps.actions.tests.test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.risks.models import Risk

pytestmark = pytest.mark.django_db

ST = TreatmentAction.Status
CS = ActionCriterion.Status


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def people():
    return {
        "grc": make_user("grc", Role.GRC_MEMBER, first_name="ندا", last_name="احمدی"),
        "owner": make_user("owner", first_name="علی", last_name="رضایی"),
        "assignee": make_user("assignee", first_name="مهدی", last_name="فرهادی"),
        "verifier": make_user("verifier", first_name="کاوه", last_name="رحیمی", job_title="ممیزی داخلی"),
        "stranger": make_user("stranger"),
    }


@pytest.fixture
def action(people):
    grc, owner = people["grc"], people["owner"]
    risk = make_risk(owner, "خرابی پایگاه داده")
    basis = approved(risk, grc, "بالا", 15)
    Assessment.objects.filter(pk=basis.pk).update(likelihood_low=5, likelihood_high=5, impact_low=3, impact_high=3)
    to_treatment_plan(risk, grc)
    plan = make_plan(risk, grc)
    target = approved(risk, grc, "متوسط", 6, kind="target")
    Assessment.objects.filter(pk=target.pk).update(likelihood_low=3, likelihood_high=3, impact_low=2, impact_high=2)
    type(plan).objects.filter(pk=plan.pk).update(
        target_assessment=target, owner_approved_at=timezone.now(), owner_approved_by=owner
    )
    Risk.objects.filter(pk=risk.pk).update(status=Risk.Status.TREATMENT)
    plan.refresh_from_db()
    item = make_action(
        plan,
        grc,
        owner,
        people["assignee"],
        people["verifier"],
        title="مانور بازیابی",
        test_setting="مانور در پنجره‌ی تغییر شبانه",
    )
    TreatmentAction.objects.filter(pk=item.pk).update(status=ST.READY)
    item.refresh_from_db()
    ActionCriterion.objects.create(
        action=item,
        title="زمان بازیابی",
        target="حداکثر ۴ ساعت",
        result="۲ ساعت",
        status=CS.PASSED,
        measures_effect=True,
        baseline="۹ ساعت",
    )
    ActionCriterion.objects.create(action=item, title="صحت داده", target="۱۰۰٪", result="۱۰۰٪", status=CS.PASSED)
    ActionCriterion.objects.create(
        action=item, title="پایگاه داده‌ی گزارش‌گیری", status=CS.OUT_OF_SCOPE, note="در دامنه‌ی این اقدام نبود."
    )
    today = timezone.localdate()
    ActionTestRun.objects.create(
        action=item,
        performed_on=today - timedelta(days=10),
        passed=False,
        outcome="۶ ساعت",
        description="جدول‌های تسویه پوشش داده نشد.",
        created_by=people["assignee"],
    )
    ActionTestRun.objects.create(
        action=item,
        performed_on=today - timedelta(days=2),
        passed=True,
        outcome="۲ ساعت",
        description="اسکریپت اصلاح‌شده.",
        created_by=people["assignee"],
    )
    ActionUpdate.objects.create(
        action=item, from_status=ST.FAILED, to_status=ST.IN_PROGRESS, note="اصلاح", created_by=people["assignee"]
    )
    return item


def url(action):
    return f"/api/actions/{action.pk}/verification/"


def test_page_shows_steps_criteria_runs_people_and_effect(api, people, action):
    data = api(people["verifier"]).get(url(action)).json()

    assert data["title"] == "آزمون و تأیید نتیجه · مانور بازیابی"
    assert [step["state"] for step in data["steps"]] == ["done", "done", "done", "current", "upcoming"]
    assert data["side"]["note"].startswith("اجرای ۱ در ") and data["side"]["note"].endswith("به «در اجرا» برگشت")
    criteria = data["criteria"]
    assert criteria["summary"] == "۲ از ۲ معیار دامنه" and criteria["met"] is True
    assert criteria["rows"][2]["status"]["value"] == "out_of_scope" and criteria["rows"][2]["result"] == "آزموده نشد"
    assert criteria["notes"] == ["در دامنه‌ی این اقدام نبود."]
    assert data["runs"]["setting"] == "مانور در پنجره‌ی تغییر شبانه"
    assert [(row["number"], row["passed"], row["outcome"]) for row in data["runs"]["rows"]] == [
        (2, True, "موفق · ۲ ساعت"),
        (1, False, "ناموفق · ۶ ساعت"),
    ]
    assert data["people"]["sod"] is True
    assert data["people"]["rows"][0] == {"label": "تأییدکننده‌ی نتیجه", "value": "کاوه رحیمی · ممیزی داخلی"}

    decision = data["decision"]
    assert decision["can_decide"] is True and decision["options"][0]["problems"] == []
    assert decision["follow_up"] == "ایجاد اقدام پیگیری برای پایگاه داده‌ی گزارش‌گیری"
    assert decision["submit"] == "ثبت تأیید و آغاز ارزیابی پس از اقدام"

    effect = data["effect"]
    assert effect["before"]["l"] == 5 and effect["before"]["i"] == 3 and effect["before"]["score"] == "۱۵"
    assert effect["after"]["title"] == "جاری جدید (پس از تأیید)" and effect["after"]["score"] == "۶"
    assert effect["rows"][0] == {"label": "زمان بازیابی", "before": "۹ ساعت", "after": "۲ ساعت"}
    assert effect["reached"] is True and "با تأیید این اقدام محقق می‌شود" in effect["note"]


def test_only_the_verifier_decides(api, people, action):
    for key in ("assignee", "owner", "grc"):
        data = api(people[key]).get(url(action)).json()
        assert data["decision"]["can_decide"] is False
        assert data["decision"]["waiting"] == "در انتظار تصمیم کاوه رحیمی به عنوان تأییدکننده‌ی مستقل"
        response = api(people[key]).post(url(action), {"decision": "verify", "note": "تأیید"}, "application/json")
        assert response.status_code == 400 and "فقط تأییدکننده" in response.json()["detail"]
    assert api(people["stranger"]).get(url(action)).status_code == 404


def test_verification_needs_every_in_scope_criterion_and_a_passing_run(api, people, action):
    client = api(people["verifier"])
    action.criteria.filter(title="صحت داده").update(status=CS.PENDING)
    ActionTestRun.objects.filter(action=action, passed=True).delete()

    problems = client.get(url(action)).json()["decision"]["options"][0]["problems"]
    assert problems == [
        "1 معیار دامنه‌ی اقدام هنوز قبول نشده است؛ نتیجه با همه‌ی معیارهای دامنه تأیید می‌شود.",
        "اجرای موفق آزمون ثبت نشده است.",
    ]
    response = client.post(url(action), {"decision": "verify", "note": "تأیید"}, "application/json")
    assert response.status_code == 400
    missing = client.post(url(action), {"decision": "fail", "note": ""}, "application/json")
    assert missing.status_code == 400 and "توضیح لازم است" in missing.json()["detail"]


def test_verifying_the_last_action_creates_follow_ups_and_asks_for_post_action_assessment(api, people, action):
    response = api(people["verifier"]).post(
        url(action),
        {"decision": "verify", "note": "دو اجرای مستقل و شواهد کامل", "follow_up": True},
        "application/json",
    )

    assert response.status_code == 200
    action.refresh_from_db()
    assert action.status == ST.VERIFIED
    follow_up = TreatmentAction.objects.get(plan=action.plan, title="پیگیری: پایگاه داده‌ی گزارش‌گیری")
    assert follow_up.status == ST.PLANNED and follow_up.verifier == people["verifier"]
    data = response.json()
    assert data["result"]["follow_ups"] == [{"code": follow_up.code, "href": f"/actions/{follow_up.pk}/"}]
    # پیگیری خارج از دامنه جلوی ارزیابی پس از اقدام را نمی‌گیرد.
    notices = MonitoringNotice.objects.filter(event_key=f"post-action:{action.plan.pk}")
    assert {notice.recipient for notice in notices} == {people["grc"], people["owner"]}
    assert data["result"]["notified"] == 2
    assert data["decision"]["can_decide"] is False and data["decision"]["last"]["label"] == "تأییدشده"
    assert [step["state"] for step in data["steps"]][-1] == "done"


def test_failing_returns_no_notice_and_other_open_actions_hold_the_assessment(api, people, action):
    make_action(action.plan, people["grc"], people["owner"], people["assignee"], people["verifier"], title="دیگر")
    data = api(people["verifier"]).get(url(action)).json()
    assert data["decision"]["submit"] == "ثبت تأیید نتیجه"
    assert data["effect"]["after"]["title"] == "هدف طرح" and data["effect"]["reached"] is False
    assert "۱ اقدام دیگر طرح هنوز باز است" in data["decision"]["closing"]

    response = api(people["verifier"]).post(url(action), {"decision": "fail", "note": "زمان گذشت"}, "application/json")

    assert response.status_code == 200
    action.refresh_from_db()
    assert action.status == ST.FAILED
    assert response.json()["side"]["items"][1] == {"value": "failed", "label": "ناموفق", "active": True}
    assert not MonitoringNotice.objects.filter(event_key__startswith="post-action:").exists()


def test_server_links_go_to_the_page(api, people, action):
    response = api(people["verifier"]).get(f"/actions/{action.pk}/verify/")
    assert response.status_code == 302 and response["Location"] == f"/app/actions/{action.pk}/verify"
    assert api(people["stranger"]).get(f"/actions/{action.pk}/verify/").status_code == 404

    work = api(people["verifier"]).get("/api/my-work/").json()
    task = next(task for task in work["tasks"] if task["key"] == f"verify-{action.pk}")
    assert task["route"] == f"/actions/{action.pk}/verify"
    section = next(section for section in work["sections"] if section["key"] == "to_verify")
    assert section["items"][0]["route"] == f"/actions/{action.pk}/verify"
