from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import ChangeRequest, RiskQuestion, StatusTransition


class NoDeleteMixin:
    def has_delete_permission(self, request, obj=None):
        return False  # سابقه‌ی گردش کار حذف نمی‌شود


@admin.register(StatusTransition)
class StatusTransitionAdmin(NoDeleteMixin, admin.ModelAdmin):
    list_display = ("risk", "from_status", "to_status", "meeting_date", "created_by", "created_at")
    list_filter = ("from_status", "to_status")
    search_fields = ("risk__code", "risk__title", "reason")

    def has_add_permission(self, request):
        return False  # انتقال فقط از صفحه‌ی ریسک و با چک شرط‌ها انجام می‌شود

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(RiskQuestion)
class RiskQuestionAdmin(NoDeleteMixin, SimpleHistoryAdmin):
    list_display = ("risk", "text", "due", "answered_at")
    search_fields = ("risk__code", "text", "answer")
    raw_id_fields = ("risk", "asked_by", "answered_by")


@admin.register(ChangeRequest)
class ChangeRequestAdmin(NoDeleteMixin, SimpleHistoryAdmin):
    list_display = ("risk", "kind", "merge_into", "status", "proposed_by", "decided_by", "decided_at")
    list_filter = ("kind", "status")
    search_fields = ("risk__code", "reason")
    raw_id_fields = ("risk", "merge_into", "proposed_by", "decided_by")
