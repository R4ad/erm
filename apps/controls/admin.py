from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Applicability, Control, IsoControl


@admin.register(IsoControl)
class IsoControlAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "title_en", "theme")
    list_filter = ("theme",)
    search_fields = ("code", "title", "title_en")

    def has_add_permission(self, request):
        return False  # فهرست پیوست A با مهاجرت داده می‌آید

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Control)
class ControlAdmin(SimpleHistoryAdmin):
    list_display = ("code", "title", "kind", "owner", "operated_by", "is_key", "is_active")
    list_filter = ("kind", "operated_by", "is_key", "is_active")
    search_fields = ("code", "title")
    raw_id_fields = ("owner",)
    filter_horizontal = ("iso_controls",)

    def has_delete_permission(self, request, obj=None):
        return False  # کنترل غیرفعال می‌شود، نه حذف


@admin.register(Applicability)
class ApplicabilityAdmin(SimpleHistoryAdmin):
    list_display = ("iso_control", "applicable", "implementation")
    list_filter = ("applicable", "implementation")

    def has_delete_permission(self, request, obj=None):
        return False
