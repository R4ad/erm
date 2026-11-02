import pytest
from django.urls import reverse

from apps.accounts.roles import Role
from apps.catalog.tests.factories import make_user
from apps.methodology.models import MethodVersion

from .factories import make_version

pytestmark = pytest.mark.django_db


def test_every_user_sees_the_active_method_with_its_criteria(client):
    client.force_login(make_user("someone"))  # بدون هیچ نقشی

    response = client.get(reverse("methodology:active"))

    assert response.status_code == 200
    assert response.context["version"].number == 1
    content = response.content.decode()
    assert "آزمایشی" in content
    assert "شرط اجرای سازمانی" in content
    assert "اختلال خدمت حیاتی با d بیش از یک‌چهارم RTO و حداکثر RTO" in content  # معیار S3
    assert "کمتر از 0.1 بار در سال" in content  # مرز A1
    assert '<h4 class="h6 mt-3">قواعد انتخاب سطح</h4>' in content  # متن زیر جدول Bc


def test_menu_links_to_the_method_page(client):
    client.force_login(make_user("someone"))

    response = client.get(reverse("core:home"))

    assert reverse("methodology:active") in response.content.decode()


def test_anonymous_user_is_sent_to_login(client):
    response = client.get(reverse("methodology:active"))

    assert response.status_code == 302
    assert response.url.startswith(reverse("accounts:login"))


@pytest.mark.parametrize(
    "role, status",
    [
        (None, 404),
        (Role.UNIT_MANAGER, 404),
        (Role.GRC_MEMBER, 200),
        (Role.SECURITY_WORKGROUP, 200),
        (Role.SECURITY_COMMITTEE, 200),
        (Role.VIEWER, 200),
        (Role.SYSTEM_ADMIN, 200),
    ],
)
def test_drafts_and_approved_versions_are_shown_to_these_roles_only(client, role, status):
    draft = make_version(2)
    approved = make_version(3, MethodVersion.Status.APPROVED)
    client.force_login(make_user("someone", *([role] if role else [])))

    assert client.get(draft.get_absolute_url()).status_code == status
    assert client.get(approved.get_absolute_url()).status_code == status


def test_archived_versions_are_shown_to_everyone_and_say_they_are_not_active(client):
    old = make_version(2, MethodVersion.Status.ARCHIVED)
    make_version(3)  # پیش‌نویس
    client.force_login(make_user("someone"))

    response = client.get(old.get_absolute_url())

    assert response.status_code == 200
    assert "این نسخه فعال نیست" in response.content.decode()
    assert [version.number for version in response.context["versions"]] == [2, 1]  # پیش‌نویس در فهرست نیست


def test_page_of_an_empty_draft_does_not_break(client, system_admin):
    draft = make_version(2)
    client.force_login(system_admin)

    response = client.get(draft.get_absolute_url())

    assert response.status_code == 200
    assert "پیش‌نویس" in response.content.decode()
