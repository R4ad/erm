"""طرح مواجهه، اقدام و پذیرش ریسک در رابط React از راه پل جنگو: فهرست‌ها، پرونده‌ها، فرم‌ها و کارهای یک‌دکمه‌ای
(تأیید طرح، تغییر وضعیت اقدام، ارسال، امضا و لغو پذیرش)، همه با همان view و همان قاعده‌های جنگو."""

from datetime import date

import pytest
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions import acceptance as acc
from apps.actions.forms import ActionForm
from apps.actions.models import MonitoringNotice, RiskAcceptance, TreatmentAction
from apps.actions.services import approve_plan
from apps.actions.tests import test_acceptance as acceptance_tests
from apps.actions.tests import test_treatment as treatment
from apps.api.routes import spa_route
from apps.assessments.models import Assessment, Path
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.risks.models import Evidence
from apps.workflow.lifecycle import get_transition
from apps.workflow.services import perform_transition

from .test_bridge import form, page, send, values_of

pytestmark = pytest.mark.django_db
ST = TreatmentAction.Status


@pytest.fixture(autouse=True)
def media(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path
    settings.ATTACHMENT_X_ACCEL_PREFIX = ""


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


@pytest.fixture
def committee():
    return make_user("committee", Role.SECURITY_COMMITTEE, first_name="کامران", last_name="کمیته")


@pytest.fixture
def unit_manager():
    return make_user("unitmgr", Role.UNIT_MANAGER, first_name="مینا", last_name="مدیر")


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def risk(owner, grc):
    risk = treatment.make_risk(owner)
    treatment.approved(risk, grc, "بالا", 12)
    treatment.to_treatment_plan(risk, grc)
    return risk


@pytest.fixture
def plan(risk, grc):
    return treatment.make_plan(risk, grc)


def target_for(plan, grc):
    target = treatment.create_assessment_in(plan.risk, grc, "target")
    Assessment.objects.filter(pk=target.pk).update(
        status=Assessment.Status.APPROVED, decision_level=treatment.level("متوسط")
    )
    target.refresh_from_db()
    plan.target_assessment = target
    plan.save()


def test_treatment_pages_have_react_routes(plan):
    assert spa_route("/actions/") == "/actions"
    assert spa_route(f"/actions/plans/{plan.pk}/") == f"/actions/plans/{plan.pk}"
    assert spa_route(f"/actions/plans/{plan.pk}/#approval") == f"/actions/plans/{plan.pk}#approval"
    assert spa_route("/actions/acceptances/?status=active") == "/actions/acceptances?status=active"
    assert spa_route("/actions/12/#progress") == "/actions/12#progress"
    assert spa_route(f"/actions/plans/{plan.pk}/reassess/") == f"/actions/plans/{plan.pk}/reassess"


def test_the_plan_waits_for_its_rules_then_the_owner_approves_it(api, grc, owner, assignee, verifier, plan):
    data = page(api(grc), plan.get_absolute_url()).json()
    assert data["title"] == f"طرح مواجهه — {plan.risk.title}"
    assert data["plan"]["state"] == {"value": "pending", "label": "منتظر تأیید مالک ریسک"}
    assert data["plan"]["level"]["name"] == "بالا" and data["plan"]["plan_required"] is True
    approval = data["approval"]
    assert approval["approve_url"] is None and any("دست‌کم یک اقدام" in item for item in approval["problems"])
    assert data["add_action_url"] == reverse("actions:action_create", args=[plan.pk])
    assert data["edit_url"] == reverse("actions:plan_update", args=[plan.pk])
    assert data["actions"] == [] and data["acceptances"] == []

    action = treatment.make_action(plan, grc, owner, assignee, verifier)
    target_for(plan, grc)
    # عضو GRC طرح را تأیید نمی‌کند؛ فقط می‌بیند که منتظر مالک ریسک است.
    approval = page(api(grc), plan.get_absolute_url()).json()["approval"]
    assert {key: approval[key] for key in ("problems", "approve_url", "message", "waiting_for_owner")} == {
        "problems": [],
        "approve_url": None,
        "message": "",
        "waiting_for_owner": True,
    }
    approval = page(api(owner), plan.get_absolute_url()).json()["approval"]
    assert approval["approve_url"] == reverse("actions:plan_approve", args=[plan.pk])
    assert "شما مالک این ریسک هستید" in approval["message"]

    assert send(api(grc), approval["approve_url"], {}).status_code == 400
    approved = send(api(owner), approval["approve_url"], {})
    assert approved.status_code == 200 and "تأیید شد" in approved.json()["message"]
    assert approved.json()["redirect"]["route"] == f"/actions/plans/{plan.pk}"
    data = page(api(owner), plan.get_absolute_url()).json()
    assert data["plan"]["state"]["value"] == "approved" and data["plan"]["approved_by"]["name"] == "رضا مالکی"
    row = data["actions"][0]
    assert row["code"] == action.code and row["status"]["value"] == ST.APPROVED
    assert row["owner"]["name"] == "رضا مالکی" and row["due"]["days_left"] is not None


def test_the_plan_page_carries_the_figma_07_parts(api, grc, owner, assignee, verifier, plan):
    """گزینه‌ها، جاری ← هدف، فهرست تأیید با برآورد، مهلت به روز کاری و زمان‌بندی اقدام‌ها با مسیر و بُعد پیامد."""
    data = page(api(grc), plan.get_absolute_url()).json()
    options = data["options"]
    assert [item["value"] for item in options["items"]] == ["reduce", "avoid", "transfer", "accept"]
    assert options["items"][0]["selected"] and options["items"][3]["disabled"]
    assert "پذیرش" in options["note"] and "بالا" in options["note"]
    assert data["compare"]["target"] is None and data["compare"]["needs_target"] is True
    checks = data["approval"]["checks"]
    assert {"label": "هر گزینه جز پذیرش دست‌کم یک اقدام دارد", "state": "fail"} in checks
    assert {"label": "گزینه‌ی کاهش: ارزیابی هدف ثبت نشده است", "state": "fail"} in checks
    assert data["approval"]["estimate"] is None and data["timeline"] is None
    assert data["approval"]["owner"]["name"] == "رضا مالکی"
    assert data["approval"]["owner_state"] == {"value": "pending", "label": "منتظر"}
    assert data["plan"]["deadline"]["working_days"] >= 0 and data["plan"]["deadline"]["overdue"] is False
    assert data["plan"]["author"] == {"id": grc.pk, "name": "سارا احمدی", "role": Role.GRC_MEMBER}

    first = Path.objects.create(assessment=plan.assessment, name="ورود مستقیم", description="-", b0=4, b0_rationale="-")
    second = Path.objects.create(
        assessment=plan.assessment, name="حساب اضطراری", description="-", b0=3, b0_rationale="-"
    )
    treatment.make_action(
        plan,
        grc,
        owner,
        assignee,
        verifier,
        path=second,
        cost=5_200_000_000,
        person_hours=300,
        start_date=date(2026, 11, 25),
        due_date=date(2027, 1, 29),
    )
    scale = plan.assessment.method_version.scales.get(code="S")
    treatment.make_action(
        plan,
        grc,
        owner,
        assignee,
        verifier,
        mechanism="impact",
        dimension=scale,
        start_date=date(2027, 1, 1),
        due_date=date(2027, 2, 15),
    )
    target_for(plan, grc)
    Assessment.objects.filter(pk=plan.target_assessment_id).update(
        target_due=date(2027, 4, 4), assumptions="B مسیر ۲ به ۲", score_high=6
    )
    data = page(api(grc), plan.get_absolute_url()).json()
    assert data["compare"]["target"]["is_approved"] and data["compare"]["target"]["due"]["jalali"] == "1406/01/15"
    assert data["compare"]["target"]["assumptions"] == "B مسیر ۲ به ۲"
    assert data["compare"]["target"]["level"]["name"] == "متوسط"
    states = {check["label"]: check["state"] for check in data["approval"]["checks"]}
    assert states["گزینه‌ی کاهش: ارزیابی هدف تأییدشده دارد"] == "ok"
    assert states["هزینه و نفرساعت برای 1 از 2 اقدام"] == "warn"
    assert data["approval"]["estimate"] == "5٫2 میلیارد ریال · 300 نفرساعت"
    rows = data["actions"]
    assert rows[0]["effect"] == {
        "label": "مسیر 2 · B",
        "kind": "likelihood",
        "title": "امکان تحقق مسیر 2: حساب اضطراری",
    }
    assert rows[1]["effect"]["label"] == "پیامد S" and rows[1]["effect"]["kind"] == "impact"
    assert [row["missing_cost"] for row in rows] == [False, True]
    assert rows[0]["verifier"]["name"] == "لیلا آزمون" and rows[0]["acceptance"] == "آزمون مسیر"
    timeline = data["timeline"]
    assert timeline["label"] == "1405"
    assert [month["label"] for month in timeline["months"]][-3:] == ["آذر", "دی", "بهمن"]
    assert round(sum(month["width"] for month in timeline["months"])) == 100
    for row in rows:
        assert 0 <= row["bar"]["start"] and row["bar"]["start"] + row["bar"]["width"] <= 100.01
    assert rows[0]["bar"]["start"] < rows[1]["bar"]["start"]
    assert first.pk  # مسیر اول شماره‌ی ۱ را نگه می‌دارد، پس مسیر دوم «مسیر 2» است


def test_the_plan_writer_reminds_the_owner_once_a_day(api, grc, owner, assignee, verifier, plan):
    remind_url = reverse("actions:plan_remind", args=[plan.pk])
    assert page(api(owner), plan.get_absolute_url()).json()["remind_url"] is None
    assert send(api(owner), remind_url, {}).status_code in (400, 403)
    assert page(api(grc), plan.get_absolute_url()).json()["remind_url"] == remind_url

    first = send(api(grc), remind_url, {})
    assert first.status_code == 200 and "یادآوری برای رضا مالکی فرستاده شد" in first.json()["message"]
    notice = MonitoringNotice.objects.get(recipient=owner)
    assert plan.risk.code in notice.message and notice.href == plan.get_absolute_url()
    again = send(api(grc), remind_url, {})
    assert again.status_code == 200 and "امروز یک بار" in again.json()["message"]
    assert MonitoringNotice.objects.filter(recipient=owner).count() == 1

    treatment.make_action(plan, grc, owner, assignee, verifier)
    target_for(plan, grc)
    approve_plan(plan, owner)
    assert page(api(grc), plan.get_absolute_url()).json()["remind_url"] is None


def test_the_action_path_belongs_to_the_base_assessment_and_only_to_b(grc, owner, assignee, verifier, plan):
    own = Path.objects.create(assessment=plan.assessment, name="ورود مستقیم", description="-", b0=4, b0_rationale="-")
    other = treatment.approved(treatment.make_risk(owner, "ریسک دیگر"), grc, "بالا", 12)
    foreign = Path.objects.create(assessment=other, name="بیگانه", description="-", b0=4, b0_rationale="-")
    data = treatment.action_data(owner, assignee, verifier)
    form = ActionForm({**data, "path": own.pk, "mechanism": "a"}, plan=plan)
    assert not form.is_valid() and "مسیر تحقق فقط برای سازوکار B است." in str(form.errors)
    form = ActionForm({**data, "path": foreign.pk}, plan=plan)
    assert not form.is_valid() and "path" in form.errors
    form = ActionForm({**data, "path": own.pk}, plan=plan)
    assert form.is_valid(), form.errors


def test_an_action_moves_with_the_moves_its_person_may_make(api, grc, owner, assignee, verifier, risk, plan):
    action = treatment.make_action(plan, grc, owner, assignee, verifier)
    target_for(plan, grc)
    approve_plan(plan, owner)
    data = page(api(assignee), action.get_absolute_url()).json()
    assert data["progress"] == {"state": "waiting"}  # ریسک هنوز «در اجرای درمان» نیست
    # مجری ریسک را نمی‌بیند: نام ریسک هست ولی پیوندش نه.
    assert data["risk"]["href"] is None and data["plan"]["href"] is None

    perform_transition(risk, get_transition("start_treatment"), grc)
    progress = page(api(assignee), action.get_absolute_url()).json()["progress"]
    assert [move["name"] for move in progress["moves"]] == ["start"] and progress["can_note"]
    assert progress["note"]["name"] == "note" and progress["evidence"] is None
    assert send(api(assignee), progress["url"], {"move": "start", "note": ""}).status_code == 200
    action.refresh_from_db()
    assert action.status == ST.IN_PROGRESS

    blocked = send(api(assignee), progress["url"], {"move": "block", "note": ""})
    assert blocked.status_code == 400 and "توضیح لازم است" in blocked.json()["message"]
    assert blocked.json()["redirect"]["route"] == f"/actions/{action.pk}#progress"

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
    progress = page(api(owner), action.get_absolute_url()).json()["progress"]
    assert progress["evidence"]["choices"][0]["value"] == str(evidence.pk)
    assert progress["evidence"]["help"].startswith("برای «آماده‌ی آزمون»") and "Ctrl" not in progress["evidence"]["help"]
    ready = send(api(owner), progress["url"], {"move": "ready", "note": "اجرا شد", "evidence": [str(evidence.pk)]})
    assert ready.status_code == 200
    data = page(api(owner), action.get_absolute_url()).json()
    assert data["action"]["status"]["value"] == ST.READY
    assert [item["code"] for item in data["evidence"]] == [evidence.code]
    # تازه‌ترین بالا، با همان برچسب وضعیت جنگو.
    assert [item["label"] for item in data["updates"]][:2] == ["آماده‌ی آزمون", "در اجرا"]
    assert data["updates"][0]["note"] == "اجرا شد" and data["updates"][0]["by"]["name"] == "رضا مالکی"
    # فقط تأییدکننده نتیجه را تأیید می‌کند.
    assert [move["name"] for move in page(api(verifier), action.get_absolute_url()).json()["progress"]["moves"]] == [
        "verify",
        "fail",
    ]


def test_the_action_and_acceptance_lists_keep_their_django_filters(api, grc, owner, assignee, verifier, plan):
    action = treatment.make_action(plan, grc, owner, assignee, verifier)
    data = page(api(grc), "/actions/?status=open").json()
    assert data["title"] == "اقدام‌ها" and data["count"] == 1
    assert data["results"][0]["risk"] == plan.risk.code and data["results"][0]["code"] == action.code
    assert {field["name"] for field in data["filters"]["fields"]} == {"q", "status", "overdue", "mine"}
    assert page(api(grc), "/actions/?mine=on").json()["count"] == 0
    assert page(api(assignee), "/actions/?mine=on").json()["count"] == 1

    risk = acceptance_tests.risk_at(owner, grc, "پایین", 3)
    acceptance = acceptance_tests.make_acceptance(risk, grc)
    data = page(api(grc), "/actions/acceptances/").json()
    assert data["results"][0]["code"] == acceptance.code
    assert data["results"][0]["state"] == {"value": "draft", "label": "پیش‌نویس"}
    assert data["results"][0]["risk"]["code"] == risk.code


def test_an_acceptance_is_submitted_signed_and_revoked_through_its_views(api, grc, owner, committee):
    risk = acceptance_tests.risk_at(owner, grc, "پایین", 3)
    acceptance = acceptance_tests.make_acceptance(risk, grc)
    data = page(api(grc), acceptance.get_absolute_url()).json()
    assert data["acceptance"]["state"]["value"] == "draft" and data["problems"] == []
    assert data["submit_url"] == reverse("actions:acceptance_submit", args=[acceptance.pk])
    assert data["cap"]["until"] is not None and data["level"]["name"] == "پایین"
    assert [row["authority"] for row in data["signatures"]] == ["owner"]
    assert data["sign_forms"] == [] and data["revoke"] is None

    assert send(api(grc), data["submit_url"], {}).status_code == 200
    data = page(api(owner), acceptance.get_absolute_url()).json()
    assert data["signatures"][0]["waiting"] and data["submit_url"] is None
    sign = data["sign_forms"][0]
    assert sign["authority"] == "owner" and sign["label"] == "مالک ریسک"
    assert [field["name"] for field in sign["fields"]] == ["authority", "note"]

    # رد بی‌توضیح پذیرفته نیست و پیام همان view برمی‌گردد.
    rejected = send(api(owner), data["sign_url"], {"authority": "owner", "decision": "reject", "note": ""})
    assert rejected.status_code == 400
    assert (
        send(api(owner), data["sign_url"], {"authority": "owner", "decision": "approve", "note": ""})
        .json()["message"]
        .startswith("همه‌ی امضاها کامل شد")
    )
    data = page(api(grc), acceptance.get_absolute_url()).json()
    assert data["acceptance"]["state"]["value"] == "active" and data["acceptance"]["decision_text"]
    assert data["signatures"][0]["signature"]["approved"] and data["signatures"][0]["signature"]["by"]["name"]
    assert data["revoke"]["url"] == reverse("actions:acceptance_revoke", args=[acceptance.pk])
    assert [field["name"] for field in data["revoke"]["fields"]] == ["reason"]

    revoked = send(api(grc), data["revoke"]["url"], {"reason": "رخداد تازه"})
    assert revoked.status_code == 200
    acceptance.refresh_from_db()
    assert acceptance.status == RiskAcceptance.Status.REVOKED
    closed = page(api(grc), acceptance.get_absolute_url()).json()["acceptance"]["closed"]
    assert closed["label"] == "لغوشده" and closed["reason"] == "رخداد تازه" and closed["by"]["name"] == "سارا احمدی"


def test_the_senior_management_letter_is_sent_as_multipart(client, grc, owner, unit_manager):
    risk = acceptance_tests.risk_at(owner, grc, "متوسط", 6, customer_tolerance_exceeded=True)
    unit_manager.managed_units.add(risk.org_unit)
    acceptance = acceptance_tests.make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    client.force_login(grc)
    sign = page(client, acceptance.get_absolute_url()).json()["sign_forms"]
    letter_form = next(item for item in sign if item["authority"] == "senior_management")
    assert letter_form["multipart"] and "تصمیم مدیریت ارشد" in letter_form["intro"]
    assert [field["name"] for field in letter_form["fields"]] == [
        "authority",
        "note",
        "reference",
        "reference_date",
        "letter",
    ]
    response = client.post(
        f"{reverse('api:form_bridge')}?path={reverse('actions:acceptance_sign', args=[acceptance.pk])}",
        {
            "authority": "senior_management",
            "decision": "approve",
            "reference": "۱۲/۳۴۵",
            "reference_date": to_jalali(timezone.localdate()),
            "letter": acceptance_tests.letter(),
        },
    )
    assert response.status_code == 200, response.json()
    signature = acceptance.signatures.get()
    assert signature.letter.original_name == "letter.pdf"
    row = next(item for item in page(client, acceptance.get_absolute_url()).json()["signatures"] if item["signature"])
    assert row["signature"]["reference_kind"] == "نامه" and row["signature"]["letter"]


def test_the_plan_and_acceptance_forms_open_through_the_bridge(api, grc, owner, plan):
    data = form(api(grc), reverse("actions:action_create", args=[plan.pk])).json()
    assert data["title"] == f"اقدام تازه برای {plan}"
    assert data["cancel"]["route"] == f"/actions/plans/{plan.pk}"
    names = [field["name"] for field in data["form"]["fields"]]
    assert {"title", "deliverable", "owner", "assignee", "verifier", "start_date", "due_date"} <= set(names)

    risk = acceptance_tests.risk_at(owner, grc, "پایین", 3)
    data = form(api(grc), reverse("actions:acceptance_create", args=[risk.pk])).json()
    assert data["cancel"]["route"] == f"/risks/{risk.pk}#acceptances"
    values = {**values_of(data["form"]), **acceptance_tests.acceptance_data(), "scope": ""}
    invalid = send(api(grc), reverse("actions:acceptance_create", args=[risk.pk]), values)
    assert invalid.status_code == 400 and "scope" in invalid.json()["errors"]
    assert not RiskAcceptance.objects.exists()


def test_the_reassessment_form_brings_the_comparison(api, grc, owner, assignee, verifier, plan):
    data = page(api(grc), plan.get_absolute_url()).json()
    assert data["reassess_url"] is None and data["comparison"] is None
    target_for(plan, grc)
    treatment.make_action(plan, grc, owner, assignee, verifier)
    approve_plan(plan, owner)
    # ارزیابی جاری تازه‌ای بعد از طرح تأیید می‌شود و بازسنجی ممکن می‌شود.
    treatment.approved(plan.risk, grc, "متوسط", 6)
    data = page(api(grc), plan.get_absolute_url()).json()
    assert data["reassess_url"] == reverse("actions:reassessment_create", args=[plan.pk])
    assert len(data["comparison"]["profiles"]) >= 2

    extras = form(api(grc), data["reassess_url"]).json()
    assert extras["submit"] == "ثبت بازسنجی" and "بخش ۲۰" in extras["intro"]
    assert extras["risk"]["code"] == plan.risk.code
    assert extras["comparison"]["rows"][0]["label"] == "A"
    assert [item["code"] for item in extras["open_actions"]] == [plan.actions.get().code]
