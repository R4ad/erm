"""«جلسه‌ی کمیته‌ی امنیت» در رابط React (فیگما ۲۳): حاضران و حد نصاب، دستور جلسه به ترتیب سطح، شدت پیامد و گسترش
بین مشتریان، پرونده‌ی تصمیم مورد انتخاب‌شده با گزینه‌ها و رأی، امضای مصوبه، اختیار تصمیم هر سطح از نسخه‌ی روش
(بخش ۱۹) و مصوبات باز جلسه‌ی قبل."""

import re
from datetime import datetime

from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.response import Response

from apps.actions.models import RiskReview
from apps.actions.services import containment_due, plan_period_start
from apps.assessments.services import decision_assessment
from apps.committee import services
from apps.committee.models import AgendaItem, AgendaOption, Attendee, Meeting
from apps.methodology.services import active_version
from apps.risks.models import Risk
from apps.risks.permissions import visible_risks

from . import formatting as fmt
from .base import ApiView
from .evaluation import period, plan_text
from .org_chart import current_rank
from .treatment import fa


# شناسه‌ی رخداد در دلیل بازبینی، مثل INC-20457
INCIDENT_REF = re.compile(r"\b[A-Z]{2,}-\d+\b")


def jalali(value):
    return fa(fmt.day(value)["jalali"]) if value else None


def clock(value):
    return fa(value.strftime("%H:%M")) if value else None


def facts_of(item):
    """سطح، امتیاز و پیامد ارزیابی تصمیم یک مورد ریسک؛ برای ترتیب دستور جلسه و پرونده‌ی تصمیم."""
    assessment = decision_assessment(item.risk) if item.risk_id else None
    return assessment


def sort_key(item, assessment):
    if not item.risk_id:
        return (1, 0, 0, 0, item.pk)
    level = assessment.decision_level.rank if assessment else 0
    impact = (assessment.impact_high or 0) if assessment else 0
    spread = item.risk.customers.count()
    return (0, -level, -impact, -spread, item.pk)


def level_of(level):
    return fmt.level(level) if level else None


def option_row(option):
    chips = []
    if option.due:
        chips.append({"text": f"طرح تا {jalali(option.due)}", "tone": "neutral"})
    if option.target_level_id:
        target = f"هدف: {option.target_level.name}"
        if option.target_score:
            target += f" {fa(option.target_score)}"
        chips.append({"text": target, "tone": "warning", "level": level_of(option.target_level)})
    if option.cost:
        chips.append({"text": f"هزینه: {option.cost}", "tone": "neutral"})
    if option.expires:
        chips.append({"text": f"انقضا: {jalali(option.expires)}", "tone": "neutral"})
    for note in option.notes or []:
        if isinstance(note, dict) and note.get("text"):
            chips.append({"text": note["text"], "tone": note.get("tone", "neutral")})
    return {
        "id": option.pk,
        "title": option.title,
        "description": option.description,
        "owner_proposal": option.owner_proposal,
        "chips": chips,
    }


def policy(level):
    """متن سیاست سطح برای پرونده‌ی تصمیم، از جدول بخش ۱۹ نسخه‌ی روش."""
    rule = level.decision_rule.rstrip(".")
    return (
        f"سطح {level.name}: {rule}. مهلت: {plan_text(level)}؛ حداکثر اعتبار پذیرش "
        f"{period(level.acceptance_value, level.acceptance_unit)}."
    )


