"""«همگام‌سازی با Active Directory» (فیگما ۲۸): پیش‌نمایش تغییرها از برداشت AD، نگاشت شاخه به واحد، اعمال بدون
دست زدن به نقش‌ها، انتقال مسئولیت‌های باز به جانشین، قواعد، آزمون اتصال و بارگذاری برداشت از CSV."""

from unittest import mock

import pytest
from django.core.management import call_command

from apps.accounts import directory
from apps.accounts.models import DirectoryConnection, DirectoryEntry, DirectorySync, User
from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import approved, make_action, make_plan, make_risk, to_treatment_plan
from apps.catalog.tests.factories import make_user
from apps.organization.models import OrgUnit

pytestmark = pytest.mark.django_db
URL = "/api/org/ad-sync/"
AD = User.Source.AD


@pytest.fixture
def admin():
    return make_user("admin", Role.SYSTEM_ADMIN, first_name="سارا", last_name="محمدی")


@pytest.fixture
def units():
    return {
        "infra": OrgUnit.objects.create(name="زیرساخت", code="T-INF", ad_group="OU=Infra · DC=datin"),
        "sec": OrgUnit.objects.create(name="امنیت", code="T-SEC", ad_group="OU=Sec,DC=datin"),
        "free": OrgUnit.objects.create(name="داده", code="T-DAT"),
    }


@pytest.fixture
def conn():
    return DirectoryConnection.objects.create(
        server="ldaps://dc01.example.local:636",
        base_dn="OU=Datin,DC=datin,DC=local",
        service_account="svc-erm-sync",
        excluded=["OU=Contractors"],
    )


def entry(username, ou, enabled=True, **fields):
    return DirectoryEntry.objects.create(
        username=username, ou=f"{ou},OU=Datin,DC=datin,DC=local", enabled=enabled, **fields
    )


@pytest.fixture
def scenario(units, conn):
    """یک کاربر بی‌تغییر، یک جابه‌جایی، یک غیرفعال، یک حساب حذف‌شده از AD، یک حساب تازه، یک شاخه‌ی نگاشت‌نشده،
    یک شاخه‌ی مستثنا و یک حساب محلی هم‌نام."""
    people = {
        "same": make_user("same", source=AD, org_unit=units["infra"]),
        "mover": make_user("mover", source=AD, org_unit=units["infra"], first_name="مهدی", last_name="فرهادی"),
        "leaver": make_user("leaver", source=AD, org_unit=units["sec"], first_name="بهرام", last_name="فتحی"),
        "gone": make_user("gone", source=AD, org_unit=units["sec"]),
        "local": make_user("local", org_unit=units["infra"]),
    }
    entry("same", "OU=Infra")
    entry("mover", "OU=Sec")
    entry("leaver", "OU=Sec", enabled=False)
    entry("fresh", "OU=Infra", first_name="سارا", last_name="کریمی", personnel_code="990001", job_title="کارشناس")
    entry("local", "OU=Sec")
    entry("d.one", "OU=DataPlatform")
    entry("d.two", "OU=DataPlatform")
    entry("c.one", "OU=Contractors")
    return people


def test_the_preview_compares_the_directory_with_users(client, admin, scenario):
    client.force_login(admin)
    data = client.get(URL).json()

    kinds = {row["user"]["username"]: row["kind"] for row in data["changes"]}
    assert kinds == {"leaver": "disabled", "gone": "disabled", "mover": "moved", "fresh": "new"}
    assert data["pending"] == 5 and data["applicable"] == 4  # چهار تغییر و یک شاخه‌ی نگاشت‌نشده
    assert data["unchanged"] == 2  # same و حساب محلی هم‌نام
    branches = {row["ou"]: row["state"] for row in data["branches"]}
    assert branches == {
        "OU=Infra": "mapped",
        "OU=Sec": "mapped",
        "OU=DataPlatform": "unmapped",
        "OU=Contractors": "excluded",
    }
    rows = {row["user"]["username"]: row for row in data["changes"]}
    assert rows["mover"]["unit"] == "از زیرساخت به امنیت" and rows["mover"]["impact"]["text"] == "بدون نقش ERM"
    assert rows["fresh"]["impact"]["text"] == "بدون نقش؛ نقش در ERM تعیین می‌شود"
    assert rows["gone"]["label"] == "حذف از AD"
    assert [unit["name"] for unit in data["unit_options"]] == ["داده"]
    assert data["rules"][-1] == {
        "key": "roles",
        "label": "اعطا یا حذف نقش از گروه‌های AD",
        "note": "همیشه غیرفعال · قفل‌شده",
        "on": False,
        "locked": True,
    }


