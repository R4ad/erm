"""«بررسی یک پاسخنامه» در رابط React (فریم‌های 12a تا 12c): سربرگ و زنجیره‌ی مسیر ← رویداد ← پیامد، اجرای شناسایی
هوشمند و مرحله‌هایش برای polling، ریسک‌های پیشنهادی و تاریخچه. پیش‌نویس‌ها این‌جا باز نمی‌شوند (پاسخ‌دهنده آن‌ها را در
ویزارد می‌بیند)؛ بقیه‌ی پاسخنامه‌ها برای هر کسی که آن‌ها را می‌بیند باز است و اقدام فقط با کارشناس ریسک است."""

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status as http
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response as ApiResponse

from apps.questionnaires.ai import grouping
from apps.questionnaires.ai.pipeline import registry, request_identification
from apps.questionnaires.answers import FA_DIGITS, answer_values, impact_types
from apps.questionnaires.models import AiRun, PendingRisk, Response
from apps.questionnaires.permissions import can_manage_questionnaires, visible_responses
from apps.questionnaires.services import TEXT_FIELDS, ai_values

from . import formatting as fmt
from .base import ApiView
from .questionnaire_answers import response_status

S = Response.Status
P = PendingRisk.Status
BASICS = ("service", "objective", "conditions", "responsibility")


def reviewable(user):
    return visible_responses(user).exclude(status=S.DRAFT)


def get_response(user, pk):
    return get_object_or_404(reviewable(user).select_related("org_unit", "respondent"), pk=pk)


def require_reviewer(user):
    if not can_manage_questionnaires(user):
        raise PermissionDenied("بررسی پاسخنامه با کارشناس ریسک است.")


def type_labels(codes, labels):
    return "، ".join(labels.get(code, code) for code in codes)


def chains(response):
    """هر مسیر با رویدادش و پیامد آن رویداد. رویداد مشترک شماره‌ی نخستین مسیرش را دارد و پیامدش فقط آن‌جا می‌آید."""
    values = answer_values(response)
    labels = {item["value"]: item["label"] for item in impact_types()}
    record = response.service_records.first()
    instances = {}
    if record is not None:
        for instance in record.risk_instances.prefetch_related("consequences"):
            instances[instance.source_key] = instance
    impacts = {impact["event"]: impact for impact in values["impacts"]}
    first_path = {}
    rows = []
    for number, path in enumerate(values["paths"], start=1):
        instance = instances.get(path["event"])
        event_number = instance.number if instance else None
        shared_with = first_path.get(path["event"])
        if shared_with is None:
            first_path[path["event"]] = number
        impact = impacts.get(path["event"]) if shared_with is None else None
        rows.append(
            {
                "path": {"number": number, "text": path["description"]},
                "event": {
                    "number": event_number,
                    "text": instance.event if instance else "",
                    "shared_with": shared_with,
                },
                "impact": (
                    {
                        "number": event_number,
                        "text": impact["description"],
                        "type": type_labels(impact["types"], labels),
                        "scope": impact["scope"],
                    }
                    if impact
                    else None
                ),
            }
        )
    basics = [{"number": n, "key": key, "text": values[key]} for n, key in enumerate(BASICS, start=1)]
    distinct = len({row["event"]["number"] for row in rows if row["impact"] and row["impact"]["text"]})
    answered = sum(1 for item in basics if item["text"].strip()) + sum(
        1 for part in ("paths", "events", "impacts") if values[part]
    )
    return {"questions": answered, "paths": len(rows), "impacts": distinct, "basics": basics, "chains": rows}


def next_in_queue(user, response):
    """پاسخنامه‌ی بعدی صف «در انتظار بررسی» به همان ترتیب 11a؛ از ته صف به سر صف برمی‌گردد."""
    queue = list(
        reviewable(user).filter(status=S.SUBMITTED).order_by("submitted_at", "pk").values_list("pk", flat=True)
    )
    others = [pk for pk in queue if pk != response.pk]
    if not others:
        return None
    if response.pk in queue:
        after = queue[queue.index(response.pk) + 1 :]
        target = after[0] if after else others[0]
    else:
        target = others[0]
    return {"id": target, "route": f"/identification/responses/{target}"}


