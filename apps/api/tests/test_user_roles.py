"""«تعریف کاربر و نقش» (فیگما ۱۹): نقش‌های سامانه‌ای هر کاربر، دارندگان هر نقش، ماتریس دسترسی و تفکیک وظایف."""

from datetime import timedelta

import pytest
from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.actions.tests.test_treatment import make_risk
from apps.catalog.tests.factories import make_user
from apps.controls.tests.test_controls import make_control
from apps.methodology.models import MethodVersion
from apps.methodology.services import copy_version, record_approval, submit_version

pytestmark = pytest.mark.django_db
URL = "/api/accounts/roles/"


@pytest.fixture
def admin():
    return make_user("admin", Role.SYSTEM_ADMIN, first_name="سارا", last_name="محمدی")


def test_only_the_system_admin_sees_users_and_roles(client):
    client.force_login(make_user("grc", Role.GRC_MEMBER))
    assert client.get(URL).status_code == 403


def test_roles_come_from_groups_and_records_and_owner_control_overlap_is_a_conflict(client, admin):
    owner = make_user("owner", first_name="علی", last_name="رضایی", source=User.Source.AD)
    risk = make_risk(owner)
    control = make_control(owner, "پشتیبان‌گیری روزانه")
    risk.controls.add(control)
    make_user("auditor", Role.VIEWER, access_expires=timezone.localdate() + timedelta(days=10))
    make_user("gone", is_active=False)
    User.objects.filter(pk=admin.pk).update(last_login=timezone.now())

    client.force_login(admin)
    data = client.get(URL).json()

    rows = {row["username"]: row for row in data["users"]}
    assert [role["label"] for role in rows["owner"]["roles"]] == ["مالک ریسک", "مسئول کنترل"]
    assert rows["owner"]["status"]["value"] == "sod" and rows["owner"]["source"]["label"] == "AD"
    assert rows["owner"]["customers"] == []  # خدمتی با مشتری در دامنه‌اش نیست
    assert rows["admin"]["customers"] is None and rows["admin"]["last_login"]["label"].startswith("امروز")
    assert rows["auditor"]["status"]["value"] == "temporary" and rows["auditor"]["status"]["label"].startswith(
        "موقت تا"
    )
    assert rows["gone"]["status"]["value"] == "inactive"
    assert data["users"][-1]["username"] == "gone"
    # فرم کاربر جدید خود سامانه، نه /admin/ که مدیر سامانه‌ی غیر staff را راه نمی‌دهد.
    assert data["add_user_url"] == "/accounts/users/new/"

    summary = data["summary"]
    assert summary["roles"] == 11 and summary["conflicts"] == 1 and summary["temporary"] == 1
    assert summary["active"] == 4 and summary["ad"] == 1  # مدیر، مالک، ممیز و مالک خدمت آزمایشی

    conflict = data["sod"]["conflicts"][0]
    assert conflict["user"]["id"] == owner.pk and risk.code in conflict["note"] and control.code in conflict["note"]
    assert len(data["sod"]["rules"]) == 4

    roles = {role["key"]: role for role in data["roles"]}
    assert roles["owner"]["count"] == 1 and roles["owner"]["kind"] == "derived" and roles["owner"]["edit_url"] is None
    assert roles["viewer"]["kind"] == "group" and roles["viewer"]["edit_url"].startswith("/admin/auth/group/")
    assert [row["label"] for row in roles["owner"]["acceptance"]] == ["سطح پایین", "سطح متوسط", "بالا و بحرانی"]
    assert roles["owner"]["acceptance"][2]["text"] == "فقط پیشنهاد به کمیته امنیت"
    matrix = {row["key"]: row["access"] for row in data["matrix"]}
    assert matrix["method"] == {"method": "F"} and matrix["reports"]["viewer"] == "L"


def test_temporary_access_ends_login_and_open_sessions(client):
    user = make_user("guest", Role.VIEWER, access_expires=timezone.localdate() - timedelta(days=1))
    user.set_password("x-test-pass-1")
    user.save()
    assert client.login(username="guest", password="x-test-pass-1") is False

    User.objects.filter(pk=user.pk).update(access_expires=timezone.localdate())
    assert client.login(username="guest", password="x-test-pass-1") is True
    User.objects.filter(pk=user.pk).update(access_expires=timezone.localdate() - timedelta(days=1))
    assert client.get("/api/session/").status_code in (401, 403)


def test_the_method_owner_does_not_record_the_approval_of_a_version_they_submitted():
    grc = make_user("grc", Role.GRC_MEMBER)
    draft = copy_version(MethodVersion.objects.get(status=MethodVersion.Status.ACTIVE), grc)
    MethodVersion.objects.filter(pk=draft.pk).update(change_notes="افق ارزیابی")
    draft.refresh_from_db()
    submit_version(draft, grc)
    yesterday = timezone.localdate() - timedelta(days=1)
    with pytest.raises(ValidationError, match="کسی جز فرستنده"):
        record_approval(draft, "۱۲۳/۴۵", yesterday, grc)
    other = make_user("other", Role.GRC_MEMBER)
    assert record_approval(draft, "۱۲۳/۴۵", yesterday, other).status == MethodVersion.Status.APPROVED
