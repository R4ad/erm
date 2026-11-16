"""«ویرایش بُعد پیامد» (فیگما ۲۷): سطوح بُعد با معیار و برچسب، ذخیره فقط در پیش‌نویس در دست ویرایش، تاریخچه‌ی بُعد
و ماشین‌حساب نمونه‌ی S."""

import pytest

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.methodology.models import MethodVersion
from apps.methodology.services import copy_version, submit_version

pytestmark = pytest.mark.django_db


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER)


@pytest.fixture
def active():
    return MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)


@pytest.fixture
def draft(active, grc):
    return copy_version(active, grc)


def url(version, code="S"):
    return f"/api/method/definition/{version.number}/impact/{code}/"


def test_the_levels_of_a_dimension_with_rules_history_and_calculator(client, grc, active, draft):
    client.force_login(grc)
    data = client.get(url(draft)).json()

    assert data["scale"]["title"] == "ویرایش بُعد پیامد · خدمت و تداوم (S)"
    assert data["version"] == {
        "number": draft.number,
        "name": f"v{draft.number}",
        "chip": {"label": f"پیش‌نویس v{draft.number}", "tone": "warning"},
        "editable": True,
    }
    assert [level["value"] for level in data["levels"]] == [0, 1, 2, 3, 4, 5]
    assert [tab["code"] for tab in data["tabs"]] == ["S", "D", "F", "C", "R"]
    assert data["base"]["name"] == f"v{active.number}" and len(data["base"]["levels"]) == 6
    assert data["rules"][0].startswith("در تساوی با MTPD")
    assert [row["version"] for row in data["history"]] == [f"v{draft.number}", f"v{active.number}"]
    assert data["history"][0]["title"] == "بدون تغییر در سطوح S" and data["history"][0]["current"]
    assert data["calculator"]["fraction"] == 0.25
    assert {item["key"]: item["on"] for item in data["stakeholders"]} == {
        "datin": True,
        "customer": True,
        "aggregate": False,
    }
    financial = client.get(url(draft, "F")).json()
    assert financial["calculator"] is None and financial["stakeholders"][1]["on"] is False
    assert client.get(url(draft, "L")).status_code == 404  # فقط ابعاد پیامد


def test_the_method_owner_saves_criteria_and_tags_of_a_draft(client, grc, active, draft):
    client.force_login(grc)
    levels = client.get(url(draft)).json()["levels"]
    levels[5]["criteria"] = levels[5]["criteria"] + " یا افت ظرفیت هم‌ارز."
    levels[1]["tags"] = ["غیرحیاتی · داخلی", "تا یک‌چهارم RTO"]

    response = client.post(url(draft), {"levels": levels}, "application/json")

    assert response.status_code == 200 and response.json()["saved"] == 2
    level = draft.scales.get(code="S").levels.get(value=5)
    assert level.criteria.endswith("یا افت ظرفیت هم‌ارز.")
    assert level.history.first().history_change_reason == "ویرایش سطوح بُعد S"
    assert draft.scales.get(code="S").levels.get(value=1).tags == "غیرحیاتی · داخلی ؛ تا یک‌چهارم RTO"
    data = response.json()
    assert data["levels"][1]["tags"] == ["غیرحیاتی · داخلی", "تا یک‌چهارم RTO"]
    assert data["history"][0]["title"] == "تغییر معیار سطح ۵ در سطوح S"
    # نسخه‌ی فعال دست نخورده است.
    assert not active.scales.get(code="S").levels.get(value=5).criteria.endswith("هم‌ارز.")

    levels[0]["criteria"] = "  "
    empty = client.post(url(draft), {"levels": levels}, "application/json")
    assert empty.status_code == 400 and "0" in empty.json()["errors"]


def test_only_an_editable_draft_is_saved_by_the_method_owner(client, grc, active, draft):
    levels = [{"value": 1, "criteria": "تازه", "tags": []}]
    client.force_login(grc)
    assert client.post(url(active), {"levels": levels}, "application/json").status_code == 400
    assert client.get(url(active)).json()["version"]["editable"] is False

    draft.change_notes = "شرح"
    draft.save()
    submit_version(draft, grc)
    submitted = client.post(url(draft), {"levels": levels}, "application/json")
    assert submitted.status_code == 400 and "فرستاده‌نشده" in submitted.json()["detail"]

    client.force_login(make_user("manager", Role.UNIT_MANAGER))
    assert client.post(url(active), {"levels": levels}, "application/json").status_code == 403