def run_facts(response):
    """عددهای متن مرحله‌های 12b: پاسخ‌ها و مسیرها، پیامدهای متمایز، ریسک‌هایی که ساخته می‌شوند و اندازه‌ی رجیستر."""
    answers = chains(response)
    complete = grouping.complete_groups(response)
    done = grouping.approved_consequences(response)
    return {
        "answers": answers["questions"],
        "paths": answers["paths"],
        "impacts": len(complete),
        "risks": len([group for group in complete if group[1].pk not in done]),
        "registry": registry().count(),
    }


def run_payload(run, facts=None):
    if run is None:
        return None
    return {
        "id": run.pk,
        "status": run.status,
        "stage": run.stage,
        "stages": AiRun.STAGES,
        "active": run.is_active,
        "error_code": run.error_code,
        "prompt_version": run.prompt_version,
        "created_at": fmt.moment(run.created_at),
        "finished_at": fmt.moment(run.finished_at),
        "facts": facts if facts is not None else run_facts(run.response),
    }


def latest_run(response):
    return response.ai_runs.order_by("-created_at", "-pk").first()


def risk_route(risk):
    return f"/risks/{risk.pk}"


def edited(draft):
    """آیا کارشناس متنی را از پیشنهاد AI تغییر داده است؛ برای برچسب «ویرایش‌شده»."""
    if not draft.ai_original:
        return False
    suggested = ai_values(draft)
    return any(getattr(draft, name) != suggested[name] for name in TEXT_FIELDS) or [
        item["text"] for item in draft.paths
    ] != [item["text"] for item in suggested["paths"]]


def draft_payload(draft):
    instance = draft.consequence.risk_instance if draft.consequence_id else None
    suggested = (draft.ai_original or {}).get("category")
    return {
        "id": draft.pk,
        "status": fmt.choice(draft, "status"),
        "title": draft.title,
        "initiating_factor": draft.initiating_factor,
        "paths": [{"number": item["number"], "text": item["text"]} for item in draft.paths],
        "target_event": draft.target_event,
        "impact": draft.impact,
        "impact_type": draft.impact_type,
        "impact_scope": draft.impact_scope,
        "category": {"id": draft.category_id, "name": draft.category.name} if draft.category_id else None,
        "category_suggested": bool(draft.category_id) and draft.category.name == suggested,
        "owner_unit": {"id": draft.owner_unit_id, "name": draft.owner_unit.name} if draft.owner_unit_id else None,
        "owner": fmt.person(draft.owner),
        "confidence": fmt.choice(draft, "confidence"),
        "confidence_reason": draft.confidence_reason,
        "gaps": draft.gaps,
        "source": {
            "paths": [item["number"] for item in draft.paths],
            "event": instance.number if instance else None,
            "impact": instance.number if instance else None,
        },
        "similar": [
            {
                "id": item["id"],
                "code": item["code"],
                "title": item["title"],
                "percent": round(item["similarity"] * 100),
                "route": f"/risks/{item['id']}",
            }
            for item in draft.similar_risks
        ],
        "edited": edited(draft),
        "suggested": ai_values(draft) if draft.ai_original else None,
        "risk": {"code": draft.risk.code, "route": risk_route(draft.risk)} if draft.risk_id else None,
        "decided_by": fmt.person(draft.decided_by),
        "decided_at": fmt.moment(draft.decided_at),
        "dismiss_reason": draft.dismiss_reason,
    }