def case(item, assessment, user, meeting):
    """پرونده‌ی تصمیم مورد انتخاب‌شده."""
    owner = item.owner
    base = {
        "id": item.pk,
        "subject": item.subject,
        "kind": {"value": item.kind, "label": item.decision_label},
        "status": {"value": item.status, "label": item.get_status_display()},
        "owner": fmt.person(owner),
        "voters": len(services.voters(meeting, item)),
        "conflict": owner.get_full_name() if owner and item.risk_id else None,
        "options": [option_row(option) for option in item.options.select_related("target_level")],
        "decision": None,
    }
    if item.status in AgendaItem.DECIDED:
        base["decision"] = {
            "chosen": item.chosen_id,
            "votes": [item.votes_for, item.votes_against, item.votes_abstain],
            "text": item.resolution,
            "at": fmt.moment(item.decided_at),
            "by": fmt.person(item.decided_by),
        }
    if not item.risk_id:
        return {**base, "risk": None, "reference": item.reference or None}
    risk = item.risk
    level = assessment.decision_level if assessment else None
    facts = []
    if assessment and assessment.likelihood_high and assessment.impact_high:
        facts.append({"label": "احتمال × پیامد", "value": f"L{assessment.likelihood_high} × I{assessment.impact_high}"})
    if owner:
        facts.append({"label": "مالک ریسک", "value": owner.get_full_name() or owner.username})
    customers = list(risk.customers.all())
    spread = "همه‌ی بانک‌ها" if len(customers) > 1 else "، ".join(customer.name for customer in customers)
    facts.append(
        {
            "label": "خدمت",
            "value": " · ".join(part for part in (risk.service.name if risk.service_id else "", spread) if part),
        }
    )
    incident = (
        RiskReview.objects.filter(risk=risk, trigger=RiskReview.Trigger.INCIDENT, completed_at__isnull=True)
        .order_by("-created_at")
        .first()
    )
    if incident:
        found = INCIDENT_REF.search(incident.reason)
        reference = found.group(0) if found else incident.reason.split("؛")[0][:60]
        facts.append({"label": "رخداد مرتبط", "value": f"{reference} · در حال پاسخ"})
    if level and level.containment_value:
        start = plan_period_start(risk)
        due = containment_due(risk, level)
        local = timezone.localtime(start) if hasattr(start, "hour") else None
        when = f"{jalali(local.date())} ساعت {clock(local)}" if local else jalali(start)
        facts.append({"label": "آغاز مهار", "value": when})
        if hasattr(due, "hour"):
            left = int((due - timezone.now()).total_seconds() // 3600)
            state = f"{fa(left)} ساعت باقی" if left > 0 else "مهلت گذشته"
            facts.append(
                {"label": "مهلت مهار", "value": f"{period(level.containment_value, level.containment_unit)} · {state}"}
            )
    return {
        **base,
        "risk": {"id": risk.pk, "code": risk.code, "href": risk.get_absolute_url()},
        "assessment": {
            "code": assessment.code,
            "href": assessment.get_absolute_url(),
            "confidence": assessment.get_confidence_display() if assessment.confidence else None,
        }
        if assessment
        else None,
        "scenario": risk.scenario.code if risk.scenario_id else None,
        "score": fa(assessment.score_high) if assessment and assessment.score_high else None,
        "level": level_of(level),
        "facts": facts,
        "policy": policy(level) if level else None,
    }


def attendees(meeting, item):
    owner = item.owner if item and item.risk_id else None
    rows = []
    for row in meeting.attendees.select_related("user"):
        name = row.user.get_full_name() or row.user.username
        if not row.present:
            state, label = "absent", "غایب"
        elif row.role == Attendee.Role.OBSERVER:
            state, label = "observer", "ناظر"
        elif owner and row.user_id == owner.pk:
            state, label = "conflict", "تعارض منافع"
        else:
            state, label = "present", "حاضر"
        if state == "conflict":
            line = "مالک ریسک · بدون رأی در پرونده‌ی خود"
        elif row.role in (Attendee.Role.CHAIR, Attendee.Role.SECRETARY):
            line = " · ".join(part for part in (row.get_role_display(), row.position) if part)
        elif row.role == Attendee.Role.OBSERVER:
            line = " · ".join(part for part in (row.position, "ناظر بدون رأی") if part)
        else:
            line = row.position or row.get_role_display()
        rows.append({"id": row.pk, "name": name, "line": line, "state": state, "state_label": label})
    return rows


def signatures(meeting, items, selected, user, number):
    item = selected if selected and selected.status == AgendaItem.Status.APPROVED else None
    if item is None or not item.signatures.exists():
        approved = [row for row in items if row.status == AgendaItem.Status.APPROVED and row.signatures.exists()]
        # تازه‌ترین مصوبه‌ی امضاشدنی
        item = max(approved, key=lambda row: row.decided_at) if approved else None
    if item is None:
        return None
    rows = [
        {
            "id": signature.pk,
            "name": signature.user.get_full_name() or signature.user.username,
            "role": signature.role,
            "signed_at": clock(timezone.localtime(signature.signed_at)) if signature.signed_at else None,
            "mine": signature.user_id == user.pk and not signature.signed_at,
        }
        for signature in item.signatures.select_related("user")
    ]
    return {
        "item": item.pk,
        "title": f"مصوبه‌ی مورد {fa(number[item.pk])}"
        + (f" · {item.risk.code}" if item.risk_id else (f" · {item.reference}" if item.reference else "")),
        "rows": rows,
        "owner_note": any(signature.role.startswith("مالک ریسک") for signature in item.signatures.all()),
    }


def authority(version):
    rows = []
    for level in version.risk_levels.order_by("-rank"):
        rule = level.decision_rule.split(".")[0].strip()
        rows.append(
            {
                "level": level_of(level),
                "rule": rule,
                "deadline": f"مهلت طرح: {plan_text(level)} · حداکثر اعتبار پذیرش: "
                f"{period(level.acceptance_value, level.acceptance_unit)}",
            }
        )
    return rows


def remaining(meeting, items):
    decided = sum(1 for item in items if item.status in AgendaItem.DECIDED)
    note = f"{fa(decided)} مورد بررسی شد"
    if meeting.status == Meeting.Status.CLOSED:
        return {"value": "بسته شد", "note": note}
    now = timezone.localtime()
    if meeting.status == Meeting.Status.OPEN and meeting.date == now.date():
        end = timezone.make_aware(datetime.combine(meeting.date, meeting.ends_at), now.tzinfo)
        minutes = int((end - now).total_seconds() // 60)
        return {"value": f"{fa(minutes)} دقیقه" if minutes > 0 else "پایان وقت", "note": note}
    return {"value": f"{clock(meeting.starts_at)}", "note": f"آغاز در {jalali(meeting.date)}"}


def previous_open(meeting):
    before = (
        Meeting.objects.filter(status=Meeting.Status.CLOSED, date__lte=meeting.date)
        .exclude(pk=meeting.pk)
        .order_by("-date", "-pk")
        .first()
    )
    if before is None:
        return {"count": 0, "overdue": 0, "meeting": None}
    open_items = before.items.filter(status=AgendaItem.Status.APPROVED, follow_up_done_at__isnull=True)
    today = timezone.localdate()
    return {
        "count": open_items.count(),
        "overdue": open_items.filter(follow_up_due__lt=today).count(),
        "meeting": {"id": before.pk, "code": before.code, "href": before.get_absolute_url()},
    }


def candidates(meeting, user):
    """ریسک‌های بالا و بحرانی که هنوز در دستور این جلسه نیستند؛ برای «افزودن مورد»."""
    taken = meeting.items.filter(risk__isnull=False).values("risk_id")
    risks = (
        visible_risks(user)
        .exclude(status__in=Risk.CLOSED_STATUSES)
        .exclude(pk__in=taken)
        .annotate(rank=current_rank())
        .filter(rank__gte=3)
        .order_by("-rank", "code")
    )
    return [{"id": risk.pk, "code": risk.code, "title": risk.title} for risk in risks]


def page(meeting, user, wanted=None):
    version = active_version()
    items = list(meeting.items.select_related("risk__owner", "risk__service", "risk__scenario", "presenter"))
    assessments = {item.pk: facts_of(item) for item in items}
    items.sort(key=lambda item: sort_key(item, assessments[item.pk]))
    number = {item.pk: index for index, item in enumerate(items, 1)}
    by_id = {item.pk: item for item in items}
    selected = by_id.get(int(wanted)) if wanted and str(wanted).isdigit() else None
    if selected is None:
        selected = next((item for item in items if item.status == AgendaItem.Status.REVIEW), None) or next(
            (item for item in items if item.status == AgendaItem.Status.PENDING), items[0] if items else None
        )
    rows = []
    levels = {"critical": 0, "high": 0, "method": 0}
    for item in items:
        assessment = assessments[item.pk]
        level = assessment.decision_level if assessment else None
        if not item.risk_id:
            levels["method"] += 1
        elif level and level.rank >= 4:
            levels["critical"] += 1
        elif level and level.rank == 3:
            levels["high"] += 1
        owner = item.owner
        rows.append(
            {
                "id": item.pk,
                "number": number[item.pk],
                "subject": item.subject,
                "reference": item.risk.code if item.risk_id else item.reference or None,
                "href": item.risk.get_absolute_url() if item.risk_id else None,
                "level": level_of(level),
                "kind": item.decision_label,
                "owner": owner.get_full_name() if owner else None,
                "status": {"value": item.status, "label": item.get_status_display()},
            }
        )
    roster = attendees(meeting, selected)
    present = [row for row in meeting.attendees.all() if row.present]
    voting = services.voters(meeting)
    restricted = [
        number[item.pk]
        for item in items
        if item.kind == AgendaItem.Kind.EXCEPTION
        or (
            assessments[item.pk]
            and (assessments[item.pk].acceptance_restricted or assessments[item.pk].out_of_acceptance_authority)
        )
    ]
    secretary = meeting.attendees.filter(user=meeting.secretary_id).first() if meeting.secretary_id else None
    can_run = services.can_run(user, meeting) and meeting.status == Meeting.Status.OPEN
    breakdown = [
        f"{fa(levels['critical'])} بحرانی" if levels["critical"] else "",
        f"{fa(levels['high'])} بالا" if levels["high"] else "",
        f"{fa(levels['method'])} تغییر روش" if levels["method"] else "",
    ]
    open_items = previous_open(meeting)
    return {
        "id": meeting.pk,
        "code": meeting.code,
        "title": f"{meeting.title} · {jalali(meeting.date)}",
        "status": {"value": meeting.status, "label": meeting.get_status_display()},
        "subtitle": " · ".join(
            part
            for part in (
                f"جلسه‌ی {meeting.get_kind_display()}" + (f" به دلیل {meeting.reason}" if meeting.reason else ""),
                f"دبیر: {meeting.secretary.get_full_name()}"
                + (f" ({secretary.position})" if secretary and secretary.position else "")
                if meeting.secretary_id
                else "",
                f"ساعت {clock(meeting.starts_at)} تا {clock(meeting.ends_at)}",
                meeting.location,
            )
            if part
        ),
        "stats": {
            "agenda": {"count": fa(len(items)), "note": " · ".join(part for part in breakdown if part) or "بدون مورد"},
            "quorum": {
                "present": fa(len(present)),
                "total": fa(meeting.attendees.count()),
                "met": len(voting) >= meeting.quorum,
                "note": f"حد نصاب {fa(meeting.quorum)} نفر · "
                + ("برقرار است" if len(voting) >= meeting.quorum else "برقرار نیست"),
            },
            "previous": {
                "count": fa(open_items["count"]),
                "note": f"{fa(open_items['overdue'])} مورد از مهلت گذشته" if open_items["overdue"] else "همه در مهلت",
                "meeting": open_items["meeting"],
            },
            "remaining": remaining(meeting, items),
        },
        "attendees": roster,
        "quorum": {
            "text": f"{fa(len(present))} از {fa(len(roster))} عضو حاضر · حد نصاب {fa(meeting.quorum)}",
            "met": len(voting) >= meeting.quorum,
        },
        "agenda": rows,
        "selected": case(selected, assessments[selected.pk], user, meeting) if selected else None,
        "signatures": signatures(meeting, items, selected, user, number),
        "authority": authority(version) if version else [],
        "restricted": "عبور از حد تحمل خاص مشتری، اختیار پذیرش عمومی را محدود می‌کند؛ "
        + f"مورد {'، '.join(fa(value) for value in restricted)} خارج از اختیار پذیرش عادی است."
        if restricted
        else None,
        "minutes": [
            {
                "number": number[item.pk],
                "subject": item.subject,
                "status": item.get_status_display(),
                "text": item.resolution or None,
                "votes": [item.votes_for, item.votes_against, item.votes_abstain]
                if item.status == AgendaItem.Status.APPROVED
                else None,
            }
            for item in items
        ],
        "can_run": can_run,
        "candidates": candidates(meeting, user) if can_run else [],
        "kinds": [{"value": value, "label": label} for value, label in AgendaItem.Kind.choices],
    }


def visible_meeting(request, pk=None):
    if pk is None:
        meeting = (
            Meeting.objects.filter(status=Meeting.Status.OPEN).order_by("-date", "-pk").first()
            or Meeting.objects.filter(status=Meeting.Status.SCHEDULED, date__gte=timezone.localdate())
            .order_by("date", "starts_at")
            .first()
            or Meeting.objects.order_by("-date", "-pk").first()
        )
        if meeting is None:
            raise NotFound("هنوز جلسه‌ای برای کمیته ثبت نشده است.")
    else:
        meeting = get_object_or_404(Meeting, pk=pk)
    if not services.can_view(request.user, meeting):
        raise PermissionDenied("جلسه‌های کمیته را اعضای کمیته، کارگروه و GRC می‌بینند.")
    return meeting


def problems_of(error):
    return {"detail": " ".join(error.messages)}


class MeetingView(ApiView):
    def get(self, request, pk=None):
        meeting = visible_meeting(request, pk)
        return Response(page(meeting, request.user, request.query_params.get("item")))


class ItemActionView(ApiView):
    """review: مورد را در حال بررسی می‌کند؛ resolve: {option, votes: [موافق، مخالف، ممتنع], text}؛ defer: {reason}؛
    sign: امضای مصوبه."""

    def post(self, request, pk, action):
        item = get_object_or_404(AgendaItem.objects.select_related("meeting"), pk=pk)
        meeting = item.meeting
        if not services.can_view(request.user, meeting):
            raise PermissionDenied("این جلسه را نمی‌بینید.")
        data = request.data
        try:
            if action == "review":
                services.start_review(item, request.user)
            elif action == "resolve":
                option = AgendaOption.objects.filter(pk=data.get("option")).first() if data.get("option") else None
                votes = data.get("votes") or [0, 0, 0]
                if not isinstance(votes, list) or len(votes) != 3:
                    raise ValidationError("رأی‌ها را به صورت موافق، مخالف و ممتنع بفرستید.")
                services.record_resolution(item, request.user, option, votes, data.get("text", ""))
            elif action == "defer":
                services.defer(item, request.user, data.get("reason"))
            elif action == "sign":
                services.sign(item, request.user)
            else:
                raise NotFound()
        except (ValidationError, ValueError, TypeError) as error:
            messages = error.messages if isinstance(error, ValidationError) else ["رأی‌ها عدد باشند."]
            return Response({"detail": " ".join(messages)}, status=400)
        return Response(page(meeting, request.user, item.pk))


class MeetingCloseView(ApiView):
    def post(self, request, pk):
        meeting = visible_meeting(request, pk)
        try:
            services.close(meeting, request.user)
        except ValidationError as error:
            return Response(problems_of(error), status=400)
        meeting.refresh_from_db()
        return Response(page(meeting, request.user))


class MeetingItemsView(ApiView):
    """افزودن مورد به دستور جلسه: {risk, kind, detail}."""

    def post(self, request, pk):
        meeting = visible_meeting(request, pk)
        if not services.can_run(request.user, meeting) or meeting.status == Meeting.Status.CLOSED:
            return Response({"detail": "مورد را دبیر یا رئیس جلسه‌ی باز اضافه می‌کند."}, status=400)
        data = request.data
        risk = visible_risks(request.user).filter(pk=data.get("risk")).first()
        kind = data.get("kind")
        if risk is None or kind not in AgendaItem.Kind.values:
            return Response({"detail": "ریسک و نوع تصمیم را انتخاب کنید."}, status=400)
        if meeting.items.filter(risk=risk).exists():
            return Response({"detail": "این ریسک در دستور همین جلسه هست."}, status=400)
        item = AgendaItem(meeting=meeting, risk=risk, kind=kind, detail=(data.get("detail") or "").strip()[:150])
        item._history_user = request.user
        item.save()
        return Response(page(meeting, request.user, item.pk), status=201)
