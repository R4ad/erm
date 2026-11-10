"""«پاسخ به سؤال‌ها» در رابط React: پرسشنامه‌های فعال، پاسخ‌های من، شروع، پر کردن و ارسال پاسخ، و جواب پرسش‌های
ریسک. همه‌چیز از همان فرم‌ها و services صفحه‌های جنگوی پرسشنامه می‌گذرد."""

from django.core.exceptions import PermissionDenied
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.http import QueryDict
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response as ApiResponse

from apps.questionnaires.forms import ResponseAnswerForm, ResponseStartForm
from apps.questionnaires.models import PendingRisk, Question, Questionnaire, Response
from apps.questionnaires.permissions import answerable_units, can_edit_response, visible_responses
from apps.questionnaires.services import missing_required, save_answer, submit_response
from apps.questionnaires.structured import save_structured
from apps.workflow.forms import AnswerForm
from apps.workflow.permissions import answerable_questions
from apps.workflow.services import answer_question

from . import formatting as fmt
from .base import ApiView


def response_row(response):
    return {
        "id": response.pk,
        "questionnaire": response.questionnaire.title,
        "org_unit": response.org_unit.name,
        "service": response.service.code if response.service_id else None,
        "respondent": fmt.person(response.respondent),
        "channel": fmt.choice(response, "channel"),
        "status": fmt.choice(response, "status"),
        "is_editable": response.is_editable,
        "is_overdue": response.is_overdue,
        "updated_at": fmt.day(response.updated_at),
    }


class AnswerHomeView(ApiView):
    """پرسشنامه‌های فعال برای شروع پاسخ تازه، و پاسخ‌هایی که کاربر داده یا در مصاحبه ثبت کرده است."""

    def get(self, request):
        user = request.user
        mine = Response.objects.filter(Q(respondent=user) | Q(recorded_by=user)).select_related(
            "questionnaire", "org_unit", "service", "respondent"
        )
        return ApiResponse(
            {
                "questionnaires": [
                    {
                        "id": questionnaire.pk,
                        "title": questionnaire.title,
                        "description": questionnaire.description,
                        "question_count": questionnaire.questions.filter(is_active=True).count(),
                    }
                    for questionnaire in Questionnaire.objects.filter(is_active=True, is_structured=True)
                ],
                "can_answer": answerable_units(user).exists(),
                "my_responses": [response_row(response) for response in mine],
                "risk_question_count": answerable_questions(user).count(),
            }
        )


