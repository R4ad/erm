import pytest
from django.contrib.auth.models import Group
from django.db import connection, transaction
from django.db.utils import DatabaseError
from django.test import RequestFactory
from django.urls import reverse

from apps.accounts.models import User
from apps.accounts.roles import Role
from apps.audit.models import AuditEvent, AuditLogIsReadOnly
from apps.audit.services import client_ip, describe_changes, tracked_models
from apps.organization.models import OrgUnit
from apps.workcalendar.models import Holiday


def events(event):
    return AuditEvent.objects.filter(event=event)


@pytest.mark.django_db
def test_login_is_logged_with_the_ip_nginx_saw(client):
    user = User.objects.create_user("sara", password="Secret-pass-1")
    history_rows = user.history.count()

    client.post(
        reverse("accounts:login"),
        {"username": "sara", "password": "Secret-pass-1"},
        # اولی را کاربر جعل کرده؛ آخری را nginx گذاشته
        HTTP_X_FORWARDED_FOR="1.2.3.4, 10.0.0.7",
        HTTP_USER_AGENT="Firefox",
    )

    event = events(AuditEvent.Event.LOGIN).get()
    assert (event.user, event.username, event.ip_address, event.user_agent) == (user, "sara", "10.0.0.7", "Firefox")
    user.refresh_from_db()
    assert user.last_login is not None  # کار update_last_login خود Django هنوز انجام می‌شود
    assert user.history.count() == history_rows  # ولی ورود ردیف تاریخچه‌ی بی‌معنی نمی‌سازد


@pytest.mark.django_db
def test_failed_login_keeps_the_username_but_not_the_password(client):
    client.post(reverse("accounts:login"), {"username": "nobody", "password": "guess-1234"})

    event = events(AuditEvent.Event.LOGIN_FAILED).get()
    assert (event.user, event.username) == (None, "nobody")
    assert "guess-1234" not in str(event.details)


@pytest.mark.django_db
def test_logout_is_logged(client):
    user = User.objects.create_user("sara")
    client.force_login(user)
    client.post(reverse("accounts:logout"))
    assert events(AuditEvent.Event.LOGOUT).get().user == user


@pytest.mark.django_db
def test_every_403_is_logged_with_its_address(client):
    user = User.objects.create_user("sara")
    client.force_login(user)

    response = client.get(reverse("accounts:user_list") + "?q=x")

    assert response.status_code == 403
    assert "دسترسی ندارید" in response.text
    event = events(AuditEvent.Event.PERMISSION_DENIED).get()
    assert event.user == user
    assert event.details == {"path": "/accounts/users/?q=x", "method": "GET"}


@pytest.mark.django_db
def test_role_changes_are_logged_from_both_sides_of_the_relation():
    user = User.objects.create_user("sara", first_name="سارا", last_name="احمدی")
    grc = Group.objects.get(name=Role.GRC_MEMBER)
    viewer = Group.objects.get(name=Role.VIEWER)

    user.groups.add(grc, viewer)  # از طرف کاربر
    grc.user_set.remove(user)  # از طرف گروه
    user.groups.add(viewer)  # چیزی عوض نمی‌شود، پس ثبت هم نمی‌شود
    user.groups.clear()

    logged = [(e.details["action"], e.details["items"]) for e in events(AuditEvent.Event.ROLES_CHANGED).order_by("pk")]
    assert logged == [
        ("added", sorted([Role.GRC_MEMBER, Role.VIEWER])),
        ("removed", [Role.GRC_MEMBER]),
        ("removed", [Role.VIEWER]),
    ]
    event = events(AuditEvent.Event.ROLES_CHANGED).first()
    assert event.details["target"] == "سارا احمدی (sara)"
    assert event.user is None  # بدون درخواست، مثلاً از خط فرمان


