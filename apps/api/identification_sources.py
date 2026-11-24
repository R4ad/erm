"""«شناسایی ریسک» (فریم 11 v2): منبع‌های شناسایی. فعلاً فقط پاسخنامه‌ها آماده است و آمارش از پاسخنامه‌هایی می‌آید که
کاربر می‌بیند؛ چهار منبع دیگر «به‌زودی»اند و آمار ندارند."""

from django.db.models import Count, Q
from rest_framework.response import Response as ApiResponse

from apps.questionnaires.models import Response
from apps.questionnaires.permissions import visible_responses

from .base import ApiView

S = Response.Status


def response_counts(user):
    counts = visible_responses(user).aggregate(
        pending=Count("pk", filter=Q(status=S.SUBMITTED)),
        returned=Count("pk", filter=Q(status=S.RETURNED)),
        identified=Count("pk", filter=Q(status=S.IDENTIFIED)),
    )
    return {**counts, "url": "/identification/responses"}


class IdentificationSourcesView(ApiView):
    def get(self, request):
        return ApiResponse({"responses": response_counts(request.user)})
