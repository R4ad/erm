from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import AiRun, PendingRisk, Response


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
    list_select_related = ("response", "risk")
    list_filter = ("status",)
    raw_id_fields = ("response", "ai_run", "consequence", "risk", "duplicate_of", "decided_by", "owner")


@admin.register(AiRun)
class AiRunAdmin(admin.ModelAdmin):
    list_display = ("__str__", "status", "stage", "provider", "model", "prompt_version", "error_code", "created_at")
    list_filter = ("status", "provider")
    list_select_related = ("response",)
    raw_id_fields = ("response", "requested_by")

    def has_delete_permission(self, request, obj=None):
        return False  # لاگ اجرای شناسایی هوشمند سابقه است
