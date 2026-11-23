"""«جلسه‌ی کمیته‌ی امنیت» (فیگما ۲۳): ترتیب دستور جلسه، حد نصاب و تعارض منافع مالک ریسک، ثبت مصوبه با رأی و
امضا، ارجاع، بستن جلسه با اعلان مصوبه به مالک، افزودن مورد و دسترسی."""

from datetime import time, timedelta

import pytest
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice
from apps.actions.tests.test_treatment import approved, level, make_risk
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.committee.models import AgendaItem, AgendaOption, Attendee, Meeting

pytestmark = pytest.mark.django_db

CURRENT = "/api/committee/meetings/current/"


@pytest.fixture
def api(client):
    def login(user):
        client.force_login(user)
        return client

    return login


@pytest.fixture
def people():
    return {
        "chair": make_user("chair", Role.SECURITY_COMMITTEE, first_name="رضا", last_name="کریمی"),
        "secretary": make_user("secretary", Role.GRC_MEMBER, first_name="ندا", last_name="احمدی"),
        "member": make_user("member", Role.SECURITY_COMMITTEE, first_name="مهدی", last_name="فرهادی"),
        "owner": make_user("owner", Role.UNIT_MANAGER, first_name="مریم", last_name="صادقی"),
        "observer": make_user("observer", first_name="الهام", last_name="توکلی"),
        "absent": make_user("absent", first_name="علی", last_name="رضایی"),
        "other": make_user("other", first_name="حسین", last_name="نوری"),
    }


