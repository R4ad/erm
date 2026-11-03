from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Coverage, RiskCategory


@admin.register(RiskCategory)
class RiskCategoryAdmin(SimpleHistoryAdmin):
    list_display = ("code", "name", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code", "name")

    def has_delete_permission(self, request, obj=None):
        return False  # دسته حذف نمی‌شود، فقط غیرفعال می‌شود


@admin.register(Coverage)
class CoverageAdmin(SimpleHistoryAdmin):
    list_display = ("service", "category", "status", "reviewed_by", "reviewed_on")
    list_filter = ("status", "category")
    search_fields = ("service__code", "service__name")
    raw_id_fields = ("service", "reviewed_by")

    def has_delete_permission(self, request, obj=None):
        return False  # وضعیت خانه عوض می‌شود و تاریخچه‌اش می‌ماند؛ حذف نمی‌شود
