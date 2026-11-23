"""قاعده‌های جلسه‌ی کمیته: چه کسی تصمیم ثبت می‌کند، حد نصاب، تعارض منافع مالک ریسک، امضای مصوبه و بستن جلسه با
انتشار مصوبات به مالکان ریسک."""

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.accounts.roles import Role
from apps.actions.models import MonitoringNotice

from .models import AgendaItem, Attendee, Meeting, ResolutionSignature


def can_view(user, meeting):
    return (
        user.is_system_admin
        or user.has_role(Role.GRC_MEMBER, Role.SECURITY_COMMITTEE, Role.SECURITY_WORKGROUP)
        or meeting.attendees.filter(user=user).exists()
    )


def can_run(user, meeting):
    """ثبت مصوبه، ارجاع، افزودن مورد و بستن جلسه با دبیر و رئیس جلسه است (و مدیر سامانه)."""
    if user.is_system_admin or meeting.secretary_id == user.pk:
        return True
    return meeting.attendees.filter(user=user, role__in=[Attendee.Role.CHAIR, Attendee.Role.SECRETARY]).exists()


def voters(meeting, item=None):
    """اعضای رأی‌دهنده‌ی حاضر؛ برای یک مورد، بدون مالک همان ریسک (تعارض منافع)."""
    rows = [row for row in meeting.attendees.all() if row.present and row.votes]
    owner = item.owner if item else None
    return [row for row in rows if not owner or row.user_id != owner.pk]


def quorum_met(meeting):
    return len(voters(meeting)) >= meeting.quorum


def _editable(meeting, user):
    if not can_run(user, meeting):
        raise ValidationError("مصوبه را دبیر یا رئیس جلسه ثبت می‌کند.")
    if meeting.status != Meeting.Status.OPEN:
        raise ValidationError("فقط در جلسه‌ی در حال برگزاری تصمیم ثبت می‌شود.")


@transaction.atomic
def record_resolution(item, user, option=None, votes=(0, 0, 0), text=""):
    item = AgendaItem.objects.select_for_update(of=("self",)).select_related("meeting", "risk__owner").get(pk=item.pk)
    meeting = item.meeting
    _editable(meeting, user)
    problems = []
    if item.status in AgendaItem.DECIDED:
        problems.append("درباره‌ی این مورد قبلاً تصمیم گرفته شده است.")
    if not quorum_met(meeting):
        problems.append(f"حد نصاب ({meeting.quorum} عضو رأی‌دهنده‌ی حاضر) برقرار نیست؛ مصوبه ثبت نمی‌شود.")
    if option is not None and option.item_id != item.pk:
        problems.append("گزینه از همین مورد انتخاب شود.")
    if option is None and item.options.exists():
        problems.append("گزینه‌ی مصوب را انتخاب کنید.")
    votes_for, against, abstain = (int(value or 0) for value in votes)
    if min(votes_for, against, abstain) < 0:
        problems.append("شمار رأی منفی نیست.")
    allowed = len(voters(meeting, item))
    if votes_for + against + abstain > allowed:
        problems.append(f"بیش از {allowed} رأی ثبت نمی‌شود؛ مالک ریسک در پرونده‌ی خود و ناظر رأی ندارند.")
    if votes_for <= against:
        problems.append("مصوبه رأی موافق بیشتر از مخالف می‌خواهد؛ وگرنه مورد را به جلسه‌ی بعد ارجاع دهید.")
    if problems:
        raise ValidationError(problems)
    item.status = AgendaItem.Status.APPROVED
    item.chosen = option
    item.votes_for, item.votes_against, item.votes_abstain = votes_for, against, abstain
    item.resolution = (text or "").strip() or (option.title if option else item.decision_label)
    item.decided_at = timezone.now()
    item.decided_by = user
    if option and option.due:
        item.follow_up_due = option.due
    item._history_user = user
    item.save()
    signers = []
    for role in (Attendee.Role.CHAIR, Attendee.Role.SECRETARY):
        row = meeting.attendees.filter(role=role).select_related("user").first()
        if row:
            signers.append((row.user, row.get_role_display()))
    owner = item.owner
    if owner and item.risk_id:
        signers.append((owner, "مالک ریسک · پذیرش طرح و باقیمانده"))
    seen = set()
    for signer, role in signers:
        if signer.pk in seen:
            continue
        seen.add(signer.pk)
        ResolutionSignature.objects.create(item=item, user=signer, role=role)
    return item


@transaction.atomic
def defer(item, user, reason):
    item = AgendaItem.objects.select_for_update(of=("self",)).select_related("meeting").get(pk=item.pk)
    _editable(item.meeting, user)
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("دلیل ارجاع به جلسه‌ی بعد را بنویسید.")
    if item.status in AgendaItem.DECIDED:
        raise ValidationError("درباره‌ی این مورد قبلاً تصمیم گرفته شده است.")
    item.status = AgendaItem.Status.DEFERRED
    item.resolution = reason
    item.decided_at = timezone.now()
    item.decided_by = user
    item._history_user = user
    item.save()
    return item


def start_review(item, user):
    """مورد انتخاب‌شده «در حال بررسی» می‌شود و مورد قبلی که هنوز تصمیم نگرفته به «در انتظار» برمی‌گردد."""
    _editable(item.meeting, user)
    if item.status in AgendaItem.DECIDED:
        raise ValidationError("درباره‌ی این مورد قبلاً تصمیم گرفته شده است.")
    with transaction.atomic():
        item.meeting.items.filter(status=AgendaItem.Status.REVIEW).exclude(pk=item.pk).update(
            status=AgendaItem.Status.PENDING
        )
        AgendaItem.objects.filter(pk=item.pk).update(status=AgendaItem.Status.REVIEW)
    item.refresh_from_db()
    return item


def sign(item, user):
    signature = item.signatures.filter(user=user).first()
    if signature is None:
        raise ValidationError("امضای این مصوبه از شما خواسته نشده است.")
    if signature.signed_at:
        raise ValidationError("این مصوبه را قبلاً امضا کرده‌اید.")
    signature.signed_at = timezone.now()
    signature.save(update_fields=["signed_at"])
    return signature


@transaction.atomic
def close(meeting, user):
    """بستن جلسه: موردهای بی‌تصمیم به جلسه‌ی بعد می‌روند و مصوبات برای مالک هر ریسک اعلان می‌شود."""
    meeting = Meeting.objects.select_for_update().get(pk=meeting.pk)
    _editable(meeting, user)
    now = timezone.now()
    for item in meeting.items.exclude(status__in=AgendaItem.DECIDED):
        item.status = AgendaItem.Status.DEFERRED
        item.resolution = "تا پایان جلسه بررسی نشد؛ به جلسه‌ی بعد ارجاع شد."
        item.decided_at = now
        item.decided_by = user
        item._history_user = user
        item.save()
    for item in meeting.items.filter(status=AgendaItem.Status.APPROVED, risk__isnull=False).select_related(
        "risk__owner"
    ):
        if item.risk.owner_id:
            MonitoringNotice.objects.get_or_create(
                recipient=item.risk.owner,
                event_key=f"committee:{item.pk}",
                defaults={
                    "risk": item.risk,
                    "message": f"مصوبه‌ی کمیته درباره‌ی {item.risk.code}: {item.resolution}",
                    "href": item.get_absolute_url(),
                },
            )
    meeting.status = Meeting.Status.CLOSED
    meeting.closed_at = now
    meeting.closed_by = user
    meeting._history_user = user
    meeting.save()
    return meeting
