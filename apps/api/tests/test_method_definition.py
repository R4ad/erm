"""«تعریف متدولوژی» (فیگما ۱۷): نسخه‌ها، تغییرات نسبت به نسخه‌ی پایه، ویرایش پارامتر پیش‌نویس و ارسال برای تصویب."""

import pytest

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.methodology.models import MethodParameter, MethodVersion
from apps.methodology.services import copy_version, save_with_reason

pytestmark = pytest.mark.django_db
URL = "/api/method/definition/"
K = MethodParameter.Key


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def active():
    return MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)


@pytest.fixture
def draft(active, grc):
    draft = copy_version(active, grc)
    row = draft.parameters.get(key=K.A_DATA_COVERAGE)
    row.value = 98
    save_with_reason(row, grc, "آزمون")
    low = draft.risk_levels.get(rank=1)
    low.review_value = 4
    save_with_reason(low, grc, "آزمون")
    return draft


def test_the_method_owner_sees_the_draft_with_its_changes_and_approval_flow(client, grc, active, draft):
    client.force_login(grc)
    data = client.get(URL).json()

    assert data["version"]["number"] == draft.number and data["version"]["editable"] is True
    assert data["version"]["based_on"] == f"v{active.number}" and data["can_submit"] is True
    assert data["can_copy"] is False  # پیش‌نویس هست
    assert [row["number"] for row in data["versions"]] == [draft.number, active.number]
    assert {row["key"] for row in data["changes"]} == {"param:a_data_coverage", "level:1:review"}
    coverage = next(row for row in data["parameters"] if row["key"] == "a_data_coverage")
    assert coverage["value"] == "98" and coverage["before"] == "۹۵ درصد"
    low = data["appetite"][0]
    assert low["review"] == "۴ ماه" and low["changed"] == ["review"]
    assert {group["key"]: group["changes"] for group in data["groups"]}["appetite"] == 1
    assert [step["state"] for step in data["approval"]] == ["current", "locked", "locked", "locked"]
    assert data["likelihood"]["changed"] == 0 and len(data["likelihood"]["rows"]) == 5
    assert [scale["code"] for scale in data["impact_scales"]] == ["S", "D", "F", "C", "R"]
    assert data["impact_scales"][2]["stakeholders"] == ["داتین"]
    assert [rule["key"] for rule in data["levels"]["rules"]][-2:] == ["incident", "prohibition"]

    viewer = make_user("viewer", Role.VIEWER)
    client.force_login(viewer)
    seen = client.get(URL).json()
    assert seen["version"]["number"] == active.number and seen["version"]["editable"] is False
    assert seen["can_submit"] is False and seen["changes"] == []
    assert client.get(f"{URL}?version={draft.number}").json()["version"]["editable"] is False


def test_parameters_of_a_draft_are_edited_only_by_the_method_owner(client, grc, active, draft):
    url = f"{URL}{draft.number}/parameters/"
    client.force_login(make_user("viewer", Role.VIEWER))
    assert client.post(url, {"values": {"horizon": "18"}}, content_type="application/json").status_code == 403

    client.force_login(grc)
    response = client.post(url, {"values": {"horizon": "۱۸", "input_return": "5"}}, content_type="application/json")
    assert response.status_code == 200 and response.json()["changed"] == ["horizon"]
    assert draft.parameters.get(key=K.HORIZON).value == 18
    assert {row["key"] for row in response.json()["page"]["changes"]} >= {"param:horizon"}

    bad = client.post(url, {"values": {"horizon": "دوازده"}}, content_type="application/json")
    assert bad.status_code == 400 and "horizon" in bad.json()["errors"]
    unknown = client.post(url, {"values": {"nope": "1"}}, content_type="application/json")
    assert unknown.status_code == 400
    locked = client.post(
        f"{URL}{active.number}/parameters/", {"values": {"horizon": "6"}}, content_type="application/json"
    )
    assert locked.status_code == 400 and active.parameters.get(key=K.HORIZON).value == 12


def test_submitting_locks_the_draft_and_a_new_draft_is_copied_only_when_none_is_open(client, grc, active):
    client.force_login(grc)
    assert client.get(URL).json()["can_copy"] is True
    copied = client.post(f"{URL}{active.number}/copy/")
    assert copied.status_code == 201
    number = copied.json()["version"]["number"]
    assert copied.json()["version"]["status"]["value"] == "draft"
    assert client.post(f"{URL}{active.number}/copy/").status_code == 400

    missing = client.post(f"{URL}{number}/submit/", {"change_notes": " "}, content_type="application/json")
    assert missing.status_code == 400 and "شرح تغییرات" in missing.json()["detail"]
    submitted = client.post(
        f"{URL}{number}/submit/", {"change_notes": "افق ارزیابی ۱۸ ماه"}, content_type="application/json"
    )
    assert submitted.status_code == 200
    page = submitted.json()
    assert page["version"]["submitted"] is True and page["version"]["editable"] is False and page["can_submit"] is False
    assert [step["state"] for step in page["approval"]] == ["done", "current", "locked", "locked"]
    stored = MethodVersion.objects.get(number=number)
    assert stored.submitted_by == grc and stored.change_notes == "افق ارزیابی ۱۸ ماه"
    assert client.post(f"{URL}{number}/submit/", {}, content_type="application/json").status_code == 400
    edit = client.post(f"{URL}{number}/parameters/", {"values": {"horizon": "6"}}, content_type="application/json")
    assert edit.status_code == 400
