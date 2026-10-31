from django.contrib import admin

from .models import AuditEvent


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    """فقط خواندنی: در پنل مدیریت هم نمی‌شود رویدادی ساخت، عوض یا حذف کرد."""

    list_display = ("at", "event", "username", "ip_address")
    list_filter = ("event",)
    search_fields = ("username",)
    date_hierarchy = "at"

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