@pytest.mark.django_db
def test_managed_unit_changes_are_logged():
    user = User.objects.create_user("sara")
    unit = OrgUnit.objects.create(name="مالی")

    unit.managers.add(user)
    user.managed_units.remove(unit)

    logged = [(e.details["action"], e.details["items"]) for e in events(AuditEvent.Event.MANAGED_UNITS_CHANGED)]
    assert sorted(logged) == [("added", ["مالی"]), ("removed", ["مالی"])]


@pytest.mark.django_db
def test_viewer_scope_changes_are_logged():
    viewer = User.objects.create_user("sara", first_name="سارا", last_name="کریمی")
    unit = OrgUnit.objects.create(name="مالی")

    viewer.scope_units.add(unit)

    event = events(AuditEvent.Event.SCOPE_UNITS_CHANGED).get()
    assert event.summary == "سارا کریمی (sara): مالی افزوده شد"


@pytest.mark.django_db
def test_events_cannot_be_changed_or_deleted():
    event = AuditEvent.objects.create(event=AuditEvent.Event.LOGIN, username="sara")

    event.username = "someone-else"
    with pytest.raises(AuditLogIsReadOnly):
        event.save()
    with pytest.raises(AuditLogIsReadOnly):
        event.delete()
    with pytest.raises(AuditLogIsReadOnly):
        AuditEvent.objects.update(username="x")
    with pytest.raises(AuditLogIsReadOnly):
        AuditEvent.objects.all().delete()

    # حتی SQL مستقیم را خود PostgreSQL رد می‌کند.
    for sql in ["UPDATE audit_auditevent SET username = 'x'", "DELETE FROM audit_auditevent"]:
        with pytest.raises(DatabaseError), transaction.atomic(), connection.cursor() as cursor:
            cursor.execute(sql)
    assert AuditEvent.objects.get().username == "sara"


@pytest.mark.django_db
def test_a_user_with_events_cannot_be_deleted_only_deactivated():
    from django.db.models import ProtectedError

    user = User.objects.create_user("sara")
    AuditEvent.objects.create(event=AuditEvent.Event.LOGIN, user=user, username="sara")
    with pytest.raises(ProtectedError):
        user.delete()


def test_client_ip_uses_the_last_forwarded_address_and_ignores_garbage():
    factory = RequestFactory()
    assert client_ip(factory.get("/", REMOTE_ADDR="10.0.0.2")) == "10.0.0.2"
    assert client_ip(factory.get("/", HTTP_X_FORWARDED_FOR="5.5.5.5,  10.0.0.9 ")) == "10.0.0.9"
    assert client_ip(factory.get("/", HTTP_X_FORWARDED_FOR="not-an-ip")) is None


def test_every_model_with_history_is_tracked():
    assert {User, OrgUnit, Holiday} <= set(tracked_models())


@pytest.mark.django_db
def test_user_history_shows_what_changed_without_the_password():
    finance = OrgUnit.objects.create(name="مالی")
    user = User.objects.create_user("sara", first_name="سارا", password="Old-pass-123")

    user.first_name = "سارا خانم"
    user.org_unit = finance
    user.is_active = False
    user.set_password("New-pass-456")
    user.save()

    record = user.history.first()
    assert sorted(describe_changes(record)) == sorted([
        ("نام", "سارا", "سارا خانم"),
        ("واحد سازمانی", "—", "مالی"),
        ("فعال", "بله", "خیر"),
    ])
    assert not hasattr(record, "password")
    assert describe_changes(user.history.last()) == []  # ردیف «ایجاد» چیزی برای مقایسه ندارد


@pytest.mark.django_db
def test_dates_in_history_are_shown_in_jalali():
    import datetime

    holiday = Holiday.objects.create(date=datetime.date(2027, 2, 11), title="پیروزی انقلاب")
    holiday.date = datetime.date(2027, 2, 12)
    holiday.save()
    assert describe_changes(holiday.history.first()) == [("تاریخ", "1405/11/22", "1405/11/23")]