def current_drafts(response):
    """پیش‌نویس‌های اجرای جاری و تصمیم‌های گرفته‌شده؛ بایگانی‌شده‌ها فقط در تاریخچه می‌مانند."""
    return (
        response.pending_risks.exclude(status=P.ARCHIVED)
        .select_related("consequence__risk_instance", "category", "owner_unit", "owner", "risk", "decided_by")
        .order_by("consequence__risk_instance__number", "pk")
    )


class ResponseReviewView(ApiView):
    """GET سربرگ، پاسخ‌ها و آخرین اجرای شناسایی هوشمند یک پاسخنامه."""

    def get(self, request, pk):
        response = get_response(request.user, pk)
        can_review = can_manage_questionnaires(request.user)
        service = response.service_records.first()
        facts = run_facts(response)
        return ApiResponse(
            {
                "id": response.pk,
                "code": response.code,
                "status": response_status(response),
                "service": service.name_and_scope if service else "",
                "org_unit": response.org_unit.name,
                "respondent": fmt.person(response.respondent),
                "submitted_at": fmt.moment(response.submitted_at),
                "can_review": can_review and response.status == S.SUBMITTED,
                "next": next_in_queue(request.user, response) if can_review else None,
                "answers": chains(response),
                "run": run_payload(latest_run(response), facts),
                "facts": facts,
                "manual_route": "/identification/manual",
            }
        )


class ResponseRisksView(ApiView):
    """GET ریسک‌های پیشنهادی پاسخنامه با شمار تصمیم‌ها برای سربرگ پنل 12c."""

    def get(self, request, pk):
        response = get_response(request.user, pk)
        drafts = list(current_drafts(response))
        run = (
            response.ai_runs.filter(status=AiRun.Status.SUCCEEDED).order_by("-finished_at", "-pk").first()
        )
        return ApiResponse(
            {
                "risks": [draft_payload(draft) for draft in drafts],
                "counts": {
                    "total": len(drafts),
                    "approved": sum(1 for draft in drafts if draft.status == P.CONVERTED),
                    "dismissed": sum(1 for draft in drafts if draft.status == P.DISMISSED),
                    "pending": sum(1 for draft in drafts if draft.status == P.PENDING),
                },
                "analysed_at": fmt.moment(run.finished_at) if run else None,
            }
        )


class AiIdentificationView(ApiView):
    """POST اجرای تازه‌ی شناسایی هوشمند در صف (۲۰۲)؛ اگر اجرایی در صف یا در حال اجراست همان برمی‌گردد."""

    def post(self, request, pk):
        require_reviewer(request.user)
        response = get_response(request.user, pk)
        if response.status != S.SUBMITTED:
            raise ValidationError({"detail": "فقط پاسخنامه‌ی در انتظار بررسی شناسایی می‌شود."})
        run = request_identification(response, request.user)
        return ApiResponse({"run_id": run.pk, "run": run_payload(run)}, status=http.HTTP_202_ACCEPTED)


def get_run(user, pk):
    return get_object_or_404(AiRun.objects.filter(response__in=reviewable(user)).select_related("response"), pk=pk)


class AiRunView(ApiView):
    """GET وضعیت و مرحله‌ی یک اجرا برای پنل 12b."""

    def get(self, request, pk):
        return ApiResponse(run_payload(get_run(request.user, pk)))


class AiRunCancelView(ApiView):
    """POST لغو اجرای در صف یا در حال اجرا. کارگر بین مرحله‌ها لغو را می‌بیند و نتیجه‌ای ثبت نمی‌کند."""

    def post(self, request, pk):
        require_reviewer(request.user)
        run = get_run(request.user, pk)
        with transaction.atomic():
            locked = AiRun.objects.select_for_update().get(pk=run.pk)
            if locked.is_active:
                locked.status = AiRun.Status.CANCELLED
                locked.finished_at = timezone.now()
                locked.save(update_fields=["status", "finished_at", "updated_at"])
        return ApiResponse(run_payload(locked))


# --- تاریخچه -----------------------------------------------------------------------------------------------------------


