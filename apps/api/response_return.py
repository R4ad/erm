"""«بازگرداندن پاسخنامه برای تکمیل» (فریم 12e): گزینه‌های مودال (پرسش‌های پیشنهادی AI، مهلت‌ها و یادداشت ریسک‌های
تأییدشده و پیش‌نویس‌های بررسی‌نشده) و خود بازگرداندن. منطق در apps/questionnaires/returning.py است."""

import datetime

from rest_framework.response import Response as ApiResponse

from apps.questionnaires.answers import TEXT_LIMIT, too_long
from apps.questionnaires.models import PendingRisk
from apps.questionnaires.returning import (
    MAX_RETURN_QUESTIONS,
    RETURN_WORKING_DAYS,
    about_targets,
    deadline_choices,
    return_response,
    suggested_questions,
    valid_due,
)
from apps.questionnaires.services import DecisionError

from . import formatting as fmt
from .base import ApiView
from .pending_risks import failure
from .response_review import get_response, require_reviewer

P = PendingRisk.Status


def clean_return(data):
    """(پرسش‌ها، پیام، مهلت). پرسش خالی کنار گذاشته می‌شود و دست‌کم یک پرسش لازم است."""
    if not isinstance(data, dict):
        raise DecisionError("بدنه‌ی درخواست نادرست است.")
    errors = {}
    questions = []
    raw = data.get("questions")
    for index, item in enumerate(raw[:MAX_RETURN_QUESTIONS] if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        if len(text) > TEXT_LIMIT:
            errors[f"questions.{index}"] = [too_long(TEXT_LIMIT)]
        questions.append({"text": text, "ref": str(item.get("ref") or ""), "source": item.get("source")})
    if not questions and not errors:
        errors["questions"] = ["دست‌کم یک پرسش انتخاب کنید."]
    message = str(data.get("message") or "").strip()
    if len(message) > TEXT_LIMIT:
        errors["message"] = [too_long(TEXT_LIMIT)]
    try:
        due = datetime.date.fromisoformat(str(data.get("due_date") or ""))
    except ValueError:
        due = None
    if due is None or not valid_due(due):
        errors["due_date"] = ["مهلت باید روز کاری بعد از امروز باشد."]
    if errors:
        raise DecisionError(errors=errors)
    return questions, message, due


class ReturnOptionsView(ApiView):
    """GET گزینه‌های مودال 12e."""

    def get(self, request, pk):
        require_reviewer(request.user)
        response = get_response(request.user, pk)
        drafts = response.pending_risks.exclude(status=P.ARCHIVED).select_related("risk")
        return ApiResponse(
            {
                "respondent": fmt.person(response.respondent),
                "suggestions": suggested_questions(response, about_targets(response)),
                "deadlines": [{"days": days, "date": fmt.day(day)} for days, day in deadline_choices()],
                "default_days": RETURN_WORKING_DAYS,
                "approved": [draft.risk.code for draft in drafts if draft.status == P.CONVERTED and draft.risk],
                "pending": sum(1 for draft in drafts if draft.status == P.PENDING),
                "max_questions": MAX_RETURN_QUESTIONS,
            }
        )


class ReturnView(ApiView):
    """POST بازگرداندن با {questions: [{text, ref, source}], message, due_date}."""

    def post(self, request, pk):
        require_reviewer(request.user)
        response = get_response(request.user, pk)
        try:
            questions, message, due = clean_return(request.data)
            response = return_response(response, request.user, questions, message, due)
        except DecisionError as error:
            return failure(error)
        return ApiResponse({"status": response.status, "questions": len(response.return_questions)})
