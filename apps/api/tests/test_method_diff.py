"""«مقایسه‌ی نسخه‌ها»ی روش (فیگما ۲۶): پارامترهای کلیدی، شبیه‌سازی اثر روی ارزیابی‌های جاری بدون تغییر رکوردها، ثبت
اجرای شبیه‌سازی در گردش تصویب و خروجی CSV."""

import pytest

from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import approved, make_risk
from apps.assessments.models import Assessment
from apps.catalog.tests.factories import make_user
from apps.methodology.models import MethodParameter, MethodSimulation, MethodVersion
from apps.methodology.services import copy_version, save_with_reason

pytestmark = pytest.mark.django_db
K = MethodParameter.Key


@pytest.fixture
def grc():
    return make_user("grc", Role.GRC_MEMBER, first_name="نرگس", last_name="امینی")


@pytest.fixture
def active():
    return MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE)


@pytest.fixture
def draft(active, grc):
    draft = copy_version(active, grc)
    row = draft.parameters.get(key=K.A_DATA_COVERAGE)
    row.value = row.value + 3
    save_with_reason(row, grc, "آزمون")
    low = draft.risk_levels.get(rank=1)
    low.review_value = 1
    save_with_reason(low, grc, "آزمون")
    return draft


def url(version, suffix=""):
    return f"/api/method/definition/{version.number}/diff/{suffix}"


def test_the_key_parameters_are_compared_with_the_base_version(client, grc, active, draft):
    client.force_login(grc)
    data = client.get(url(draft)).json()

    assert data["title"] == f"مقایسه‌ی ParameterSet v{draft.number} با v{active.number}"
    assert data["subtitle"].startswith("۲ پارامتر تغییر کرده")
    assert data["changed"] == 2 and len(data["rows"]) == 9
    rows = {row["key"]: row for row in data["rows"]}
    assert rows["coverage"]["changed"] and rows["coverage"]["status"]["label"] == "سخت‌گیرانه‌تر"
    assert rows["review_low"]["status"]["label"] == "کوتاه‌تر" and rows["review_low"]["after"] == "ماهانه"
    assert rows["ranges"]["after"] == "همان" and rows["ranges"]["status"]["label"] == "بدون تغییر"
    assert data["version"]["chip"] == {"label": "پیش‌نویس · در دست ویرایش", "tone": "neutral"}
    assert [step["key"] for step in data["steps"]] == ["draft", "review", "simulation", "approval", "publish"]
    assert data["can_submit"] is True and data["can_simulate"] is True
    assert data["rules"][1].endswith(f"با v{draft.number} انجام می‌شود")


def test_the_simulation_finds_assessments_affected_without_changing_them(client, grc, active, draft):
    owner = make_user("owner")
    low = approved(make_risk(owner, "ریسک پایین"), grc, "پایین", 2)
    Assessment.objects.filter(pk=low.pk).update(likelihood_low=1, likelihood_high=1, impact_low=2, impact_high=2)
    coverage = active.parameters.get(key=K.A_DATA_COVERAGE).value + 1
    rate = approved(make_risk(owner, "ریسک نرخ‌محور"), grc, "متوسط", 6)
    Assessment.objects.filter(pk=rate.pk).update(
        a_basis="rate",
        a=3,
        a_rationale="نرخ",
        a_count=4,
        a_period_months=12,
        a_coverage=coverage,
        likelihood_high=3,
        impact_high=2,
    )
    client.force_login(grc)

    simulation = client.get(url(draft)).json()["simulation"]
    tiles = {tile["key"]: tile["value"] for tile in simulation["tiles"]}
    assert tiles == {"count": 2, "data": 1, "levels": 0, "review": 1}
    effects = {row["assessment"]["code"]: row for row in simulation["rows"]}
    assert "کمتر از" in effects[rate.code]["effect"] and "داده‌ی بیشتر" in effects[rate.code]["action"]
    assert effects[low.code]["effect"].endswith("به ماهانه") and effects[low.code]["action"].startswith("سررسید جدید")
    low.refresh_from_db()
    assert low.method_version == active  # ارزیابی نسخه‌ی خود را نگه می‌دارد.


def test_running_the_simulation_is_recorded_in_the_approval_flow(client, grc, active, draft):
    # پیش‌نویس را فقط متولی روش می‌بیند؛ بقیه آن را پیدا نمی‌کنند و شبیه‌سازی‌اش را اجرا نمی‌کنند.
    client.force_login(make_user("manager", Role.UNIT_MANAGER))
    assert client.post(url(draft), {}, "application/json").status_code in (403, 404)

    client.force_login(grc)
    data = client.post(url(draft), {}, "application/json").json()
    run = MethodSimulation.objects.get()
    assert run.version == draft and run.base == active and run.run_by == grc
    step = next(step for step in data["steps"] if step["key"] == "simulation")
    assert step["state"] == "done" and data["last_run"]["by"] == "نرگس امینی"
    # نسخه‌ی فعال‌شده دیگر شبیه‌سازی نمی‌خواهد؛ نسخه‌ی بی‌مبنا هم چیزی برای مقایسه ندارد.
    assert client.post(url(active, f"?base={draft.number}"), {}, "application/json").status_code == 400
    assert client.get(url(active)).status_code == 404


def test_the_comparison_exports_to_csv(client, grc, active, draft):
    client.force_login(grc)
    response = client.get(url(draft, "?export=csv"))

    assert response.status_code == 200 and response["Content-Type"].startswith("text/csv")
    text = response.content.decode("utf-8-sig")
    assert "پوشش ثبت داده‌ی آغازگر" in text and "سخت‌گیرانه‌تر" in text
    assert client.get(url(draft, f"?base={draft.number}")).status_code == 400
