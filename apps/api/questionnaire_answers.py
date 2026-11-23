"""«پاسخ به پرسشنامه‌ها» در رابط React: مدیر واحد، که در RACI روش مالک «ثبت مأموریت و سناریو» است، همان شش پرسش
«شناسایی ریسک» را بی انتخاب خدمت پاسخ می‌دهد. ارسالش ریسک نمی‌سازد؛ ورودی «در حال شناسایی» می‌شود و عضو GRC آن را در
«شناسایی ریسک» با انتخاب خدمت تکمیل می‌کند. بعد از ارسال، مدیر ورودی را فقط در جدول می‌بیند و نه ویرایش می‌کند نه حذف.
شکل داده و بدنه‌ی درخواست همان شناسایی است (identification.py)."""

from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response as ApiResponse

from apps.risks.identification import (
    AnswerForm,
    answer_entries,
    can_answer,
    managed_units,
    submit_answers,
)
from apps.risks.models import IdentificationDraft

from .identification import EntryView, page_data, recent_rows


class QuestionnaireAnswersView(EntryView):
    """GET داده‌ی صفحه (و پیش‌نویس ?draft=)، POST ذخیره‌ی پیش‌نویس یا با submit=true ارسال برای شناسایی، DELETE
    حذف پیش‌نویس. فقط برای مدیر واحدی که دست‌کم یک واحد دارد."""

    form_class = AnswerForm
    locked_message = "این پاسخ‌ها برای شناسایی ارسال شده‌اند و دیگر ویرایش یا حذف نمی‌شوند."

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not can_answer(request.user):
            raise PermissionDenied("«پاسخ به پرسشنامه‌ها» برای مدیر واحد است.")

    def can_write(self, user):
        return True

    def entries(self, user):
        return answer_entries(user)

    def finish(self, form, draft, upload, remove):
        draft = submit_answers(form, draft, upload, remove)
        return {"message": "پاسخ‌ها ثبت شد و برای شناسایی به کارشناس ریسک رسید.", "entry": {"id": draft.pk}}

    def get(self, request):
        user = request.user
        draft = None
        if request.query_params.get("draft"):
            drafts = answer_entries(user).filter(status=IdentificationDraft.Status.DRAFT)
            draft = get_object_or_404(drafts, pk=request.query_params["draft"])
        data = page_data(
            user,
            AnswerForm(user=user),
            draft,
            managed_units(user),
            recent_rows(user, self.queue),
            can_identify=False,
            can_answer=True,
        )
        # خدمت پیش‌نویس قدیمی در داده می‌ماند ولی در این صفحه نشان داده نمی‌شود.
        data["values"]["target"] = ""
        return ApiResponse(data)