def test_open_duties_need_a_successor_before_the_user_is_left_behind(client, admin, scenario):
    leaver, mover = scenario["leaver"], scenario["mover"]
    grc = make_user("grc", Role.GRC_MEMBER)
    risk = make_risk(leaver, "ریسک باز کاربر رفته")
    approved(risk, grc, "بالا", 12)
    to_treatment_plan(risk, grc)
    action = make_action(make_plan(risk, grc), grc, leaver, mover, grc)
    client.force_login(admin)

    rows = {row["user"]["username"]: row for row in client.get(URL).json()["changes"]}
    assert rows["leaver"]["impact"] == {"text": f"مالک {risk.code} و ۱ اقدام باز؛ جانشین لازم است", "tone": "danger"}
    assert rows["leaver"]["action"]["kind"] == "successor" and rows["leaver"]["attention"]
    assert rows["mover"]["impact"]["text"].startswith("مجری ۱ اقدام باز؛ نقش‌ها حفظ می‌شوند")
    assert rows["mover"]["action"] == {"kind": "review", "label": "بررسی", "href": "/accounts/users"}

    # جانشینی که همان تأییدکننده‌ی نتیجه است، هم مالک و هم تأییدکننده می‌شد.
    refused = client.post(URL, {"action": "successor", "user": leaver.pk, "successor": grc.pk}, "application/json")
    assert refused.status_code == 400 and action.code in refused.json()["detail"]

    successor = make_user("next", source=AD, org_unit=leaver.org_unit)
    leaver.managed_units.add(leaver.org_unit)
    response = client.post(
        URL, {"action": "successor", "user": leaver.pk, "successor": successor.pk}, "application/json"
    )
    assert response.status_code == 200 and response.json()["message"].startswith("۳ مسئولیت")
    risk.refresh_from_db()
    action.refresh_from_db()
    assert risk.owner == successor and action.owner == successor
    assert risk.history.first().history_change_reason.startswith("انتقال مسئولیت‌های بهرام فتحی")
    assert list(successor.managed_units.all()) == [leaver.org_unit] and not leaver.managed_units.exists()
    rows = {row["user"]["username"]: row for row in response.json()["changes"]}
    assert rows["leaver"]["impact"]["text"] == "بدون مسئولیت باز"


def test_applying_creates_moves_and_deactivates_without_roles(client, admin, scenario, units):
    client.force_login(admin)
    response = client.post(URL, {"action": "apply"}, "application/json")

    assert response.status_code == 200 and response.json()["message"] == "۴ تغییر اعمال شد"
    fresh = User.objects.get(username="fresh")
    assert fresh.source == AD and fresh.org_unit == units["infra"] and fresh.personnel_code == "990001"
    assert not fresh.has_usable_password() and not fresh.groups.exists()
    assert User.objects.get(username="mover").org_unit == units["sec"]
    assert not User.objects.get(username="leaver").is_active and not User.objects.get(username="gone").is_active
    assert User.objects.get(username="local").org_unit == units["infra"]  # حساب محلی دست نخورده است
    run = DirectorySync.objects.get(status=DirectorySync.Status.APPLIED)
    assert run.run_by == admin and run.applied == 4 and run.pending == 1
    assert {change["username"] for change in run.changes} == {"fresh", "mover", "leaver", "gone"}
    data = response.json()
    assert data["changes"] == [] and data["history"][0]["note"] == "۴ تغییر · سارا محمدی"


