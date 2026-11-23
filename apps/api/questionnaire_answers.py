"""«پاسخ به پرسشنامه‌ها» در رابط React (فریم‌های 30 تا 30f): مدیر واحد هشت پرسش جلسه‌ی شناسایی را پاسخ می‌دهد،
پیش‌نویس را ذخیره می‌کند و پاسخنامه را برای کارشناس ریسک می‌فرستد. پاسخنامه‌ی بازگشتی هم همین‌جا تکمیل می‌شود.
منطق ویزارد در apps/questionnaires/answers.py است."""

from django.db import transaction
from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response as ApiResponse

from apps.questionnaires.answers import (
    FA_DIGITS,
    IMPACT_LIMIT,
    MAX_PATHS,
    PATH_LIMIT,
    TEXT_LIMIT,
    answer_values,
    blank_values,
    clean_values,
    impact_types,
    save_values,
    start_response,
    stored_summary,
    submit_errors,
    submit_response,
    summary,
)
from apps.questionnaires.models import Response, ServiceRecord
from apps.questionnaires.permissions import visible_responses
from apps.risks.identification import answer_unit, can_answer, managed_units

from . import formatting as fmt
from .base import ApiView

RECENT = 8
STATUS_TONE = {
    Response.Status.DRAFT: "neutral",
    Response.Status.SUBMITTED: "info",
    Response.Status.RETURNED: "warning",
    Response.Status.IDENTIFIED: "success",
    Response.Status.REVIEWED: "brand",
}


def response_status(response):
    return {**fmt.choice(response, "status"), "tone": STATUS_TONE[response.status]}


def editable_responses(user):
    return Response.objects.filter(respondent=user, status__in=Response.EDITABLE_STATUSES)


def response_route(response, user):
    if response.is_editable and response.respondent_id == user.pk:
        return f"/questionnaire-answers?response={response.pk}"
    return f"/identification/responses/{response.pk}"


def response_payload(response):
    returned = None
    if response.status == Response.Status.RETURNED:
        returned = {
            "message": response.return_message,
            "questions": response.return_questions,
            "due": fmt.deadline(response.return_due),
        }
    return {
        "id": response.pk,
        "code": response.code,
        "status": response_status(response),
        "step": response.wizard_step,
        "saved_at": fmt.moment(response.updated_at),
        "org_unit": {"id": response.org_unit_id, "name": response.org_unit.name},
        "returned": returned,
    }


def response_row(response, user):
    service, counts = stored_summary(response)
    return {
        "id": response.pk,
        "code": response.code,
        "service": service,
        "summary": counts,
        "step": response.wizard_step,
        "org_unit": response.org_unit.name,
        "status": response_status(response),
        "respondent": fmt.person(response.respondent),
        "updated_at": fmt.moment(response.updated_at),
        "route": response_route(response, user),
    }


def with_answers(responses):
    """پاسخنامه‌ها با خدمت، رویدادها، مسیرها و پیامدها در چند پرس‌وجو، برای stored_summary."""
    records = ServiceRecord.objects.prefetch_related("risk_instances__paths", "risk_instances__consequences")
    return responses.select_related("org_unit", "respondent").prefetch_related(
        Prefetch("service_records", queryset=records)
    )


def recent_rows(user):
    responses = with_answers(visible_responses(user)).order_by("-updated_at", "-pk")[:RECENT]
    return [response_row(response, user) for response in responses]


def page_data(user, response):
    unit = answer_unit(user)
    return {
        "can_answer": True,
        "unit": {"id": unit.pk, "name": unit.name} if unit else None,
        # مدیر چند واحد برای پاسخنامه‌ی تازه واحد را انتخاب می‌کند.
        "units": [] if unit else [{"value": str(item.pk), "label": item.name} for item in managed_units(user)],
        "impact_types": impact_types(),
        "limits": {"text": TEXT_LIMIT, "path": PATH_LIMIT, "impact": IMPACT_LIMIT, "paths": MAX_PATHS},
        "response": response_payload(response) if response else None,
        "values": answer_values(response) if response else blank_values(),
        "recent": recent_rows(user),
        "all_url": "/identification/responses",
    }


class QuestionnaireAnswersView(ApiView):
    """GET داده‌ی ویزارد (و پاسخنامه‌ی ?response= برای ادامه)، POST ذخیره‌ی پیش‌نویس یا با submit=true ارسال. فقط
    برای مدیر واحدی که دست‌کم یک واحد دارد؛ پاسخنامه‌ی پیش‌نویس یا بازگشتی را فقط پاسخ‌دهنده‌اش ادامه می‌دهد. پاسخنامه
    با قفل ردیف خوانده می‌شود تا ذخیره‌ای که دیر برسد پاسخنامه‌ی ارسال‌شده را دوباره ننویسد."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not can_answer(request.user):
            raise PermissionDenied("«پاسخ به پرسشنامه‌ها» برای مدیر واحد است.")

    def get(self, request):
        user = request.user
        response = None
        if request.query_params.get("response"):
            response = get_object_or_404(
                editable_responses(user).select_related("org_unit"), pk=request.query_params["response"]
            )
        return ApiResponse(page_data(user, response))

    def post(self, request):
        user = request.user
        body = request.data if isinstance(request.data, dict) else {}
        submit = bool(body.get("submit"))
        with transaction.atomic():
            response = None
            if body.get("response"):
                response = get_object_or_404(
                    editable_responses(user).select_for_update().select_related("org_unit"), pk=body["response"]
                )
            values, errors = clean_values(body.get("values"), [item["value"] for item in impact_types()])
            unit = None
            if response is None:
                unit = answer_unit(user) or managed_units(user).filter(pk=str(body.get("org_unit") or "0")).first()
                if unit is None:
                    errors["org_unit"] = ["واحد را انتخاب کنید."]
            if submit:
                errors = submit_errors(values) | errors
            if errors:
                message = (
                    f"{str(len(errors)).translate(FA_DIGITS)} پرسش اجباری بی‌پاسخ مانده است؛ پیش از ارسال آن‌ها را کامل کنید."
                    if submit
                    else "پیش‌نویس ذخیره نشد."
                )
                return ApiResponse({"message": message, "errors": errors}, status=status.HTTP_400_BAD_REQUEST)
            if response is None:
                response = start_response(user, unit)
            save_values(response, values, body.get("step"))
            if submit:
                submit_response(response)
        data = {"response": response_payload(response), "recent": recent_rows(user)}
        if submit:
            return ApiResponse(
                {
                    **data,
                    "message": f"پاسخنامه‌ی {response.code} برای کارشناس ریسک فرستاده شد.",
                    "summary": summary(values),
                }
            )
        return ApiResponse({**data, "message": "پیش‌نویس ذخیره شد."})
