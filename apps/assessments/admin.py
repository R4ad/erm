from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Assessment, ImpactDetail


class ImpactDetailInline(admin.TabularInline):
    model = ImpactDetail
    extra = 0
    can_delete = False
    raw_id_fields = ("customer", "scale")
    filter_horizontal = ("evidence",)


@admin.register(Assessment)
class AssessmentAdmin(SimpleHistoryAdmin):
    list_display = ("code", "risk", "kind", "method_version", "meeting_date", "status")
    list_filter = ("kind", "status")
    search_fields = ("code", "risk__code")
    raw_id_fields = ("risk",)
    inlines = [ImpactDetailInline]

    def has_delete_permission(self, request, obj=None):
        return False  # ارزیابی حذف نمی‌شود
