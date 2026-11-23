from django.utils import timezone

from .models import PendingRisk, Response


def mark_reviewed(response, user):
    response.status = Response.Status.REVIEWED
    response.reviewed_by = user
    response.reviewed_at = timezone.now()
    response.save()


def convert_pending(pending, risk, user):
    pending.status = PendingRisk.Status.CONVERTED
    pending.risk = risk
    pending.decided_by = user
    pending.decided_at = timezone.now()
    pending.save()


def dismiss_pending(pending, user, reason, duplicate_of=None):
    pending.status = PendingRisk.Status.DISMISSED
    pending.dismiss_reason = reason
    pending.duplicate_of = duplicate_of
    pending.decided_by = user
    pending.decided_at = timezone.now()
    pending.save()
