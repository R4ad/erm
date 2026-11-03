from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Assessment, AssessmentReview, ImpactDetail, Path


class ImpactDetailInline(admin.TabularInline):
    model = ImpactDetail
    extra = 0
    can_delete = False
    raw_id_fields = ("customer", "scale")
    filter_horizontal = ("evidence",)


class PathInline(admin.StackedInline):
    model = Path
    extra = 0
    filter_horizontal = ("evidence", "control_assessments")


class AssessmentReviewInline(admin.TabularInline):
    """سابقه‌ی کنترل کیفیت فقط از صفحه‌ی ارزیابی ثبت می‌شود و اینجا فقط دیده می‌شود."""

    model = AssessmentReview
    extra = 0
    can_delete = False
    fields = ("action", "notes", "meeting_date", "created_by", "created_at")
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Assessment)
class AssessmentAdmin(SimpleHistoryAdmin):
    list_display = ("code", "risk", "kind", "method_version", "meeting_date", "status", "decision_level")
    list_filter = ("kind", "status")
    search_fields = ("code", "risk__code")
    raw_id_fields = ("risk",)
    filter_horizontal = ("a_evidence", "escalation_evidence")
    inlines = [ImpactDetailInline, PathInline, AssessmentReviewInline]

    def has_delete_permission(self, request, obj=None):
        return False  # ارزیابی حذف نمی‌شود
