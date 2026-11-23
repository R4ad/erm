"""تفویض اختیار موقت (فیگما ۲۹): جانشین در دوره‌ی تفویض تا سطح تعیین‌شده به جای مالک امضا می‌کند، سطح بالا و
بحرانی تفویض نمی‌شود، رونوشت تصمیم به مالک می‌رسد و اعلان‌های پایش مالک به جانشین هم می‌رسد."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.delegation import acts_for
from apps.accounts.models import Delegation
from apps.actions import acceptance as acc
from apps.actions.models import AcceptanceSignature, MonitoringNotice
from apps.actions.monitoring import notify
from apps.catalog.tests.factories import make_user
from apps.methodology.services import active_version

from .test_acceptance import make_acceptance, risk_at

pytestmark = pytest.mark.django_db
AUTH = AcceptanceSignature.Authority
APPROVE = AcceptanceSignature.Decision.APPROVE


@pytest.fixture
def successor():
    return make_user("successor", first_name="کیان", last_name="اکبری")


def delegate(owner, successor, grc, max_rank=2, starts=0, days=10, **fields):
    today = timezone.localdate()
    return Delegation.objects.create(
        user=owner,
        successor=successor,
        starts_on=today + timedelta(days=starts),
        ends_on=today + timedelta(days=starts + days),
        max_rank=max_rank,
        created_by=grc,
        **fields,
    )


def pending(owner, grc, level_name, score):
    acceptance = make_acceptance(risk_at(owner, grc, level_name, score), grc)
    acc.submit_acceptance(acceptance, grc)
    acceptance.refresh_from_db()
    return acceptance


def test_the_successor_signs_for_the_owner_within_the_delegation(grc, owner, successor):
    acceptance = pending(owner, grc, "پایین", 2)
    assert not acc.can_sign(successor, acceptance, AUTH.OWNER)

    later = delegate(owner, successor, grc, starts=3)
    assert not acc.can_sign(successor, acceptance, AUTH.OWNER)  # دوره هنوز آغاز نشده است
    later.delete()
    delegate(owner, successor, grc)
    assert acc.signable_authorities(successor, acceptance) == [AUTH.OWNER]

    acc.sign_acceptance(acceptance, successor, AUTH.OWNER, APPROVE)
    acceptance.refresh_from_db()
    assert acceptance.status == acceptance.Status.ACTIVE
    notice = MonitoringNotice.objects.get(recipient=owner)
    assert notice.message == f"کیان اکبری به جانشینی شما پذیرش {acceptance.code} را تأیید کرد."


def test_high_and_critical_decisions_are_never_delegated(grc, owner, successor):
    delegate(owner, successor, grc, max_rank=4)
    levels = {level.name: level for level in active_version().risk_levels.all()}
    assert acts_for(successor, owner, levels["متوسط"])
    assert not acts_for(successor, owner, levels["بالا"]) and not acts_for(successor, owner, levels["بحرانی"])
    Delegation.objects.update(max_rank=1)
    assert acts_for(successor, owner, levels["پایین"]) and not acts_for(successor, owner, levels["متوسط"])
    successor.is_active = False
    successor.save()
    assert not acts_for(successor, owner, levels["پایین"])


def test_the_acting_successor_does_not_also_sign_as_the_manager(grc, owner, successor):
    risk = risk_at(owner, grc, "متوسط", 6)
    successor.managed_units.add(risk.org_unit)
    acceptance = make_acceptance(risk, grc)
    acc.submit_acceptance(acceptance, grc)
    acceptance.refresh_from_db()
    delegate(owner, successor, grc)
    assert acc.signable_authorities(successor, acceptance) == [AUTH.OWNER, AUTH.UNIT_MANAGER]

    acc.sign_acceptance(acceptance, successor, AUTH.OWNER, APPROVE)
    acceptance.refresh_from_db()
    # همان شخص هر دو امضا را نمی‌دهد؛ امضای مدیر واحد با مدیر دیگری است.
    assert not acc.can_sign(successor, acceptance, AUTH.UNIT_MANAGER)
    assert acceptance.status == acceptance.Status.PENDING


def test_monitoring_notices_reach_the_successor(grc, owner, successor):
    risk = risk_at(owner, grc, "پایین", 2)
    delegate(owner, successor, grc, notify_successor=False)
    assert notify(risk, "k1", "پیام", "/", [owner]) == 1
    Delegation.objects.update(notify_successor=True)
    assert notify(risk, "k2", "پیام", "/", [owner]) == 2
    assert MonitoringNotice.objects.filter(recipient=successor, event_key="k2").exists()