def event(text, at, actor=None, tone="neutral"):
    return {"text": text, "actor": fmt.person(actor), "at": at, "tone": tone}


def response_events(response):
    """ایجاد، ارسال، ارسال دوباره و بازگرداندن، از تاریخچه‌ی خود پاسخنامه."""
    events = []
    previous = None
    submitted_before = False
    for record in response.history.order_by("history_date", "history_id").select_related("history_user"):
        actor = record.history_user or response.respondent
        if previous is None:
            events.append(event("پیش‌نویس ایجاد شد", record.history_date, actor))
        elif record.status != previous.status:
            if record.status == S.SUBMITTED:
                text = "دوباره برای بررسی ارسال شد" if submitted_before else "برای بررسی ارسال شد"
                events.append(event(text, record.history_date, actor, "info"))
                submitted_before = True
            elif record.status == S.RETURNED:
                count = len(record.return_questions or [])
                text = f"برای تکمیل بازگردانده شد · {str(count).translate(FA_DIGITS)} پرسش"
                events.append(event(text, record.history_date, record.history_user, "warning"))
        previous = record
    return events


def run_events(response):
    events = []
    runs = response.ai_runs.filter(status__in=[AiRun.Status.SUCCEEDED, AiRun.Status.EMPTY, AiRun.Status.FAILED])
    for run in runs.prefetch_related("drafts"):
        at = run.finished_at or run.updated_at
        if run.status == AiRun.Status.SUCCEEDED:
            count = str(len(run.drafts.all())).translate(FA_DIGITS)
            events.append(event(f"شناسایی هوشمند · {count} ریسک پیشنهاد شد", at, tone="tangerine"))
        elif run.status == AiRun.Status.EMPTY:
            events.append(event("شناسایی هوشمند · ریسکی ساخته نشد", at))
        else:
            events.append(event("شناسایی هوشمند انجام نشد", at, tone="danger"))
    return events


def decision_events(response):
    events = []
    decided = response.pending_risks.filter(status__in=[P.CONVERTED, P.DISMISSED]).select_related("risk", "decided_by")
    for draft in decided:
        at = draft.decided_at or draft.updated_at
        if draft.status == P.CONVERTED:
            events.append(event(f"ریسک {draft.risk.code} تأیید شد", at, draft.decided_by, "success"))
        else:
            events.append(event(f"ریسک پیشنهادی «{draft.title}» رد شد", at, draft.decided_by))
    return events


EDIT_FIELDS = (*TEXT_FIELDS, "paths", "category_id", "owner_unit_id", "owner_id")


def edit_events(response):
    """هر ذخیره‌ی فرم 12d که مقداری را عوض کرده است، از تاریخچه‌ی پیش‌نویس‌ها؛ ساخت پیش‌نویس و تغییر وضعیت ویرایش نیست."""
    events = []
    records = (
        PendingRisk.history.filter(response_id=response.pk)
        .select_related("history_user")
        .order_by("id", "history_date", "history_id")
    )
    previous = None
    for record in records:
        same = previous is not None and previous.id == record.id
        if same and record.history_user and record.status == previous.status == P.PENDING:
            if any(getattr(record, name) != getattr(previous, name) for name in EDIT_FIELDS):
                text = f"ریسک پیشنهادی «{record.title}» ویرایش شد"
                events.append(event(text, record.history_date, record.history_user))
        previous = record
    return events


class ResponseHistoryView(ApiView):
    """GET رویدادهای پاسخنامه، تازه‌ترین اول: ایجاد و ارسال، بازگرداندن، شناسایی هوشمند و تصمیم‌ها."""

    def get(self, request, pk):
        response = get_response(request.user, pk)
        events = response_events(response) + run_events(response) + decision_events(response) + edit_events(response)
        events.sort(key=lambda item: item["at"], reverse=True)
        return ApiResponse({"events": [{**item, "at": fmt.moment(item["at"])} for item in events]})

