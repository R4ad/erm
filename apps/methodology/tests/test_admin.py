"""نسخه‌ی روش در پنل مدیریت: فقط پیش‌نویس ویرایش می‌شود، هیچ نسخه‌ای ساخته یا حذف نمی‌شود جز با کپی،
و کپی، ثبت تصویب و فعال‌سازی دکمه‌های صفحه‌ی نسخه‌اند (س۱۲ قدم ۸)."""

import datetime

import pytest
from django.contrib.auth.models import Permission
from django.urls import reverse
from django.utils import timezone

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.core.jalali import to_jalali
from apps.methodology.models import MethodVersion
from apps.methodology.services import copy_version, record_approval

pytestmark = pytest.mark.django_db


def change_url(obj):
    return reverse(f"admin:methodology_{obj._meta.model_name}_change", args=[obj.pk])


def action_url(action, version):
    return reverse(f"admin:methodology_methodversion_{action}", args=[version.pk])


def test_active_version_is_read_only_and_cannot_be_added_or_deleted(admin_client, v1):
    response = admin_client.get(change_url(v1))

    content = response.content.decode()
    assert response.status_code == 200
    assert 'name="_save"' not in content
    assert action_url("copy", v1) in content
    assert action_url("approve", v1) in content  # نسخه‌ی آزمایشی فعال تصویبش را می‌گیرد
    assert action_url("activate", v1) not in content
    assert admin_client.post(change_url(v1), {"title": "عنوان دیگر"}).status_code == 403
    assert admin_client.get(reverse("admin:methodology_methodversion_add")).status_code == 403
    assert admin_client.post(reverse("admin:methodology_methodversion_delete", args=[v1.pk])).status_code == 403


def test_copy_makes_an_editable_draft(admin_client, admin_user, v1):
    assert admin_client.get(action_url("copy", v1)).status_code == 200

    response = admin_client.post(action_url("copy", v1))

    draft = MethodVersion.objects.get(number=2)
    assert response.url == change_url(draft)
    assert draft.history.get().history_user == admin_user
    assert 'name="_save"' in admin_client.get(change_url(draft)).content.decode()


def test_scale_page_follows_the_lock_of_its_version(admin_client, v1, draft):
    assert 'name="_save"' not in admin_client.get(change_url(v1.scales.get(code="S"))).content.decode()
    assert 'name="_save"' in admin_client.get(change_url(draft.scales.get(code="S"))).content.decode()


def test_approval_page_lists_the_problems_and_then_records_the_letter(admin_client, admin_user, v1):
    draft = copy_version(v1, admin_user)

    page = admin_client.get(action_url("approve", draft)).content.decode()
    assert "شرح تغییرات نسبت به نسخه‌ی قبلی خالی است" in page
    assert 'value="ثبت تصویب"' not in page  # با ایراد، دکمه‌ی ثبت نیست

    draft.change_notes = "آزمایش"
    draft.save()
    response = admin_client.post(action_url("approve", draft), {"approval_ref": "۱۲۳/۴۵", "approved_on": "1405/08/10"})

    draft.refresh_from_db()
    assert response.status_code == 302
    assert draft.status == MethodVersion.Status.APPROVED
    assert (draft.approved_on, draft.approval_recorded_by) == (datetime.date(2026, 11, 1), admin_user)


def test_approval_date_after_today_is_shown_on_the_form(admin_client, draft):
    tomorrow = to_jalali(timezone.localdate() + datetime.timedelta(days=1))

    response = admin_client.post(action_url("approve", draft), {"approval_ref": "۱۲۳", "approved_on": tomorrow})

    assert response.status_code == 200
    assert "تاریخ نامه‌ی تصویب نمی‌تواند بعد از امروز باشد." in response.content.decode()
    draft.refresh_from_db()
    assert draft.is_draft


def test_activation_archives_the_active_version(admin_client, admin_user, v1, draft, yesterday):
    approved = record_approval(draft, "۱۲۳/۴۵", yesterday, admin_user)
    assert "«نسخه‌ی 1: روش v5» بایگانی می‌شود" in admin_client.get(action_url("activate", approved)).content.decode()

    admin_client.post(action_url("activate", approved))

    approved.refresh_from_db()
    v1.refresh_from_db()
    assert (approved.status, approved.activated_by) == (MethodVersion.Status.ACTIVE, admin_user)
    assert v1.status == MethodVersion.Status.ARCHIVED


def test_a_draft_is_not_activated(admin_client, draft):
    assert "فقط نسخه‌ی تصویب‌شده فعال می‌شود." in admin_client.get(action_url("activate", draft)).content.decode()

    response = admin_client.post(action_url("activate", draft), follow=True)

    assert "فقط نسخه‌ی تصویب‌شده فعال می‌شود." in response.content.decode()
    draft.refresh_from_db()
    assert draft.is_draft


def test_history_is_shown_but_cannot_be_reverted(admin_client, v1):
    record = v1.history.get()
    url = reverse("admin:methodology_methodversion_simple_history", args=[v1.pk, record.history_id])

    assert admin_client.get(url).status_code == 200
    assert admin_client.post(url, {"title": "عنوان قدیمی"}).status_code == 403


def test_actions_need_the_admin_panel_and_its_permissions(client, v1):
    client.force_login(make_user("grc", Role.GRC_MEMBER))  # بدون دسترسی پنل مدیریت
    assert client.post(action_url("copy", v1)).status_code == 302  # به ورود پنل مدیریت

    staff = make_user("staff", is_staff=True)
    staff.user_permissions.add(Permission.objects.get(codename="view_methodversion"))
    client.force_login(staff)
    assert client.get(change_url(v1)).status_code == 200
    for action in ["copy", "approve", "activate"]:
        assert client.post(action_url(action, v1)).status_code == 403
    assert MethodVersion.objects.count() == 1