class ResponseStartView(ApiView):
    """GET گزینه‌های فرم شروع را می‌دهد و POST پاسخ تازه را می‌سازد؛ مثل ResponseStartView جنگو."""

    def questionnaire(self, pk):
        return get_object_or_404(Questionnaire, pk=pk, is_active=True)

    def check(self, request):
        if not answerable_units(request.user).exists():
            raise PermissionDenied

    def form(self, request, questionnaire, data=None):
        return ResponseStartForm(data, user=request.user, instance=Response(questionnaire=questionnaire))

    def get(self, request, pk):
        self.check(request)
        questionnaire = self.questionnaire(pk)
        form = self.form(request, questionnaire)
        fields = {}
        for name, field in form.fields.items():
            fields[name] = {
                "label": str(field.label),
                "help": str(field.help_text),
                "required": field.required,
                "initial": str(field.initial) if field.initial else "",
                "choices": fmt.field_choices(form, name),
            }
        return ApiResponse({"questionnaire": {"id": questionnaire.pk, "title": questionnaire.title}, "fields": fields})

    def post(self, request, pk):
        self.check(request)
        questionnaire = self.questionnaire(pk)
        form = self.form(request, questionnaire, data=request.data)
        if not form.is_valid():
            return ApiResponse({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        response = form.instance
        response.recorded_by = request.user
        if not response.respondent_id:
            response.respondent = request.user
        is_interview = response.respondent_id != request.user.pk
        response.channel = Response.Channel.INTERVIEW if is_interview else Response.Channel.QUESTIONNAIRE
        response = form.save()
        return ApiResponse({"id": response.pk}, status=status.HTTP_201_CREATED)


def answer_value(question, answers):
    answer = answers.get(question.pk)
    if question.kind == Question.Kind.TEXT:
        return answer.text if answer else ""
    selected = [option.pk for option in answer.options.all()] if answer else []
    return selected if question.kind == Question.Kind.MULTIPLE else (selected[0] if selected else None)


def selected_ids(question, answers):
    answer = answers.get(question.pk)
    return {option.pk for option in answer.options.all()} if answer else set()


def response_detail(response, user):
    answers = {answer.question_id: answer for answer in response.answers.prefetch_related("options")}
    can_edit = can_edit_response(user, response)
    field_meta = Response._meta
    fixed = [
        {
            "name": name,
            "label": str(field_meta.get_field(name).verbose_name),
            "help": str(field_meta.get_field(name).help_text),
            "value": getattr(response, name),
        }
        for name in Response.FIXED_ITEMS
    ]
    new_item = field_meta.get_field("new_item")
    questions = response.questionnaire.active_questions() if can_edit else None
    if questions is None:
        # پاسخ ارسال‌شده همان سؤال‌هایی را نشان می‌دهد که جواب گرفته‌اند، حتی اگر بعداً غیرفعال شده باشند.
        answered = [answer.question for answer in response.answers.select_related("question")]
        questions = sorted(answered, key=lambda question: (question.order, question.pk))
    return {
        **response_row(response),
        "questionnaire": {
            "id": response.questionnaire_id,
            "title": response.questionnaire.title,
            "description": response.questionnaire.description,
        },
        "recorded_by": fmt.person(response.recorded_by),
        "can_edit": can_edit,
        "submitted_at": fmt.moment(response.submitted_at),
        "return_question": response.return_question if response.status == Response.Status.RETURNED else "",
        "return_due": fmt.deadline(response.return_due) if response.status == Response.Status.RETURNED else None,
        "reviewed_by": fmt.person(response.reviewed_by),
        "reviewed_at": fmt.moment(response.reviewed_at),
        "fixed": fixed,
        "new_item": {
            "name": "new_item",
            "label": str(new_item.verbose_name),
            "help": str(new_item.help_text),
            "value": response.new_item,
        },
        "questions": [
            {
                "id": question.pk,
                "text": question.text,
                "help": question.help_text,
                "kind": question.kind,
                "required": question.is_required,
                # فرم پاسخ فقط گزینه‌های فعال را می‌پذیرد؛ پاسخ ارسال‌شده گزینه‌ی انتخاب‌شده را حتی اگر بعداً غیرفعال شده باشد نشان می‌دهد.
                "options": [
                    {"id": option.pk, "text": option.text}
                    for option in question.options.all()
                    if option.is_active or (not can_edit and option.pk in selected_ids(question, answers))
                ],
                "value": answer_value(question, answers),
            }
            for question in questions
        ],
        "pending_risks": [
            {"description": item.description, "status": fmt.choice(item, "status"), "source": item.get_source_display()}
            for item in response.pending_risks.all()
        ],
        "classic_url": response.get_absolute_url(),
        "is_structured": response.questionnaire.is_structured,
        "structured_data": response.structured_data,
        "structured_questions": [
            {"id": q.pk, "text": q.text, "stage": q.stage, "required": q.is_required, "help": q.help_text}
            for q in (response.questionnaire.active_questions() if can_edit else response.questionnaire.questions.all())
        ] if response.questionnaire.is_structured else [],
    }


def form_data(payload, questions):
    """JSON رابط React را به داده‌ی همان فرم جنگو برمی‌گرداند: قلم‌های ثابت متن، و جواب هر سؤال با نام question_<شناسه>."""
    data = QueryDict(mutable=True)
    fixed = payload.get("fixed") or {}
    for name in Response.FIXED_ITEMS:
        data[name] = str(fixed.get(name) or "")
    data["new_item"] = str(payload.get("new_item") or "")
    answers = payload.get("answers") or {}
    for question in questions:
        value = answers.get(str(question.pk))
        name = ResponseAnswerForm.question_field_name(question)
        if question.kind == Question.Kind.MULTIPLE:
            data.setlist(name, [str(item) for item in (value or [])])
        elif value not in (None, ""):
            data[name] = str(value)
    return data


class ResponseDetailView(ApiView):
    def get_response(self, request, pk):
        return get_object_or_404(
            visible_responses(request.user).select_related(
                "questionnaire", "org_unit", "service", "respondent", "recorded_by", "reviewed_by"
            ),
            pk=pk,
        )

    def get(self, request, pk):
        return ApiResponse(response_detail(self.get_response(request, pk), request.user))

    @transaction.atomic
    def put(self, request, pk):
        """ذخیره‌ی پیش‌نویس؛ با submit=true بعد از چک سؤال‌های اجباری برای بررسی GRC فرستاده می‌شود."""
        response = self.get_response(request, pk)
        if not can_edit_response(request.user, response):
            raise PermissionDenied
        if response.questionnaire.is_structured:
            try:
                save_structured(response, request.data.get("structured_data"), bool(request.data.get("submit")))
            except ValidationError as exc:
                return ApiResponse({"message": " ".join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
            if request.data.get("submit"):
                submit_response(response)
            return ApiResponse({"message": "پاسخ ذخیره شد.", "response": response_detail(response, request.user)})
        questions = list(response.questionnaire.active_questions())
        form = ResponseAnswerForm(form_data(request.data, questions), instance=response)
        if not form.is_valid():
            return ApiResponse({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        response = form.save()
        for question, value in form.answer_values():
            save_answer(response, question, value)
        if not request.data.get("submit"):
            return ApiResponse({"message": "پاسخ ذخیره شد.", "response": response_detail(response, request.user)})
        missing = missing_required(response)
        if missing:
            errors = {
                ResponseAnswerForm.question_field_name(question): ["این سؤال اجباری است."] for question in missing
            }
            return ApiResponse(
                {
                    "message": "جواب‌ها ذخیره شد، ولی پاسخ بدون سؤال‌های اجباری ارسال نمی‌شود.",
                    "errors": errors,
                    "response": response_detail(response, request.user),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        submit_response(response)
        count = response.pending_risks.filter(status=PendingRisk.Status.PENDING).count()
        return ApiResponse(
            {
                "message": f"پاسخ برای بررسی عضو GRC ارسال شد. ریسک در انتظار: {count}",
                "response": response_detail(response, request.user),
            }
        )


class RiskQuestionListView(ApiView):
    """پرسش‌های بازی که کاربر باید جواب بدهد؛ همان فهرست workflow:question_list."""

    def get(self, request):
        questions = answerable_questions(request.user).select_related("risk", "risk__org_unit", "asked_by")
        return ApiResponse(
            {
                "questions": [
                    {
                        "id": question.pk,
                        "text": question.text,
                        "risk": {
                            "id": question.risk_id,
                            "code": question.risk.code,
                            "title": question.risk.title,
                            "org_unit": question.risk.org_unit.name,
                        },
                        "asked_by": fmt.person(question.asked_by),
                        "asked_at": fmt.day(question.created_at),
                        "due": fmt.deadline(question.due),
                    }
                    for question in questions
                ]
            }
        )


class RiskQuestionAnswerView(ApiView):
    def post(self, request, pk):
        question = get_object_or_404(answerable_questions(request.user).select_related("risk"), pk=pk)
        form = AnswerForm(request.data, instance=question)
        if not form.is_valid():
            return ApiResponse({"errors": fmt.form_errors(form)}, status=status.HTTP_400_BAD_REQUEST)
        answer_question(question, request.user, form.cleaned_data["answer"])
        return ApiResponse({"message": f"جواب پرسش ریسک {question.risk.code} ثبت شد."})
