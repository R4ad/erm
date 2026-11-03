from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Answer, Option, PendingRisk, Question, Questionnaire, Response


class NoDeleteAdmin(SimpleHistoryAdmin):
    def has_delete_permission(self, request, obj=None):
        return False  # پرسشنامه و پاسخ‌ها سابقه‌اند؛ غیرفعال می‌شوند، نه حذف


class OptionInline(admin.TabularInline):
    model = Option
    extra = 0
    can_delete = False


@admin.register(Questionnaire)
class QuestionnaireAdmin(NoDeleteAdmin):
    list_display = ("title", "is_active")


@admin.register(Question)
class QuestionAdmin(NoDeleteAdmin):
    list_display = ("text", "questionnaire", "kind", "order", "is_active")
    list_filter = ("questionnaire", "kind")
    inlines = [OptionInline]


class AnswerInline(admin.TabularInline):
    model = Answer
    extra = 0
    can_delete = False
    filter_horizontal = ("options",)


@admin.register(Response)
class ResponseAdmin(NoDeleteAdmin):
    list_display = ("questionnaire", "org_unit", "service", "respondent", "status", "submitted_at")
    list_filter = ("status", "questionnaire", "channel")
    raw_id_fields = ("service", "respondent", "recorded_by", "reviewed_by")
    inlines = [AnswerInline]


@admin.register(PendingRisk)
class PendingRiskAdmin(NoDeleteAdmin):
    list_display = ("__str__", "response", "source", "status", "risk")
    list_filter = ("status", "source")
    raw_id_fields = ("response", "option", "risk", "duplicate_of", "decided_by")
