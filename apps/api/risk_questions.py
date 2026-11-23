"""پرسش‌های ریسک که کاربر باید جواب بدهد (همان فهرست workflow:question_list)."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response as ApiResponse

from apps.workflow.forms import AnswerForm
from apps.workflow.permissions import answerable_questions
from apps.workflow.services import answer_question

from . import formatting as fmt
from .base import ApiView


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
