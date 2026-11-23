from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import PendingRisk, Response


class NoDeleteAdmin(SimpleHistoryAdmin):
    def has_delete_permission(self, request, obj=None):
        return False  # پاسخنامه‌ها و ریسک‌های پیشنهادی سابقه‌اند و حذف نمی‌شوند


@admin.register(Response)
class ResponseAdmin(NoDeleteAdmin):
    list_display = ("__str__", "org_unit", "respondent", "status", "submitted_at", "review_due")
    list_filter = ("status",)
    search_fields = ("code",)
    readonly_fields = ("code",)
    raw_id_fields = ("service", "respondent", "reviewed_by")


@admin.register(PendingRisk)
class PendingRiskAdmin(NoDeleteAdmin):
    list_display = ("__str__", "response", "status", "risk")
    list_filter = ("status",)
    raw_id_fields = ("response", "risk", "duplicate_of", "decided_by")