def risk_at(owner, grc, name, score, impact, title):
    risk = make_risk(owner, title)
    assessment = approved(risk, grc, name, score)
    Assessment.objects.filter(pk=assessment.pk).update(likelihood_high=score // impact, impact_high=impact)
    return risk


@pytest.fixture
def meeting(people):
    item = Meeting.objects.create(
        kind=Meeting.Kind.EXTRAORDINARY,
        reason="ریسک بحرانی",
        date=timezone.localdate(),
        starts_at=time(0, 0),
        ends_at=time(23, 59),
        location="اتاق جلسات",
        secretary=people["secretary"],
        quorum=3,
        status=Meeting.Status.OPEN,
        created_by=people["secretary"],
    )
    R = Attendee.Role
    for key, role, present in [
        ("chair", R.CHAIR, True),
        ("secretary", R.SECRETARY, True),
        ("member", R.MEMBER, True),
        ("owner", R.MEMBER, True),
        ("observer", R.OBSERVER, True),
        ("absent", R.MEMBER, False),
    ]:
        Attendee.objects.create(meeting=item, user=people[key], role=role, present=present, position="سمت")
    return item


@pytest.fixture
def agenda(meeting, people):
    """یک مورد بالا با پیامد ۵، یک مورد بالا با پیامد ۳، یک بحرانی و یک تغییر روش؛ ثبت به ترتیب عکس نمایش."""
    grc = people["secretary"]
    K = AgendaItem.Kind
    method = AgendaItem.objects.create(
        meeting=meeting, title="تصویب تغییر روش", reference="ParameterSet v6", kind=K.METHOD, presenter=grc
    )
    mild = AgendaItem.objects.create(
        meeting=meeting, risk=risk_at(people["other"], grc, "بالا", 12, 3, "بالا با پیامد ۳"), kind=K.PROGRESS
    )
    severe = AgendaItem.objects.create(
        meeting=meeting,
        risk=risk_at(people["other"], grc, "بالا", 10, 5, "بالا با پیامد ۵"),
        kind=K.EXCEPTION,
        detail="عبور از حد تحمل مشتری",
    )
    critical = AgendaItem.objects.create(
        meeting=meeting, risk=risk_at(people["owner"], grc, "بحرانی", 20, 4, "دسترسی ممتاز"), kind=K.EXPOSURE
    )
    AgendaOption.objects.create(
        item=critical,
        title="کاهش + مهار فوری",
        description="استقرار PAM",
        owner_proposal=True,
        cost="۲٫۸ میلیارد ریال",
        target_level=level("بالا"),
        target_score=10,
        due=timezone.localdate() + timedelta(days=3),
    )
    AgendaOption.objects.create(item=critical, title="اجتناب", description="قطع دسترسی پیمانکار")
    return {"critical": critical, "severe": severe, "mild": mild, "method": method}


def test_agenda_is_ordered_by_level_impact_then_method_items(api, people, meeting, agenda):
    data = api(people["secretary"]).get(CURRENT).json()

    assert [row["subject"] for row in data["agenda"]] == [
        "دسترسی ممتاز",
        "بالا با پیامد ۵",
        "بالا با پیامد ۳",
        "تصویب تغییر روش",
    ]
    assert data["agenda"][3]["reference"] == "ParameterSet v6" and data["agenda"][3]["level"] is None
    assert data["stats"]["agenda"] == {"count": "۴", "note": "۱ بحرانی · ۲ بالا · ۱ تغییر روش"}
    assert data["subtitle"].startswith("جلسه‌ی فوق‌العاده به دلیل ریسک بحرانی · دبیر: ندا احمدی (سمت)")
    # موردی که در حال بررسی نیست: نخستین مورد در انتظار پرونده‌ی پیش‌فرض است.
    assert data["selected"]["id"] == agenda["critical"].pk
    assert data["restricted"].endswith("مورد ۲ خارج از اختیار پذیرش عادی است.")
    assert [row["level"]["name"] for row in data["authority"]] == ["بحرانی", "بالا", "متوسط", "پایین"]
    assert data["can_run"] is True


def test_quorum_counts_present_voters_and_the_owner_is_conflicted(api, people, meeting, agenda):
    data = api(people["chair"]).get(f"{CURRENT}?item={agenda['critical'].pk}").json()

    assert data["stats"]["quorum"]["present"] == "۵" and data["stats"]["quorum"]["total"] == "۶"
    assert data["quorum"]["met"] is True
    states = {row["name"]: row["state"] for row in data["attendees"]}
    assert states == {
        "رضا کریمی": "present",
        "ندا احمدی": "present",
        "مهدی فرهادی": "present",
        "مریم صادقی": "conflict",
        "الهام توکلی": "observer",
        "علی رضایی": "absent",
    }
    selected = data["selected"]
    # رئیس، دبیر و عضو؛ مالک در پرونده‌ی خود و ناظر رأی ندارند.
    assert selected["voters"] == 3 and selected["conflict"] == "مریم صادقی"
    assert selected["level"]["name"] == "بحرانی" and selected["score"] == "۲۰"
    assert {"label": "احتمال × پیامد", "value": "L5 × I4"} in selected["facts"]
    assert selected["policy"].startswith("سطح بحرانی: ")
    first = selected["options"][0]
    assert first["owner_proposal"] is True
    assert [chip["text"] for chip in first["chips"]][1:] == ["هدف: بالا ۱۰", "هزینه: ۲٫۸ میلیارد ریال"]

    # در پرونده‌ی ریسک دیگری، مالک این ریسک تعارض ندارد.
    other = api(people["chair"]).get(f"{CURRENT}?item={agenda['severe'].pk}").json()
    assert {row["name"]: row["state"] for row in other["attendees"]}["مریم صادقی"] == "present"


def test_resolution_needs_an_option_majority_and_no_more_votes_than_voters(api, people, meeting, agenda):
    client = api(people["secretary"])
    critical = agenda["critical"]
    url = f"/api/committee/items/{critical.pk}/resolve/"
    option = critical.options.get(owner_proposal=True)

    missing = client.post(url, {"votes": [3, 0, 0]}, content_type="application/json")
    assert missing.status_code == 400 and "گزینه‌ی مصوب" in missing.json()["detail"]
    too_many = client.post(url, {"option": option.pk, "votes": [4, 0, 0]}, content_type="application/json")
    assert too_many.status_code == 400 and "بیش از 3 رأی" in too_many.json()["detail"]
    tied = client.post(url, {"option": option.pk, "votes": [1, 1, 1]}, content_type="application/json")
    assert tied.status_code == 400 and "رأی موافق بیشتر" in tied.json()["detail"]

    response = client.post(url, {"option": option.pk, "votes": [2, 0, 1], "text": ""}, content_type="application/json")

    assert response.status_code == 200
    critical.refresh_from_db()
    assert critical.status == AgendaItem.Status.APPROVED and critical.chosen == option
    assert (critical.votes_for, critical.votes_against, critical.votes_abstain) == (2, 0, 1)
    assert critical.resolution == "کاهش + مهار فوری" and critical.follow_up_due == option.due
    data = response.json()
    assert data["selected"]["decision"]["chosen"] == option.pk
    signatures = data["signatures"]
    assert signatures["item"] == critical.pk and signatures["title"].startswith("مصوبه‌ی مورد ۱ · ")
    assert [(row["name"], row["role"], row["signed_at"]) for row in signatures["rows"]] == [
        ("رضا کریمی", "رئیس کمیته", None),
        ("ندا احمدی", "دبیر", None),
        ("مریم صادقی", "مالک ریسک · پذیرش طرح و باقیمانده", None),
    ]
    assert signatures["rows"][1]["mine"] is True and signatures["owner_note"] is True

    again = client.post(url, {"option": option.pk, "votes": [2, 0, 0]}, content_type="application/json")
    assert again.status_code == 400 and "قبلاً تصمیم" in again.json()["detail"]


def test_only_chair_or_secretary_record_decisions_and_quorum_is_required(api, people, meeting, agenda):
    mild = agenda["mild"]
    url = f"/api/committee/items/{mild.pk}/resolve/"

    member = api(people["member"]).post(url, {"votes": [2, 0, 0]}, content_type="application/json")
    assert member.status_code == 400 and "دبیر یا رئیس" in member.json()["detail"]

    Attendee.objects.filter(meeting=meeting, user=people["member"]).update(present=False)
    Attendee.objects.filter(meeting=meeting, user=people["owner"]).update(present=False)
    lacking = api(people["chair"]).post(url, {"votes": [2, 0, 0]}, content_type="application/json")
    assert lacking.status_code == 400 and "حد نصاب" in lacking.json()["detail"]
    assert api(people["chair"]).get(CURRENT).json()["stats"]["quorum"]["met"] is False


def test_review_defer_and_sign(api, people, meeting, agenda):
    client = api(people["secretary"])
    severe, mild = agenda["severe"], agenda["mild"]

    assert client.post(f"/api/committee/items/{severe.pk}/review/", content_type="application/json").status_code == 200
    client.post(f"/api/committee/items/{mild.pk}/review/", content_type="application/json")
    severe.refresh_from_db()
    mild.refresh_from_db()
    assert severe.status == AgendaItem.Status.PENDING and mild.status == AgendaItem.Status.REVIEW
    # بدون پارامتر item، مورد در حال بررسی انتخاب می‌شود.
    assert client.get(CURRENT).json()["selected"]["id"] == mild.pk

    empty = client.post(f"/api/committee/items/{mild.pk}/defer/", {"reason": " "}, content_type="application/json")
    assert empty.status_code == 400 and "دلیل ارجاع" in empty.json()["detail"]
    deferred = client.post(
        f"/api/committee/items/{mild.pk}/defer/", {"reason": "گزارش کامل نیست"}, content_type="application/json"
    )
    assert deferred.status_code == 200 and deferred.json()["selected"]["status"]["value"] == "deferred"

    client.post(f"/api/committee/items/{severe.pk}/resolve/", {"votes": [3, 0, 0]}, content_type="application/json")
    stranger = api(people["member"]).post(f"/api/committee/items/{severe.pk}/sign/", content_type="application/json")
    assert stranger.status_code == 400 and "از شما خواسته نشده" in stranger.json()["detail"]
    signed = (
        api(people["chair"]).post(f"/api/committee/items/{severe.pk}/sign/", content_type="application/json").json()
    )
    assert signed["signatures"]["rows"][0]["signed_at"] is not None
    assert signed["signatures"]["rows"][0]["mine"] is False
    twice = api(people["chair"]).post(f"/api/committee/items/{severe.pk}/sign/", content_type="application/json")
    assert twice.status_code == 400


def test_closing_defers_open_items_and_notifies_risk_owners(api, people, meeting, agenda):
    client = api(people["chair"])
    severe = agenda["severe"]
    client.post(f"/api/committee/items/{severe.pk}/resolve/", {"votes": [3, 0, 0]}, content_type="application/json")

    data = client.post(f"/api/committee/meetings/{meeting.pk}/close/").json()

    assert data["status"]["value"] == "closed" and data["can_run"] is False
    assert data["stats"]["remaining"]["value"] == "بسته شد"
    statuses = {item.pk: item.status for item in meeting.items.all()}
    assert statuses[severe.pk] == AgendaItem.Status.APPROVED
    assert {statuses[agenda[key].pk] for key in ("critical", "mild", "method")} == {AgendaItem.Status.DEFERRED}
    notice = MonitoringNotice.objects.get(event_key=f"committee:{severe.pk}")
    assert notice.recipient == people["other"] and notice.href == f"/committee/{meeting.pk}/?item={severe.pk}"
    assert not MonitoringNotice.objects.filter(event_key=f"committee:{agenda['critical'].pk}").exists()

    late = client.post(f"/api/committee/items/{agenda['critical'].pk}/review/", content_type="application/json")
    assert late.status_code == 400 and "در حال برگزاری" in late.json()["detail"]


def test_previous_meeting_open_resolutions_are_counted(api, people, meeting, agenda):
    before = Meeting.objects.create(
        date=timezone.localdate() - timedelta(days=14),
        starts_at=time(10),
        ends_at=time(11),
        status=Meeting.Status.CLOSED,
        created_by=people["secretary"],
    )
    today = timezone.localdate()
    for days, done in [(-2, None), (5, None), (-1, timezone.now())]:
        AgendaItem.objects.create(
            meeting=before,
            title="مصوبه",
            kind=AgendaItem.Kind.METHOD,
            status=AgendaItem.Status.APPROVED,
            follow_up_due=today + timedelta(days=days),
            follow_up_done_at=done,
        )

    previous = api(people["secretary"]).get(CURRENT).json()["stats"]["previous"]

    assert previous["count"] == "۲" and previous["note"] == "۱ مورد از مهلت گذشته"
    assert previous["meeting"]["href"] == f"/committee/{before.pk}/"


def test_adding_a_high_risk_to_the_agenda(api, people, meeting, agenda):
    extra = risk_at(people["other"], people["secretary"], "بالا", 12, 4, "ریسک تازه")
    risk_at(people["other"], people["secretary"], "متوسط", 6, 3, "ریسک متوسط")
    client = api(people["secretary"])

    candidates = client.get(CURRENT).json()["candidates"]
    assert [row["title"] for row in candidates] == ["ریسک تازه"]

    url = f"/api/committee/meetings/{meeting.pk}/items/"
    added = client.post(url, {"risk": extra.pk, "kind": "plan", "detail": "فوری"}, content_type="application/json")
    assert added.status_code == 201
    assert added.json()["selected"]["kind"]["label"] == "تأیید طرح · فوری"
    duplicate = client.post(url, {"risk": extra.pk, "kind": "plan"}, content_type="application/json")
    assert duplicate.status_code == 400
    member = api(people["member"]).post(url, {"risk": extra.pk, "kind": "plan"}, content_type="application/json")
    assert member.status_code == 400


def test_visibility_and_server_links(api, people, meeting, agenda):
    assert api(people["other"]).get(CURRENT).status_code == 403
    assert api(people["observer"]).get(f"/api/committee/meetings/{meeting.pk}/").status_code == 200
    viewer = api(people["observer"]).get(CURRENT).json()
    assert viewer["can_run"] is False and viewer["candidates"] == []

    response = api(people["observer"]).get(f"/committee/{meeting.pk}/?item={agenda['critical'].pk}")
    assert response.status_code == 302
    assert response["Location"] == f"/app/committee/{meeting.pk}/?item={agenda['critical'].pk}"


def test_no_meeting_yet(api, people):
    response = api(people["secretary"]).get(CURRENT)
    assert response.status_code == 404