def test_rules_turn_changes_off_and_branches_are_mapped(client, admin, scenario, units, conn):
    client.force_login(admin)
    client.post(URL, {"action": "rules", "key": "auto_create", "on": False}, "application/json")
    data = client.post(URL, {"action": "rules", "key": "deactivate", "on": False}, "application/json").json()
    assert data["applicable"] == 1  # فقط جابه‌جایی
    rows = {row["user"]["username"]: row for row in data["changes"]}
    assert rows["fresh"]["action"]["label"] == "ایجاد خودکار خاموش است"
    assert client.post(URL, {"action": "rules", "key": "roles", "on": True}, "application/json").status_code == 400

    taken = client.post(URL, {"action": "map", "ou": "ou=dataplatform", "unit": units["infra"].pk}, "application/json")
    assert taken.status_code == 400
    mapped = client.post(URL, {"action": "map", "ou": "ou=dataplatform", "unit": units["free"].pk}, "application/json")
    assert mapped.status_code == 200
    units["free"].refresh_from_db()
    assert units["free"].ad_group == "OU=DataPlatform"
    assert {row["ou"]: row["state"] for row in mapped.json()["branches"]}["OU=DataPlatform"] == "mapped"
    client.post(URL, {"action": "rules", "key": "auto_create", "on": True}, "application/json")
    data = client.get(URL).json()
    assert {row["user"]["username"] for row in data["changes"] if row["kind"] == "new"} == {"fresh", "d.one", "d.two"}

    entry("x.one", "OU=Vendors")
    excluded = client.post(URL, {"action": "map", "ou": "ou=vendors", "unit": "exclude"}, "application/json")
    conn.refresh_from_db()
    assert excluded.status_code == 200 and conn.excluded == ["OU=Contractors", "OU=Vendors"]


def test_the_connection_test_and_the_preview_run_are_recorded(client, admin, scenario, conn):
    client.force_login(admin)
    with mock.patch("apps.accounts.directory.socket.create_connection", side_effect=OSError):
        failed = client.post(URL, {"action": "test"}, "application/json").json()
    assert failed["connection"]["state"] == {"label": "ناموفق", "tone": "danger"}
    assert failed["message"] == "اتصال ناموفق بود · dc01.example.local:636 پاسخ نداد."
    with mock.patch("apps.accounts.directory.socket.create_connection"):
        ok = client.post(URL, {"action": "test"}, "application/json").json()
    assert ok["connection"]["state"]["label"] == "متصل"

    data = client.post(URL, {"action": "preview"}, "application/json").json()
    assert data["message"] == "پیش‌نمایش تازه آماده شد · ۵ مورد در انتظار"
    assert (
        data["history"][0]["title"].endswith("· پیش‌نمایش") and data["history"][0]["note"] == "۵ تغییر در انتظار اعمال"
    )
    assert "پیش‌نمایش امروز ساعت" in data["subtitle"]


def test_only_system_admins_see_the_page(client, admin, scenario):
    client.force_login(make_user("manager", Role.UNIT_MANAGER))
    assert client.get(URL).status_code == 403
    assert client.post(URL, {"action": "apply"}, "application/json").status_code == 403
    assert client.get("/api/org/chart/").json()["ad_sync_url"] is None

    client.force_login(admin)
    assert client.get("/api/org/chart/").json()["ad_sync_url"] == "/units/ad-sync"
    DirectoryConnection.objects.all().delete()
    assert client.get(URL).status_code == 404
    assert client.get("/api/org/chart/").json()["ad_sync_url"] is None


def test_a_directory_export_replaces_the_snapshot(tmp_path, conn):
    entry("old", "OU=Infra")
    export = tmp_path / "ad.csv"
    export.write_text(
        "﻿username,first_name,last_name,ou,enabled\n"
        'a.one,آرش,مقدم,"OU=Infra,DC=datin",true\n'
        'b.two,بهار,نوری,"OU=Sec,DC=datin",false\n',
        encoding="utf-8",
    )
    call_command("directory_sync", file=str(export))

    assert sorted(DirectoryEntry.objects.values_list("username", "enabled")) == [("a.one", True), ("b.two", False)]
    assert DirectorySync.objects.get().status == DirectorySync.Status.PREVIEW

    with pytest.raises(directory.DirectoryError, match="تکراری"):
        directory.load_entries("username,ou\na,OU=X\nA,OU=Y\n")
    with pytest.raises(directory.DirectoryError, match="ou"):
        directory.load_entries("username\na\n")
