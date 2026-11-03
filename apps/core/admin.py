from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import Attachment, Comment


@admin.register(Attachment)
class AttachmentAdmin(SimpleHistoryAdmin):
    list_display = ("original_name", "content_type", "object_id", "size", "created_by", "created_at")
    list_filter = ("content_type",)
    raw_id_fields = ("created_by",)

    def has_delete_permission(self, request, obj=None):
        return False  # پیوست حذف نمی‌شود


@admin.register(Comment)
class CommentAdmin(SimpleHistoryAdmin):
    list_display = ("__str__", "content_type", "object_id", "created_by", "created_at")
    list_filter = ("content_type",)
    raw_id_fields = ("created_by",)

    def has_delete_permission(self, request, obj=None):
        return False  # نظر حذف نمی‌شود؛ ویرایشش در تاریخچه می‌ماند
